import { MicroserviceLanguage } from '../../core/interfaces/microservice_language';
import { executeCommand } from '../../utils/terminal_handle';

/**
 * Реализация MicroserviceLanguage для Python.
 */
export const pythonLanguage: MicroserviceLanguage = {
    name: 'python',
    displayName: 'Python',
    templateCategory: 'python',
    templatePlaceholder: 'python-fastapi',
    defaultPort: 8000,

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
    },

    getExclusions(): string[] {
        return ['__pycache__', '.venv', '.pytest_cache', '.ruff_cache', '.mypy_cache'];
    },

    getOpenApiUrl(port?: number): string {
        return `http://localhost:${port ?? this.defaultPort}/openapi.json`;
    }
};
