import * as path from 'path';
import { window, Terminal } from 'vscode';
import { ServiceLocator } from '../../../core/services/service_locator';
import { getRootWorkspaceFolders } from '../../../utils/path_util';
import { parseOpenApi } from '../parsers/openapi_parser';
import { PythonEndpointGenerator } from '../generators/python';
import { terminalCommands } from '../../../utils/terminal_handle';

let terminal: Terminal | undefined;
const PYTHON_SERVICE_URL = 'http://localhost:8000';
const SERVERPOD_GENERATE = 'serverpod generate --experimental-features=all';

interface MicroserviceInfo {
    name: string;
    path: string;
}

/**
 * Generate Python Bridge from OpenAPI spec.
 * Fetches OpenAPI from running Python service and generates Serverpod endpoint.
 * No models generated - Flutter should use Freezed or simple classes.
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
    const microservicesPath = path.join(workspacePath, 'microservices');

    // Находим все микросервисы
    const availableServices = await findMicroservices(workspacePath, pythonPath, microservicesPath, fileSystem);

    if (availableServices.length === 0) {
        window.showErrorMessage('No Python microservices found');
        return;
    }

    // Предлагаем выбрать
    const items = availableServices.map(s => ({
        label: s.name,
        description: s.path,
        service: s
    }));

    const selected = await window.showQuickPick(items, {
        placeHolder: 'Select microservice to generate bridge for'
    });

    if (!selected) {
        return; // Пользователь отменил
    }

    const serviceName = selected.service.name;
    const servicePath = selected.service.path;

    let openApiJson: string | null;

    try {
        // Пробуем fetch с сервера
        openApiJson = await fetchOpenApiWithRetry(servicePath, fileSystem);

        if (!openApiJson) {
            return; // Пользователь отменил
        }

        // Parse OpenAPI
        const parsed = parseOpenApi(openApiJson);

        window.showInformationMessage(
            `Found ${parsed.endpoints.length} endpoints`
        );

        // Generate endpoint methods (с указанием имени сервиса)
        const endpointGen = new PythonEndpointGenerator(fileSystem);
        await endpointGen.generate(workspacePath, parsed.endpoints, serviceName);

        // Show success
        window.showInformationMessage(
            `✅ Generated ${parsed.endpoints.length} methods in ${serviceName}_endpoint.dart. Running serverpod generate...`
        );

        // Run serverpod generate
        await runServerpodGenerate(serverPath);

    } catch (error) {
        window.showErrorMessage(`Error: ${error}`);
    }
}

/**
 * Находит все Python микросервисы в проекте
 */
async function findMicroservices(
    workspacePath: string,
    pythonPath: string,
    microservicesPath: string,
    fileSystem: any
): Promise<MicroserviceInfo[]> {
    const services: MicroserviceInfo[] = [];
    const projectName = path.basename(workspacePath);

    // 1. {project}_python
    if (await fileSystem.exists(path.join(pythonPath, 'main.py')) ||
        await fileSystem.exists(path.join(pythonPath, 'app', 'main.py'))) {
        services.push({
            name: `${projectName}_python`,
            path: pythonPath
        });
    }

    // 2. microservices/*
    if (await fileSystem.exists(microservicesPath)) {
        const entries = await fileSystem.readDirectory(microservicesPath);
        for (const entry of entries) {
            const entryPath = path.join(microservicesPath, entry);
            const mainPy = path.join(entryPath, 'main.py');
            const appMainPy = path.join(entryPath, 'app', 'main.py');

            if (await fileSystem.exists(mainPy) || await fileSystem.exists(appMainPy)) {
                services.push({
                    name: entry,
                    path: entryPath
                });
            }
        }
    }

    return services;
}

/**
 * Пытается получить OpenAPI. Если сервер не запущен — предлагает запустить.
 */
async function fetchOpenApiWithRetry(
    servicePath: string,
    fileSystem: any
): Promise<string | null> {
    // Пробуем fetch
    try {
        const response = await fetch(`${PYTHON_SERVICE_URL}/openapi.json`);
        if (response.ok) {
            return await response.text();
        }
    } catch {
        // Сервер не запущен
    }

    // Сервер не запущен — предлагаем запустить
    const action = await window.showWarningMessage(
        'Python server not running. Start it?',
        'Start server',
        'Load from file',
        'Cancel'
    );

    if (action === 'Cancel' || !action) {
        return null;
    }

    if (action === 'Load from file') {
        return await loadFromFile(servicePath, fileSystem);
    }

    // Start server
    await startPythonServer(servicePath);

    // Ждём и пробуем снова
    window.showInformationMessage('⏳ Waiting for Python server to start...');

    for (let i = 0; i < 10; i++) {
        await sleep(2000);
        try {
            const response = await fetch(`${PYTHON_SERVICE_URL}/openapi.json`);
            if (response.ok) {
                window.showInformationMessage('✅ Python server started!');
                return await response.text();
            }
        } catch {
            // Ещё не запустился
        }
    }

    window.showErrorMessage('Server did not start in 20 seconds. Check terminal for errors.');
    return null;
}

/**
 * Загружает OpenAPI из файла
 */
async function loadFromFile(servicePath: string, fileSystem: any): Promise<string | null> {
    const filePath = path.join(servicePath, 'openapi_spec.json');

    if (await fileSystem.exists(filePath)) {
        return await fileSystem.readFile(filePath);
    }

    // Try in app folder
    const appFilePath = path.join(servicePath, 'app', 'openapi_spec.json');
    if (await fileSystem.exists(appFilePath)) {
        return await fileSystem.readFile(appFilePath);
    }

    window.showErrorMessage(
        `OpenAPI spec not found. Save ${PYTHON_SERVICE_URL}/openapi.json to ${filePath}`
    );
    return null;
}

/**
 * Запускает Python сервер в терминале
 */
async function startPythonServer(pythonPath: string): Promise<void> {
    if (!terminal || terminal.exitStatus !== undefined) {
        terminal = window.createTerminal({
            name: 'Python Server',
            cwd: pythonPath,
        });
    }
    terminal.show();
    terminal.sendText(`cd "${pythonPath}"`);
    terminal.sendText('uv run main.py');
}

async function runServerpodGenerate(serverPath: string): Promise<void> {
    window.showInformationMessage('⏳ Running serverpod generate...');
    await terminalCommands([SERVERPOD_GENERATE], serverPath);
    window.showInformationMessage('✅ serverpod generate completed!');
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
