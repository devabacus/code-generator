import { IFileSystem } from "../../../core/interfaces/file_system";

export interface ReplacementRule { from: string | RegExp; to: string; }

export interface ReplaceTask {
    sourcePath: string;
    destinationPath: string;
    rules: ReplacementRule[];
}

/**
 * Class for replacing text in files using dictionary rules
 */
export class ReplacingFileProcessor {

    constructor(private fileSystem: IFileSystem) { }

    public async process(tasks: ReplaceTask[]): Promise<void> {
        const processPromises = tasks.map(task => this._processSingleFile(task));
        await Promise.all(processPromises);
    }

    private async _processSingleFile(task: ReplaceTask): Promise<void> {
        let content = await this.fileSystem.readFile(task.sourcePath);

        for (const rule of task.rules) {
            const regex = typeof rule.from === 'string' ? new RegExp(rule.from, 'g') : rule.from;
            content = content.replace(regex, rule.to);
        }

        await this.fileSystem.createFile(task.destinationPath, content);
    }
}
