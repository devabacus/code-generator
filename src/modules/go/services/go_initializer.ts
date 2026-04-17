import path from 'path';
import { execCommand } from '../../../core/utils/exec';
import { IFileSystem } from '../../../core/interfaces/file_system';
import { DefaultFileSystem } from '../../../core/implementations/default_file_system';

/**
 * Инициализатор Go проектов.
 */
export class GoInitializer {
    private fileSystem: IFileSystem;

    constructor(fileSystem?: IFileSystem) {
        this.fileSystem = fileSystem || new DefaultFileSystem();
    }

    async initialize(projectPath: string, templateName?: string, projectName?: string): Promise<void> {
        // Если переданы имена, заменяем module в go.mod и import paths в .go файлах
        if (templateName && projectName && templateName !== projectName) {
            await this.updateGoModuleName(projectPath, templateName, projectName);
        }

        try {
            await execCommand('go mod tidy', projectPath);
        } catch {
            // Игнорируем если нет go.mod
        }
    }

    /**
     * Обновляет имя модуля в go.mod и import paths во всех .go файлах
     */
    private async updateGoModuleName(projectPath: string, templateName: string, projectName: string): Promise<void> {
        const fileSystem = this.fileSystem;

        // Формируем имена модулей
        const oldModuleName = `${templateName}-service`;
        const newModuleName = `${projectName}-service`;

        // 1. Обновляем go.mod
        const goModPath = path.join(projectPath, 'go.mod');
        if (await fileSystem.exists(goModPath)) {
            let content = await fileSystem.readFile(goModPath);
            content = content.replace(new RegExp(oldModuleName, 'g'), newModuleName);
            await fileSystem.createFile(goModPath, content);
        }

        // 2. Обновляем import paths во всех .go файлах рекурсивно
        await this.updateGoFilesRecursively(projectPath, oldModuleName, newModuleName);
    }

    /**
     * Рекурсивно обновляет import paths в .go файлах
     */
    private async updateGoFilesRecursively(
        dirPath: string,
        oldModuleName: string,
        newModuleName: string
    ): Promise<void> {
        const fileSystem = this.fileSystem;
        const entries = await fileSystem.readDirectory(dirPath);

        for (const name of entries) {
            const fullPath = path.join(dirPath, name);

            if (await fileSystem.isDirectory(fullPath)) {
                // Рекурсивно обходим поддиректории (кроме vendor и .git)
                if (name !== 'vendor' && name !== '.git') {
                    await this.updateGoFilesRecursively(fullPath, oldModuleName, newModuleName);
                }
            } else if (name.endsWith('.go')) {
                // Обновляем .go файл
                let content = await fileSystem.readFile(fullPath);
                if (content.includes(oldModuleName)) {
                    content = content.replace(new RegExp(oldModuleName, 'g'), newModuleName);
                    await fileSystem.createFile(fullPath, content);
                }
            }
        }
    }
}
