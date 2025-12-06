import { window } from "vscode";
import { exec } from "child_process";

export async function writeToTerminal(command = "whoami") {
    const terminal = window.createTerminal('My Terminal');
    terminal.show();
    terminal.sendText(command);
}

export async function terminalCommands(commands: string[], path: string): Promise<void> {
    for (const command of commands) {
        await executeCommand(command, path);
        window.showInformationMessage(`${command}`);
    }
}

export async function executeCommand(command: string, cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
        exec(command, { cwd }, (error, stdout, stderr) => {
            if (error) {
                window.showErrorMessage(`Error: ${stderr || error.message}`);
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

export function executeCommandSync(command: string, cwd: string): void {
    const execSync = require('child_process').execSync;
    execSync(command, { cwd, stdio: 'inherit' });
}

export async function executeInTerminal(command: string, path?: string): Promise<void> {
    const terminal = window.createTerminal('Build Runner');
    terminal.show();
    if (path) {
        terminal.sendText(`cd "${path}"; ${command}`);
    } else {
        terminal.sendText(command);
    }
}

export async function executeInTerminalBatch(commands: string[], path?: string): Promise<void> {
    for (const command of commands) {
        await executeInTerminal(command, path);
    }
}
