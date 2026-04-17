import { OpenDialogOptions, Uri, window, workspace } from "vscode";

export const getUserInputWrapper = async (userInputNeed: boolean, prompt: string): Promise<string | undefined> => {
    if (!userInputNeed) {
        return undefined;
    }

    const userInput = await getUserInput(prompt);
    if (!userInput) {
        window.showErrorMessage("Folder name cannot be empty.");
        return undefined;
    }

    return userInput;
};

export const getUserInput = async (prompt: string, placeHolder = "", validateInput?: (text: string) => string | null): Promise<string | undefined> => {
    const userInput = await window.showInputBox({ prompt: prompt, placeHolder: placeHolder, validateInput });
    return userInput?.trim() || undefined;
};

async function promptForTargetDirectory(prompt?: string, defaultUri?: string): Promise<string | undefined> {
    const options: OpenDialogOptions = {
        canSelectMany: false,
        openLabel: prompt ?? "Select folder",
        canSelectFolders: true,
        defaultUri: defaultUri ? Uri.file(defaultUri) : workspace.workspaceFolders?.[0]?.uri
    };

    return (await window.showOpenDialog(options))?.[0]?.fsPath;
}

export const pickPath = async (prompt?: string, defaultUri?: string): Promise<string | undefined> => {
    const path = await promptForTargetDirectory(prompt, defaultUri);
    if (!path) {
        window.showErrorMessage("Directory selection cancelled.");
    }
    return path;
};
