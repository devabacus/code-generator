// Node module - экспорт всех команд
import { commands } from 'vscode';
import { addNodeProject } from './commands/add_node_project';

/**
 * Регистрирует все команды модуля Node.
 */
export function registerNodeCommands() {
    return [
        commands.registerCommand('code-generator.addNodeProject', addNodeProject),
    ];
}
