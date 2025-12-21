import { MicroserviceLanguage, LanguageType } from './interfaces/microservice_language';
import { pythonLanguage } from '../modules/python/python_language';
import { nodeLanguage } from '../modules/node/node_language';
import { goLanguage } from '../modules/go/go_language';

/**
 * Реестр языков микросервисов.
 * Используется для получения конфигурации языка по его имени.
 */
const languageRegistry: Record<LanguageType, MicroserviceLanguage> = {
    python: pythonLanguage,
    node: nodeLanguage,
    go: goLanguage
};

/**
 * Возвращает конфигурацию языка по его имени.
 */
export function getLanguage(name: LanguageType): MicroserviceLanguage {
    return languageRegistry[name];
}

/**
 * Возвращает список всех поддерживаемых языков.
 */
export function getAllLanguages(): MicroserviceLanguage[] {
    return Object.values(languageRegistry);
}

/**
 * Возвращает список всех категорий шаблонов.
 */
export function getAllTemplateCategories(): string[] {
    return Object.values(languageRegistry).map(l => l.templateCategory);
}
