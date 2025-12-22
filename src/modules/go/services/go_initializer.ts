import path from 'path';
import { executeCommand } from '../../../utils/terminal_handle';
import { ServiceLocator } from '../../../core/services/service_locator';

/**
 * Инициализатор Go проектов.
 */
export class GoInitializer {
    async initialize(projectPath: string, templateName?: string, projectName?: string): Promise<void> {
        // Если переданы имена, заменяем module в go.mod и import paths в .go файлах
        if (templateName && projectName && templateName !== projectName) {
            await this.updateGoModuleName(projectPath, templateName, projectName);
        }

        try {
            await executeCommand('go mod tidy', projectPath);
        } catch {
            // Игнорируем если нет go.mod
        }
    }

    /**
     * Обновляет имя модуля в go.mod и import paths во всех .go файлах
     */
    private async updateGoModuleName(projectPath: string, templateName: string, projectName: string): Promise<void> {
        const fileSystem = ServiceLocator.getInstance().getFileSystem();

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
        const fileSystem = ServiceLocator.getInstance().getFileSystem();
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
