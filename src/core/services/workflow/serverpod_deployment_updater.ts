/**
 * Модуль обновления Serverpod deployment.
 */
import path from 'path';
import { WorkflowDependencies } from './types';

/**
 * Обновляет Serverpod deployment.yaml, добавляя env var для микросервиса.
 */
export async function updateServerpodDeploymentEnv(
    deps: WorkflowDependencies,
    workspacePath: string,
    serviceName: string
): Promise<void> {
    const projectName = path.basename(workspacePath);
    const deploymentPath = path.join(workspacePath, `${projectName}_server`, 'k8s', 'deployment.yaml');

    if (!await deps.fileSystem.exists(deploymentPath)) {
        return;
    }

    let content = await deps.fileSystem.readFile(deploymentPath);

    const envVarName = `${serviceName.toUpperCase().replace(/-/g, '_')}_SERVICE_URL`;
    const envVarValue = `http://${serviceName}-service:8000`;

    if (content.includes(envVarName)) {
        return;
    }

    const lines = content.split('\n');
    let insertIndex = -1;
    const indent = '            ';

    // Ищем последнюю _SERVICE_URL
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('_SERVICE_URL')) {
            insertIndex = i + 1;
        }
    }

    // Если нет, ищем после SERVERPOD_SERVICE_SECRET
    if (insertIndex === -1) {
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('key: service-secret')) {
                insertIndex = i + 1;
                break;
            }
        }
    }

    if (insertIndex > 0) {
        const newEnvVar = `${indent}- name: ${envVarName}\n${indent}  value: "${envVarValue}"`;
        lines.splice(insertIndex, 0, newEnvVar);
        content = lines.join('\n');
        await deps.fileSystem.createFile(deploymentPath, content);
    }
}

/**
 * Удаляет переменную окружения из deployment.yaml Serverpod.
 */
export async function removeServerpodDeploymentEnv(
    deps: WorkflowDependencies,
    workspacePath: string,
    serviceName: string
): Promise<void> {
    const projectName = path.basename(workspacePath);
    const deploymentPath = path.join(workspacePath, `${projectName}_server`, 'k8s', 'deployment.yaml');

    if (!await deps.fileSystem.exists(deploymentPath)) {
        return;
    }

    const content = await deps.fileSystem.readFile(deploymentPath);
    const envVarName = `${serviceName.toUpperCase().replace(/-/g, '_')}_SERVICE_URL`;

    const lines = content.split('\n');
    const newLines: string[] = [];
    let skipNext = false;

    for (let i = 0; i < lines.length; i++) {
        if (skipNext) {
            skipNext = false;
            continue;
        }
        if (lines[i].includes(`name: ${envVarName}`)) {
            skipNext = true;
            continue;
        }
        newLines.push(lines[i]);
    }

    await deps.fileSystem.createFile(deploymentPath, newLines.join('\n'));
}
