/**
 * Выбор языка для создания микросервиса.
 */
import { window } from 'vscode';
import { MicroserviceLanguage, LanguageType } from '../../../../core/interfaces/microservice_language';
import { getAllLanguages } from '../../../../core/language_registry';

export interface LanguageChoice {
    language: MicroserviceLanguage;
    type: LanguageType;
}

/**
 * Показывает QuickPick для выбора языка микросервиса.
 */
export async function pickLanguage(): Promise<LanguageChoice | undefined> {
    const languages = getAllLanguages();

    const items = languages.map(lang => ({
        label: getLanguageIcon(lang.name) + ' ' + lang.displayName,
        description: getLanguageDescription(lang.name),
        language: lang,
        type: lang.name as LanguageType
    }));

    const selected = await window.showQuickPick(items, {
        placeHolder: 'Select microservice language',
        matchOnDescription: true,
    });

    if (!selected) {
        return undefined;
    }

    return { language: selected.language, type: selected.type };
}

function getLanguageIcon(name: string): string {
    switch (name) {
        case 'python': return '🐍';
        case 'node': return '📦';
        case 'go': return '🔷';
        default: return '📄';
    }
}

function getLanguageDescription(name: string): string {
    switch (name) {
        case 'python': return 'FastAPI, uv, pytest';
        case 'node': return 'Express/Fastify, npm';
        case 'go': return 'Gin/Echo, go mod';
        default: return '';
    }
}
