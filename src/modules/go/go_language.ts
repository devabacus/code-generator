import { MicroserviceLanguage } from '../../core/interfaces/microservice_language';
import { executeCommand } from '../../utils/terminal_handle';

/**
 * Реализация MicroserviceLanguage для Go.
 */
export const goLanguage: MicroserviceLanguage = {
    name: 'go',
    displayName: 'Go',
    templateCategory: 'go',
    templatePlaceholder: 'go-fiber',
    defaultPort: 8080,

    async initialize(projectPath: string): Promise<void> {
        try {
            await executeCommand('go mod tidy', projectPath);
        } catch {
            // Игнорируем если нет go.mod
        }
    },

    getExclusions(): string[] {
        return ['vendor', 'bin'];
    },

    getOpenApiUrl(port?: number): string {
        return `http://localhost:${port ?? this.defaultPort}/swagger/doc.json`;
    }
};
