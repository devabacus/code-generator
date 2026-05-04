import * as fs from 'fs/promises';
import * as path from 'path';
import { IFileSystem } from '../interfaces/file_system';
import { GenerationConfig } from '../../features/generation/config/generation_config';

/**
 * Минимальный интерфейс логгера. Адаптеры (CLI / VS Code) реализуют его поверх
 * собственных каналов вывода (stdout/stderr / VSCode Output Channel).
 */
export interface IBootstrapLogger {
    info(msg: string): void;
}

/**
 * Патчит относительные path-зависимости в pubspec.yaml внутри target-проекта.
 *
 * Шаблон t115 живёт в `Templates/flutter/t115/<feature>_flutter/`, default target
 * в `Projects/Flutter/serverpod/<name>/<name>_flutter/` — на 1 уровень глубже
 * из-за `serverpod/`. Поэтому relative paths в pubspec.yaml шаблона нужно
 * углубить на (target_depth − template_depth) уровней.
 *
 * **TASK-024 / Session E2 round 2 fix.** Раньше patcher hardcoded "+1 уровень"
 * (template at depth N, target at depth N+1). Это рушилось для
 * `--projects-path G:/Templates/flutter` (target = `Templates/flutter/simplified/`,
 * та же глубина что template `Templates/flutter/t115/`) — patcher всё-равно
 * углублял paths и `flutter pub get` падал на non-existent `Templates/Packages/`.
 *
 * Теперь delta вычисляется динамически: считаем число path segments в
 * `templFlutterProjectPath` vs `targetFlutterProjectPath`, добавляем
 * `(targetDepth − templateDepth)` уровней `../` к каждой relative path-зависимости.
 *
 * Покрытие (для default delta = 1):
 *   1. **In-monorepo packages** (Templates/flutter/t115/Packages/X → Projects/Flutter/serverpod/<n>/Packages/X):
 *      `path: ../../Packages/X` → `path: ../../../Packages/X`
 *   2. **Out-of-monorepo packages** (sync_core path-dep, etc., from Projects/Flutter/Packages/):
 *      `path: ../../../../Projects/Flutter/Packages/X` → `path: ../../../../../Projects/Flutter/Packages/X`
 *
 * Для **delta = 0** (e.g. `--projects-path Templates/flutter`) — patcher no-op:
 * paths не модифицируются, потому что template и target живут на одной глубине.
 *
 * Inverse-проверки: оставленные неизменёнными absolute paths и `path: ../../<feature>_client`
 * (внутримонорепо siblings) — для них не применяется substitution.
 */
export async function patchPubspecPackagePaths(
    fileSystem: IFileSystem,
    config: GenerationConfig,
): Promise<void> {
    // TASK-024: динамическая depth delta между template и target.
    // Считаем число path segments после нормализации (Windows backslash → POSIX slash,
    // removed empty parts от leading slash или trailing slash).
    const templateSegments = path.normalize(config.templFlutterProjectPath)
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean).length;
    const targetSegments = path.normalize(config.targetFlutterProjectPath)
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean).length;
    const delta = targetSegments - templateSegments;

    // Если delta <= 0, paths не нуждаются в углублении. Sub-zero (target на
    // меньшей глубине чем template) — exotic case, тоже no-op (углубить нельзя
    // mathematically; "shallow" target означал бы paths должны бы стать короче,
    // но шаблон уже формирует paths под template depth, так что noop безопасен).
    if (delta <= 0) {
        return;
    }

    const additionalUpLevels = '../'.repeat(delta);

    const pubspecCandidates = [
        path.join(config.targetFlutterProjectPath, 'pubspec.yaml'),
        path.join(config.targetAdminProjectPath, 'pubspec.yaml'),
    ];

    for (const pubspecPath of pubspecCandidates) {
        if (!await fileSystem.exists(pubspecPath)) { continue; }
        const content = await fileSystem.readFile(pubspecPath);
        let patched = content;
        // 1. In-monorepo packages: ../../Packages/X → ../../<+delta>../Packages/X
        patched = patched.replace(
            /(\bpath:\s*)\.\.\/\.\.\/Packages\//g,
            `$1${additionalUpLevels}../../Packages/`
        );
        // 2. Out-of-monorepo packages (sync_core etc.):
        //    ../../../../Projects/... → ../<+delta>../../../../Projects/...
        //    D8 (2026-05-02): Pattern использует **exact** `{4}` (НЕ `{4,}` greedy),
        //    чтобы быть **idempotent**. Template state = 4 levels (`../../../../`).
        //    После 1-го patch = (4 + delta) levels. Pattern `{4}` НЕ matches
        //    более чем 4 leading `../`, так что повторный run не trigger.
        patched = patched.replace(
            /(\bpath:\s*)((?:\.\.\/){4})Projects\//g,
            `$1${additionalUpLevels}$2Projects/`
        );
        if (patched !== content) {
            await fileSystem.createFile(pubspecPath, patched);
        }
    }
}

/**
 * Копирует agent infrastructure из шаблона в target проект:
 * - `CLAUDE.md` (top-level agent guide) и `AGENTS.md` (правила процесса)
 * - `ai/scripts/{new_task.py, task.py}` — task management CLI
 * - `ai/prompts/{executor,teamlead,finalize}.prompt.md` — промпты ролей
 * - `ai/guides/`, `ai/discussions/docs/`, `ai/tasks/_template/` — справочники
 *
 * Применяет PROJECT_ONLY словарь (`<templProject> → <targetProject>`).
 */
export async function copyAgentInfrastructure(
    fileSystem: IFileSystem,
    config: GenerationConfig,
    logger: IBootstrapLogger,
): Promise<void> {
    const sourceRoot = config.monoRepoTemplPath;
    const targetRoot = config.monoRepoTargetPath;

    const replaceProjectName = (content: string): string =>
        content.replaceAll(config.templProject, config.targetProject);

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
    fileSystem: IFileSystem,
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
