/**
 * Модуль модификации workflow для monorepo.
 */
import path from 'path';
import { WorkflowDependencies } from './types';
import { findWorkflowFile } from './workflow_file_finder';

/**
 * Модифицирует workflow для использования в монорепо.
 * @param templateName Имя шаблона (папка шаблона)
 */
export async function modifyForMonorepo(
    deps: WorkflowDependencies,
    projectPath: string,
    projectName: string,
    relativePath: string,
    templateName: string
): Promise<void> {
    const workflowDir = path.join(projectPath, '.github', 'workflows');
    const workflowPath = await findWorkflowFile(deps, workflowDir);

    if (!workflowPath) {
        return;
    }

    let content = await deps.fileSystem.readFile(workflowPath);

    // Добавляем или обновляем paths фильтр
    const hasPaths = content.includes('paths:');
    if (!content.includes(`- '${relativePath}/**'`)) {
        if (hasPaths) {
            // Если paths уже есть, добавляем нашу строку в начало списка путей
            const pathsRegex = /(paths:\s*\n)/;
            content = content.replace(pathsRegex, `$1      - '${relativePath}/**'\n      - '.github/workflows/deployment-${projectName}.yml'\n`);
        } else {
            // Если paths нет, добавляем после branches
            const onPushRegex = /(push:\s*\n)([\t ]*)(branches:\s*\[[^\]]+\])/;
            const onPushMatch = content.match(onPushRegex);
            if (onPushMatch) {
                const indent = onPushMatch[2];
                content = content.replace(
                    onPushRegex,
                    `$1$2$3\n${indent}paths:\n${indent}  - '${relativePath}/**'\n${indent}  - '.github/workflows/deployment-${projectName}.yml'`
                );
            }
        }
    }

    // Обновляем context и file для Docker build (только если они еще не в монорепо формате)
    if (!content.includes(`context: ./${relativePath}`)) {
        content = content.replace(/context:\s*\.\s*\n/g, `context: ./${relativePath}\n`);
    }
    if (!content.includes(`file: ./${relativePath}/Dockerfile.prod`)) {
        content = content.replace(/file:\s*\.\/Dockerfile\.prod/g, `file: ./${relativePath}/Dockerfile.prod`);
    }

    // Обновляем пути к k8s манифестам (только если они не начинаются с microservices/)
    const k8sFiles = ['configmap.yaml', 'service.yaml', 'deployment.yaml'];
    for (const file of k8sFiles) {
        const fileRegex = new RegExp(`(?<!\\/)${file}`, 'g'); // Ищем имя файла, перед которым нет слэша
        // Или даже более специфично - ищем именно k8s/
        content = content.replace(new RegExp(`(?<!${relativePath}/)k8s/${file}`, 'g'), `${relativePath}/k8s/${file}`);
    }

    // Добавляем working-directory в задачу test
    const hasWorkingDir = content.includes(`working-directory: ${relativePath}`);
    if (!hasWorkingDir) {
        const testJobRegex = /(test:\s*\n)([\t ]*)(runs-on:\s*ubuntu-latest)/;
        const testMatch = content.match(testJobRegex);

        if (testMatch) {
            const indent = testMatch[2];
            // Проверяем, нет ли уже блока defaults
            if (!content.includes('defaults:')) {
                content = content.replace(
                    testJobRegex,
                    `$1$2$3\n${indent}defaults:\n${indent}  run:\n${indent}    working-directory: ${relativePath}`
                );
            } else {
                // Если defaults есть, но нет нашего working-directory (это сложнее, пока просто добавим, если получится)
                // Но обычно в шаблонах либо есть всё, либо ничего.
            }
        }
    }

    // Добавляем working-directory в golangci-lint-action
    const lintRegex = /(uses:\s*golangci\/golangci-lint-action@[v\d.]+[\s\S]*?with:\s*\n)/;
    const lintMatch = content.match(lintRegex);
    if (lintMatch) {
        const lintBlock = lintMatch[0];
        const afterWith = content.substring(lintMatch.index! + lintBlock.length);
        const firstLineAfterWith = afterWith.split('\n')[0];

        if (!lintBlock.includes('working-directory:') && !firstLineAfterWith.includes('working-directory:')) {
            const indentWithLine = lintBlock.match(/([\t ]+)with:/);
            const indentWith = indentWithLine ? indentWithLine[1] : '          ';
            const indentMatch = afterWith.match(/^([\t ]+)/);
            const extraIndent = indentMatch ? indentMatch[1] : (indentWith + '  ');
            const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';

            content = content.replace(
                lintRegex,
                `$1${extraIndent}working-directory: ${relativePath}${lineEnding}`
            );
        }
    }

    // Заменяем имя шаблона на реальное имя проекта (SERVICE_NAME и т.д.)
    if (templateName !== projectName) {
        content = content.replace(new RegExp(templateName, 'g'), projectName);
    }

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
