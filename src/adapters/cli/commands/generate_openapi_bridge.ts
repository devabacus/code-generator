import { Command } from 'commander';
import path from 'path';
import { DefaultFileSystem } from '../../../core/implementations/default_file_system';
import { TrackingFileSystem } from '../utils/cli_file_system';
import { CliLogger } from '../utils/cli_logger';
import { cliExec } from '../utils/cli_exec';
import { parseOpenApi } from '../../../features/generation/parsers/openapi_parser';
import { PythonEndpointGenerator } from '../../../features/generation/generators/python';
import { detectLanguage } from '../../../core/services/language_detector';
import { getLanguage } from '../../../core/language_registry';

interface GenerateOpenApiBridgeOptions {
    microservice: string;
    workspace: string;
    openapiUrl?: string;
    openapiFile?: string;
    startServer?: boolean;
    human?: boolean;
}

export function registerGenerateOpenApiBridge(program: Command): void {
    program
        .command('generate-openapi-bridge')
        .description('Generate Serverpod endpoint from OpenAPI spec')
        .requiredOption('--microservice <name>', 'Microservice name')
        .requiredOption('--workspace <path>', 'Workspace root path')
        .option('--openapi-url <url>', 'URL to fetch OpenAPI spec from')
        .option('--openapi-file <path>', 'Path to OpenAPI JSON file')
        .option('--start-server', 'Start dev server before fetching spec')
        .option('--json', 'Output as JSON (default)', true)
        .option('--human', 'Output as human-readable text')
        .action(async (opts: GenerateOpenApiBridgeOptions) => {
            await handleGenerateOpenApiBridge(opts);
        });
}

async function handleGenerateOpenApiBridge(opts: GenerateOpenApiBridgeOptions): Promise<void> {
    const jsonMode = !opts.human;
    const logger = new CliLogger(jsonMode);
    const startTime = Date.now();

    try {
        const inner = new DefaultFileSystem();
        const fileSystem = new TrackingFileSystem(inner, logger);

        // Find microservice
        const microservicesPath = path.join(opts.workspace, 'microservices');
        const servicePath = path.join(microservicesPath, opts.microservice);

        // Also check legacy path
        const projectName = path.basename(opts.workspace);
        const legacyPath = path.join(opts.workspace, `${projectName}_python`);

        let actualServicePath: string;
        if (await fileSystem.exists(servicePath)) {
            actualServicePath = servicePath;
        } else if (opts.microservice === `${projectName}_python` && await fileSystem.exists(legacyPath)) {
            actualServicePath = legacyPath;
        } else {
            logger.error(`Microservice not found: ${servicePath}`);
            logger.emitResult('generate-openapi-bridge', false, startTime);
            process.exit(1);
        }

        // Detect language
        const languageType = await detectLanguage(actualServicePath, fileSystem);
        if (!languageType) {
            logger.error('Could not detect project language.');
            logger.emitResult('generate-openapi-bridge', false, startTime);
            process.exit(1);
        }

        const language = getLanguage(languageType);
        logger.info(`Found ${language.displayName} microservice: ${opts.microservice}`);

        // Get OpenAPI spec
        let openApiJson: string | null = null;

        if (opts.openapiFile) {
            // Load from file
            if (!await fileSystem.exists(opts.openapiFile)) {
                logger.error(`OpenAPI file not found: ${opts.openapiFile}`);
                logger.emitResult('generate-openapi-bridge', false, startTime);
                process.exit(1);
            }
            openApiJson = await fileSystem.readFile(opts.openapiFile);
        } else if (opts.openapiUrl) {
            // Fetch from URL
            logger.info(`Fetching OpenAPI spec from ${opts.openapiUrl}...`);
            const response = await fetch(opts.openapiUrl);
            if (!response.ok) {
                logger.error(`Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`);
                logger.emitResult('generate-openapi-bridge', false, startTime);
                process.exit(1);
            }
            openApiJson = await response.text();
        } else {
            // Try to auto-detect from common file locations
            const possiblePaths = [
                path.join(actualServicePath, 'openapi.json'),
                path.join(actualServicePath, 'openapi_spec.json'),
                path.join(actualServicePath, 'swagger.json'),
                path.join(actualServicePath, 'app', 'openapi_spec.json'),
                path.join(actualServicePath, 'docs', 'swagger.json'),
            ];

            for (const filePath of possiblePaths) {
                if (await fileSystem.exists(filePath)) {
                    logger.info(`Found OpenAPI spec at ${filePath}`);
                    openApiJson = await fileSystem.readFile(filePath);
                    break;
                }
            }

            if (!openApiJson) {
                // Try fetching from running server
                const openApiUrl = language.getOpenApiUrl();
                logger.info(`Trying to fetch from ${openApiUrl}...`);
                try {
                    const response = await fetch(openApiUrl);
                    if (response.ok) {
                        openApiJson = await response.text();
                    }
                } catch {
                    // Server not running
                }
            }

            if (!openApiJson) {
                logger.error(
                    'OpenAPI spec not found. Use --openapi-file or --openapi-url, ' +
                    'or save spec to openapi.json in the microservice folder.'
                );
                logger.emitResult('generate-openapi-bridge', false, startTime);
                process.exit(1);
            }
        }

        // Parse and generate
        const parsed = parseOpenApi(openApiJson);
        logger.info(`Found ${parsed.endpoints.length} endpoints`);

        const endpointGen = new PythonEndpointGenerator(fileSystem);
        await endpointGen.generate(opts.workspace, parsed.endpoints, opts.microservice, language.defaultPort);

        // Run serverpod generate
        logger.info('Running serverpod generate...');
        const serverPath = path.join(opts.workspace, `${projectName}_server`);
        await cliExec('serverpod generate --experimental-features=all', serverPath, logger);

        logger.emitResult('generate-openapi-bridge', true, startTime);
    } catch (error) {
        logger.error(String(error));
        logger.emitResult('generate-openapi-bridge', false, startTime);
        process.exit(1);
    }
}
