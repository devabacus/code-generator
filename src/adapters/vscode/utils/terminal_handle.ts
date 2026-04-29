import { window } from "vscode";
import { execCommand } from "../../../core/utils/exec";

export { execCommand as executeCommand } from "../../../core/utils/exec";

export async function writeToTerminal(command = "whoami") {
    const terminal = window.createTerminal('My Terminal');
    terminal.show();
    terminal.sendText(command);
}

export async function terminalCommands(commands: string[], path: string): Promise<void> {
    for (const command of commands) {
        await execCommand(command, path);
        window.showInformationMessage(`${command}`);
    }
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
