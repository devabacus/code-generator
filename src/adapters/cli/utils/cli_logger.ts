export interface CliResult {
    success: boolean;
    command: string;
    files_created: string[];
    files_modified: string[];
    errors: string[];
    duration_ms: number;
}

export class CliLogger {
    private jsonMode: boolean;
    private filesCreated: string[] = [];
    private filesModified: string[] = [];
    private errors: string[] = [];

    constructor(jsonMode: boolean) {
        this.jsonMode = jsonMode;
    }

    info(msg: string): void {
        if (this.jsonMode) {
            process.stderr.write(msg + '\n');
        } else {
            console.log(msg);
        }
    }

    error(msg: string): void {
        this.errors.push(msg);
        if (this.jsonMode) {
            process.stderr.write(`ERROR: ${msg}\n`);
        } else {
            console.error(`ERROR: ${msg}`);
        }
    }

    trackFileCreated(filePath: string): void {
        this.filesCreated.push(filePath);
    }

    trackFileModified(filePath: string): void {
        this.filesModified.push(filePath);
    }

    emitResult(command: string, success: boolean, startTime: number): void {
        const result: CliResult = {
            success,
            command,
            files_created: this.filesCreated,
            files_modified: this.filesModified,
            errors: this.errors,
            duration_ms: Date.now() - startTime,
        };

        if (this.jsonMode) {
            process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        } else {
            console.log(`\n${success ? 'SUCCESS' : 'FAILED'}: ${command}`);
            if (this.filesCreated.length > 0) {
                console.log(`Created (${this.filesCreated.length}):`);
                this.filesCreated.forEach(f => console.log(`  + ${f}`));
            }
            if (this.filesModified.length > 0) {
                console.log(`Modified (${this.filesModified.length}):`);
                this.filesModified.forEach(f => console.log(`  ~ ${f}`));
            }
            if (this.errors.length > 0) {
                console.log(`Errors (${this.errors.length}):`);
                this.errors.forEach(e => console.log(`  ! ${e}`));
            }
            console.log(`Duration: ${result.duration_ms}ms`);
        }
    }
}
