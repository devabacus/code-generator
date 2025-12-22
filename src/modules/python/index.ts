// Python module - экспорт всех команд
import { commands } from 'vscode';
import { importMicroservice } from '../../core/commands/import_microservice';
import { exportMicroservice } from '../../core/commands/export_microservice';
import { removeMicroservice } from '../../core/commands/remove_microservice';

/**
 * Регистрирует все команды модуля Python.
 * addPythonProject заменён на унифицированный addMicroservice в extension.ts
 */
export function registerPythonCommands() {
    return [
        commands.registerCommand('code-generator.importMicroservice', importMicroservice),
        commands.registerCommand('code-generator.exportMicroservice', exportMicroservice),
        commands.registerCommand('code-generator.removeMicroservice', removeMicroservice),
    ];
}
