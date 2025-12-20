import path from 'path';
import { IFileSystem } from '../../../core/interfaces/file_system';

/**
 * Модификатор GitHub Actions workflow для монорепо.
 * При добавлении проекта в microservices/ нужно:
 * 1. Добавить paths фильтр (чтобы workflow срабатывал только при изменении в этой папке)
 * 2. Обновить context и file пути для Docker build
 * 3. Переименовать workflow файл (deployment.yml -> deployment-{projectName}.yml)
 */
export class WorkflowModifier {
    constructor(private readonly fileSystem: IFileSystem) { }

    /**
     * Модифицирует workflow для использования в монорепо.
     * @param projectPath Путь к скопированному проекту (например, .../microservices/my-service)
     * @param projectName Имя проекта (например, my-service)
     * @param relativePath Относительный путь от корня репо (например, microservices/my-service)
     */
    async modifyForMonorepo(
        projectPath: string,
        projectName: string,
        relativePath: string
    ): Promise<void> {
        const workflowDir = path.join(projectPath, '.github', 'workflows');
        const workflowPath = path.join(workflowDir, 'deployment.yml');

        if (!await this.fileSystem.exists(workflowPath)) {
            return; // Нет workflow файла
        }

        let content = await this.fileSystem.readFile(workflowPath);

        // 1. Добавляем paths фильтр после branches
        content = content.replace(
            /on:\s*\n\s+push:\s*\n\s+branches:\s*\[([^\]]+)\]/,
            `on:
  push:
    branches: [$1]
    paths:
      - '${relativePath}/**'
      - '.github/workflows/deployment-${projectName}.yml'`
        );

        // 2. Обновляем context и file для Docker build
        content = content.replace(
            /context:\s*\.\s*\n/g,
            `context: ./${relativePath}\n`
        );
        content = content.replace(
            /file:\s*\.\/Dockerfile\.prod/g,
            `file: ./${relativePath}/Dockerfile.prod`
        );

        // 3. Обновляем пути к k8s манифестам
        content = content.replace(
            /k8s\/configmap\.yaml/g,
            `${relativePath}/k8s/configmap.yaml`
        );
        content = content.replace(
            /k8s\/service\.yaml/g,
            `${relativePath}/k8s/service.yaml`
        );
        content = content.replace(
            /k8s\/deployment\.yaml/g,
            `${relativePath}/k8s/deployment.yaml`
        );

        // 4. Обновляем working-directory для uv команд (если есть)
        // Добавляем working-directory для job test
        if (!content.includes('working-directory:')) {
            content = content.replace(
                /(jobs:\s*\n\s+test:\s*\n\s+runs-on:\s*ubuntu-latest)/,
                `$1\n    defaults:\n      run:\n        working-directory: ${relativePath}`
            );
        }

        // 5. Заменяем python-fastapi на реальное имя проекта
        content = content.replace(/python-fastapi/g, projectName);

        // Сохраняем модифицированный workflow
        await this.fileSystem.createFile(workflowPath, content);

        // 5. Переименовываем файл workflow
        const newWorkflowPath = path.join(workflowDir, `deployment-${projectName}.yml`);
        if (workflowPath !== newWorkflowPath) {
            await this.fileSystem.createFile(newWorkflowPath, content);
            // Удаляем старый файл (если есть метод delete, иначе оставляем)
        }
    }

    /**
     * Перемещает .github/workflows из проекта в корень репо.
     * В монорепо workflow должен быть в корне, а не в папке microservices.
     */
    async moveWorkflowToRepoRoot(
        projectPath: string,
        repoRootPath: string,
        projectName: string
    ): Promise<void> {
        const projectWorkflowDir = path.join(projectPath, '.github', 'workflows');
        const repoWorkflowDir = path.join(repoRootPath, '.github', 'workflows');
        const workflowFileName = `deployment-${projectName}.yml`;

        const sourceFile = path.join(projectWorkflowDir, 'deployment.yml');
        const targetFile = path.join(repoWorkflowDir, workflowFileName);

        if (!await this.fileSystem.exists(sourceFile)) {
            return;
        }

        // Создаём папку если не существует
        await this.fileSystem.createFolder(repoWorkflowDir);

        // Читаем содержимое
        const content = await this.fileSystem.readFile(sourceFile);

        // Записываем в корень репо
        await this.fileSystem.createFile(targetFile, content);
    }

    /**
     * Обновляет K8s манифесты с реальным именем сервиса.
     * Заменяет 'python-fastapi' на {projectName}
     */
    async updateK8sManifests(projectPath: string, projectName: string): Promise<void> {
        const k8sDir = path.join(projectPath, 'k8s');
        const files = ['deployment.yaml', 'service.yaml', 'configmap.yaml'];

        for (const file of files) {
            const filePath = path.join(k8sDir, file);
            if (await this.fileSystem.exists(filePath)) {
                let content = await this.fileSystem.readFile(filePath);
                content = content.replace(/python-fastapi/g, projectName);
                await this.fileSystem.createFile(filePath, content);
            }
        }
    }

    /**
     * Обновляет Serverpod deployment.yaml, добавляя env var для микросервиса.
     * Добавляет: {SERVICENAME}_SERVICE_URL = http://{servicename}-service:8000
     * @param workspacePath Корень monorepo
     * @param serviceName Имя микросервиса (например, python1)
     */
    async updateServerpodDeploymentEnv(workspacePath: string, serviceName: string): Promise<void> {
        const projectName = path.basename(workspacePath);
        const deploymentPath = path.join(workspacePath, `${projectName}_server`, 'k8s', 'deployment.yaml');

        if (!await this.fileSystem.exists(deploymentPath)) {
            return; // K8s манифесты не существуют
        }

        let content = await this.fileSystem.readFile(deploymentPath);

        // Формируем env var
        const envVarName = `${serviceName.toUpperCase().replace(/-/g, '_')}_SERVICE_URL`;
        const envVarValue = `http://${serviceName}-service:8000`;

        // Проверяем, не добавлен ли уже
        if (content.includes(envVarName)) {
            return; // Уже есть
        }

        // Ищем последнюю env переменную с _SERVICE_URL и добавляем после неё
        const envPattern = /(- name: \w+_SERVICE_URL\n\s+value: "[^"]+"\n)/g;
        const matches = [...content.matchAll(envPattern)];

        if (matches.length > 0) {
            const lastMatch = matches[matches.length - 1];
            const lastEnvVar = lastMatch[0];
            const newEnvVar = `- name: ${envVarName}\n              value: "${envVarValue}"\n`;

            content = content.replace(lastEnvVar, lastEnvVar + '            ' + newEnvVar);
            await this.fileSystem.createFile(deploymentPath, content);
        }
    }
}

