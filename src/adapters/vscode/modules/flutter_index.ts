// Flutter module - экспорт всех команд
import { commands } from 'vscode';
import { createNewProject } from '../commands/create_new_project';
import { createDataFilesByReplacement } from '../commands/create_data_files_by_replacement';
import { generateServerpodK8s } from '../commands/generate_serverpod_k8s';
import { setupCICD } from '../commands/setup_cicd';
import { addMicroservice } from '../commands/add_microservice_legacy';

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
         