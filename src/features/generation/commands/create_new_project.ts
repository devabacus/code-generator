import { ServiceLocator } from "../../../core/services/service_locator";
import { executeCommand } from "../../../utils/terminal_handle";
import { getUserInput } from "../../../utils/ui/ui_ask_folder";
import { AppDatabaseGenerator } from "../generators/app_database_generator";
import { GenerationService } from "../generators/generation_service";
import { GenerationConfig } from "../config/generation_config";

const SERVERPOD_GENERATE = 'serverpod generate';
const build_runner = 'dart run build_runner build -d';
const pubGet = 'flutter pub get';

export async function createNewProject(): Promise<void> {
    const fileSystem = ServiceLocator.getInstance().getFileSystem();

    const targetProject = await getUserInput('Enter project name');
    if (!targetProject) {
        return;
    }

    const config = new GenerationConfig({
        templProject: 't36',
        targetProject: targetProject,
        manifest: ['startProject']
    });

    // Create serverpod app
    await executeCommand(`serverpod create ${targetProject}`, config.projectsPath);

    const monoRepoPath = config.monoRepoTargetPath;

    // Create admin app
    await executeCommand(`flutter create ${targetProject}_admin`, monoRepoPath);

    // Main generation service
    const generationService = new GenerationService(fileSystem);
    await generationService.generate(config);

    // Create database.dart file (drift table)
    const appDatabaseGenerator = new AppDatabaseGenerator(fileSystem, config);
    await appDatabaseGenerator.generate();

    const openCommand = `antigravity -g "${monoRepoPath}"`;

    // Run flutter pub get for each folder (flutter, server, admin)
    await executeCommand(pubGet, config.targetFlutterProjectPath);
    await executeCommand(pubGet, config.targetServerProjectPath);
    await executeCommand(pubGet, config.targetAdminProjectPath);

    // Run serverpod generate in server folder, and build_runner in flutter and admin
    await executeCommand(SERVERPOD_GENERATE, config.targetServerProjectPath);
    await executeCommand(build_runner, config.targetFlutterProjectPath);
    await executeCommand(build_runner, config.targetAdminProjectPath);

    // Open project in IDE
    await executeCommand(openCommand, config.projectsPath);
}
