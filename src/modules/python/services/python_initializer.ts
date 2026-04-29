import { execCommand } from '../../../core/utils/exec';

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
            await execCommand('uv sync', projectPath);
        } catch {
            // Если uv не установлен, пробуем pip
            try {
                await execCommand('pip install -r requirements.txt', projectPath);
            } catch {
                // Игнорируем, если нет requirements.txt
            }
        }
    }
}
