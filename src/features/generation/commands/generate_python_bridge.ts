import * as path from 'path';
import { window, Terminal } from 'vscode';
import { ServiceLocator } from '../../../core/services/service_locator';
import { getRootWorkspaceFolders } from '../../../utils/path_util';
import { parseOpenApi } from '../parsers/openapi_parser';
import { PythonEndpointGenerator, PythonModelsGenerator } from '../generators/python';

let terminal: Terminal | undefined;

/**
 * Generate Python Bridge from OpenAPI spec.
 * Fetches OpenAPI from running Python service and generates Serverpod code.
 */
export async function generatePythonBridge(): Promise<void> {
    const fileSystem = ServiceLocator.getInstance().getFileSystem();
    const workspacePath = getRootWorkspaceFolders();

    if (!workspacePath) {
        window.showErrorMessage('No workspace folder found');
        return;
    }

    const projectName = path.basename(workspacePath);
    const pythonPath = path.join(workspacePath, `${projectName}_python`);
    const serverPath = path.join(workspacePath, `${projectName}_server`);

    // Ask for OpenAPI source
    const source = await window.showQuickPick([
        { label: 'From running server', description: 'http://localhost:8000/openapi.json', value: 'server' },
        { label: 'From file', description: 'openapi_spec.json in Python folder', value: 'file' },
    ], { placeHolder: 'Select OpenAPI source' });

    if (!source) return;

    let openApiJson: string;

    try {
        if (source.value === 'file') {
            // Read from file
            const filePath = path.join(pythonPath, 'openapi_spec.json');
            if (!await fileSystem.exists(filePath)) {
                // Try nested path (common mistake)
                const nestedPath = path.join(pythonPath, projectName + '_python', 'openapi_spec.json');
                if (await fileSystem.exists(nestedPath)) {
                    openApiJson = await fileSystem.readFile(nestedPath);
                } else {
                    window.showErrorMessage(
                        `OpenAPI spec not found. Save http://localhost:8000/openapi.json to ${filePath}`
                    );
                    return;
                }
            } else {
                openApiJson = await fileSystem.readFile(filePath);
            }
        } else {
            // Fetch from server
            try {
                const response = await fetch('http://localhost:8000/openapi.json');
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                openApiJson = await response.text();
            } catch (e) {
                window.showErrorMessage(
                    `Cannot connect to Python server. Is it running? Error: ${e}`
                );
                return;
            }
        }

        // Parse OpenAPI
        const parsed = parseOpenApi(openApiJson);

        window.showInformationMessage(
            `Found ${parsed.endpoints.length} endpoints and ${parsed.models.length} models`
        );

        // Generate endpoint methods
        const endpointGen = new PythonEndpointGenerator(fileSystem);
        await endpointGen.generate(workspacePath, parsed.endpoints);

        // Generate models
        const modelsGen = new PythonModelsGenerator(fileSystem);
        const generatedModels = await modelsGen.generate(workspacePath, parsed.models);

        // Show success
        window.showInformationMessage(
            `Generated ${parsed.endpoints.length} methods and ${generatedModels.length} models. Running serverpod generate...`
        );

        // Run serverpod generate
        await runServerpodGenerate(serverPath);

    } catch (error) {
        window.showErrorMessage(`Error: ${error}`);
    }
}

async function runServerpodGenerate(serverPath: string): Promise<void> {
    if (!terminal || terminal.exitStatus !== undefined) {
        terminal = window.createTerminal({
            name: 'Python Bridge',
            cwd: serverPath,
        });
    }
    terminal.show();
    terminal.sendText(`cd "${serverPath}"`);
    terminal.sendText('serverpod generate');
}
