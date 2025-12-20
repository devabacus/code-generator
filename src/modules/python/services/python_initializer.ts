import { executeCommand } from '../../../utils/terminal_handle';

/**
 * Инициализатор Python проектов.
 * Выполняет специфичные для Python команды после копирования шаблона.
 */
export class PythonInitializer {
    /**
     * Инициализирует Python проект.
     * @param projectPath Путь к скопированному проекту
     */
    async initialize(projectPath: string): Promise<void> {
        // Пробуем uv sync (предпочтительно)
        try {
            await executeCommand('uv sync', projectPath);
        } catch {
            // Если uv не установлен, пробуем pip
            try {
                await executeCommand('pip install -r requirements.txt', projectPath);
            } catch {
                // Игнорируем, если нет requirements.txt
            }
        }
    }
}
