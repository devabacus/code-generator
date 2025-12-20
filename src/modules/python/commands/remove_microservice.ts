import { window, QuickPickItem } from 'vscode';
import path from 'path';
import { ServiceLocator } from '../../../core/services/service_locator';
import { getRootWorkspaceFolders } from '../../../utils/path_util';
import { WorkflowModifier } from '../services/workflow_modifier';
import { executeCommand } from '../../../utils';

/**
 * Команда для полного удаления микросервиса из проекта.
 * 1. Находит микросервисы в проекте.
 * 2. Удаляет папку сервиса.
 * 3. Удаляет endpoint и виджет.
 * 4. Чистит deployment.yaml и developer_tools_page.dart.
 * 5. Удаляет ресурсы из Kubernetes.
 * 6. Запускает serverpod generate.
 */
export async function removeMicroservice(): Promise<void> {
    const fileSystem = ServiceLocator.getInstance().getFileSystem();
    const workflowModifier = new WorkflowModifier(fileSystem);
    const workspacePath = getRootWorkspaceFolders();

    if (!workspacePath) {
        window.showErrorMessage('No workspace folder found. Open a project first.');
        return;
    }

    try {
        // 1. Поиск микросервисов
        const microservices: string[] = [];

        // Проверяем папку microservices
        const microPath = path.join(workspacePath, 'microservices');
        if (await fileSystem.exists(microPath)) {
            const dirs = await fileSystem.readDirectory(microPath);
            for (const d of dirs) {
                if (await fileSystem.isDirectory(path.join(microPath, d))) {
                    microservices.push(path.join('microservices', d));
                }
            }
        }

        // Проверяем корень на наличие папок с суффиксами (например t115_python)
        const rootDirs = await fileSystem.readDirectory(workspacePath);
        const suffixPattern = /_python$|_node$|_go$/;
        for (const d of rootDirs) {
            if (suffixPattern.test(d) && await fileSystem.isDirectory(path.join(workspacePath, d))) {
                microservices.push(d);
            }
        }

        if (microservices.length === 0) {
            window.showInformationMessage('No microservices found to remove.');
            return;
        }

        // 2. Выбор микросервиса
        const selected = await window.showQuickPick(microservices, {
            placeHolder: 'Выберите микросервис для ПОЛНОГО удаления'
        });

        if (!selected) {
            return;
        }

        // Определяем имя сервиса для патчинга (например, python1)
        const serviceFolderName = path.basename(selected);
        const serviceName = serviceFolderName.includes('_')
            ? serviceFolderName.split('_').slice(1).join('_')
            : serviceFolderName;

        // 3. Подтверждение
        const confirm = await window.showWarningMessage(
            `ВНИМАНИЕ! Вы собираетесь удалить микросервис "${selected}".\n` +
            `Это удалит папку проекта, endpoint, виджет, CI workflow и ресурсы в Kubernetes.\n` +
            `Вы уверены?`,
            { modal: true },
            'Удалить всё'
        );

        if (confirm !== 'Удалить всё') {
            return;
        }

        // 4. Процесс удаления
        const fullTargetPath = path.join(workspacePath, selected);

        await window.withProgress({
            location: 15, // Notification
            title: `Удаление микросервиса ${serviceName}`,
            cancellable: false
        }, async (progress) => {

            // Шаг 1: Kubernetes
            progress.report({ message: 'Удаление ресурсов из Kubernetes (kubectl)...' });
            try {
                const projectName = path.basename(workspacePath);
                const k8sDir = path.join(fullTargetPath, 'k8s');

                // 1. Попытка удаления по манифестам (если папка еще есть)
                if (await fileSystem.exists(k8sDir)) {
                    await executeCommand(`kubectl delete -f k8s/ -n ${projectName}`, fullTargetPath);
                }

                // 2. Добиваем по меткам (на всякий случай и для старых версий)
                await executeCommand(`kubectl delete all,configmap,ingress,secret -l app=${serviceName}-service -n ${projectName}`, workspacePath);
                await executeCommand(`kubectl delete all,configmap,ingress,secret -l app=${serviceName} -n ${projectName}`, workspacePath);
            } catch (e) {
                console.warn('Kubectl delete failed, maybe resources don\'t exist.');
            }

            // Шаг 2: Конфигурации
            progress.report({ message: 'Очистка конфигураций (deployment.yaml, developer_tools)...' });
            await workflowModifier.removeServerpodDeploymentEnv(workspacePath, serviceName);
            await workflowModifier.unpatchDeveloperToolsPage(workspacePath, serviceName);

            // Шаг 3: Ассоциированные файлы
            progress.report({ message: 'Удаление endpoint и виджетов...' });
            const projectName = path.basename(workspacePath);
            const serverPath = path.join(workspacePath, `${projectName}_server`);
            const flutterPath = path.join(workspacePath, `${projectName}_flutter`);

            // Удаляем endpoint
            const endpointPath = path.join(serverPath, 'lib', 'src', 'endpoints', `${serviceName}_endpoint.dart`);
            if (await fileSystem.exists(endpointPath)) {
                await fileSystem.deleteDirectory(endpointPath); // rm работает и для файлов
            }

            // Удаляем виджет и папку фичи, если она пустая или специфичная для сервиса
            const featureDir = path.join(flutterPath, 'lib', 'features', serviceName);
            if (await fileSystem.exists(featureDir)) {
                await fileSystem.deleteDirectory(featureDir);
            }

            // Удаляем CI workflow
            const workflowPath = path.join(workspacePath, '.github', 'workflows', `deployment-${serviceName}.yml`);
            if (await fileSystem.exists(workflowPath)) {
                await fileSystem.deleteDirectory(workflowPath);
            }

            // Шаг 4: Сама папка проекта
            progress.report({ message: 'Удаление папки проекта...' });
            await fileSystem.deleteDirectory(fullTargetPath);

            // Шаг 5: Serverpod generate
            progress.report({ message: 'Запуск serverpod generate...' });
            await executeCommand('serverpod generate --experimental-features=all', serverPath);
        });

        window.showInformationMessage(`✅ Микросервис ${serviceName} успешно удален.`);

    } catch (error) {
        window.showErrorMessage(`Ошибка при удалении микросервиса: ${error}`);
    }
}
