import { IFileSystem } from '../../core/interfaces/file_system';

/**
 * Mock file system for testing.
 * Stores files in memory instead of real filesystem.
 */
export class MockFileSystem implements IFileSystem {
    private files: Map<string, string> = new Map();
    private directories: Set<string> = new Set();

    constructor() {
        // Root always exists
        this.directories.add('/');
    }

    // Pre-populate with files for testing
    setFile(path: string, content: string): void {
        this.files.set(this.normalizePath(path), content);
        // Create parent directories
        const dir = this.getParentDir(path);
        if (dir) {
            this.createFolderSync(dir);
        }
    }

    setDirectory(path: string): void {
        this.createFolderSync(path);
    }

    private normalizePath(p: string): string {
        return p.replace(/\\/g, '/');
    }

    private getParentDir(p: string): string {
        const normalized = this.normalizePath(p);
        const parts = normalized.split('/');
        parts.pop();
        return parts.join('/') || '/';
    }

    private createFolderSync(dirPath: string): void {
        const normalized = this.normalizePath(dirPath);
        const parts = normalized.split('/').filter(Boolean);
        let current = '';
        for (const part of parts) {
            current += '/' + part;
            this.directories.add(current);
        }
    }

    // IFileSystem implementation
    async exists(path: string): Promise<boolean> {
        const normalized = this.normalizePath(path);
        return this.files.has(normalized) || this.directories.has(normalized);
    }

    async readFile(path: string): Promise<string> {
        const normalized = this.normalizePath(path);
        const content = this.files.get(normalized);
        if (content === undefined) {
            throw new Error(`File not found: ${path}`);
        }
        return content;
    }

    async createFile(path: string, content: string): Promise<void> {
        this.setFile(path, content);
    }

    async createFolder(folderPath: string): Promise<void> {
        this.createFolderSync(folderPath);
    }

    async deleteFile(filePath: string): Promise<void> {
        this.files.delete(this.normalizePath(filePath));
    }

    async readDirectory(folderPath: string): Promise<string[]> {
        const normalized = this.normalizePath(folderPath);
        const entries: string[] = [];

        // Find all files in this directory
        for (const [filePath] of this.files) {
            const parent = this.getParentDir(filePath);
            if (parent === normalized) {
                const name = filePath.split('/').pop()!;
                entries.push(name);
            }
        }

        // Find all subdirectories
        for (const dir of this.directories) {
            const parent = this.getParentDir(dir);
            if (parent === normalized && dir !== normalized) {
                const name = dir.split('/').pop()!;
                if (!entries.includes(name)) {
                    entries.push(name);
                }
            }
        }

        return entries;
    }

    async isDirectory(path: string): Promise<boolean> {
        const normalized = this.normalizePath(path);
        return this.directories.has(normalized);
    }

    getFilesSnapshot(): Map<string, string> {
        return new Map(this.files);
    }

    async copyFile(source: string, dest: string): Promise<void> {
        const content = await this.readFile(source);
        await this.createFile(dest, content);
    }

    async readDirectoryRecursive(dirPath: string): Promise<string[]> {
        const normalized = this.normalizePath(dirPath);
        const result: string[] = [];

        for (const [filePath] of this.files) {
            if (filePath.startsWith(normalized + '/')) {
                result.push(filePath);
            }
        }

        return result;
    }

    async deleteDirectory(dirPath: string): Promise<void> {
        const normalized = this.normalizePath(dirPath);

        // Delete all files in directory
        for (const [filePath] of this.files) {
            if (filePath.startsWith(normalized + '/')) {
                this.files.delete(filePath);
            }
        }

        // Delete all subdirectories
        for (const dir of Array.from(this.directories)) {
            if (dir.startsWith(normalized)) {
                this.directories.delete(dir);
            }
        }
    }

    clear(): void {
        this.files.clear();
        this.directories.clear();
        this.directories.add('/');
    }
}
