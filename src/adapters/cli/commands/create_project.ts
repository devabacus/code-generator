import { Command } from 'commander';
import path from 'path';
import * as fs from 'fs/promises';
import { GenerationConfig } from '../../../features/generation/config/generation_config';
import { GenerationService } from '../../../features/generation/generators/generation_service';
import { AppDatabaseGenerator } from '../../../features/generation/generators/app_database_generator';
import { DefaultFileSystem } from '../../../core/implementations/default_file_system';
import { TrackingFileSystem } from '../utils/cli_file_system';
import { CliLogger } from '../utils/cli_logger';
import { cliExec } from '../utils/cli_exec';
import { startAppFix } from '../../../utils/start_app_fix';
import { ServerpodYamlParser } from '../../../features/generation/parsers/server_yaml_parser';
import { manifestType } from '../../../features/generation/generators/manifests';

const SERVERPOD_GENERATE = 'serverpod generate --experimental-features=all';
const SERVERPOD_CREATE_MIGRATION = 'serverpod create-migration --experimental-features=all --force';
const BUILD_RUNNER = 'dart run build_runner build -d';
const PUB_GET = 'flutter pub get';
const DRIFT_WORKER_COMPILE = 'dart compile js -O2 -o web/drift_worker.dart.js web/drift_worker.dart';
const DRIFT_WORKER_CONTENT = `import 'package:drift/wasm.dart';

void main() {
  WasmDatabase.workerMainForOpen();
}
`;
const SQLITE3_WASM_FILE = 'sqlite3.wasm';

interface CreateProjectOptions {
    name: string;
    templatesPath: string;
    projectsPath: string;
    templProject: string;
    skipPubGet?: boolean;
    skipServerpodGenerate?: boolean;
    skipGitInit?: boolean;
    localSetup?: boolean;
    human?: boolean;
}

export function registerCreateProject(program: Command): void {
    program
        .command('create-project')
        .description('Create a new Serverpod monorepo project')
        .requiredOption('--name <name>', 'Project name')
        .option('--templates-path <path>', 'Path to templates', 'G:/Templates')
        .option('--projects-path <path>', 'Base path for projects', 'G:/Projects/Flutter/serverpod')
        .option('--templ-project <id>', 'Template project ID', 't115')
        .option('--skip-pub-get', 'Skip flutter pub get')
        .option('--skip-serverpod-generate', 'Skip serverpod generate and migrations')
        .option('--skip-git-init', 'Skip git init and GitHub setup')
        .option('--local-setup', 'After creation: docker compose up, migrations, run server')
        .option('--json', 'Output as JSON (default)', true)
        .option('--human', 'Output as human-readable text')
        .action(async (opts: CreateProjectOptions) => {
            await handleCreateProject(opts);
        });
}

