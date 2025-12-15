import { window } from "vscode";
import { getRootWorkspaceFolders } from "./path_util";
import { executeInTerminal, terminalCommands } from "./terminal_handle";


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
    const reinstallExtCmds = [
        'vsce package',
        'antigravity --install-extension code-generator-0.0.1.vsix --force',
        'code --install-extension code-generator-0.0.1.vsix --force'
    ];
    await terminalCommands(reinstallExtCmds, getRootWorkspaceFolders());
    window.showInformationMessage('✅ Расширение успешно обновлено!');
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
