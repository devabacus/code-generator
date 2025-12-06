import { window } from "vscode";
import { createDataFilesByReplacement } from "../features/generation/commands/create_data_files_by_replacement";
import { createNewProject } from "../features/generation/commands/create_new_project";

export async function flutterHandler() {
    const options: { [key: string]: () => Promise<any> } = {
        'New project with serverpod': () => createNewProject(),
        'Create data files from yaml': () => createDataFilesByReplacement(),
    };

    const choice = await window.showQuickPick(Object.keys(options), {
        placeHolder: 'Select action',
    });

    if (choice && options[choice]) {
        await options[choice]();
    }
}
