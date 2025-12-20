// Go module - экспорт всех команд
import { commands } from 'vscode';
import { addGoProject } from './commands/add_go_project';

/**
 * Регистрирует все команды модуля Go.
 */
export function registerGoCommands() {
    return [
        commands.registerCommand('code-generator.addGoProject', addGoProject),
    ];
}
