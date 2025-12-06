import { window } from "vscode";
import { terminalCommands } from "./terminal_handle";

export async function gitInit(path: string) {
    const gitInitSet = [
        'git init',
        'git add .',
        'git commit -m "init"'
    ];
    await terminalCommands(gitInitSet, path);
    window.showInformationMessage('✅ Git initialized!');
}
