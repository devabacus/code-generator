
export interface IFileSystem {
    createFile(path: string, content: string): Promise<void>;
    createFolder(path: string): Promise<void>;
    readFile(path: string): Promise<string>;
    exists(path: string): Promise<boolean>;
    copyFile(pathSource: string, pathDest: string): Promise<void>;
    readDirectory(path: string): Promise<string[]>;
    readDirectoryRecursive(path: string): Promise<string[]>;
    isDirectory(path: string): Promise<boolean>;
}
