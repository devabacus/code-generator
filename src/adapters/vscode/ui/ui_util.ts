import { Range, window, workspace, Position } from "vscode";
import { createFolders } from "../../../utils/dir_handle";

export function openTextDocument(destinationPath: string) {
    workspace.openTextDocument(destinationPath).then((doc) => {
        window.showTextDocument(doc);
    });
}

export async function askPickOption(placeHolder: string, folderOptions: Record<string, string[]>): Promise<string | undefined> {
    const selectedOption = await window.showQuickPick(Object.keys(folderOptions), {
        placeHolder: placeHolder
    });
    return selectedOption || undefined;
}

export async function addPickedFoldersSet(folderOptions: Record<string, string[]>) {
    const selectedOption = await askPickOption("Select folder structure", folderOptions);

    if (selectedOption) {
        const selectedFolders = folderOptions[selectedOption];
        await createFolders(selectedFolders);
    }
}

export function getDocText(): string {
    const doc = window.activeTextEditor;
    return doc!.document.getText();
}

export function getCurrectSelect(): string {
    const editor = window.activeTextEditor;
    const document = editor?.document;
    const selection = editor?.selection;
    return document!.getText(selection);
}

export function getCurrentLineText() {
    const editor = window.activeTextEditor;
    const cursor = editor!.selection.active;
    const line = cursor.line;
    const lineRange = new Range(new Position(line, 0), new Position(line + 1, 0));
    return editor?.document.getText(lineRange);
}

export async function confirmDialog(askMsg: string, positive: string, negative: string): Promise<boolean> {
    const answer = await window.showInformationMessage(askMsg, positive, negative);
    if (answer) { return true; }
    return false;
}
