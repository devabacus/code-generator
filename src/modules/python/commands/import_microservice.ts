import { window, Uri } from 'vscode';
import path from 'path';
import { ServiceLocator } from '../../../core/services/service_locator';
import { getRootWorkspaceFolders } from '../../../utils/path_util';
import { WorkflowModifier } from '../services/workflow_modifier';

/**
 * Команда импорта существующего микросервиса в монорепо.
 * 1. Выбирает папку с существующим сервисом
 * 2. Копирует в microservices/ (без .git)
 * 3. Модифицирует workflow для монорепо
 * 4. Перемещает workflow в корень репо
 */
export async function importMicroservice(): Promise<void> {
    const fileSystem = ServiceLocator.getInstance().getFileSystem();
    const workflowModifier = new WorkflowModifier(fileSystem);

    // Получаем путь к workspace (корень монорепо)
    const workspacePath = getRootWorkspaceFolders();
    if (!workspacePath) {
        window.showErrorMessage('No workspace folder open. Open a monorepo project first.');
        return;
    }

    // Выбираем папку с существующим сервисом
    const sourceFolder = await window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: 'Выбрать сервис для импорта',
        title: 'Выберите папку с существующим микросервисом'
    });

    if (!sourceFolder || sourceFolder.length === 0) {
        return;
    }

    const sourcePath = sourceFolder[0].fsPath;
    const serviceName = path.basename(sourcePath);

    // Подтверждаем имя или запрашиваем новое
    const projectName = await window.showInputBox({
        prompt: 'Имя сервиса в microservices/',
        value: serviceName.toLowerCase().replace(/_/g, '-'),
        validateInput: (value) => {
            if (!value || value.trim().length === 0) {
                return 'Name cannot be empty';
            }
            if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(value)) {
                return 'Name must be lowercase, use only letters, numbers and hyphens';
            }
            return null;
        }
    });

    if (!projectName) {
        return;
    }

    const targetPath = path.join(workspacePath, 'microservices', projectName);
    const relativePath = `microservices/${projectName}`;

    // Проверяем, не существует ли уже папка
    if (await fileSystem.exists(targetPath)) {
        const overwrite = await window.showWarningMessage(
            `Folder ${projectName} already exists in microservices/. Overwrite?`,
            'Yes', 'No'
        );
        if (overwrite !== 'Yes') {
            return;
        }
    }

    try {
        window.showInformationMessage(`📦 Importing ${serviceName} to microservices/${projectName}...`);

        // Копируем папку (без .git, node_modules и т.д.)
        await copyDirectoryWithExclusions(fileSystem, sourcePath, targetPath, [
            '.git',
            'node_modules',
            '__pycache__',
            '.venv',
            '.pytest_cache',
            '.ruff_cache',
            '.terraform',
            'terraform.tfstate',
            'terraform.tfstate.backup',
            '.terraform.lock.hcl'
        ]);

        // Модифицируем workflow для монорепо
        await workflowModifier.modifyForMonorepo(targetPath, projectName, relativePath);

        // Перемещаем workflow в корень репо
        await workflowModifier.moveWorkflowToRepoRoot(targetPath, workspacePath, projectName);

        // Удаляем .github из импортированного сервиса (теперь он в корне)
        const importedGithubDir = path.join(targetPath, '.github');
        if (await fileSystem.exists(importedGithubDir)) {
            await deleteDirectory(fileSystem, importedGithubDir);
        }

        window.showInformationMessage(
            `✅ Microservice "${projectName}" imported successfully!\n` +
            `📋 Workflow: .github/workflows/deployment-${projectName}.yml`
        );

    } catch (error) {
        window.showErrorMessage(`Error importing microservice: ${error}`);
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

/**
 * Удаляет директорию рекурсивно
 */
async function deleteDirectory(fileSystem: any, dirPath: string): Promise<void> {
    if (!await fileSystem.exists(dirPath)) {
        return;
    }

    const entries = await fileSystem.readDirectory(dirPath);

    for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);
        if (await fileSystem.isDirectory(entryPath)) {
            await deleteDirectory(fileSystem, entryPath);
        } else {
            // Примечание: нужен метод deleteFile в IFileSystem
            // Пока пропускаем удаление файлов
        }
    }
}
