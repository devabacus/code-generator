import { window, Uri } from 'vscode';
import path from 'path';
import { ServiceLocator } from '../../../core/services/service_locator';
import { MicroserviceService } from '../../../core/services/microservice_service';
import { detectLanguage } from '../../../core/services/language_detector';
import { getLanguage } from '../../../core/language_registry';
import { getRootWorkspaceFolders } from '../utils/path_util';
import { executeCommand } from '../utils/terminal_handle';
import { gitInit } from '../utils/git_init';
import { workspace } from 'vscode';

/**
 * Унифицированная команда экспорта микросервиса из монорепо.
 * Язык определяется автоматически.
 */
export async function exportMicroservice(): Promise<void> {
    const fileSystem = ServiceLocator.getInstance().getFileSystem();

    // Получаем путь к workspace (корень монорепо)
    const workspacePath = getRootWorkspaceFolders();
    if (!workspacePath) {
        window.showErrorMessage('No workspace folder open. Open a monorepo project first.');
        return;
    }

    // Проверяем наличие microservices/
    const microservicesPath = path.join(workspacePath, 'microservices');
    if (!await fileSystem.exists(microservicesPath)) {
        window.showErrorMessage('No microservices/ folder found in workspace.');
        return;
    }

    // Получаем список микросервисов
    const entries = await fileSystem.readDirectory(microservicesPath);
    const microservices: string[] = [];
    for (const entry of entries) {
        const entryPath = path.join(microservicesPath, entry);
        if (await fileSystem.isDirectory(entryPath)) {
            microservices.push(entry);
        }
    }

    if (microservices.length === 0) {
        window.showWarningMessage('No microservices found in microservices/ folder.');
        return;
    }

    // Показываем выбор микросервиса
    const selectedService = await window.showQuickPick(
        microservices.map(name => ({ label: name, description: `microservices/${name}` })),
        { placeHolder: 'Select microservice to export' }
    );

    if (!selectedService) {
        return;
    }

    const serviceName = selectedService.label;
    const sourcePath = path.join(microservicesPath, serviceName);

    // Определяем язык
    const languageType = await detectLanguage(sourcePath, fileSystem);
    if (!languageType) {
        window.showErrorMessage('Could not detect project language.');
        return;
    }

    const language = getLanguage(languageType);

    // Дефолтный путь
    const defaultPath = workspace.getConfiguration('codeGenerator').get<string>('pythonProjectsPath') || 'G:\\Projects\\Python';

    // Выбираем папку назначения
    const targetFolder = await window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        defaultUri: Uri.file(defaultPath),
        openLabel: 'Select folder for export',
        title: 'Select export destination'
    });

    if (!targetFolder || targetFolder.length === 0) {
        return;
    }

    const targetPath = path.join(targetFolder[0].fsPath, serviceName);

    // Проверяем существование
    if (await fileSystem.exists(targetPath)) {
        const overwrite = await window.showWarningMessage(
            `Folder ${serviceName} already exists. Overwrite?`,
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
            title: `Exporting ${serviceName}`,
            cancellable: false
        }, async (progress) => {
            progress.report({ message: 'Copying files...' });
            await microserviceService.exportProject(
                sourcePath,
                targetPath,
                serviceName,
                workspacePath
            );
        });

        // CI/CD setup
        const setupCICD = await window.showQuickPick(
            [
                { label: '$(check) Yes, setup CI/CD now', description: 'Run terraform for GitHub Secrets', value: true },
                { label: '$(x) No, setup later', description: 'Run apply.ps1 manually', value: false }
            ],
            { placeHolder: 'Setup GitHub Secrets for CI/CD?' }
        );

        await gitInit(targetPath, serviceName, { setupCICD: setupCICD?.value ?? false });

        const openProject = await window.showInformationMessage(
            `✅ Microservice "${serviceName}" exported to ${targetPath}`,
            'Open in new window'
        );

        if (openProject === 'Open in new window') {
            await executeCommand(`antigravity -g "${targetPath}"`, targetPath);
        }
    } catch (error) {
        window.showErrorMessage(`Error exporting microservice: ${error}`);
    }
}
