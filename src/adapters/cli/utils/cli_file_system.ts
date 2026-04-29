import { IFileSystem } from '../../../core/interfaces/file_system';
import { DefaultFileSystem } from '../../../core/implementations/default_file_system';
import { CliLogger } from './cli_logger';

export class TrackingFileSystem implements IFileSystem {
    private inner: DefaultFileSystem;
    private logger: CliLogger;

    constructor(inner: DefaultFileSystem, logger: CliLogger) {
        this.inner = inner;
        this.logger = logger;
    }

    async createFile(filePath: string, content: string): Promise<void> {
        const existed = await this.inner.exists(filePath);
        await this.inner.createFile(filePath, content);
        if (existed) {
            this.logger.trackFileModified(filePath);
        } else {
            this.logger.trackFileCreated(filePath);
        }
    }

    async copyFile(source: string, dest: string): Promise<void> {
        const existed = await this.inner.exists(dest);
        await this.inner.copyFile(source, dest);
        if (existed) {
            this.logger.trackFileModified(dest);
        } else {
            this.logger.trackFileCreated(dest);
        }
    }

    async createFolder(folderPath: string): Promise<void> {
        return this.inner.createFolder(folderPath);
    }

    async readFile(filePath: string): Promise<string> {
        return this.inner.readFile(filePath);
    }

    async exists(filePath: string): Promise<boolean> {
        return this.inner.exists(filePath);
    }

    readDirectory(dirPath: string): Promise<string[]> {
        return this.inner.readDirectory(dirPath);
    }

    readDirectoryRecursive(dirPath: string): Promise<string[]> {
        return this.inner.readDirectoryRecursive(dirPath);
    }

    isDirectory(dirPath: string): Promise<boolean> {
        return this.inner.isDirectory(dirPath);
    }

    async deleteDirectory(dirPath: string): Promise<void> {
        return this.inner.deleteDirectory(dirPath);
    }

    async deleteFile(filePath: string): Promise<void> {
        return this.inner.deleteFile(filePath);
    }
}
