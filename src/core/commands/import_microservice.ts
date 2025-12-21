import { window, Uri } from 'vscode';
import path from 'path';
import { ServiceLocator } from '../services/service_locator';
import { MicroserviceService } from '../services/microservice_service';
import { detectLanguage } from '../services/language_detector';
import { getLanguage } from '../language_registry';
import { WorkflowModifier } from '../services/workflow_modifier';
import { getRootWorkspaceFolders } from '../../utils/path_util';
import { workspace } from 'vscode';
import { executeCommand } from '../../utils';

/**
 * Унифицированная команда импорта микросервиса в монорепо.
 * Язык определяется автоматически по содержимому проекта.
 */
export async function importMicroservice(): Promise<void> {
    const fileSystem = ServiceLocator.getInstance().getFileSystem();
    const workflowModifier = new WorkflowModifier(fileSystem);

    // Получаем путь к workspace
    const workspacePath = getRootWorkspaceFolders();
    if (!workspacePath) {
        window.showErrorMessage('No workspace folder open. Open a monorepo project first.');
        return;
    }

    // Выбираем папку с существующим микросервисом
    const sourceFolder = await window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        defaultUri: Uri.file('G:\\Projects'),
        openLabel: 'Выбрать микросервис для импорта',
        title: 'Выберите папку с микросервисом'
    });

    if (!sourceFolder || sourceFolder.length === 0) {
        return;
    }

    const sourcePath = sourceFolder[0].fsPath;
    const projectName = path.basename(sourcePath).toLowerCase().replace(/_/g, '-');

    // Валидация имени
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(projectName)) {
        window.showErrorMessage(
            `Invalid project name "${projectName}". Name must be lowercase, use only letters, numbers and hyphens.`
        );
        return;
    }

    // Определяем язык
    const languageType = await detectLanguage(sourcePath, fileSystem);
    if (!languageType) {
        window.showErrorMessage('Could not detect project language. Make sure it has pyproject.toml, package.json, or go.mod.');
        return;
    }

    const language = getLanguage(languageType);

    // Целевой путь
    const targetPath = path.join(workspacePath, 'microservices', projectName);
    const relativePath = `microservices/${projectName}`;

    // Проверяем существование
    if (await fileSystem.exists(targetPath)) {
        const overwrite = await window.showWarningMessage(
            `Folder microservices/${projectName} already exists. Overwrite?`,
            'Yes', 'No'
        );
        if (overwrite !== 'Yes') {
            return;
        }
    }

    try {
        const microserviceService = new MicroserviceService(fileSystem, language);

        await window.withProgress({
            location: 15,
            title: `Importing ${language.displayName} microservice ${projectName}`,
            cancellable: false
        }, async (progress) => {
            progress.report({ message: 'Copying files...' });
            await microserviceService.importProject(
                sourcePath,
                targetPath,
                projectName,
                workspacePath,
                relativePath
            );

            progress.report({ message: 'Integrating with Serverpod...' });
            const templatesPath = workspace.getConfiguration('codeGenerator').get<string>('templatesPath') || 'G:\\Templates';
            await workflowModifier.updateServerpodDeploymentEnv(workspacePath, projectName);
            await workflowModifier.copyServerpodEndpoint(workspacePath, projectName, templatesPath);
            await workflowModifier.copyFlutterHealthCheckWidget(workspacePath, projectName, templatesPath);
            await workflowModifier.patchDeveloperToolsPage(workspacePath, projectName);

            // Запускаем serverpod generate
            progress.report({ message: 'Running serverpod generate...' });
            const repoName = path.basename(workspacePath);
            const serverPath = path.join(workspacePath, `${repoName}_server`);
            await executeCommand('serverpod generate', serverPath);
        });

        window.showInformationMessage(`✅ ${language.displayName} microservice "${projectName}" imported successfully!`);
    } catch (error) {
        window.showErrorMessage(`Error importing microservice: ${error}`);
    }
}
