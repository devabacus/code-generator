// Python module - экспорт всех команд
import { commands } from 'vscode';
import { addPythonProject } from './commands/add_python_project';
import { importMicroservice } from '../../core/commands/import_microservice';
import { exportMicroservice } from '../../core/commands/export_microservice';
import { removeMicroservice } from '../../core/commands/remove_microservice';

/**
 * Регистрирует все команды модуля Python.
 */
export function registerPythonCommands() {
    return [
        commands.registerCommand('code-generator.addPythonProject', addPythonProject),
        commands.registerCommand('code-generator.importMicroservice', importMicroservice),
        commands.registerCommand('code-generator.exportMicroservice', exportMicroservice),
        commands.registerCommand('code-generator.removeMicroservice', removeMicroservice),
    ];
}
