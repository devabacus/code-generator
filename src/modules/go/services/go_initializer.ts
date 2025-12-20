import { executeCommand } from '../../../utils/terminal_handle';

/**
 * Инициализатор Go проектов.
 */
export class GoInitializer {
    async initialize(projectPath: string): Promise<void> {
        try {
            await executeCommand('go mod tidy', projectPath);
        } catch {
            // Игнорируем если нет go.mod
        }
    }
}
