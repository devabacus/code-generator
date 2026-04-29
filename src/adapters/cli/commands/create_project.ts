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

        // 4c. Копирование agent infrastructure (CLAUDE.md, AGENTS.md, ai/scripts/, ai/prompts/)
        // в свежий проект. Эти файлы — общая инфраструктура для AI-агентов работающих над
        // любым сгенерированным проектом (task workflow, multi-agent правила, prompts).
        logger.info('Copying agent infrastructure (CLAUDE.md, AGENTS.md, ai/scripts, ai/prompts)...');
        await copyAgentInfrastructure(fileSystem, config, logger);

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

    // Копируем hand-written tasks-widgets из шаблона в target.
    // Эти виджеты нужны home_page.dart (импортирует ../../../tasks/presentation/widgets/...).
    // Не используем manifest startProject + scan_dir feature/, потому что тот резолвит destination
    // в `targetFeaturePath` (= 'home' дефолт), а нам нужно `features/tasks/presentation/widgets/`.
    const tasksWidgetsSrc = path.join(
        config.templFlutterProjectPath, 'lib', 'features', 'tasks', 'presentation', 'widgets',
    );
    if (await fileSystem.exists(tasksWidgetsSrc)) {
        const tasksWidgetsDst = path.join(targetFeatureDir, 'presentation', 'widgets');
        await fileSystem.createFolder(tasksWidgetsDst);
        const widgetFiles = await fs.readdir(tasksWidgetsSrc);
        for (const widget of widgetFiles.filter(f => f.endsWith('.dart'))) {
            let content = await fs.readFile(path.join(tasksWidgetsSrc, widget), 'utf-8');
            // Применяем PROJECT_ONLY словарь: t115 → targetProject (для package: импортов)
            content = content.replaceAll(config.templProject, config.targetProject);
            await fileSystem.createFile(path.join(tasksWidgetsDst, widget), content);
        }
        logger.info(`  → copied ${widgetFiles.length} tasks/presentation/widgets file(s)`);
    }
}

/**
 * Копирует agent infrastructure из шаблона в target проект:
 * - `CLAUDE.md` (агентский guide верхнего уровня) и `AGENTS.md` (правила процесса)
 * - `ai/scripts/{new_task.py, task.py}` — task management CLI
 * - `ai/prompts/{executor,teamlead,finalize}.prompt.md` — промпты для ролей
 * - `ai/guides/`, `ai/discussions/docs/`, `ai/tasks/_template/` — справочники и шаблоны (если есть)
 *
 * Применяет PROJECT_ONLY словарь (`<templProject> → <targetProject>`) к содержимому
 * файлов чтобы плейсхолдеры типа `t115_flutter` стали `<name>_flutter`.
 *
 * НЕ использует manifest startProject + scan_dir feature/ — те резолвят destination
 * через `targetFeaturePath`, что неправильно для root-уровня (CLAUDE.md, AGENTS.md)
 * и для ai/ директории.
 */
async function copyAgentInfrastructure(
    fileSystem: TrackingFileSystem,
    config: GenerationConfig,
    logger: CliLogger,
): Promise<void> {
    const sourceRoot = config.monoRepoTemplPath; // G:/Templates/flutter/<templ>
    const targetRoot = config.monoRepoTargetPath; // G:/Projects/Flutter/serverpod/<name>

    const replaceProjectName = (content: string): string =>
        content.replaceAll(config.templProject, config.targetProject);

    // 1. Root-level files: CLAUDE.md, AGENTS.md
    for (const fileName of ['CLAUDE.md', 'AGENTS.md']) {
        const src = path.join(sourceRoot, fileName);
        if (!await fileSystem.exists(src)) {
            logger.info(`  → ${fileName} not in template, skip`);
            continue;
        }
        const dst = path.join(targetRoot, fileName);
        const content = await fs.readFile(src, 'utf-8');
        await fileSystem.createFile(dst, replaceProjectName(content));
        logger.info(`  → ${fileName}`);
    }

    // 2. ai/ subdirectories — копируем целиком указанные дочерние папки шаблона.
    // НЕ копируем `ai/tasks/active/` или `ai/tasks/done/` — они project-specific (история).
    // НЕ копируем `ai/docs/` — будет project-specific документация (TASK-001 заполняет под проект).
    const aiSubpaths = [
        'ai/scripts',
        'ai/prompts',
        'ai/guides',
        'ai/discussions/docs',
        'ai/tasks/_template',
        'ai/README.md',
        'ai/version.md',
    ];
    for (const subpath of aiSubpaths) {
        const src = path.join(sourceRoot, subpath);
        if (!await fileSystem.exists(src)) { continue; }
        await copyDirOrFileWithReplacements(src, path.join(targetRoot, subpath), replaceProjectName, fileSystem);
    }
    logger.info(`  → ai/ infrastructure copied (scripts/prompts/guides/discussions docs/tasks template)`);
}

async function copyDirOrFileWithReplacements(
    src: string,
    dst: string,
    transform: (content: string) => string,
    fileSystem: TrackingFileSystem,
): Promise<void> {
    const stat = await fs.stat(src);
    if (stat.isFile()) {
        const content = await fs.readFile(src, 'utf-8');
        await fileSystem.createFile(dst, transform(content));
        return;
    }
    if (!stat.isDirectory()) { return; }
    await fileSystem.createFolder(dst);
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const dstPath = path.join(dst, entry.name);
        if (entry.isDirectory()) {
            await copyDirOrFileWithReplacements(srcPath, dstPath, transform, fileSystem);
        } else if (entry.isFile()) {
            // Бинарные файлы (.png, .ico) — текстовая трансформация ломает их. Фильтр по расширениям.
            const ext = path.extname(entry.name).toLowerCase();
            const textExtensions = new Set(['.md', '.py', '.dart', '.yaml', '.yml', '.json', '.txt', '.ps1', '.sh', '.gitignore', '']);
            if (textExtensions.has(ext)) {
                const content = await fs.readFile(srcPath, 'utf-8');
                await fileSystem.createFile(dstPath, transform(content));
            } else {
                await fileSystem.copyFile(srcPath, dstPath);
            }
        }
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
