import path from 'path';
import { IFileSystem } from '../interfaces/file_system';
import { MicroserviceLanguage, TemplateMetadata } from '../interfaces/microservice_language';
import { WorkflowModifier } from './workflow_modifier';
import { TemplateService } from './template_service';

/**
 * Опции для добавления микросервиса.
 */
export interface AddProjectOptions {
    /** Путь к шаблону */
    templatePath: string;
    /** Имя проекта */
    projectName: string;
    /** Целевой путь */
    targetPath: string;
    /** Тип назначения */
    destinationType: 'microservices' | 'root' | 'standalone';
    /** Путь к корню workspace (для монорепо) */
    workspacePath?: string;
    /** Относительный путь от корня репо */
    relativePath?: string;
}

/**
 * Общий сервис для работы с микросервисами.
 * Предоставляет add/import/export/remove для любого языка.
 */
export class MicroserviceService {
    private readonly workflowModifier: WorkflowModifier;
    private readonly templateService: TemplateService;

    constructor(
        private readonly fileSystem: IFileSystem,
        private readonly language: MicroserviceLanguage
    ) {
        this.workflowModifier = new WorkflowModifier(fileSystem);
        this.templateService = new TemplateService(fileSystem);
    }

    /**
     * Добавляет новый микросервис из шаблона.
     */
    async addProject(options: AddProjectOptions): Promise<void> {
        const { templatePath, projectName, targetPath, destinationType, workspacePath, relativePath } = options;

        // 1. Копируем шаблон
        await this.templateService.copyTemplate(templatePath, targetPath);

        // 2. Создаём template.json
        await this.createTemplateJson(targetPath, projectName, templatePath);

        // 3. Обновляем K8s манифесты (заменяем placeholder на реальное имя)
        await this.workflowModifier.updateK8sManifests(targetPath, projectName);
        await this.workflowModifier.updateEnvExample(targetPath, projectName);

        // 4. Модифицируем для монорепо или standalone
        if (destinationType === 'standalone') {
            await this.workflowModifier.updateForStandalone(targetPath, projectName);
        } else if (workspacePath && relativePath) {
            await this.workflowModifier.modifyForMonorepo(targetPath, projectName, relativePath);
            await this.workflowModifier.moveWorkflowToRepoRoot(targetPath, workspacePath, projectName);
        }

        // 5. Инициализация специфичная для языка
        await this.language.initialize(targetPath);
    }

    /**
     * Импортирует существующий микросервис в монорепо.
     */
    async importProject(
        sourcePath: string,
        targetPath: string,
        projectName: string,
        workspacePath: string,
        relativePath: string
    ): Promise<void> {
        // 1. Копируем с исключениями
        await this.copyDirectoryWithExclusions(
            sourcePath,
            targetPath,
            this.language.getExclusions()
        );

        // 2. Модифицируем workflow для монорепо
        await this.workflowModifier.modifyForMonorepo(targetPath, projectName, relativePath);
        await this.workflowModifier.moveWorkflowToRepoRoot(targetPath, workspacePath, projectName);

        // 3. Инициализация
        await this.language.initialize(targetPath);
    }

    /**
     * Экспортирует микросервис из монорепо в standalone.
     */
    async exportProject(
        sourcePath: string,
        targetPath: string,
        projectName: string,
        workspacePath: string
    ): Promise<void> {
        // 1. Копируем с исключениями
        await this.copyDirectoryWithExclusions(
            sourcePath,
            targetPath,
            this.language.getExclusions()
        );

        // 2. Копируем workflow из корня монорепо
        const repoWorkflowPath = path.join(workspacePath, '.github', 'workflows', `deployment-${projectName}.yml`);
        const targetWorkflowDir = path.join(targetPath, '.github', 'workflows');
        const targetWorkflowPath = path.join(targetWorkflowDir, `deployment-${projectName}.yml`);

        if (await this.fileSystem.exists(repoWorkflowPath)) {
            await this.fileSystem.createFolder(targetWorkflowDir);
            const workflowContent = await this.fileSystem.readFile(repoWorkflowPath);
            await this.fileSystem.createFile(targetWorkflowPath, workflowContent);
        }

        // 3. Убираем monorepo-специфичные изменения
        await this.workflowModifier.revertToStandalone(targetPath, projectName);
    }

    /**
     * Удаляет микросервис из проекта.
     */
    async removeProject(
        projectPath: string,
        projectName: string,
        workspacePath: string
    ): Promise<void> {
        // 1. Удаляем workflow из корня монорепо
        const workflowPath = path.join(workspacePath, '.github', 'workflows', `deployment-${projectName}.yml`);
        if (await this.fileSystem.exists(workflowPath)) {
            await this.fileSystem.deleteFile(workflowPath);
        }

        // 2. Удаляем папку микросервиса
        // (deleteFolder должен быть добавлен в IFileSystem)
    }

    /**
     * Создаёт template.json в проекте.
     */
    private async createTemplateJson(
        projectPath: string,
        projectName: string,
        templatePath: string
    ): Promise<void> {
        const metadata: TemplateMetadata = {
            language: this.language.name,
            templateName: path.basename(templatePath),
            createdAt: new Date().toISOString()
        };

        const jsonPath = path.join(projectPath, 'template.json');
        await this.fileSystem.createFile(jsonPath, JSON.stringify(metadata, null, 2));
    }

    /**
     * Копирует директорию рекурсивно с исключениями.
     */
    private async copyDirectoryWithExclusions(
        source: string,
        destination: string,
        excludes: string[]
    ): Promise<void> {
        await this.fileSystem.createFolder(destination);

        const entries = await this.fileSystem.readDirectory(source);

        for (const entry of entries) {
            if (excludes.includes(entry)) {
                continue;
            }

            const sourcePath = path.join(source, entry);
            const destPath = path.join(destination, entry);

            if (await this.fileSystem.isDirectory(sourcePath)) {
                await this.copyDirectoryWithExclusions(sourcePath, destPath, excludes);
            } else {
                const content = await this.fileSystem.readFile(sourcePath);
                await this.fileSystem.createFile(destPath, content);
            }
        }
    }
}
