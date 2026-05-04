import path from "path";
import { ServiceLocator } from "../../../core/services/service_locator";
import { gitInit } from "../utils/git_init";
import { startAppFix } from "../../../utils/start_app_fix";
import { executeCommand } from "../utils/terminal_handle";
import { getUserInput } from "../ui/ui_ask_folder";
import { GenerationConfig } from "../../../features/generation/config/generation_config";
import { AppDatabaseGenerator } from "../../../features/generation/generators/app_database_generator";
import { GenerationService } from "../../../features/generation/generators/generation_service";
import {
    patchPubspecPackagePaths,
    copyAgentInfrastructure,
    IBootstrapLogger,
} from "../../../core/services/project_bootstrapper";

const SERVERPOD_GENERATE = 'serverpod generate --experimental-features=all';
const SERVERPOD_CREATE_MIGRATION = 'serverpod create-migration --experimental-features=all --force';
const build_runner = 'dart run build_runner build -d';
const pubGet = 'flutter pub get';
const DRIFT_WORKER_COMPILE = 'dart compile js -O2 -o web/drift_worker.dart.js web/drift_worker.dart';
const DRIFT_WORKER_CONTENT = `import 'package:drift/wasm.dart';

void main() {
  WasmDatabase.workerMainForOpen();
}
`;
const SQLITE3_WASM_FILE = 'sqlite3.wasm';

export async function createNewProject(): Promise<void> {
    const fileSystem = ServiceLocator.getInstance().getFileSystem();

    const targetProject = await getUserInput('Enter project name');
    if (!targetProject) {
        return;
    }

    const templatesPath = ServiceLocator.getInstance().getTemplatesPath();

    // VS Code adapter uses t115 default — consistent с CLI default post-pivot
    // (Discussion #12 — 2026-05-04: t115 = supported template для existing
    // codebases / weight continuity; simplified = opt-in via CLI flag).
    // VS Code doesn't expose template variant picker yet; users wanting
    // simplified template should use CLI: `codegen create-project --template simplified`.
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

    // Bootstrap-шаги (вынесены в shared core/services/project_bootstrapper.ts).
    // ВАЖНО: tasks-фичу НЕ генерируем. Tasks (Category/Tag/Task/TaskTagMap) —
    // эталонные шаблоны для entity-генерации по YAML, не часть нового проекта.
    const bootstrapLogger: IBootstrapLogger = {
        info: (msg) => console.log(msg),
    };
    await patchPubspecPackagePaths(fileSystem, config);
    await copyAgentInfrastructure(fileSystem, config, bootstrapLogger);

    // Create database.dart file (drift table)
    const appDatabaseGenerator = new AppDatabaseGenerator(fileSystem, config);
    await appDatabaseGenerator.generate();

    // Fix common Flutter project issues
    startAppFix(config.targetFlutterProjectPath);
    gitInit(monoRepoPath, targetProject);

    const openCommand = `code "${monoRepoPath}"`;

    // Run flutter pub get for each folder (flutter, server, admin)
    await executeCommand(pubGet, config.targetFlutterProjectPath);
    await executeCommand(pubGet, config.targetServerProjectPath);
    await executeCommand(pubGet, config.targetAdminProjectPath);

    // Setup Drift Web WASM support (after pub get so drift package is available)
    const webDir = path.join(config.targetFlutterProjectPath, 'web');
    await fileSystem.createFile(path.join(webDir, 'drift_worker.dart'), DRIFT_WORKER_CONTENT);
    await executeCommand(DRIFT_WORKER_COMPILE, config.targetFlutterProjectPath);
    const templateSqliteWasm = path.join(config.templFlutterProjectPath, 'web', SQLITE3_WASM_FILE);
    await fileSystem.copyFile(templateSqliteWasm, path.join(webDir, SQLITE3_WASM_FILE));

    // Run serverpod generate in server folder, and build_runner in flutter and admin
    await executeCommand(SERVERPOD_GENERATE, config.targetServerProjectPath);
    await executeCommand(SERVERPOD_CREATE_MIGRATION, config.targetServerProjectPath);
    await executeCommand(build_runner, config.targetFlutterProjectPath);
    await executeCommand(build_runner, config.targetAdminProjectPath);

    // Open project in IDE
    await executeCommand(openCommand, config.projectsPath);
}
