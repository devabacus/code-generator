import { MicroserviceLanguage } from '../../core/interfaces/microservice_language';
import { execCommand } from '../../core/utils/exec';

/**
 * Реализация MicroserviceLanguage для Python.
 */
export const pythonLanguage: MicroserviceLanguage = {
    name: 'python',
    displayName: 'Python',
    templateCategory: 'python',
    defaultPort: 8000,

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
    },

    getExclusions(): string[] {
        return ['.git', '__pycache__', '.venv', '.pytest_cache', '.ruff_cache', '.mypy_cache', '.terraform', 'terraform.tfstate', 'terraform.tfstate.backup', '.terraform.lock.hcl'];
    },

    getOpenApiUrl(port?: number): string {
        return `http://localhost:${port ?? this.defaultPort}/openapi.json`;
    },

    getDevServerCommand(): string {
        return 'uv run uvicorn app.main:app --reload';
    }
};
