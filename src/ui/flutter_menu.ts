import { window } from "vscode";
import { createDataFilesByReplacement } from "../features/generation/commands/create_data_files_by_replacement";
import { createNewProject } from "../features/generation/commands/create_new_project";
import { generateServerpodK8s } from "../features/generation/commands/generate_serverpod_k8s";
import { generateOpenApiBridge } from "../core/commands/generate_openapi_bridge";
import { addMicroservice } from "../core/commands/add_microservice";

export async function flutterHandler() {
    const options: { [key: string]: () => Promise<any> } = {
        // Serverpod проекты
        'New project with serverpod': () => createNewProject(),
        'Create data files from yaml': () => createDataFilesByReplacement(),
        'Generate Serverpod K8s files': () => generateServerpodK8s(),
        'Generate OpenAPI Bridge': () => generateOpenApiBridge(),
        // Проекты из шаблонов
        '── Projects from Templates ──': async () => { },
        'Add microservice from template': () => addMicroservice(),
    };

    const choice = await window.showQuickPick(Object.keys(options), {
        placeHolder: 'Select action',
    });

    if (choice && options[choice] && !choice.startsWith('──')) {
        await options[choice]();
    }
}
