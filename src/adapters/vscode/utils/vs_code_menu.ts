import { commands, Uri, window } from "vscode";
import { getRootWorkspaceFolders } from "./path_util";
import { executeInTerminal, terminalCommands } from "./terminal_handle";
import { vsixFileName } from "./vsix_name";
import fs from "fs";
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

    // 1. Bump patch (TASK-036) — версия видимо растёт, чтобы было понятно что
    //    расширение обновилось (раньше всегда 0.0.1). --no-git-tag-version: без
    //    git-тега/коммита, package.json-диф коммитится пользователем когда удобно.
    //    terminalCommands ждёт завершения (execCommand awaited) → последовательность.
    await terminalCommands(['npm version patch --no-git-tag-version'], workspacePath);

    // 2. Имя .vsix из актуальной (поднятой) version — НЕ хардкод (иначе bump ломает путь).
    const pkg = JSON.parse(fs.readFileSync(path.join(workspacePath, 'package.json'), 'utf8'));
    const vsix = vsixFileName(pkg.name, pkg.version);

    // 3. Package через npx (TASK-036) — не зависит от глобального `vsce`.
    await terminalCommands(['npx @vscode/vsce package --allow-missing-repository'], workspacePath);

    // 4. Install via VS Code API
    const vsixUri = Uri.file(path.join(workspacePath, vsix));
    await commands.executeCommand('workbench.extensions.installExtension', vsixUri);

    // 5. Reload
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
