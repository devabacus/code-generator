import { window } from "vscode";
import { terminalCommands } from "./terminal_handle";

export async function gitInit(path: string, projectName: string, githubUsername: string = 'devabacus') {

    const gitInitSet = [
        'git init',
        'git add .',
        'git commit -m "init [skip ci]"',
        `gh repo create ${projectName} --private`,
        `git remote add origin https://github.com/${githubUsername}/${projectName}.git`,
        'git push -u origin master'
    ];
    await terminalCommands(gitInitSet, path);
    window.showInformationMessage(`✅ Git initialized and pushed to GitHub: ${projectName}`);
}
