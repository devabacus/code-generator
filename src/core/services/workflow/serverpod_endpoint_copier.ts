/**
 * Модуль копирования Serverpod endpoint.
 */
import path from 'path';
import { WorkflowDependencies, toPascalCase } from './types';

/**
 * Копирует Serverpod endpoint из шаблона.
 */
export async function copyServerpodEndpoint(
    deps: WorkflowDependencies,
    workspacePath: string,
    serviceName: string,
    templatesPath: string
): Promise<void> {
    const projectName = path.basename(workspacePath);
    const serverPath = path.join(workspacePath, `${projectName}_server`);

    if (!await deps.fileSystem.exists(serverPath)) {
        return;
    }

    const endpointsDir = path.join(serverPath, 'lib', 'src', 'endpoints');

    // Копируем shared/microservice_endpoint.dart
    const sharedDir = path.join(endpointsDir, 'shared');
    const sharedDestPath = path.join(sharedDir, 'microservice_endpoint.dart');

    if (!await deps.fileSystem.exists(sharedDestPath)) {
        const sharedSourcePath = path.join(templatesPath, 'flutter', 't115', 't115_server', 'lib', 'src', 'endpoints', 'shared', 'microservice_endpoint.dart');
        if (await deps.fileSystem.exists(sharedSourcePath)) {
            await deps.fileSystem.createFolder(sharedDir);
            const sharedContent = await deps.fileSystem.readFile(sharedSourcePath);
            await deps.fileSystem.createFile(sharedDestPath, sharedContent);
        }
    }

    // Копируем endpoint
    const sourceEndpoint = path.join(templatesPath, 'flutter', 't115', 't115_server', 'lib', 'src', 'endpoints', 'python_endpoint.dart');

    if (!await deps.fileSystem.exists(sourceEndpoint)) {
        return;
    }

    const targetEndpointPath = path.join(endpointsDir, `${serviceName}_endpoint.dart`);

    if (await deps.fileSystem.exists(targetEndpointPath)) {
        return;
    }

    await deps.fileSystem.createFolder(endpointsDir);

    let content = await deps.fileSystem.readFile(sourceEndpoint);
    content = content.replace(/python/g, serviceName);
    content = content.replace(/Python/g, toPascalCase(serviceName));
    content = content.replace(/PYTHON/g, serviceName.toUpperCase());

    await deps.fileSystem.createFile(targetEndpointPath, content);
}
