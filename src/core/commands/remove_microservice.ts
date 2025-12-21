import { window } from 'vscode';
import path from 'path';
import { ServiceLocator } from '../services/service_locator';
import { WorkflowModifier } from '../services/workflow_modifier';
import { detectLanguage } from '../services/language_detector';
import { getLanguage } from '../language_registry';
import { getRootWorkspaceFolders } from '../../utils/path_util';
import { executeCommand } from '../../utils';

/**
 * Унифицированная команда удаления микросервиса из проекта.
 */
export async function removeMicroservice(): Promise<void> {
    const fileSystem = ServiceLocator.getInstance().getFileSystem();
    const workflowModifier = new WorkflowModifier(fileSystem);

    const workspacePath = getRootWorkspaceFolders();
    if (!workspacePath) {
        window.showErrorMessage('No workspace folder open.');
        return;
    }

    // Собираем список микросервисов
    const microservicesPath = path.join(workspacePath, 'microservices');
    if (!await fileSystem.exists(microservicesPath)) {
        window.showWarningMessage('No microservices/ folder found.');
        return;
    }

    const entries = await fileSystem.readDirectory(microservicesPath);
    const microservices: { name: string; language: string }[] = [];

    for (const entry of entries) {
        const entryPath = path.join(microservicesPath, entry);
        if (await fileSystem.isDirectory(entryPath)) {
            const lang = await detectLanguage(entryPath, fileSystem);
            microservices.push({
                name: entry,
                language: lang ? getLanguage(lang).displayName : 'Unknown'
            });
        }
    }

    if (microservices.length === 0) {
        window.showWarningMessage('No microservices found.');
        return;
    }

    // Показываем выбор
    const selected = await window.showQuickPick(
        microservices.map(m => ({
            label: m.name,
            description: m.language,
            detail: `microservices/${m.name}`
        })),
        { placeHolder: 'Select microservice to remove' }
    );

    if (!selected) {
        return;
    }

    const serviceName = selected.label;

    // Подтверждение
    const confirm = await window.showWarningMessage(
        `Are you sure you want to remove "${serviceName}"? This will delete:\n` +
        `• microservices/${serviceName}/\n` +
        `• .github/workflows/deployment-${serviceName}.yml\n` +
        `• Serverpod endpoint and Flutter widget`,
        { modal: true },
        'Yes, remove'
    );

    if (confirm !== 'Yes, remove') {
        return;
    }

    try {
        await window.withProgress({
            location: 15,
            title: `Removing ${serviceName}`,
            cancellable: false
        }, async (progress) => {
            const repoName = path.basename(workspacePath);

            // 1. Удаляем workflow
            progress.report({ message: 'Removing workflow...' });
            const workflowPath = path.join(workspacePath, '.github', 'workflows', `deployment-${serviceName}.yml`);
            if (await fileSystem.exists(workflowPath)) {
                await fileSystem.deleteFile(workflowPath);
            }

            // 2. Удаляем Serverpod endpoint
            progress.report({ message: 'Removing Serverpod endpoint...' });
            const endpointPath = path.join(workspacePath, `${repoName}_server`, 'lib', 'src', 'endpoints', `${serviceName}_endpoint.dart`);
            if (await fileSystem.exists(endpointPath)) {
                await fileSystem.deleteFile(endpointPath);
            }

            // 3. Удаляем Serverpod интеграцию (env var, flutter widget)
            progress.report({ message: 'Removing Serverpod integration...' });
            await workflowModifier.removeServerpodDeploymentEnv(workspacePath, serviceName);
            await workflowModifier.unpatchDeveloperToolsPage(workspacePath, serviceName);

            // 4. Удаляем Flutter widget и feature folder
            progress.report({ message: 'Removing Flutter widget...' });
            const featurePath = path.join(workspacePath, `${repoName}_flutter`, 'lib', 'features', serviceName);
            if (await fileSystem.exists(featurePath)) {
                await fileSystem.deleteDirectory(featurePath);
            }

            // 5. Удаляем папку микросервиса
            progress.report({ message: 'Removing folder...' });
            const servicePath = path.join(microservicesPath, serviceName);
            if (await fileSystem.exists(servicePath)) {
                await fileSystem.deleteDirectory(servicePath);
            }

            // 6. Запускаем serverpod generate
            progress.report({ message: 'Running serverpod generate...' });
            const serverPath = path.join(workspacePath, `${repoName}_server`);
            await executeCommand('serverpod generate', serverPath);

            // 7. Удаляем из Kubernetes кластера (если развёрнут)
            progress.report({ message: 'Removing from Kubernetes...' });
            const namespace = repoName.replace(/_/g, '-');
            try {
                await executeCommand(`kubectl delete deployment ${serviceName}-service -n ${namespace} --ignore-not-found=true`, workspacePath);
                await executeCommand(`kubectl delete service ${serviceName}-service -n ${namespace} --ignore-not-found=true`, workspacePath);
                await executeCommand(`kubectl delete configmap ${serviceName}-service-config -n ${namespace} --ignore-not-found=true`, workspacePath);
            } catch {
                // Игнорируем ошибки kubectl (кластер может быть недоступен)
            }
        });

        window.showInformationMessage(`✅ Microservice "${serviceName}" removed successfully!`);
    } catch (error) {
        window.showErrorMessage(`Error removing microservice: ${error}`);
    }
}
