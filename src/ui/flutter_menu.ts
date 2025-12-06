import { window } from "vscode";
import { createNewProject } from "../createNewProject";


export async function flutterHandler() {
    const options: { [key: string]: () => Promise<any> } = {
        'Новый проект c serverpod': () => createNewProject(),
    };

    const choice = await window.showQuickPick(Object.keys(options), {
        placeHolder: 'Выберите действие',
    });

    if (choice && options[choice]) {
        await options[choice]();
    }
}

