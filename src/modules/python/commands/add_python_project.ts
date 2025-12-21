import { window } from 'vscode';
import path from 'path';
import { ServiceLocator } from '../../../core/services/service_locator';
import { TemplateService, TemplateInfo } from '../../../core/services/template_service';
import { getRootWorkspaceFolders } from '../../../utils/path_util';
import { getTemplatesPath, getDestinationChoice } from '../ui/project_picker';
import { PythonInitializer } from '../services/python_initializer';
import { WorkflowModifier } from '../services/workflow_modifier';
import { executeCommand } from '../../../utils';
import { gitInit } from '../../../utils/git_init';

/**
 * Команда добавления Python проекта из шаблона.
 * 1. Показывает список шаблонов из категории python
 * 2. Позволяет выбрать куда добавить (microservices, корень, standalone)
 * 3. Копирует шаблон
 * 4. Модифицирует workflow для монорепо (если нужно)
 * 5. Выполняет uv sync
 */
export async function addPythonProject(): Promise<void> {
    const fileSystem = ServiceLocator.getInstance().getFileSystem();
    const templateService = new TemplateService(fileSystem);
    const initializer = new PythonInitializer();
    const workflowModifier = new WorkflowModifier(fileSystem);

    // Получаем путь к шаблонам из настроек
    const templatesPath = getTemplatesPath();
    if (!templatesPath) {
        window.showErrorMessage('Templates path not configured. Set codeGenerator.templatesPath in settings.');
        return;
    }

    // Сканируем Python шаблоны
    const templates = await templateService.scanTemplates(templatesPath, 'python');
    if (templates.length === 0) {
        window.showWarningMessage(`No Python templates found in ${path.join(templatesPath, 'python')}`);
        return;
    }

    // Показываем выбор шаблона
    const selectedTemplate = await pickTemplate(templates);
    if (!selectedTemplate) {
        return; // Пользователь отменил
    }

    // Запрашиваем имя проекта (RFC 1123 compatible для Kubernetes namespace)
    const projectName = await window.showInputBox({
        prompt: 'Enter project folder name (lowercase, no underscores)',
        value: selectedTemplate.name.toLowerCase().replace(/_/g, '-'),
        validateInput: (value) => {
            if (!value || value.trim().length === 0) {
                return 'Name cannot be empty';
            }
            if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(value)) {
                return 'Name must be lowercase, start/end with letter or number, use only hyphens (no underscores)';
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
    let isMonorepo = false;
    let relativePath = '';
    const workspacePath = getRootWorkspaceFolders();

    switch (destination.type) {
        case 'microservices':
            if (!workspacePath) {
                window.showErrorMessage('No workspace folder open');
                return;
            }
            targetPath = path.join(workspacePath, 'microservices', projectName);
            isMonorepo = true;
            relativePath = `microservices/${projectName}`;
            break;
        case 'root':
            if (!workspacePath) {
                window.showErrorMessage('No workspace folder open');
                return;
            }
            targetPath = path.join(workspacePath, projectName);
            isMonorepo = true;
            relativePath = projectName;
            break;
        case 'standalone':
            if (!destination.path) {
                return;
            }
            targetPath = path.join(destination.path, projectName);
            break;
        default:
            return;
    }

    // Проверяем, не существует ли уже папка
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
        // Копируем шаблон
        await templateService.copyTemplate(selectedTemplate.path, targetPath);

        // Модифицируем workflow для монорепо
        if (isMonorepo && workspacePath) {
            await workflowModifier.modifyForMonorepo(targetPath, projectName, relativePath, selectedTemplate.name);
            await workflowModifier.moveWorkflowToRepoRoot(targetPath, workspacePath, projectName);
            await workflowModifier.updateK8sManifests(targetPath, projectName, selectedTemplate.name);
            await workflowModifier.updateServerpodDeploymentEnv(workspacePath, projectName);
            await workflowModifier.copyServerpodEndpoint(workspacePath, projectName, templatesPath);
            await workflowModifier.copyFlutterHealthCheckWidget(workspacePath, projectName, templatesPath);
            await workflowModifier.patchDeveloperToolsPage(workspacePath, projectName);

            // Запускаем serverpod generate
            const projectBaseName = path.basename(workspacePath);
            const serverPath = path.join(workspacePath, `${projectBaseName}_server`);
            window.showInformationMessage('⏳ Running serverpod generate...');
            await executeCommand('serverpod generate --experimental-features=all', serverPath);

            window.showInformationMessage(`📋 Workflow moved to .github/workflows/deployment-${projectName}.yml`);
        }

        // Инициализируем Python проект
        await initializer.initialize(targetPath);

        // Git init и открытие в IDE для standalone проектов
        if (destination.type === 'standalone') {
            // Обновляем workflow и K8s манифесты с реальным именем проекта
            await workflowModifier.updateForStandalone(targetPath, projectName, selectedTemplate.name);

            // Спрашиваем про настройку CI/CD
            const setupCICD = await window.showQuickPick(
                [
                    { label: '$(check) Да, настроить CI/CD сейчас', description: 'Запустит terraform для GitHub Secrets', value: true },
                    { label: '$(x) Нет, настрою позже', description: 'Запущу apply.ps1 вручную', value: false }
                ],
                { placeHolder: 'Настроить GitHub Secrets для CI/CD?' }
            );

            await gitInit(targetPath, projectName, { setupCICD: setupCICD?.value ?? false });

            // Открываем в отдельном окне только standalone проекты
            const openCommand = `antigravity -g "${targetPath}"`;
            await executeCommand(openCommand, targetPath);
        } else {
            // Для microservices показываем подсказку про Python Bridge
            window.showInformationMessage(
                `✅ Python microservice "${projectName}" added! ` +
                `To create Serverpod bridge: 1) Run service locally 2) Execute "Generate Python Bridge"`
            );
        }

        window.showInformationMessage(`✅ Python project "${projectName}" created successfully!`);


    } catch (error) {
        window.showErrorMessage(`Error creating Python project: ${error}`);
    }
}

/**
 * Показывает QuickPick для выбора шаблона.
 */
async function pickTemplate(templates: TemplateInfo[]): Promise<TemplateInfo | undefined> {
    const items = templates.map(t => ({
        label: t.name,
        description: t.description || '',
        detail: t.path,
        template: t
    }));

    const selected = await window.showQuickPick(items, {
        placeHolder: 'Select Python template',
        matchOnDescription: true,
    });

    return selected?.template;
}
