import path from 'path';
import { parseDocument, YAMLMap, YAMLSeq } from 'yaml';
import { WorkflowDependencies } from './types';

/**
 * Обновляет Serverpod deployment.yaml с использованием YAML-парсера.
 */
export async function updateServerpodDeploymentEnvYaml(
    deps: WorkflowDependencies,
    workspacePath: string,
    serviceName: string,
    port: number = 8000
): Promise<void> {
    const projectName = path.basename(workspacePath);
    const deploymentPath = path.join(workspacePath, `${projectName}_server`, 'k8s', 'deployment.yaml');

    if (!await deps.fileSystem.exists(deploymentPath)) {
        return;
    }

    const content = await deps.fileSystem.readFile(deploymentPath);
    const doc = parseDocument(content);

    // Находим containers[0]
    const spec = doc.getIn(['spec', 'template', 'spec']) as any;
    if (!spec) {
        return;
    }

    const containers = spec.get('containers') as YAMLSeq;
    if (!containers || containers.items.length === 0) {
        return;
    }

    const mainContainer = containers.get(0) as YAMLMap;
    if (!mainContainer) {
        return;
    }

    let env = mainContainer.get('env') as YAMLSeq;
    if (!env) {
        env = new YAMLSeq();
        mainContainer.set('env', env);
    }

    const envVarName = `${serviceName.toUpperCase().replace(/-/g, '_')}_SERVICE_URL`;
    const envVarValue = `http://${serviceName}-service:${port}`;

    // Ищем существующую переменную
    let existingIndex = -1;
    for (let i = 0; i < env.items.length; i++) {
        const item = env.get(i) as YAMLMap;
        if (item && item.get('name') === envVarName) {
            existingIndex = i;
            break;
        }
    }

    if (existingIndex !== -1) {
        // Обновляем существующую
        const item = env.get(existingIndex) as YAMLMap;
        item.set('value', envVarValue);
    } else {
        // Добавляем новую
        const newEnv = doc.createNode({
            name: envVarName,
            value: envVarValue
        });
        env.add(newEnv);
    }

    await deps.fileSystem.createFile(deploymentPath, doc.toString());
}

/**
 * Удаляет переменную окружения из deployment.yaml Serverpod с использованием YAML-парсера.
 */
export async function removeServerpodDeploymentEnvYaml(
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
    const doc = parseDocument(content);

    const spec = doc.getIn(['spec', 'template', 'spec']) as any;
    if (!spec) {
        return;
    }

    const containers = spec.get('containers') as YAMLSeq;
    if (!containers || containers.items.length === 0) {
        return;
    }

    const mainContainer = containers.get(0) as YAMLMap;
    if (!mainContainer) {
        return;
    }

    const env = mainContainer.get('env') as YAMLSeq;
    if (!env) {
        return;
    }

    const envVarName = `${serviceName.toUpperCase().replace(/-/g, '_')}_SERVICE_URL`;

    for (let i = 0; i < env.items.length; i++) {
        const item = env.get(i) as YAMLMap;
        if (item && item.get('name') === envVarName) {
            env.delete(i);
            break;
        }
    }

    await deps.fileSystem.createFile(deploymentPath, doc.toString());
}
