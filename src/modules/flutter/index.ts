// Flutter module - экспорт всех команд
import { commands } from 'vscode';
import { createNewProject } from '../../features/generation/commands/create_new_project';
import { createDataFilesByReplacement } from '../../features/generation/commands/create_data_files_by_replacement';
import { generateServerpodK8s } from '../../features/generation/commands/generate_serverpod_k8s';
import { setupCICD } from '../../features/generation/commands/setup_cicd';
import { addMicroservice } from '../../core/commands/add_microservice';

/**
 * Регистрирует все команды модуля Flutter/Serverpod.
 * add*ToProject команды заменены на унифицированный addMicroservice
 */
export function registerFlutterCommands() {
    return [
        commands.registerCommand('code-generator.createNewProject', createNewProject),
        commands.registerCommand('code-generator.addMicroserviceFromTemplate', addMicroservice),
        commands.registerCommand('code-generator.createDataFiles', createDataFilesByReplacement),
        commands.registerCommand('code-generator.generateK8s', generateServerpodK8s),
        commands.registerCommand('code-generator.setupCICD', setupCICD),
    ];
}
         