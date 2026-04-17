import { window, Uri } from 'vscode';
import path from 'path';
import { ServiceLocator } from '../../../core/services/service_locator';
import { TemplateService, TemplateInfo } from '../../../core/services/template_service';
import { MicroserviceService } from '../../../core/services/microservice_service';
import * as workflow from '../../../core/services/workflow';
import { getLanguage, getAllTemplateCategories } from '../../../core/language_registry';
import { getLanguageFromTemplatePath } from '../../../core/services/language_detector';
import { getRootWorkspaceFolders } from '../utils/path_util';
import { executeCommand } from '../utils/terminal_handle';
import { gitInit } from '../utils/git_init';
import { workspace } from 'vscode';

/**
 * Унифицированная команда добавления микросервиса.
 * Работает с любым языком: Python, Node.js, Go.
 * Язык определяется автоматически по выбранному шаблону.
 */
export async function addMicroservice(): Promise<void> {
    const fileSystem = ServiceLocator.getInstance().getFileSystem();
    const templateService = new TemplateService(fileSystem);

    // Получаем путь к шаблонам из настроек
    const templatesPath = workspace.getConfiguration('codeGenerator').get<string>('templatesPath');
    if (!templatesPath) {
        window.showErrorMessage('Templates path not configured. Set codeGenerator.templatesPath in settings.');
        return;
    }

    // Сканируем все шаблоны всех языков
    const allTemplates: TemplateInfo[] = [];
    for (const category of getAllTemplateCategories()) {
        const templates = await templateService.scanTemplates(templatesPath, category);
        allTemplates.push(...templates);
    }

    if (allTemplates.length === 0) {
        window.showWarningMessage(`No templates found in ${templatesPath}`);
        return;
    }

    // Показываем выбор шаблона
    const selectedTemplate = await pickTemplate(allTemplates);
    if (!selectedTemplate) {
        return;
    }

    // Определяем язык по пути к шаблону
    const languageType = getLanguageFromTemplatePath(selectedTemplate.path);
    if (!languageType) {
        window.showErrorMessage(`Could not determine language for template: ${selectedTemplate.path}`);
        return;
    }

    const language = getLanguage(languageType);

    // Запрашиваем имя проекта
    const projectName = await window.showInputBox({
        prompt: 'Enter project folder name (lowercase, no underscores)',
        value: selectedTemplate.name.toLowerCase().replace(/_/g, '-'),
        validateInput: (value) => {
            if (!value || value.trim().length === 0) {
                return 'Name cannot be empty';
            }
            if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(value)) {
                return 'Name must be lowercase, start/end with letter or number, use only hyphens';
            }
            return null;
        }
    });

    if (!projectName) {
        return;
    }

    // Выбор места назначения
    const destination = await getDestinationChoice();
    if (!destination) {
        return;
    }

    let targetPath: string;
    let destinationType: 'microservices' | 'root' | 'standalone' = 'standalone';
    let relativePath = '';
    const workspacePath = getRootWorkspaceFolders();

    switch (destination.type) {
        case 'microservices':
            if (!workspacePath) {
                window.showErrorMessage('No workspace folder open');
                return;
            }
            targetPath = path.join(workspacePath, 'microservices', projectName);
            destinationType = 'microservices';
            relativePath = `microservices/${projectName}`;
            break;
        case 'root':
            if (!workspacePath) {
                window.showErrorMessage('No workspace folder open');
                return;
            }
            targetPath = path.join(workspacePath, projectName);
            destinationType = 'root';
            relativePath = projectName;
            break;
        case 'standalone':
            if (!destination.path) {
                return;
            }
            targetPath = path.join(destination.path, projectName);
            destinationType = 'standalone';
            break;
        default:
            return;
    }

    // Проверяем существование папки
    if (await fileSystem.exists(targetPath)) {
        const overwrite = await window.showWarningMessage(
            `Folder ${projectName} already exists. Overwrite?`,
            'Yes', 'No'
        );
        if (overwrite !== 'Yes') {
            return;
        }
    }

    try {
        // Создаём сервис для нужного языка
        const microserviceService = new MicroserviceService(fileSystem, language);
        const deps: workflow.WorkflowDependencies = { fileSystem };

        await window.withProgress({
            location: 15,
            title: `Creating ${language.displayName} microservice "${projectName}"`,
            cancellable: false
        }, async (progress) => {
            // Добавляем проект
            progress.report({ message: 'Copying template...' });
            await microserviceService.addProject({
                templatePath: selectedTemplate.path,
                projectName,
                targetPath,
                destinationType,
                workspacePath: workspacePath ?? undefined,
                relativePath: relativePath || undefined
            });

            // Для монорепо — интеграция с Serverpod
            if ((destinationType === 'microservices' || destinationType === 'root') && workspacePath) {
                progress.report({ message: 'Adding Serverpod endpoint...' });
                await workflow.updateServerpodDeploymentEnv(deps, workspacePath, projectName, language.defaultPort);
                await workflow.copyServerpodEndpoint(deps, workspacePath, projectName, templatesPath);

                progress.report({ message: 'Adding Flutter widget...' });
                await workflow.copyFlutterHealthCheckWidget(deps, workspacePath, projectName, templatesPath);
                await workflow.patchDeveloperToolsPage(deps, workspacePath, projectName);

                // Запускаем serverpod generate
                progress.report({ message: 'Running serverpod generate...' });
                const repoName = path.basename(workspacePath);
                const serverPath = path.join(workspacePath, `${repoName}_server`);
                await executeCommand('serverpod generate', serverPath);
            }
        });

        // Для standalone — CI/CD и git init
        if (destinationType === 'standalone') {
            const setupCICD = await window.showQuickPick(
                [
                    { label: '$(check) Да, настроить CI/CD сейчас', description: 'Запустит terraform для GitHub Secrets', value: true },
                    { label: '$(x) Нет, настрою позже', description: 'Запущу apply.ps1 вручную', value: false }
                ],
                { placeHolder: 'Настроить GitHub Secrets для CI/CD?' }
            );

            await gitInit(targetPath, projectName, { setupCICD: setupCICD?.value ?? false });

            // Открываем в отдельном окне
            const openCommand = `antigravity -g "${targetPath}"`;
            await executeCommand(openCommand, targetPath);
        }

        window.showInformationMessage(`✅ ${language.displayName} microservice "${projectName}" created successfully!`);
    } catch (error) {
        window.showErrorMessage(`Error creating microservice: ${error}`);
    }
}

