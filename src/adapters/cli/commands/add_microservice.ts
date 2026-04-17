import { Command } from 'commander';
import path from 'path';
import { DefaultFileSystem } from '../../../core/implementations/default_file_system';
import { TrackingFileSystem } from '../utils/cli_file_system';
import { CliLogger } from '../utils/cli_logger';
import { cliExec } from '../utils/cli_exec';
import { MicroserviceService } from '../../../core/services/microservice_service';
import { TemplateService } from '../../../core/services/template_service';
import { getLanguage } from '../../../core/language_registry';
import { LanguageType } from '../../../core/interfaces/microservice_language';
import * as workflow from '../../../core/services/workflow';

interface AddMicroserviceOptions {
    language: string;
    template: string;
    name: string;
    destination: string;
    destinationPath?: string;
    templatesPath: string;
    workspace?: string;
    human?: boolean;
}

export function registerAddMicroservice(program: Command): void {
    program
        .command('add-microservice')
        .description('Add a microservice from template')
        .requiredOption('--language <lang>', 'Language: python, node, go')
        .requiredOption('--template <name>', 'Template name (folder name in templates/{language}/)')
        .requiredOption('--name <name>', 'Project name (lowercase, hyphens only)')
        .option('--destination <type>', 'Destination: microservices, root, standalone', 'microservices')
        .option('--destination-path <path>', 'Path for standalone destination')
        .option('--templates-path <path>', 'Path to templates', 'G:/Templates')
        .option('--workspace <path>', 'Workspace root path (required for microservices/root)')
        .option('--json', 'Output as JSON (default)', true)
        .option('--human', 'Output as human-readable text')
        .action(async (opts: AddMicroserviceOptions) => {
            await handleAddMicroservice(opts);
        });
}

async function handleAddMicroservice(opts: AddMicroserviceOptions): Promise<void> {
    const jsonMode = !opts.human;
    const logger = new CliLogger(jsonMode);
    const startTime = Date.now();

    try {
        // Validate language
        if (!['python', 'node', 'go'].includes(opts.language)) {
            logger.error(`Invalid language: ${opts.language}. Must be python, node, or go.`);
            logger.emitResult('add-microservice', false, startTime);
            process.exit(1);
        }

        // Validate name
        if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(opts.name)) {
            logger.error(`Invalid project name: ${opts.name}. Must be lowercase letters, numbers, hyphens.`);
            logger.emitResult('add-microservice', false, startTime);
            process.exit(1);
        }

        const language = getLanguage(opts.language as LanguageType);
        const inner = new DefaultFileSystem();
        const fileSystem = new TrackingFileSystem(inner, logger);
        const templateService = new TemplateService(fileSystem);

        // Resolve template path
        const templatePath = path.join(opts.templatesPath, language.templateCategory, opts.template);
        if (!await fileSystem.exists(templatePath)) {
            // List available templates
            const available = await templateService.scanTemplates(opts.templatesPath, language.templateCategory);
            const names = available.map(t => t.name).join(', ');
            logger.error(`Template not found: ${templatePath}\nAvailable: ${names || 'none'}`);
            logger.emitResult('add-microservice', false, startTime);
            process.exit(1);
        }

        // Resolve destination
        let targetPath: string;
        let isMonorepo = false;
        let relativePath = '';
        const workspacePath = opts.workspace;

        switch (opts.destination) {
            case 'microservices':
                if (!workspacePath) {
                    logger.error('--workspace is required for microservices destination');
                    logger.emitResult('add-microservice', false, startTime);
                    process.exit(1);
                }
                targetPath = path.join(workspacePath, 'microservices', opts.name);
                isMonorepo = true;
                relativePath = `microservices/${opts.name}`;
                break;
            case 'root':
                if (!workspacePath) {
                    logger.error('--workspace is required for root destination');
                    logger.emitResult('add-microservice', false, startTime);
                    process.exit(1);
                }
                targetPath = path.join(workspacePath, opts.name);
                isMonorepo = true;
                relativePath = opts.name;
                break;
            case 'standalone':
                if (!opts.destinationPath) {
                    logger.error('--destination-path is required for standalone destination');
                    logger.emitResult('add-microservice', false, startTime);
                    process.exit(1);
                }
                targetPath = path.join(opts.destinationPath, opts.name);
                break;
            default:
                logger.error(`Invalid destination: ${opts.destination}`);
                logger.emitResult('add-microservice', false, startTime);
                process.exit(1);
        }

        logger.info(`Creating ${language.displayName} project "${opts.name}" from template "${opts.template}"...`);

        const microserviceService = new MicroserviceService(fileSystem, language, templateService);
        await microserviceService.addProject({
            templatePath,
            projectName: opts.name,
            targetPath,
            destinationType: opts.destination as 'microservices' | 'root' | 'standalone',
            workspacePath,
            relativePath,
        });

        // Serverpod integration for monorepo
        if (isMonorepo && workspacePath) {
            logger.info('Integrating with Serverpod...');
            const deps: workflow.WorkflowDependencies = { fileSystem };
            await workflow.updateServerpodDeploymentEnv(deps, workspacePath, opts.name, language.defaultPort);
            await workflow.copyServerpodEndpoint(deps, workspacePath, opts.name, opts.templatesPath);
            await workflow.copyFlutterHealthCheckWidget(deps, workspacePath, opts.name, opts.templatesPath);
            await workflow.patchDeveloperToolsPage(deps, workspacePath, opts.name);

            logger.info('Running serverpod generate...');
            const repoName = path.basename(workspacePath);
            const serverPath = path.join(workspacePath, `${repoName}_server`);
            await cliExec('serverpod generate --experimental-features=all', serverPath, logger);
        }

        logger.emitResult('add-microservice', true, startTime);
    } catch (error) {
        logger.error(String(error));
        logger.emitResult('add-microservice', false, startTime);
        process.exit(1);
    }
}
