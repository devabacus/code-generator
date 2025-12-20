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
 * Add Node microservice to existing Serverpod project.
 * Uses GenerationService to copy files from template with replacements.
 * Also copies CI workflow to .github/workflows/
 */
export async function addNodeToProject(): Promise<void> {
    const fileSystem = ServiceLocator.getInstance().getFileSystem();
    const workspacePath = getRootWorkspaceFolders();

    if (!workspacePath) {
        window.showErrorMessage('No workspace folder found');
        return;
    }

    const projectName = path.basename(workspacePath);
    const nodePath = path.join(workspacePath, `${projectName}_node`);
    const serverPath = path.join(workspacePath, `${projectName}_server`);

    // Check if Node folder already exists
    if (await fileSystem.exists(nodePath)) {
        const overwrite = await window.showWarningMessage(
            `${projectName}_node already exists. Overwrite?`,
            'Yes', 'No'
        );
        if (overwrite !== 'Yes') {
            return;
        }
    }

    try {
        const templatesPath = ServiceLocator.getInstance().getTemplatesPath();
        const config = new GenerationConfig({
            templProject: TEMPL_PROJECT,
            workspacesPath: workspacePath,
            manifest: ['nodeStart'],
            templatesPath: templatesPath
        });

        const generationService = new GenerationService(fileSystem);
        await generationService.generate(config);

        // Copy CI workflow to .github/workflows/
        await copyCIWorkflow(fileSystem, config.templatesPath, projectName, workspacePath);

        // Run serverpod generate to create client code for node_endpoint
        await executeCommand(SERVERPOD_GENERATE, serverPath);

        window.showInformationMessage(
            `✅ Node microservice added to ${projectName}!`
        );

    } catch (error) {
        window.showErrorMessage(`Error adding Node: ${error}`);
    }
}

/**
 * Copy and adapt CI workflow for Node deployment
 */
async function copyCIWorkflow(
    fileSystem: any,
    templatesPath: string,
    projectName: string,
    workspacePath: string
): Promise<void> {
    const ciSourcePath = path.join(
        templatesPath, 'flutter', TEMPL_PROJECT, '.github', 'workflows', 'deployment-node.yml'
    );
    const ciDestPath = path.join(
        workspacePath, '.github', 'workflows', 'deployment-node.yml'
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
