
export interface IFileSystem {
    createFile(path: string, content: string): Promise<void>;
    createFolder(path: string): Promise<void>;
    readFile(path: string): Promise<string>;
    exists(path: string): Promise<boolean>;
    copyFile(pathSource: string, pathDest: string): Promise<void>;
    readDirectory(path: string): Promise<string[]>;
    readDirectoryRecursive(path: string): Promise<string[]>;
    isDirectory(path: string): Promise<boolean>;
    deleteDirectory(path: string): Promise<void>;
    deleteFile(path: string): Promise<void>;
    /**
     * TASK-042: атомарная замена файла (temp → target). Нужна ledger'у
     * (`.codegen/ledger.json`): при падении посередине записи на диске обязан
     * остаться либо старый ledger целиком, либо новый целиком — «половина
     * JSON» сделала бы baseline нечитаемым и увела бы весь проект в legacy.
     */
    rename(pathSource: string, pathDest: string): Promise<void>;
}
