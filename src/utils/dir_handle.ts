import fs from 'fs';
import path from 'path';
import { promises as fsPromises } from 'fs';

export async function createFolders(folderPaths: string[], errorHandler?: (error: string) => void): Promise<void> {
    for (const dirPath of folderPaths) {
        try {
            await createFolder(dirPath);
        } catch (error) {
            errorHandler?.(String(error));
        }
    }
}

export async function createFolder(path: string) {
    if (!fs.existsSync(path)) {
        await fs.promises.mkdir(path, { recursive: true });
    }
}

export function pathExists(path: string): boolean {
    return fs.existsSync(path);
}

export async function createFileOneTime(path: string, content: string) {
    if (!fs.existsSync(path)) {
        createFile(path, content);
    }
}

export async function copyFile(pathSource: string, pathDest: string): Promise<void> {
    try {
        const destDir = path.dirname(pathDest);
        await fsPromises.mkdir(destDir, { recursive: true });
        await fsPromises.copyFile(pathSource, pathDest);
    } catch (error) {
        console.error(`Error copying file from ${pathSource} to ${pathDest}`, error);
        throw error;
    }
}

export async function createFile(mpath: string, content: string) {
    if (!fs.existsSync(path.dirname(mpath))) {
        await fs.promises.mkdir(path.dirname(mpath), { recursive: true });
    }
    await fs.promises.writeFile(mpath, content, 'utf8');
}

export async function getFilesInDir(path: string): Promise<string[]> {
    return await fs.promises.readdir(path);
}

export async function readFile(filePath: string): Promise<string> {
    try {
        return await fs.promises.readFile(filePath, 'utf-8');
    } catch (error) {
        throw error;
    }
}

export async function readDirectory(directoryPath: string): Promise<string[]> {
    try {
        const files = await fsPromises.readdir(directoryPath);
        return files;
    } catch (error) {
        console.error(`Error reading directory ${directoryPath}:`, error);
        throw error;
    }
}

export async function isDirectory(dirPath: string): Promise<boolean> {
    try {
        const stats = await fs.promises.stat(dirPath);
        return stats.isDirectory();
    } catch {
        return false;
    }
}

export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

export async function readDirectoryRecursive(dirPath: string): Promise<string[]> {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...await readDirectoryRecursive(fullPath));
        } else {
            files.push(fullPath);
        }
    }
    return files;
}
