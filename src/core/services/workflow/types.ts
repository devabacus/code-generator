/**
 * Общие типы для workflow модулей.
 */
import { IFileSystem } from '../../interfaces/file_system';

/**
 * Зависимости для workflow модулей.
 */
export interface WorkflowDependencies {
    fileSystem: IFileSystem;
}

/**
 * Преобразует строку в PascalCase.
 */
export function toPascalCase(str: string): string {
    return str
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
}
