import { commands, Uri, window } from "vscode";
import { getRootWorkspaceFolders } from "./path_util";
import { executeInTerminal, terminalCommands } from "./terminal_handle";
import path from "path";


// export type ActionMap = { [key: string]: () => Promise<void> };
export async function vsCodeExtHandler() {
    const options: Record<string, () => Promise<void>> = {

        'Переустановить расширение': reinstallExtension,
        'Пересобрать': rebuildExtension,

    };

    const choice = await window.showQuickPick(Object.keys(options), {
        placeHolder: 'Выберите действие',
    });

    if (choice && options[choice]) {
        await options[choice]();
    }
}


async function reinstallExtension() {
    const workspacePath = getRootWorkspaceFolders();

    // 1. Package
    await terminalCommands(['vsce package'], workspacePath);

    // 2. Install via VS Code API
    const vsixUri = Uri.file(path.join(workspacePath, 'code-generator-0.0.1.vsix'));
    await commands.executeCommand('workbench.extensions.installExtension', vsixUri);

    // 3. Reload
    await commands.executeCommand('workbench.action.reloadWindow');
}


async function rebuildExtension() {
    const rebuildCmds: string[] = [
        'npm update @vscode/test-cli @vscode/test-electron @types/mocha',
        'npm run compile'
    ];
    // await terminalCommands(rebuildCmds, getRootWorkspaceFolders());
    await executeInTerminal('npm update @vscode/test-cli @vscode/test-electron @types/mocha',);
    await executeInTerminal('npm run watch');
    window.showInformationMessage('✅ Пересобрано!');
}