async function handleCreateProject(opts: CreateProjectOptions): Promise<void> {
    const jsonMode = !opts.human;
    const logger = new CliLogger(jsonMode);
    const startTime = Date.now();

    try {
        const targetProject = opts.name;
        const inner = new DefaultFileSystem();
        const fileSystem = new TrackingFileSystem(inner, logger);

        const config = new GenerationConfig({
            templProject: opts.templProject,
            targetProject: targetProject,
            manifest: ['startProject'],
            templatesPath: opts.templatesPath,
            projectsPath: opts.projectsPath,
        });

        // 1. Create serverpod app
        logger.info('Creating Serverpod project...');
        await cliExec(`serverpod create ${targetProject}`, config.projectsPath, logger);

        const monoRepoPath = config.monoRepoTargetPath;

        // 2. Create admin app
        logger.info('Creating admin Flutter app...');
        await cliExec(`flutter create ${targetProject}_admin`, monoRepoPath, logger);

        // 3. Remove demo folders
        logger.info('Removing demo folders...');
        const flutterLibPath = path.join(config.targetFlutterProjectPath, 'lib');
        await fileSystem.deleteDirectory(path.join(flutterLibPath, 'screens'));
        await fileSystem.deleteDirectory(path.join(flutterLibPath, 'config'));

        // 4. Main generation
        logger.info('Running generation service...');
        const generationService = new GenerationService(fileSystem);
        await generationService.generate(config);

        // 4a. Авто-генерация starter-фичи tasks (Category, Tag, Task, TaskTagMap),
        // чтобы home_page.dart / tasks/presentation/widgets компилировались сразу
        // после create-project. Иначе пользователь должен вручную звать generate-entity.
        logger.info('Auto-generating starter tasks entities...');
        await autoGenerateTasksFeature(fileSystem, config, logger);

        // 4b. Пост-обработка pubspec.yaml: target проект на 1 уровень глубже шаблона
        // (Templates/flutter/<tpl>/ vs Projects/Flutter/serverpod/<name>/), поэтому
        // относительные path-зависимости вроде `path: ../../Packages/X` нужно
        // углубить до `path: ../../../Packages/X`.
        logger.info('Patching pubspec.yaml relative package paths...');
        await patchPubspecPackagePaths(fileSystem, config);

        // 5. Create database.dart
        logger.info('Generating AppDatabase...');
        const appDatabaseGenerator = new AppDatabaseGenerator(fileSystem, config);
        await appDatabaseGenerator.generate();

        // 6. Fix common issues
        logger.info('Applying Flutter fixes...');
        await startAppFix(config.targetFlutterProjectPath);

        // 7. Git init (optional)
        if (!opts.skipGitInit) {
            logger.info('Initializing git...');
            await cliExec('git init', monoRepoPath, logger);
            await cliExec('git add .', monoRepoPath, logger);
            await cliExec('git commit -m "init [skip ci]"', monoRepoPath, logger);
        }

        // 8. Flutter pub get (optional)
        if (!opts.skipPubGet) {
            logger.info('Running flutter pub get...');
            await cliExec(PUB_GET, config.targetFlutterProjectPath, logger);
            await cliExec(PUB_GET, config.targetServerProjectPath, logger);
            await cliExec(PUB_GET, config.targetAdminProjectPath, logger);

            // Setup Drift Web WASM
            logger.info('Setting up Drift WASM worker...');
            const webDir = path.join(config.targetFlutterProjectPath, 'web');
            await fileSystem.createFile(path.join(webDir, 'drift_worker.dart'), DRIFT_WORKER_CONTENT);
            await cliExec(DRIFT_WORKER_COMPILE, config.targetFlutterProjectPath, logger);
            const templateSqliteWasm = path.join(config.templFlutterProjectPath, 'web', SQLITE3_WASM_FILE);
            await fileSystem.copyFile(templateSqliteWasm, path.join(webDir, SQLITE3_WASM_FILE));
        }

        // 9. Serverpod generate (optional)
        if (!opts.skipServerpodGenerate) {
            logger.info('Running serverpod generate...');
            await cliExec(SERVERPOD_GENERATE, config.targetServerProjectPath, logger);
            await cliExec(SERVERPOD_CREATE_MIGRATION, config.targetServerProjectPath, logger);
            await cliExec(BUILD_RUNNER, config.targetFlutterProjectPath, logger);
            await cliExec(BUILD_RUNNER, config.targetAdminProjectPath, logger);
        }

        // 10. Local setup (optional): docker compose + migrations + run server
        if (opts.localSetup) {
            const monoRepoPath = config.monoRepoTargetPath;
            const serverPath = config.targetServerProjectPath;
            const flutterPath = config.targetFlutterProjectPath;

            logger.info('--- Local setup ---');

            logger.info('Stopping old containers...');
            await cliExec('docker compose down -v', serverPath, logger).catch(() => {});

            logger.info('Starting Docker containers (postgres + redis)...');
            await cliExec('docker compose up -d', serverPath, logger);

            logger.info('Waiting for PostgreSQL...');
            for (let i = 0; i < 15; i++) {
                try {
                    await cliExec('docker compose exec -T postgres pg_isready -U postgres', serverPath, logger, true);
                    logger.info('PostgreSQL is ready.');
                    break;
                } catch {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }

            logger.info('Creating migrations...');
            await cliExec('serverpod create-migration --experimental-features=all --force', serverPath, logger);

            logger.info('Running serverpod generate...');
            await cliExec('serverpod generate --experimental-features=all', serverPath, logger);

            logger.info('Running build_runner for Flutter...');
            await cliExec('dart run build_runner build --delete-conflicting-outputs', flutterPath, logger);

            logger.info('Starting server (applying migrations)...');
            await cliExec('dart bin/main.dart --apply-migrations', serverPath, logger);
        }

        logger.emitResult('create-project', true, startTime);
    } catch (error) {
        logger.error(String(error));
        logger.emitResult('create-project', false, startTime);
        process.exit(1);
    }
}

function snakeToCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * Запускает entity-generation для каждого <name>.spy.yaml в шаблонной папке tasks/.
 * Это делает свежесозданный проект сразу компилируемым (home_page.dart
 * ссылается на features/tasks/{Category,Tag,Task,TaskTagMap}).
 */
async function autoGenerateTasksFeature(
    fileSystem: TrackingFileSystem,
    config: GenerationConfig,
    logger: CliLogger,
): Promise<void> {
    const tasksModelsDir = path.join(config.templServerProjectPath, 'lib', 'src', 'models', 'tasks');
    if (!await fileSystem.exists(tasksModelsDir)) {
        logger.info(`No template tasks/ models found at ${tasksModelsDir}, skipping auto-gen`);
        return;
    }

    const targetTasksDir = path.join(config.targetServerProjectPath, 'lib', 'src', 'models', 'tasks');
    await fileSystem.createFolder(targetTasksDir);

    const entries = await fs.readdir(tasksModelsDir);
    const entityYamls = entries.filter(f => f.endsWith('.spy.yaml') && !f.endsWith('_sync_event.spy.yaml'));

    // Сначала копируем ВСЕ yaml (включая sync_event) в target, чтобы валидация
    // парного sync_event прошла, и serverpod generate увидел все классы.
    for (const file of entries.filter(f => f.endsWith('.spy.yaml'))) {
        const src = path.join(tasksModelsDir, file);
        const dst = path.join(targetTasksDir, file);
        const content = await fs.readFile(src, 'utf-8');
        await fileSystem.createFile(dst, content);
    }

    const targetFeatureDir = path.join(config.targetFlutterLibPath, 'features', 'tasks');

    for (const file of entityYamls) {
        const yamlPath = path.join(targetTasksDir, file);
        const yamlContent = await fs.readFile(yamlPath, 'utf-8');
        const model = ServerpodYamlParser.parse(yamlContent);

        const features: manifestType[] = model.isRelation ? ['manyToMany'] : ['entity'];

        const entityConfig = new GenerationConfig({
            templProject: config.templProject,
            workspacesPath: config.monoRepoTargetPath,
            templFeatureName: 'tasks',
            targetFeaturePath: targetFeatureDir,
            targetEntity: snakeToCamelCase(model.tableName),
            targetEntity1: model.entity1,
            targetEntity2: model.entity2,
            manifest: features,
            templatesPath: config.templatesPath,
        });

        logger.info(`  → ${model.className}`);
        const entityGenerationService = new GenerationService(fileSystem);
        await entityGenerationService.generate(entityConfig, model);
    }
}

/**
 * Патчит относительные path-зависимости в pubspec.yaml внутри target-проекта.
 * Шаблон t115 живёт в `Templates/flutter/t115/`, target проект в
 * `Projects/Flutter/serverpod/<name>/` — на 1 уровень глубже из-за `serverpod/`.
 * Поэтому `path: ../../Packages/X` (валидно в шаблоне) нужно превратить в
 * `path: ../../../Packages/X` для target.
 */
async function patchPubspecPackagePaths(fileSystem: TrackingFileSystem, config: GenerationConfig): Promise<void> {
    const pubspecCandidates = [
        path.join(config.targetFlutterProjectPath, 'pubspec.yaml'),
        path.join(config.targetAdminProjectPath, 'pubspec.yaml'),
    ];

    for (const pubspecPath of pubspecCandidates) {
        if (!await fileSystem.exists(pubspecPath)) { continue; }
        const content = await fileSystem.readFile(pubspecPath);
        const patched = content.replace(/(\bpath:\s*)\.\.\/\.\.\/Packages\//g, '$1../../../Packages/');
        if (patched !== content) {
            await fileSystem.createFile(pubspecPath, patched);
        }
    }
}
