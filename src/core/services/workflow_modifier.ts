import path from 'path';
import { IFileSystem } from '../interfaces/file_system';

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
     * Обновляет workflow и K8s манифесты для standalone проекта.
     * Заменяет имя шаблона на реальное имя проекта.
     * @param templateName - имя папки шаблона (например, 'node-fastify')
     */
    async updateForStandalone(projectPath: string, projectName: string, templateName: string): Promise<void> {
        const workflowDir = path.join(projectPath, '.github', 'workflows');
        const workflowPath = path.join(workflowDir, 'deployment.yml');

        if (await this.fileSystem.exists(workflowPath)) {
            let content = await this.fileSystem.readFile(workflowPath);

            // Заменяем имя шаблона на реальное имя проекта
            content = content.replace(new RegExp(templateName, 'g'), projectName);

            // Переименовываем workflow файл
            const newWorkflowPath = path.join(workflowDir, `deployment-${projectName}.yml`);
            await this.fileSystem.createFile(newWorkflowPath, content);

            // Удаляем старый deployment.yml
            await this.fileSystem.deleteFile(workflowPath);
        }

        // Обновляем K8s манифесты
        await this.updateK8sManifests(projectPath, projectName, templateName);

        // Обновляем .env.example
        await this.updateEnvExample(projectPath, projectName, templateName);
    }

    /**
     * Обновляет .env.example с реальным именем сервиса.
     * @param templateName - имя папки шаблона
     */
    async updateEnvExample(projectPath: string, projectName: string, templateName: string): Promise<void> {
        const envPath = path.join(projectPath, '.env.example');

        if (await this.fileSystem.exists(envPath)) {
            let content = await this.fileSystem.readFile(envPath);
            content = content.replace(new RegExp(templateName, 'g'), projectName);
            await this.fileSystem.createFile(envPath, content);
        }
    }

    /**
     * Убирает monorepo-специфичные модификации из workflow.
     * Используется при экспорте микросервиса из монорепо в standalone.
     */
    async revertToStandalone(projectPath: string, projectName: string): Promise<void> {
        const workflowDir = path.join(projectPath, '.github', 'workflows');
        const workflowPath = await this.findWorkflowFile(workflowDir);

        if (!workflowPath) {
            return;
        }

        let content = await this.fileSystem.readFile(workflowPath);

        // 1. Убираем paths filter
        content = content.replace(
            /on:\s*\n\s+push:\s*\n\s+branches:\s*\[([^\]]+)\]\s*\n\s+paths:\s*\n\s+- '[^']+'\s*\n\s+- '[^']+'/,
            `on:\n  push:\n    branches: [$1]`
        );

        // 2. Убираем working-directory
        content = content.replace(
            /\n\s+defaults:\s*\n\s+run:\s*\n\s+working-directory:\s*[^\n]+/g,
            ''
        );

        // 3. Заменяем пути context и file обратно на локальные
        content = content.replace(
            /context:\s*\.\/microservices\/[^\/\n]+/g,
            'context: .'
        );
        content = content.replace(
            /file:\s*\.\/microservices\/[^\/\n]+\/Dockerfile\.prod/g,
            'file: ./Dockerfile.prod'
        );

        // 4. Заменяем пути к k8s манифестам
        content = content.replace(
            /microservices\/[^\/\n]+\/k8s\/configmap\.yaml/g,
            'k8s/configmap.yaml'
        );
        content = content.replace(
            /microservices\/[^\/\n]+\/k8s\/service\.yaml/g,
            'k8s/service.yaml'
        );
        content = content.replace(
            /microservices\/[^\/\n]+\/k8s\/deployment\.yaml/g,
            'k8s/deployment.yaml'
        );

        await this.fileSystem.createFile(workflowPath, content);
    }

    /**
     * Ищет workflow файл в директории.
     * Сначала ищет deployment-*.yml (standalone), потом deployment.yml.
     */
    private async findWorkflowFile(workflowDir: string): Promise<string | null> {
        if (!await this.fileSystem.exists(workflowDir)) {
            return null;
        }

        const files = await this.fileSystem.readDirectory(workflowDir);

        // Сначала ищем deployment-*.yml (standalone проекты)
        const renamedWorkflow = files.find(f => f.startsWith('deployment-') && f.endsWith('.yml'));
        if (renamedWorkflow) {
            return path.join(workflowDir, renamedWorkflow);
        }

        // Затем ищем deployment.yml (оригинальный шаблон)
        const defaultWorkflow = path.join(workflowDir, 'deployment.yml');
        if (await this.fileSystem.exists(defaultWorkflow)) {
            return defaultWorkflow;
        }

        return null;
    }

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

        // Ищем workflow файл: сначала deployment-*.yml (standalone), потом deployment.yml
        let workflowPath = await this.findWorkflowFile(workflowDir);
        if (!workflowPath) {
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

        // 6. Переименовываем файл workflow
        const newWorkflowPath = path.join(workflowDir, `deployment-${projectName}.yml`);
        if (workflowPath !== newWorkflowPath) {
            await this.fileSystem.createFile(newWorkflowPath, content);
            // Удаляем старый файл
            await this.fileSystem.deleteFile(workflowPath);
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

        // Ищем workflow файл (может быть deployment.yml или deployment-*.yml)
        const sourceFile = await this.findWorkflowFile(projectWorkflowDir);
        if (!sourceFile) {
            return;
        }

        const targetFile = path.join(repoWorkflowDir, workflowFileName);

        // Создаём папку если не существует
        await this.fileSystem.createFolder(repoWorkflowDir);

        // Читаем содержимое
        const content = await this.fileSystem.readFile(sourceFile);

        // Записываем в корень репо
        await this.fileSystem.createFile(targetFile, content);
    }

    /**
     * Обновляет K8s манифесты с реальным именем сервиса.
     * @param templateName - имя папки шаблона
     */
    async updateK8sManifests(projectPath: string, projectName: string, templateName: string): Promise<void> {
        const k8sDir = path.join(projectPath, 'k8s');
        const files = ['deployment.yaml', 'service.yaml', 'configmap.yaml'];

        for (const file of files) {
            const filePath = path.join(k8sDir, file);
            if (await this.fileSystem.exists(filePath)) {
                let content = await this.fileSystem.readFile(filePath);
                content = content.replace(new RegExp(templateName, 'g'), projectName);
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

        const lines = content.split('\n');
        let insertIndex = -1;
        const indent = '            ';

        // Сначала ищем последнюю _SERVICE_URL (value на следующей строке)
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('_SERVICE_URL')) {
                // Если это строка с name:, нужно пропустить и следующую строку с value:
                if (lines[i].includes('- name:')) {
                    insertIndex = i + 2; // после строки с name и value
                } else {
                    insertIndex = i + 1;
                }
            }
        }

        // Если нет _SERVICE_URL, ищем после SERVERPOD_SERVICE_SECRET (последний секрет)
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
            await this.fileSystem.createFile(deploymentPath, content);
        }
    }

    /**
     * Копирует Flutter health check виджет из шаблона t115 в текущий проект.
     * @param workspacePath Корень monorepo
     * @param serviceName Имя микросервиса (например, python1)
     * @param templatesPath Путь к шаблонам (G:\Templates)
     */
    async copyFlutterHealthCheckWidget(
        workspacePath: string,
        serviceName: string,
        templatesPath: string
    ): Promise<void> {
        const projectName = path.basename(workspacePath);
        const flutterPath = path.join(workspacePath, `${projectName}_flutter`);

        // Проверяем что Flutter проект существует
        if (!await this.fileSystem.exists(flutterPath)) {
            return;
        }

        // 1. Копируем shared_health_check_widgets.dart если не существует
        const sharedWidgetsDir = path.join(flutterPath, 'lib', 'features', 'developer_tools', 'presentation', 'widgets');
        const sharedWidgetsPath = path.join(sharedWidgetsDir, 'shared_health_check_widgets.dart');

        if (!await this.fileSystem.exists(sharedWidgetsPath)) {
            const sourceSharedWidgets = path.join(templatesPath, 'flutter', 't115', 't115_flutter', 'lib', 'features', 'developer_tools', 'presentation', 'widgets', 'shared_health_check_widgets.dart');
            if (await this.fileSystem.exists(sourceSharedWidgets)) {
                await this.fileSystem.createFolder(sharedWidgetsDir);
                let content = await this.fileSystem.readFile(sourceSharedWidgets);
                content = content.replace(/t115/g, projectName);
                await this.fileSystem.createFile(sharedWidgetsPath, content);
            }
        }

        // 2. Копируем python_health_check_card.dart → {serviceName}_health_check_card.dart
        const sourceWidget = path.join(templatesPath, 'flutter', 't115', 't115_flutter', 'lib', 'features', 'python', 'presentation', 'widgets', 'python_health_check_card.dart');

        if (!await this.fileSystem.exists(sourceWidget)) {
            return;
        }

        const targetWidgetDir = path.join(flutterPath, 'lib', 'features', serviceName, 'presentation', 'widgets');
        const targetWidgetPath = path.join(targetWidgetDir, `${serviceName}_health_check_card.dart`);

        // Проверяем не существует ли уже
        if (await this.fileSystem.exists(targetWidgetPath)) {
            return;
        }

        await this.fileSystem.createFolder(targetWidgetDir);

        // Читаем и заменяем
        let content = await this.fileSystem.readFile(sourceWidget);
        content = content.replace(/t115/g, projectName);
        content = content.replace(/python/g, serviceName);
        content = content.replace(/Python/g, this.toPascalCase(serviceName));

        await this.fileSystem.createFile(targetWidgetPath, content);
    }

    /**
     * Копирует Serverpod endpoint из шаблона t115 в текущий проект.
     * @param workspacePath Корень monorepo
     * @param serviceName Имя микросервиса (например, python1)
     * @param templatesPath Путь к шаблонам (G:\Templates)
     */
    async copyServerpodEndpoint(
        workspacePath: string,
        serviceName: string,
        templatesPath: string
    ): Promise<void> {
        const projectName = path.basename(workspacePath);
        const serverPath = path.join(workspacePath, `${projectName}_server`);

        // Проверяем что сервер существует
        if (!await this.fileSystem.exists(serverPath)) {
            return;
        }

        const endpointsDir = path.join(serverPath, 'lib', 'src', 'endpoints');

        // 1. Копируем shared/microservice_endpoint.dart если не существует
        const sharedDir = path.join(endpointsDir, 'shared');
        const sharedDestPath = path.join(sharedDir, 'microservice_endpoint.dart');

        if (!await this.fileSystem.exists(sharedDestPath)) {
            const sharedSourcePath = path.join(templatesPath, 'flutter', 't115', 't115_server', 'lib', 'src', 'endpoints', 'shared', 'microservice_endpoint.dart');
            if (await this.fileSystem.exists(sharedSourcePath)) {
                await this.fileSystem.createFolder(sharedDir);
                const sharedContent = await this.fileSystem.readFile(sharedSourcePath);
                await this.fileSystem.createFile(sharedDestPath, sharedContent);
            }
        }

        // 2. Копируем python_endpoint.dart → {serviceName}_endpoint.dart
        const sourceEndpoint = path.join(templatesPath, 'flutter', 't115', 't115_server', 'lib', 'src', 'endpoints', 'python_endpoint.dart');

        if (!await this.fileSystem.exists(sourceEndpoint)) {
            return;
        }

        const targetEndpointPath = path.join(endpointsDir, `${serviceName}_endpoint.dart`);

        // Проверяем не существует ли уже
        if (await this.fileSystem.exists(targetEndpointPath)) {
            return;
        }

        await this.fileSystem.createFolder(endpointsDir);

        // Читаем и заменяем
        let content = await this.fileSystem.readFile(sourceEndpoint);
        content = content.replace(/python/g, serviceName);
        content = content.replace(/Python/g, this.toPascalCase(serviceName));
        content = content.replace(/PYTHON/g, serviceName.toUpperCase());

        await this.fileSystem.createFile(targetEndpointPath, content);
    }

    /**
     * Патчит developer_tools_page.dart, добавляя import и widget для нового микросервиса.
     * @param workspacePath Корень monorepo
     * @param serviceName Имя микросервиса (например, python1)
     */
    async patchDeveloperToolsPage(workspacePath: string, serviceName: string): Promise<void> {
        const projectName = path.basename(workspacePath);
        const pagePath = path.join(workspacePath, `${projectName}_flutter`, 'lib', 'features', 'developer_tools', 'presentation', 'pages', 'developer_tools_page.dart');

        if (!await this.fileSystem.exists(pagePath)) {
            return;
        }

        let content = await this.fileSystem.readFile(pagePath);
        const pascalName = this.toPascalCase(serviceName);

        // Проверяем, не добавлен ли уже
        if (content.includes(`${pascalName}HealthCheckCard`)) {
            return;
        }

        // 1. Добавляем import после последнего health_check_card импорта
        const importLine = `import '../../../${serviceName}/presentation/widgets/${serviceName}_health_check_card.dart';`;
        const importPattern = /(import '\.\.\/\.\.\/\.\.\/\w+\/presentation\/widgets\/\w+_health_check_card\.dart';)/g;
        const importMatches = [...content.matchAll(importPattern)];

        if (importMatches.length > 0) {
            const lastImport = importMatches[importMatches.length - 1][0];
            content = content.replace(lastImport, `${lastImport}\n${importLine}`);
        }

        // 2. Добавляем widget в начало списка (после описания секции)
        const widgetLine = `\n            ${pascalName}HealthCheckCard(client: client),\n            const SizedBox(height: 16),`;
        const anchor = '// Microservice Health Check Cards';

        if (content.includes(anchor)) {
            content = content.replace(anchor, `${anchor}${widgetLine}`);
        } else {
            // Фолбэк если комментария нет - ищем по описанию секции
            const fallbackPattern = /'Test connectivity and performance of backend microservices\.',\s+style: TextStyle\(color: Colors\.grey\),\s+\),\s+const SizedBox\(height: 16\),/g;
            const match = fallbackPattern.exec(content);
            if (match) {
                const insertIndex = match.index + match[0].length;
                content = content.slice(0, insertIndex) + widgetLine + content.slice(insertIndex);
            }
        }

        await this.fileSystem.createFile(pagePath, content);
    }

    /**
     * Удаляет переменную окружения из deployment.yaml Serverpod.
     */
    async removeServerpodDeploymentEnv(workspacePath: string, serviceName: string): Promise<void> {
        const projectName = path.basename(workspacePath);
        const deploymentPath = path.join(workspacePath, `${projectName}_server`, 'k8s', 'deployment.yaml');

        if (!await this.fileSystem.exists(deploymentPath)) {
            return;
        }

        const content = await this.fileSystem.readFile(deploymentPath);
        const envVarName = `${serviceName.toUpperCase().replace(/-/g, '_')}_SERVICE_URL`;

        // Удаляем построчно — ищем строку с именем и следующую с value
        const lines = content.split('\n');
        const newLines: string[] = [];
        let skipNext = false;

        for (let i = 0; i < lines.length; i++) {
            if (skipNext) {
                skipNext = false;
                continue;
            }
            if (lines[i].includes(`name: ${envVarName}`)) {
                // Пропускаем эту строку и следующую (value)
                skipNext = true;
                continue;
            }
            newLines.push(lines[i]);
        }

        await this.fileSystem.createFile(deploymentPath, newLines.join('\n'));
    }

    /**
     * Удаляет импорт и виджет из developer_tools_page.dart.
     */
    async unpatchDeveloperToolsPage(workspacePath: string, serviceName: string): Promise<void> {
        const projectName = path.basename(workspacePath);
        const pagePath = path.join(workspacePath, `${projectName}_flutter`, 'lib', 'features', 'developer_tools', 'presentation', 'pages', 'developer_tools_page.dart');

        if (!await this.fileSystem.exists(pagePath)) {
            return;
        }

        let content = await this.fileSystem.readFile(pagePath);
        const pascalName = this.toPascalCase(serviceName);

        // 1. Удаляем импорт
        const importPattern = new RegExp(`import\\s+'\\.\\.\\/\\.\\.\\/\\.\\.\\/${serviceName}\\/presentation\\/widgets\\/${serviceName}_health_check_card\\.dart';\\n?`, 'g');
        content = content.replace(importPattern, '');

        // 2. Удаляем виджет и SizedBox после него
        const widgetPattern = new RegExp(`\\s+${pascalName}HealthCheckCard\\(client: client\\),\\n\\s+const SizedBox\\(height: 16\\),`, 'g');
        content = content.replace(widgetPattern, '');

        await this.fileSystem.createFile(pagePath, content);
    }

    private toPascalCase(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

