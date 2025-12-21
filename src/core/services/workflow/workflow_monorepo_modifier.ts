/**
 * Модуль модификации workflow для monorepo.
 */
import path from 'path';
import { WorkflowDependencies } from './types';
import { findWorkflowFile } from './workflow_file_finder';

/**
 * Модифицирует workflow для использования в монорепо.
 */
export async function modifyForMonorepo(
    deps: WorkflowDependencies,
    projectPath: string,
    projectName: string,
    relativePath: string
): Promise<void> {
    const workflowDir = path.join(projectPath, '.github', 'workflows');
    const workflowPath = await findWorkflowFile(deps, workflowDir);

    if (!workflowPath) {
        return;
    }

    let content = await deps.fileSystem.readFile(workflowPath);

    // Добавляем paths фильтр
    content = content.replace(
        /on:\s*\n\s+push:\s*\n\s+branches:\s*\[([^\]]+)\]/,
        `on:\n  push:\n    branches: [$1]\n    paths:\n      - '${relativePath}/**'\n      - '.github/workflows/deployment-${projectName}.yml'`
    );

    // Обновляем context и file для Docker build
    content = content.replace(/context:\s*\.\s*\n/g, `context: ./${relativePath}\n`);
    content = content.replace(/file:\s*\.\/Dockerfile\.prod/g, `file: ./${relativePath}/Dockerfile.prod`);

    // Обновляем пути к k8s манифестам
    content = content.replace(/k8s\/configmap\.yaml/g, `${relativePath}/k8s/configmap.yaml`);
    content = content.replace(/k8s\/service\.yaml/g, `${relativePath}/k8s/service.yaml`);
    content = content.replace(/k8s\/deployment\.yaml/g, `${relativePath}/k8s/deployment.yaml`);

    // Добавляем working-directory
    if (!content.includes('working-directory:')) {
        content = content.replace(
            /(jobs:\s*\n\s+test:\s*\n\s+runs-on:\s*ubuntu-latest)/,
            `$1\n    defaults:\n      run:\n        working-directory: ${relativePath}`
        );
    }

    // Заменяем python-fastapi на реальное имя
    content = content.replace(/python-fastapi/g, projectName);

    await deps.fileSystem.createFile(workflowPath, content);

    // Переименовываем файл
    const newWorkflowPath = path.join(workflowDir, `deployment-${projectName}.yml`);
    if (workflowPath !== newWorkflowPath) {
        await deps.fileSystem.createFile(newWorkflowPath, content);
        await deps.fileSystem.deleteFile(workflowPath);
    }
}

/**
 * Перемещает .github/workflows из проекта в корень репо.
 */
export async function moveWorkflowToRepoRoot(
    deps: WorkflowDependencies,
    projectPath: string,
    repoRootPath: string,
    projectName: string
): Promise<void> {
    const projectWorkflowDir = path.join(projectPath, '.github', 'workflows');
    const repoWorkflowDir = path.join(repoRootPath, '.github', 'workflows');
    const workflowFileName = `deployment-${projectName}.yml`;

    const sourceFile = await findWorkflowFile(deps, projectWorkflowDir);
    if (!sourceFile) {
        return;
    }

    const targetFile = path.join(repoWorkflowDir, workflowFileName);

    await deps.fileSystem.createFolder(repoWorkflowDir);
    const content = await deps.fileSystem.readFile(sourceFile);
    await deps.fileSystem.createFile(targetFile, content);
}
