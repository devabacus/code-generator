import { Command } from 'commander';
import path from 'path';
import { DefaultFileSystem } from '../../../core/implementations/default_file_system';
import { TrackingFileSystem } from '../utils/cli_file_system';
import { CliLogger } from '../utils/cli_logger';
import { cliExec } from '../utils/cli_exec';
import { MicroserviceService } from '../../../core/services/microservice_service';
import { detectLanguage } from '../../../core/services/language_detector';
import { getLanguage } from '../../../core/language_registry';
import * as workflow from '../../../core/services/workflow';

interface ImportMicroserviceOptions {
    source: string;
    workspace: string;
    templatesPath: string;
    name?: string;
    human?: boolean;
}

export function registerImportMicroservice(program: Command): void {
    program
        .command('import-microservice')
        .description('Import an existing microservice into monorepo')
        .requiredOption('--source <path>', 'Path to existing microservice')
        .requiredOption('--workspace <path>', 'Workspace root path')
        .option('--templates-path <path>', 'Path to templates', 'G:/Templates')
        .option('--name <name>', 'Override project name (default: source folder name)')
        .option('--json', 'Output as JSON (default)', true)
        .option('--human', 'Output as human-readable text')
        .action(async (opts: ImportMicroserviceOptions) => {
            await handleImportMicroservice(opts);
        });
}

async function handleImportMicroservice(opts: ImportMicroserviceOptions): Promise<void> {
    const jsonMode = !opts.human;
    const logger = new CliLogger(jsonMode);
    const startTime = Date.now();

    try {
        const inner = new DefaultFileSystem();
        const fileSystem = new TrackingFileSystem(inner, logger);
        const deps: workflow.WorkflowDependencies = { fileSystem };

        const projectName = opts.name || path.basename(opts.source).toLowerCase().replace(/_/g, '-');

        // Validate name
        if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(projectName)) {
            logger.error(`Invalid project name: ${projectName}. Must be lowercase, hyphens only.`);
            logger.emitResult('import-microservice', false, startTime);
            process.exit(1);
        }

        // Detect language
        const languageType = await detectLanguage(opts.source, fileSystem);
        if (!languageType) {
            logger.error('Could not detect project language. Ensure pyproject.toml, package.json, or go.mod exists.');
            logger.emitResult('import-microservice', false, startTime);
            process.exit(1);
        }

        const language = getLanguage(languageType);
        logger.info(`Detected ${language.displayName} project: ${projectName}`);

        const targetPath = path.join(opts.workspace, 'microservices', projectName);
        const relativePath = `microservices/${projectName}`;

        // Import
        logger.info('Copying files...');
        const microserviceService = new MicroserviceService(fileSystem, language);
        await microserviceService.importProject(
            opts.source, targetPath, projectName, opts.workspace, relativePath
        );

        // Serverpod integration
        logger.info('Integrating with Serverpod...');
        await workflow.updateServerpodDeploymentEnv(deps, opts.workspace, projectName, language.defaultPort);
        await workflow.copyServerpodEndpoint(deps, opts.workspace, projectName, opts.templatesPath);
        await workflow.copyFlutterHealthCheckWidget(deps, opts.workspace, projectName, opts.templatesPath);
        await workflow.patchDeveloperToolsPage(deps, opts.workspace, projectName);

        // Serverpod generate
        logger.info('Running serverpod generate...');
        const repoName = path.basename(opts.workspace);
        const serverPath = path.join(opts.workspace, `${repoName}_server`);
        await cliExec('serverpod generate', serverPath, logger);

        logger.emitResult('import-microservice', true, startTime);
    } catch (error) {
        logger.error(String(error));
        logger.emitResult('import-microservice', false, startTime);
        process.exit(1);
    }
}
