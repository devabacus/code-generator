/**
 * Модуль обновления K8s манифестов.
 */
import path from 'path';
import { WorkflowDependencies } from './types';

/** Плейсхолдеры шаблонов для разных языков (base names without -service) */
const TEMPLATE_PLACEHOLDERS = [
    'python-fastapi',
    'node-fastify',
    'go-fiber',
    't115-node'
];

/**
 * Обновляет K8s манифесты с реальным именем сервиса.
 * Заменяет плейсхолдеры шаблонов на {projectName}
 */
export async function updateK8sManifests(
    deps: WorkflowDependencies,
    projectPath: string,
    projectName: string
): Promise<void> {
    const k8sDir = path.join(projectPath, 'k8s');
    const files = ['deployment.yaml', 'service.yaml', 'configmap.yaml'];

    for (const file of files) {
        const filePath = path.join(k8sDir, file);
        if (await deps.fileSystem.exists(filePath)) {
            let content = await deps.fileSystem.readFile(filePath);
            for (const placeholder of TEMPLATE_PLACEHOLDERS) {
                content = content.replace(new RegExp(placeholder, 'g'), projectName);
            }
            await deps.fileSystem.createFile(filePath, content);
        }
    }
}

/**
 * Обновляет .env.example с реальным именем сервиса.
 */
export async function updateEnvExample(
    deps: WorkflowDependencies,
    projectPath: string,
    projectName: string
): Promise<void> {
    const envPath = path.join(projectPath, '.env.example');

    if (await deps.fileSystem.exists(envPath)) {
        let content = await deps.fileSystem.readFile(envPath);
        content = content.replace(/python-service/g, `${projectName}-service`);
        content = content.replace(/node-service/g, `${projectName}-service`);
        content = content.replace(/go-service/g, `${projectName}-service`);
        await deps.fileSystem.createFile(envPath, content);
    }
}
