import * as path from 'path';
import { window, Terminal } from 'vscode';
import { ServiceLocator } from '../services/service_locator';
import { getRootWorkspaceFolders } from '../../utils/path_util';
import { parseOpenApi } from '../../features/generation/parsers/openapi_parser';
import { PythonEndpointGenerator } from '../../features/generation/generators/python';
import { terminalCommands } from '../../utils/terminal_handle';
import { detectLanguage } from '../services/language_detector';
import { getLanguage } from '../language_registry';
import { MicroserviceLanguage } from '../interfaces/microservice_language';

let terminal: Terminal | undefined;
const SERVERPOD_GENERATE = 'serverpod generate --experimental-features=all';

interface MicroserviceInfo {
    name: string;
    path: string;
    language: MicroserviceLanguage;
}

/**
 * Унифицированная генерация OpenAPI Bridge для любого языка.
 * Поддерживает Python, Node.js, Go и любые другие языки с OpenAPI.
 */
export async function generateOpenApiBridge(): Promise<void> {
    const fileSystem = ServiceLocator.getInstance().getFileSystem();
    const workspacePath = getRootWorkspaceFolders();

    if (!workspacePath) {
        window.showErrorMessage('No workspace folder found');
        return;
    }

    const microservicesPath = path.join(workspacePath, 'microservices');

    // Находим все микросервисы с определением языка
    const availableServices = await findAllMicroservices(workspacePath, microservicesPath, fileSystem);

    if (availableServices.length === 0) {
        window.showErrorMessage('No microservices found');
        return;
    }

    // Предлагаем выбрать
    const items = availableServices.map(s => ({
        label: s.name,
        description: `${s.language.displayName} • ${s.path}`,
        service: s
    }));

    const selected = await window.showQuickPick(items, {
        placeHolder: 'Select microservice to generate bridge for'
    });

    if (!selected) {
        return;
    }

    const { name: serviceName, path: servicePath, language } = selected.service;

    try {
        // Пробуем fetch с сервера
        const openApiJson = await fetchOpenApiWithRetry(servicePath, language, fileSystem);

        if (!openApiJson) {
            return; // Пользователь отменил
        }

        // Parse OpenAPI
        const parsed = parseOpenApi(openApiJson);

        window.showInformationMessage(
            `Found ${parsed.endpoints.length} endpoints from ${language.displayName} service`
        );

        // Generate endpoint methods
        const endpointGen = new PythonEndpointGenerator(fileSystem);
        await endpointGen.generate(workspacePath, parsed.endpoints, serviceName, language.defaultPort);

        // Show success
        window.showInformationMessage(
            `✅ Generated ${parsed.endpoints.length} methods in ${serviceName}_endpoint.dart. Running serverpod generate...`
        );

        // Run serverpod generate
        const projectName = path.basename(workspacePath);
        const serverPath = path.join(workspacePath, `${projectName}_server`);
        await runServerpodGenerate(serverPath);

    } catch (error) {
        window.showErrorMessage(`Error: ${error}`);
    }
}

/**
 * Находит все микросервисы с автоопределением языка
 */
async function findAllMicroservices(
    workspacePath: string,
    microservicesPath: string,
    fileSystem: any
): Promise<MicroserviceInfo[]> {
    const services: MicroserviceInfo[] = [];

    // Проверяем microservices/
    if (await fileSystem.exists(microservicesPath)) {
        const entries = await fileSystem.readDirectory(microservicesPath);
        for (const entry of entries) {
            const entryPath = path.join(microservicesPath, entry);
            if (await fileSystem.isDirectory(entryPath)) {
                const languageType = await detectLanguage(entryPath, fileSystem);
                if (languageType) {
                    services.push({
                        name: entry,
                        path: entryPath,
                        language: getLanguage(languageType)
                    });
                }
            }
        }
    }

    // Проверяем {project}_python (legacy)
    const projectName = path.basename(workspacePath);
    const pythonLegacyPath = path.join(workspacePath, `${projectName}_python`);
    if (await fileSystem.exists(pythonLegacyPath)) {
        const languageType = await detectLanguage(pythonLegacyPath, fileSystem);
        if (languageType) {
            services.push({
                name: `${projectName}_python`,
                path: pythonLegacyPath,
                language: getLanguage(languageType)
            });
        }
    }

    return services;
}

/**
 * Пытается получить OpenAPI. Если сервер не запущен — предлагает запустить.
 */
async function fetchOpenApiWithRetry(
    servicePath: string,
    language: MicroserviceLanguage,
    fileSystem: any
): Promise<string | null> {
    const openApiUrl = language.getOpenApiUrl();

    // Пробуем fetch
    try {
        const response = await fetch(openApiUrl);
        if (response.ok) {
            return await response.text();
        }
    } catch {
        // Сервер не запущен
    }

    // Сервер не запущен — предлагаем запустить
    const action = await window.showWarningMessage(
        `${language.displayName} server not running at ${openApiUrl}. Start it?`,
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
    await startDevServer(servicePath, language);

    // Ждём и пробуем снова
    window.showInformationMessage(`⏳ Waiting for ${language.displayName} server to start...`);

    for (let i = 0; i < 15; i++) {
        await sleep(2000);
        try {
            const response = await fetch(openApiUrl);
            if (response.ok) {
                window.showInformationMessage(`✅ ${language.displayName} server started!`);
                return await response.text();
            }
        } catch {
            // Ещё не запустился
        }
    }

    window.showErrorMessage('Server did not start in 30 seconds. Check terminal for errors.');
    return null;
}

/**
 * Загружает OpenAPI из файла
 */
async function loadFromFile(servicePath: string, fileSystem: any): Promise<string | null> {
    const possiblePaths = [
        path.join(servicePath, 'openapi.json'),
        path.join(servicePath, 'openapi_spec.json'),
        path.join(servicePath, 'swagger.json'),
        path.join(servicePath, 'app', 'openapi_spec.json'),
        path.join(servicePath, 'docs', 'swagger.json')
    ];

    for (const filePath of possiblePaths) {
        if (await fileSystem.exists(filePath)) {
            return await fileSystem.readFile(filePath);
        }
    }

    window.showErrorMessage(
        `OpenAPI spec not found. Save your OpenAPI JSON to one of: openapi.json, swagger.json, openapi_spec.json`
    );
    return null;
}

/**
 * Запускает dev-сервер в терминале
 */
async function startDevServer(servicePath: string, language: MicroserviceLanguage): Promise<void> {
    const terminalName = `${language.displayName} Dev Server`;

    if (!terminal || terminal.exitStatus !== undefined) {
        terminal = window.createTerminal({
            name: terminalName,
            cwd: servicePath,
        });
    }
    terminal.show();
    terminal.sendText(`cd "${servicePath}"`);
    terminal.sendText(language.getDevServerCommand());
}

async function runServerpodGenerate(serverPath: string): Promise<void> {
    window.showInformationMessage('⏳ Running serverpod generate...');
    await terminalCommands([SERVERPOD_GENERATE], serverPath);
    window.showInformationMessage('✅ serverpod generate completed!');
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
