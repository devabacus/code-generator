/**
 * Модуль копирования Flutter health check widgets.
 */
import path from 'path';
import { WorkflowDependencies, toPascalCase } from './types';

/**
 * Копирует Flutter health check виджет из шаблона.
 */
export async function copyFlutterHealthCheckWidget(
    deps: WorkflowDependencies,
    workspacePath: string,
    serviceName: string,
    templatesPath: string
): Promise<void> {
    const projectName = path.basename(workspacePath);
    const flutterPath = path.join(workspacePath, `${projectName}_flutter`);

    if (!await deps.fileSystem.exists(flutterPath)) {
        return;
    }

    // Копируем shared_health_check_widgets.dart
    const sharedWidgetsDir = path.join(flutterPath, 'lib', 'features', 'developer_tools', 'presentation', 'widgets');
    const sharedWidgetsPath = path.join(sharedWidgetsDir, 'shared_health_check_widgets.dart');

    if (!await deps.fileSystem.exists(sharedWidgetsPath)) {
        const sourceSharedWidgets = path.join(templatesPath, 'flutter', 't115', 't115_flutter', 'lib', 'features', 'developer_tools', 'presentation', 'widgets', 'shared_health_check_widgets.dart');
        if (await deps.fileSystem.exists(sourceSharedWidgets)) {
            await deps.fileSystem.createFolder(sharedWidgetsDir);
            let content = await deps.fileSystem.readFile(sourceSharedWidgets);
            content = content.replace(/t115/g, projectName);
            await deps.fileSystem.createFile(sharedWidgetsPath, content);
        }
    }

    // Копируем health check card
    const sourceWidget = path.join(templatesPath, 'flutter', 't115', 't115_flutter', 'lib', 'features', 'python', 'presentation', 'widgets', 'python_health_check_card.dart');

    if (!await deps.fileSystem.exists(sourceWidget)) {
        return;
    }

    const targetWidgetDir = path.join(flutterPath, 'lib', 'features', serviceName, 'presentation', 'widgets');
    const targetWidgetPath = path.join(targetWidgetDir, `${serviceName}_health_check_card.dart`);

    if (await deps.fileSystem.exists(targetWidgetPath)) {
        return;
    }

    await deps.fileSystem.createFolder(targetWidgetDir);

    let content = await deps.fileSystem.readFile(sourceWidget);
    content = content.replace(/t115/g, projectName);
    content = content.replace(/python/g, serviceName);
    content = content.replace(/Python/g, toPascalCase(serviceName));

    await deps.fileSystem.createFile(targetWidgetPath, content);
}
