import { executeCommand } from '../../../utils/terminal_handle';

/**
 * Инициализатор Node.js проектов.
 */
export class NodeInitializer {
    async initialize(projectPath: string): Promise<void> {
        try {
            await executeCommand('npm install', projectPath);
        } catch {
            // Игнорируем если нет package.json
        }
    }
}
