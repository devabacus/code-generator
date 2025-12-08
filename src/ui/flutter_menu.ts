import { window } from "vscode";
import { createDataFilesByReplacement } from "../features/generation/commands/create_data_files_by_replacement";
import { createNewProject } from "../features/generation/commands/create_new_project";
import { generateServerpodK8s } from "../features/generation/commands/generate_serverpod_k8s";

export async function flutterHandler() {
    const options: { [key: string]: () => Promise<any> } = {
        'New project with serverpod': () => createNewProject(),
        'Create data files from yaml': () => createDataFilesByReplacement(),
        'Generate Serverpod K8s files': () => generateServerpodK8s(),
    };

    const choice = await window.showQuickPick(Object.keys(options), {
        placeHolder: 'Select action',
    });

    if (choice && options[choice]) {
        await options[choice]();
    }
}
