import { window, Uri } from 'vscode';
import path from 'path';
import { ServiceLocator } from '../../../core/services/service_locator';
import { getRootWorkspaceFolders } from '../../../utils/path_util';
import { WorkflowModifier } from '../services/workflow_modifier';
import { getTemplatesPath } from '../ui/project_picker';
import { executeCommand } from '../../../utils';

/**
 * Команда импорта существующего микросервиса в монорепо.
 * 1. Выбирает папку с существующим сервисом (по умолчанию G:\Projects\Python)
 * 2. Копирует в microservices/ (без .git)
 * 3. Модифицирует workflow для монорепо
 * 4. Создаёт Serverpod endpoint и Flutter виджет
 * 5. Добавляет env var в deployment.yaml
 * 6. Патчит developer_tools_page.dart
 * 7. Запускает serverpod generate
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

    // Получаем путь к шаблонам
    const templatesPath = getTemplatesPath();
    if (!templatesPath) {
        window.showErrorMessage('Templates path not configured. Set codeGenerator.templatesPath in settings.');
        return;
    }

    // Дефолтный путь для Python проектов
    const defaultPythonProjectsPath = 'G:\\Projects\\Python';

    // Выбираем папку с существующим сервисом
    const sourceFolder = await window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        defaultUri: Uri.file(defaultPythonProjectsPath),
        openLabel: 'Выбрать сервис для импорта',
        title: 'Выберите папку с существующим микросервисом'
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
        await window.withProgress({
            location: 15, // Notification
            title: `Импорт микросервиса ${projectName}`,
            cancellable: false
        }, async (progress) => {

            // Шаг 1: Копирование
            progress.report({ message: 'Копирование файлов...' });
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

            // Шаг 2: Модификация workflow
            progress.report({ message: 'Настройка CI/CD workflow...' });
            await workflowModifier.modifyForMonorepo(targetPath, projectName, relativePath);
            await workflowModifier.moveWorkflowToRepoRoot(targetPath, workspacePath, projectName);

            // Удаляем .github из импортированного сервиса (теперь он в корне)
            const importedGithubDir = path.join(targetPath, '.github');
            if (await fileSystem.exists(importedGithubDir)) {
                await fileSystem.deleteDirectory(importedGithubDir);
            }

            // Шаг 3: Serverpod интеграция (K8s манифесты уже содержат правильные имена в импортируемом проекте)
            progress.report({ message: 'Создание Serverpod endpoint...' });
            await workflowModifier.updateServerpodDeploymentEnv(workspacePath, projectName);
            await workflowModifier.copyServerpodEndpoint(workspacePath, projectName, templatesPath);
            await workflowModifier.copyFlutterHealthCheckWidget(workspacePath, projectName, templatesPath);
            await workflowModifier.patchDeveloperToolsPage(workspacePath, projectName);

            // Шаг 5: Serverpod generate
            progress.report({ message: 'Запуск serverpod generate...' });
            const projectBaseName = path.basename(workspacePath);
            const serverPath = path.join(workspacePath, `${projectBaseName}_server`);
            await executeCommand('serverpod generate --experimental-features=all', serverPath);
        });

        window.showInformationMessage(
            `✅ Microservice "${projectName}" imported successfully!\n` +
            `📋 Workflow: .github/workflows/deployment-${projectName}.yml\n` +
            `🔌 Endpoint: ${projectName}_endpoint.dart\n` +
            `💚 Widget: ${projectName}_health_check_card.dart`
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
