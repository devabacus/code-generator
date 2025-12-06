import { OpenDialogOptions, Uri, window, workspace } from "vscode";


// Функция для получения ввода от пользователя
export const getUserInput = async (prompt: string, placeHolder = "", validateInput?: (text: string) => string | null): Promise<string | undefined> => {
    const userInput = await window.showInputBox({ prompt: prompt, placeHolder: placeHolder, validateInput });
    return userInput?.trim() || undefined;
};


// Вспомогательная функция для выбора папки
async function promptForTargetDirectory(prompt?: string, defaultUri?: string): Promise<string | undefined> {
    const options: OpenDialogOptions = {
        canSelectMany: false,
        openLabel: prompt??"Выберите папку для создания",
        canSelectFolders: true,
        defaultUri: defaultUri ? Uri.file(defaultUri) : workspace.workspaceFolders?.[0]?.uri
    };

    return (await window.showOpenDialog(options))?.[0]?.fsPath;
}

// Функция для выбора папки через диалоговое окно
export const pickPath = async (prompt?: string, defaultUri?: string): Promise<string | undefined> => {
    const path = await promptForTargetDirectory(prompt, defaultUri);
    if (!path) {
        window.showErrorMessage("Выбор директории отменён.");
    }
    return path;
};