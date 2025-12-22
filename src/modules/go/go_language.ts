import { MicroserviceLanguage } from '../../core/interfaces/microservice_language';
import { GoInitializer } from './services/go_initializer';

const goInitializer = new GoInitializer();

/**
 * Реализация MicroserviceLanguage для Go.
 */
export const goLanguage: MicroserviceLanguage = {
    name: 'go',
    displayName: 'Go',
    templateCategory: 'go',
    defaultPort: 8001,

    async initialize(projectPath: string, templateName?: string, projectName?: string): Promise<void> {
        await goInitializer.initialize(projectPath, templateName, projectName);
    },

    getExclusions(): string[] {
        return ['vendor', 'bin'];
    },

    getOpenApiUrl(port?: number): string {
        return `http://localhost:${port ?? this.defaultPort}/swagger/doc.json`;
    }
};
