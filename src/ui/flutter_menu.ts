import { window } from "vscode";
import { addGoToProject } from "../features/generation/commands/add_go_to_project";
import { addNodeToProject } from "../features/generation/commands/add_node_to_project";
import { addPythonToProject } from "../features/generation/commands/add_python_to_project";
import { createDataFilesByReplacement } from "../features/generation/commands/create_data_files_by_replacement";
import { createNewProject } from "../features/generation/commands/create_new_project";
import { generateServerpodK8s } from "../features/generation/commands/generate_serverpod_k8s";
import { generatePythonBridge } from "../features/generation/commands/generate_python_bridge";
import { addPythonProject } from "../modules/python/commands/add_python_project";
import { addNodeProject } from "../modules/node/commands/add_node_project";
import { addGoProject } from "../modules/go/commands/add_go_project";

export async function flutterHandler() {
    const options: { [key: string]: () => Promise<any> } = {
        // Serverpod проекты
        'New project with serverpod': () => createNewProject(),
        'Add Python to Serverpod project': () => addPythonToProject(),
        'Add Go to Serverpod project': () => addGoToProject(),
        'Add Node.js to Serverpod project': () => addNodeToProject(),
        'Create data files from yaml': () => createDataFilesByReplacement(),
        'Generate Serverpod K8s files': () => generateServerpodK8s(),
        'Generate Python Bridge (OpenAPI)': () => generatePythonBridge(),
        // Проекты из шаблонов
        '── Projects from Templates ──': async () => { },
        'Add Python project from template': () => addPythonProject(),
        'Add Node.js project from template': () => addNodeProject(),
        'Add Go project from template': () => addGoProject(),
    };

    const choice = await window.showQuickPick(Object.keys(options), {
        placeHolder: 'Select action',
    });

    if (choice && options[choice] && !choice.startsWith('──')) {
        await options[choice]();
    }
}
