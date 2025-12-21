/**
 * Модуль модификации workflow для standalone проектов.
 */
import path from 'path';
import { WorkflowDependencies } from './types';
import { findWorkflowFile } from './workflow_file_finder';
import { updateK8sManifests, updateEnvExample } from './k8s_manifest_updater';

/** Плейсхолдеры шаблонов для разных языков */
const TEMPLATE_PLACEHOLDERS = ['python-fastapi', 'node-fastify', 'go-fiber', 'go-gin'];

/**
 * Обновляет workflow и K8s манифесты для standalone проекта.
 * Заменяет плейсхолдеры шаблонов на реальное имя проекта.
 */
export async function updateForStandalone(
    deps: WorkflowDependencies,
    projectPath: string,
    projectName: string
): Promise<void> {
    const workflowDir = path.join(projectPath, '.github', 'workflows');
    const workflowPath = path.join(workflowDir, 'deployment.yml');

    if (await deps.fileSystem.exists(workflowPath)) {
        let content = await deps.fileSystem.readFile(workflowPath);
        for (const placeholder of TEMPLATE_PLACEHOLDERS) {
            content = content.replace(new RegExp(placeholder, 'g'), projectName);
        }

        const newWorkflowPath = path.join(workflowDir, `deployment-${projectName}.yml`);
        await deps.fileSystem.createFile(newWorkflowPath, content);
        await deps.fileSystem.deleteFile(workflowPath);
    }

    await updateK8sManifests(deps, projectPath, projectName);
    await updateEnvExample(deps, projectPath, projectName);
}

/**
 * Убирает monorepo-специфичные модификации из workflow.
 * Используется при экспорте микросервиса из монорепо в standalone.
 */
export async function revertToStandalone(
    deps: WorkflowDependencies,
    projectPath: string,
    projectName: string
): Promise<void> {
    const workflowDir = path.join(projectPath, '.github', 'workflows');
    const workflowPath = await findWorkflowFile(deps, workflowDir);

    if (!workflowPath) {
        return;
    }

    let content = await deps.fileSystem.readFile(workflowPath);

    // Убираем paths filter
    content = content.replace(
        /on:\s*\n\s+push:\s*\n\s+branches:\s*\[([^\]]+)\]\s*\n\s+paths:\s*\n\s+- '[^']+'\s*\n\s+- '[^']+'/,
        `on:\n  push:\n    branches: [$1]`
    );

    // Убираем working-directory
    content = content.replace(
        /\n\s+defaults:\s*\n\s+run:\s*\n\s+working-directory:\s*[^\n]+/g,
        ''
    );

    // Заменяем пути обратно на локальные
    content = content.replace(/context:\s*\.\/microservices\/[^\/\n]+/g, 'context: .');
    content = content.replace(/file:\s*\.\/microservices\/[^\/\n]+\/Dockerfile\.prod/g, 'file: ./Dockerfile.prod');
    content = content.replace(/microservices\/[^\/\n]+\/k8s\/configmap\.yaml/g, 'k8s/configmap.yaml');
    content = content.replace(/microservices\/[^\/\n]+\/k8s\/service\.yaml/g, 'k8s/service.yaml');
    content = content.replace(/microservices\/[^\/\n]+\/k8s\/deployment\.yaml/g, 'k8s/deployment.yaml');

    await deps.fileSystem.createFile(workflowPath, content);
}
