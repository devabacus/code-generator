// Python module - экспорт всех команд
import { commands } from 'vscode';
import { addPythonProject } from './commands/add_python_project';
import { importMicroservice } from './commands/import_microservice';

/**
 * Регистрирует все команды модуля Python.
 */
export function registerPythonCommands() {
    return [
        commands.registerCommand('code-generator.addPythonProject', addPythonProject),
        commands.registerCommand('code-generator.importMicroservice', importMicroservice),
    ];
}
