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
import {
    autoGenerateTasksFeature as bootstrapAutoGenTasks,
    patchPubspecPackagePaths as bootstrapPatchPubspec,
    copyAgentInfrastructure as bootstrapCopyAgentInfra,
} from '../../../core/services/project_bootstrapper';

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
    withTasks?: boolean;
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
        .option('--with-tasks', 'Auto-generate starter tasks-фичу (Category/Tag/Task/TaskTagMap) для демо. По умолчанию выключено — голый проект только с settings/auth/configuration.')
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

        // 4a/b/c. Bootstrap-шаги вынесены в shared core/services/project_bootstrapper.ts
        // чтобы и CLI, и VS Code адаптер использовали одинаковую логику.

        // tasks-фича — опциональная демо. По умолчанию выключена (голый проект
        // только с settings/auth/configuration). Включить через --with-tasks.
        if (opts.withTasks) {
            logger.info('Auto-generating starter tasks entities (--with-tasks)...');
            await bootstrapAutoGenTasks(fileSystem, config, logger);
        } else {
            logger.info('Skipping tasks-фичу (default). Pass --with-tasks to include Category/Tag/Task/TaskTagMap demo.');
        }

        logger.info('Patching pubspec.yaml relative package paths...');
        await bootstrapPatchPubspec(fileSystem, config);

        logger.info('Copying agent infrastructure (CLAUDE.md, AGENTS.md, ai/scripts, ai/prompts)...');
        await bootstrapCopyAgentInfra(fileSystem, config, logger);

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

// Bootstrap helpers (autoGenerateTasksFeature, patchPubspecPackagePaths,
// copyAgentInfrastructure) вынесены в src/core/services/project_bootstrapper.ts
// чтобы и CLI, и VS Code адаптер использовали одинаковую логику.
