import path from "path";
import { window, workspace } from "vscode";

export function getRootWorkspaceFolders() {
    const workspaceFolders = workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        window.showErrorMessage('Open a folder first');
        throw new Error('Workspace not found');
    }
    return workspaceFolders[0].uri.fsPath;
}

export function getLibPath() {
    return `${getRootWorkspaceFolders()}/lib`;
}

export function getUserSnippetsPath(): string {
    return path.join(process.env.APPDATA || "", "Code", "User", "snippets");
}

export function getActiveEditorPath(): string | undefined {
    return window.activeTextEditor?.document.uri.fsPath;
}
