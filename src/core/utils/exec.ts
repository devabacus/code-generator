import { exec } from 'child_process';

const isWindows = process.platform === 'win32';
const defaultShell = isWindows ? { shell: 'powershell.exe' } : {};

export async function execCommand(command: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(command, { cwd, maxBuffer: 10 * 1024 * 1024, ...defaultShell }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`${command}\n${stderr || error.message}`));
            } else {
                resolve(stdout);
            }
        });
    });
}

export async function execSequence(commands: string[], cwd: string): Promise<void> {
    for (const command of commands) {
        await execCommand(command, cwd);
    }
}
