import { execCommand } from '../../../core/utils/exec';

/**
 * Инициализатор Node.js проектов.
 */
export class NodeInitializer {
    async initialize(projectPath: string): Promise<void> {
        try {
            await execCommand('npm install', projectPath);
        } catch {
            // Игнорируем если нет package.json
        }
    }
}
