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
 * Шаблон t115 живёт в `Templates/flutter/t115/`, target проект в
 * `Projects/Flutter/serverpod/<name>/` — на 1 уровень глубже из-за `serverpod/`.
 * Поэтому `path: ../../Packages/X` (валидно в шаблоне) нужно превратить в
 * `path: ../../../Packages/X` для target.
 */
export async function patchPubspecPackagePaths(
    fileSystem: IFileSystem,
    config: GenerationConfig,
): Promise<void> {
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
