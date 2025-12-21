import path from 'path';
import { executeCommand } from '../../../utils/terminal_handle';
import { ServiceLocator } from '../../../core/services/service_locator';

/**
 * Инициализатор Go проектов.
 */
export class GoInitializer {
    async initialize(projectPath: string, templateName?: string, projectName?: string): Promise<void> {
        // Если переданы имена, заменяем module в go.mod
        if (templateName && projectName && templateName !== projectName) {
            await this.updateGoModName(projectPath, templateName, projectName);
        }

        try {
            await executeCommand('go mod tidy', projectPath);
        } catch {
            // Игнорируем если нет go.mod
        }
    }

    /**
     * Обновляет имя модуля в go.mod
     */
    private async updateGoModName(projectPath: string, templateName: string, projectName: string): Promise<void> {
        const fileSystem = ServiceLocator.getInstance().getFileSystem();
        const goModPath = path.join(projectPath, 'go.mod');

        if (!await fileSystem.exists(goModPath)) {
            return;
        }

        let content = await fileSystem.readFile(goModPath);
        // Заменяем имя модуля: go-fiber-service -> gofiber22-service
        const oldModuleName = `${templateName}-service`;
        const newModuleName = `${projectName}-service`;
        content = content.replace(new RegExp(oldModuleName, 'g'), newModuleName);
        await fileSystem.createFile(goModPath, content);
    }
}
