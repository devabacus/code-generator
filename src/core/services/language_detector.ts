import path from 'path';
import { IFileSystem } from '../interfaces/file_system';
import { LanguageType } from '../interfaces/microservice_language';

/**
 * Определяет язык микросервиса по его содержимому.
 * 
 * Приоритет:
 * 1. template.json (если создан расширением)
 * 2. Файлы-маркеры (fallback для внешних проектов)
 */
export async function detectLanguage(
    projectPath: string,
    fileSystem: IFileSystem
): Promise<LanguageType | null> {
    // 1. Проверяем template.json
    const templateJsonPath = path.join(projectPath, 'template.json');
    if (await fileSystem.exists(templateJsonPath)) {
        try {
            const content = await fileSystem.readFile(templateJsonPath);
            const data = JSON.parse(content);
            if (data.language && ['python', 'node', 'go'].includes(data.language)) {
                return data.language as LanguageType;
            }
        } catch {
            // Игнорируем ошибки парсинга
        }
    }

    // 2. Fallback по файлам-маркерам
    if (await fileSystem.exists(path.join(projectPath, 'pyproject.toml'))) {
        return 'python';
    }
    if (await fileSystem.exists(path.join(projectPath, 'package.json'))) {
        return 'node';
    }
    if (await fileSystem.exists(path.join(projectPath, 'go.mod'))) {
        return 'go';
    }

    return null;
}

/**
 * Определяет язык по пути к шаблону.
 * Шаблоны находятся в templates/{language}/{template-name}
 */
export function getLanguageFromTemplatePath(templatePath: string): LanguageType | null {
    const normalized = templatePath.replace(/\\/g, '/');

    if (normalized.includes('/python/')) {
        return 'python';
    }
    if (normalized.includes('/node/')) {
        return 'node';
    }
    if (normalized.includes('/go/')) {
        return 'go';
    }

    return null;
}
