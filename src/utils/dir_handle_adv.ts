import * as path from 'path';
import { IFileSystem } from '../core/interfaces/file_system';

/**
 * Simple scan function with .templateignore support (only in root)
 */
export async function scanWithIgnore(
    directory: string,
    fileSystem: IFileSystem
): Promise<string[]> {
    const ignoreFilePath = path.join(directory, '.templateignore');
    let ignoredDirs: string[] = [];

    if (await fileSystem.exists(ignoreFilePath)) {
        const ignoreContent = await fileSystem.readFile(ignoreFilePath);
        ignoredDirs = ignoreContent
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .map(line => line.replace(/\/$/, ''));
    }

    const allFiles = await fileSystem.readDirectoryRecursive(directory);

    const filteredFiles = allFiles.filter(filePath => {
        const relativePath = path.relative(directory, filePath);

        return !ignoredDirs.some(ignoredDir => {
            const normalizedPath = relativePath.replace(/\\/g, '/');
            return normalizedPath.startsWith(ignoredDir + '/') || normalizedPath === ignoredDir;
        });
    });

    return filteredFiles;
}
