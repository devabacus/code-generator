// Flutter module - экспорт всех команд
import { commands } from 'vscode';
import { createNewProject } from '../../features/generation/commands/create_new_project';
import { addPythonToProject } from '../../features/generation/commands/add_python_to_project';
import { addGoToProject } from '../../features/generation/commands/add_go_to_project';
import { addNodeToProject } from '../../features/generation/commands/add_node_to_project';
import { createDataFilesByReplacement } from '../../features/generation/commands/create_data_files_by_replacement';
import { generateServerpodK8s } from '../../features/generation/commands/generate_serverpod_k8s';
import { setupCICD } from '../../features/generation/commands/setup_cicd';

/**
 * Регистрирует все команды модуля Flutter/Serverpod.
 */
export function registerFlutterCommands() {
    return [
        commands.registerCommand('code-generator.createNewProject', createNewProject),
        commands.registerCommand('code-generator.addPython', addPythonToProject),
        commands.registerCommand('code-generator.addGo', addGoToProject),
        commands.registerCommand('code-generator.addNode', addNodeToProject),
        commands.registerCommand('code-generator.createDataFiles', createDataFilesByReplacement),
        commands.registerCommand('code-generator.generateK8s', generateServerpodK8s),
        commands.registerCommand('code-generator.setupCICD', setupCICD),
    ];
}
