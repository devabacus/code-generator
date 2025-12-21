import { window, Uri } from 'vscode';
import path from 'path';
import { ServiceLocator } from '../../../core/services/service_locator';
import { getRootWorkspaceFolders } from '../../../utils/path_util';
import { WorkflowModifier } from '../services/workflow_modifier';
import { executeCommand } from '../../../utils';
import { gitInit } from '../../../utils/git_init';

/**
 * Команда экспорта микросервиса из монорепо в standalone проект.
 * 1. Выбирает микросервис из microservices/
 * 2. Копирует в выбранную папку
 * 3. Копирует workflow из корня монорепо
 * 4. Убирает monorepo-специфичные модификации (paths, working-directory, пути)
 * 5. Инициализирует git
 */
export async function exportMicroservice(): Promise<void> {
    const fileSystem = ServiceLocator.getInstance().getFileSystem();
    const workflowModifier = new WorkflowModifier(fileSystem);

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
        { placeHolder: 'Выберите микросервис для экспорта' }
    );

    if (!selectedService) {
        return;
    }

    const serviceName = selectedService.label;
    const sourcePath = path.join(microservicesPath, serviceName);

    // Дефолтный путь для Python проектов
    const defaultPythonProjectsPath = 'G:\\Projects\\Python';

    // Выбираем папку назначения
    const targetFolder = await window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        defaultUri: Uri.file(defaultPythonProjectsPath),
        openLabel: 'Выбрать папку для экспорта',
        title: 'Выберите папку, куда экспортировать микросервис'
    });

    if (!targetFolder || targetFolder.length === 0) {
        return;
    }

    const targetPath = path.join(targetFolder[0].fsPath, serviceName);

    // Проверяем, не существует ли уже папка
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
        await window.withProgress({
            location: 15, // Notification
            title: `Экспорт микросервиса ${serviceName}`,
            cancellable: false
        }, async (progress) => {

            // Шаг 1: Копирование микросервиса
            progress.report({ message: 'Копирование файлов...' });
            await copyDirectoryWithExclusions(fileSystem, sourcePath, targetPath, [
                '__pycache__',
                '.venv',
                '.pytest_cache',
                '.ruff_cache'
            ]);

            // Шаг 2: Копирование workflow из корня монорепо
            progress.report({ message: 'Копирование workflow...' });
            const repoWorkflowPath = path.join(workspacePath, '.github', 'workflows', `deployment-${serviceName}.yml`);
            const targetWorkflowDir = path.join(targetPath, '.github', 'workflows');
            const targetWorkflowPath = path.join(targetWorkflowDir, `deployment-${serviceName}.yml`);

            if (await fileSystem.exists(repoWorkflowPath)) {
                await fileSystem.createFolder(targetWorkflowDir);
                const workflowContent = await fileSystem.readFile(repoWorkflowPath);
                await fileSystem.createFile(targetWorkflowPath, workflowContent);
            }

            // Шаг 3: Убираем monorepo-специфичные модификации
            progress.report({ message: 'Настройка для standalone...' });
            await workflowModifier.revertToStandalone(targetPath, serviceName);
        });

        // Спрашиваем про настройку CI/CD
        const setupCICD = await window.showQuickPick(
            [
                { label: '$(check) Да, настроить CI/CD сейчас', description: 'Запустит terraform для GitHub Secrets', value: true },
                { label: '$(x) Нет, настрою позже', description: 'Запущу apply.ps1 вручную', value: false }
            ],
            { placeHolder: 'Настроить GitHub Secrets для CI/CD?' }
        );

        // Git init с опциональной настройкой CI/CD
        await gitInit(targetPath, serviceName, { setupCICD: setupCICD?.value ?? false });

        // Спрашиваем, открыть ли проект
        const openProject = await window.showInformationMessage(
            `✅ Microservice "${serviceName}" exported to ${targetPath}`,
            'Открыть в новом окне'
        );

        if (openProject === 'Открыть в новом окне') {
            await executeCommand(`antigravity -g "${targetPath}"`, targetPath);
        }

    } catch (error) {
        window.showErrorMessage(`Error exporting microservice: ${error}`);
    }
}

/**
 * Копирует директорию рекурсивно с исключениями
 */
async function copyDirectoryWithExclusions(
    fileSystem: any,
    source: string,
    destination: string,
    excludes: string[]
): Promise<void> {
    await fileSystem.createFolder(destination);

    const entries = await fileSystem.readDirectory(source);

    for (const entry of entries) {
        if (excludes.includes(entry)) {
            continue;
        }

        const sourcePath = path.join(source, entry);
        const destPath = path.join(destination, entry);

        if (await fileSystem.isDirectory(sourcePath)) {
            await copyDirectoryWithExclusions(fileSystem, sourcePath, destPath, excludes);
        } else {
            const content = await fileSystem.readFile(sourcePath);
            await fileSystem.createFile(destPath, content);
        }
    }
}
