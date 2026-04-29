import { MicroserviceLanguage } from '../../core/interfaces/microservice_language';
import { execCommand } from '../../core/utils/exec';

/**
 * Реализация MicroserviceLanguage для Node.js.
 */
export const nodeLanguage: MicroserviceLanguage = {
    name: 'node',
    displayName: 'Node.js',
    templateCategory: 'node',
    defaultPort: 3000,

    async initialize(projectPath: string): Promise<void> {
        try {
            await execCommand('npm install', projectPath);
        } catch {
            // Игнорируем если нет package.json
        }
    },

    getExclusions(): string[] {
        return ['.git', 'node_modules', '.npm', 'dist', 'build'];
    },

    getOpenApiUrl(port?: number): string {
        return `http://localhost:${port ?? this.defaultPort}/docs/json`;
    },

    getDevServerCommand(): string {
        return 'npm run dev';
    }
};