/**
 * Показывает QuickPick для выбора шаблона.
 */
async function pickTemplate(templates: TemplateInfo[]): Promise<TemplateInfo | undefined> {
    const items = templates.map(t => ({
        label: t.name,
        description: getLanguageFromTemplatePath(t.path) ?? '',
        detail: t.description || t.path,
        template: t
    }));

    const selected = await window.showQuickPick(items, {
        placeHolder: 'Select microservice template',
        matchOnDescription: true,
    });

    return selected?.template;
}

/**
 * Показывает выбор места назначения.
 */
async function getDestinationChoice(): Promise<{ type: 'microservices' | 'root' | 'standalone', path?: string } | undefined> {
    const workspacePath = getRootWorkspaceFolders();

    const choices = [];

    if (workspacePath) {
        choices.push(
            { label: '$(folder) microservices/', description: 'Add to monorepo microservices folder', type: 'microservices' as const },
            { label: '$(folder) Project root', description: 'Add to workspace root', type: 'root' as const }
        );
    }

    choices.push({ label: '$(folder-opened) Standalone project', description: 'Create in separate folder', type: 'standalone' as const });

    const selected = await window.showQuickPick(choices, {
        placeHolder: 'Where to create the microservice?'
    });

    if (!selected) {
        return undefined;
    }

    if (selected.type === 'standalone') {
        const defaultPath = workspace.getConfiguration('codeGenerator').get<string>('pythonProjectsPath') || 'G:\\Projects\\Python';
        const folder = await window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            defaultUri: Uri.file(defaultPath),
            openLabel: 'Select folder'
        });

        if (!folder || folder.length === 0) {
            return undefined;
        }

        return { type: 'standalone', path: folder[0].fsPath };
    }

    return { type: selected.type };
}
