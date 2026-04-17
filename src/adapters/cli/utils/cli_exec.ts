import { exec } from 'child_process';
import { CliLogger } from './cli_logger';

const isWindows = process.platform === 'win32';
const shellOption = isWindows ? { shell: 'powershell.exe' } : {};

export async function cliExec(command: string, cwd: string, logger: CliLogger, silent = false): Promise<string> {
    return new Promise((resolve, reject) => {
        if (!silent) { logger.info(`  $ ${command}`); }
        exec(command, { cwd, maxBuffer: 10 * 1024 * 1024, ...shellOption }, (error, stdout, stderr) => {
            if (error) {
                if (!silent) {
                    const details = [stderr, stdout, error.message].filter(Boolean).join('\n');
                    logger.error(`Command failed: ${command}\n${details}`);
                }
                reject(error);
            } else {
                resolve(stdout);
            }
        });
    });
}

export async function cliExecSequence(commands: string[], cwd: string, logger: CliLogger): Promise<void> {
    for (const command of commands) {
        await cliExec(command, cwd, logger);
    }
}
