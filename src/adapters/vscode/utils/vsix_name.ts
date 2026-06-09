/**
 * Имя .vsix-файла, которое генерит `vsce package`: `<name>-<version>.vsix`.
 *
 * Выделено в отдельный модуль (без импорта `vscode`) чтобы:
 *  - не дублировать формат строки между package.json и reinstall-handler'ом
 *    (TASK-036: после авто-bump версии захардкоженное `code-generator-0.0.1.vsix`
 *    ломалось — теперь имя выводится из актуальной version);
 *  - покрыть unit-тестом без vscode-runtime.
 */
export function vsixFileName(name: string, version: string): string {
    return `${name}-${version}.vsix`;
}
