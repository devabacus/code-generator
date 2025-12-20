import path from "path";
import { ServiceLocator } from "../../../core/services/service_locator";
import { gitInit } from "../../../utils/git_init";
import { startAppFix } from "../../../utils/start_app_fix";
import { executeCommand } from "../../../utils/terminal_handle";
import { getUserInput } from "../../../utils/ui/ui_ask_folder";
import { GenerationConfig } from "../config/generation_config";
import { AppDatabaseGenerator } from "../generators/app_database_generator";
import { GenerationService } from "../generators/generation_service";

const SERVERPOD_GENERATE = 'serverpod generate --experimental-features=all';
const SERVERPOD_CREATE_MIGRATION = 'serverpod create-migration --experimental-features=all --force';
const build_runner = 'dart run build_runner build -d';
const pubGet = 'flutter pub get';

export async function createNewProject(): Promise<void> {
    const fileSystem = ServiceLocator.getInstance().getFileSystem();

    const targetProject = await getUserInput('Enter project name');
    if (!targetProject) {
        return;
    }

    const templatesPath = ServiceLocator.getInstance().getTemplatesPath();

    const config = new GenerationConfig({
        templProject: 't115',
        targetProject: targetProject,
        manifest: ['startProject'],
        templatesPath: templatesPath
    });

    // Create serverpod app
    await executeCommand(`serverpod create ${targetProject}`, config.projectsPath);

    const monoRepoPath = config.monoRepoTargetPath;

    // Create admin app
    await executeCommand(`flutter create ${targetProject}_admin`, monoRepoPath);

    // Удаляем демо-папки созданные serverpod (мы используем свою архитектуру)
    const flutterLibPath = path.join(config.targetFlutterProjectPath, 'lib');
    await fileSystem.deleteDirectory(path.join(flutterLibPath, 'screens'));
    await fileSystem.deleteDirectory(path.join(flutterLibPath, 'config'));

    // Main generation service
    const generationService = new GenerationService(fileSystem);
    await generationService.generate(config);

    // Create database.dart file (drift table)
    const appDatabaseGenerator = new AppDatabaseGenerator(fileSystem, config);
    await appDatabaseGenerator.generate();

    // Fix common Flutter project issues
    startAppFix(config.targetFlutterProjectPath);
    gitInit(monoRepoPath, targetProject);

    const openCommand = `antigravity -g "${monoRepoPath}"`;

    // Run flutter pub get for each folder (flutter, server, admin)
    await executeCommand(pubGet, config.targetFlutterProjectPath);
    await executeCommand(pubGet, config.targetServerProjectPath);
    await executeCommand(pubGet, config.targetAdminProjectPath);

    // Run serverpod generate in server folder, and build_runner in flutter and admin
    await executeCommand(SERVERPOD_GENERATE, config.targetServerProjectPath);
    await executeCommand(SERVERPOD_CREATE_MIGRATION, config.targetServerProjectPath);
    await executeCommand(build_runner, config.targetFlutterProjectPath);
    await executeCommand(build_runner, config.targetAdminProjectPath);

    // Open project in IDE
    await executeCommand(openCommand, config.projectsPath);
}
