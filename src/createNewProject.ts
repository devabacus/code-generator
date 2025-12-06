import { GenerationConfig } from "./generation_config";
import { getUserInput, pickPath } from "./utils/vscode_ui";


export async function createNewProject(): Promise<void> {
    console.log('create new project');

    // const targetProject = await getUserInput('введите название проекта');
    // if (!targetProject) {
    //     return;
    // }

    const templPath = await pickPath("Выберите папку шаблон");
    if (!templPath) {
        return;
    }

    const targetPath = await pickPath("Выберите папку проекта");
    if (!targetPath) {
        return;
    }

    const config = new GenerationConfig({
        templPath: templPath,
        targetPath: targetPath
    });

    const directoriesToScan = new Set<string>();
    
    for (const dir of directoriesToScan) {
        
    }
}