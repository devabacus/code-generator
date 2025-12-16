import path from "path";
import { window } from "vscode";
import { ServiceLocator } from "../../../core/services/service_locator";
import { getRootWorkspaceFolders } from "../../../utils/path_util";
import { executeCommand } from "../../../utils/terminal_handle";
import { GenerationConfig } from "../config/generation_config";
import { GenerationService } from "../generators/generation_service";

const TEMPL_PROJECT = 't115';
const SERVERPOD_GENERATE = 'serverpod generate --experimental-features=all';

/**
 * Add Go microservice to existing Serverpod project.
 * Uses GenerationService to copy files from template with replacements.
 * Also copies CI workflow to .github/workflows/
 */
export async function addGoToProject(): Promise<void> {
    const fileSystem = ServiceLocator.getInstance().getFileSystem();
    const workspacePath = getRootWorkspaceFolders();

    if (!workspacePath) {
        window.showErrorMessage('No workspace folder found');
        return;
    }

    const projectName = path.basename(workspacePath);
    const goPath = path.join(workspacePath, `${projectName}_go`);
    const serverPath = path.join(workspacePath, `${projectName}_server`);

    // Check if Go folder already exists
    if (await fileSystem.exists(goPath)) {
        const overwrite = await window.showWarningMessage(
            `${projectName}_go already exists. Overwrite?`,
            'Yes', 'No'
        );
        if (overwrite !== 'Yes') {
            return;
        }
    }

    try {
        const config = new GenerationConfig({
            templProject: TEMPL_PROJECT,
            workspacesPath: workspacePath,
            manifest: ['goStart'],
        });

        const generationService = new GenerationService(fileSystem);
        await generationService.generate(config);

        // Copy CI workflow to .github/workflows/
        await copyCIWorkflow(fileSystem, config.projectsPath, projectName, workspacePath);

        // Run serverpod generate to create client code for go_endpoint
        await executeCommand(SERVERPOD_GENERATE, serverPath);

        window.showInformationMessage(
            `✅ Go microservice added to ${projectName}!`
        );

    } catch (error) {
        window.showErrorMessage(`Error adding Go: ${error}`);
    }
}

/**
 * Copy and adapt CI workflow for Go deployment
 */
async function copyCIWorkflow(
    fileSystem: any,
    projectsPath: string,
    projectName: string,
    workspacePath: string
): Promise<void> {
    const ciSourcePath = path.join(
        projectsPath, TEMPL_PROJECT, '.github', 'workflows', 'deployment-go.yml'
    );
    const ciDestPath = path.join(
        workspacePath, '.github', 'workflows', 'deployment-go.yml'
    );

    // Check if source CI exists
    if (!await fileSystem.exists(ciSourcePath)) {
        return; // No CI template, skip silently
    }

    // Read CI template
    let ciContent = await fileSystem.readFile(ciSourcePath);

    // Replace template project name with target project name
    ciContent = ciContent.replace(new RegExp(TEMPL_PROJECT, 'g'), projectName);

    // Ensure .github/workflows directory exists
    await fileSystem.createFolder(path.dirname(ciDestPath));

    // Write CI workflow
    await fileSystem.createFile(ciDestPath, ciContent);
}
