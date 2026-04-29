import { Command } from 'commander';
import path from 'path';
import { DefaultFileSystem } from '../../../core/implementations/default_file_system';
import { TrackingFileSystem } from '../utils/cli_file_system';
import { CliLogger } from '../utils/cli_logger';
import { cliExec, cliExecSequence } from '../utils/cli_exec';
import { MicroserviceService } from '../../../core/services/microservice_service';
import { detectLanguage } from '../../../core/services/language_detector';
import { getLanguage } from '../../../core/language_registry';

interface ExportMicroserviceOptions {
    microservice: string;
    destination: string;
    workspace: string;
    setupCicd?: boolean;
    githubUsername: string;
    human?: boolean;
}

export function registerExportMicroservice(program: Command): void {
    program
        .command('export-microservice')
        .description('Export a microservice from monorepo to standalone')
        .requiredOption('--microservice <name>', 'Microservice name (folder in microservices/)')
        .requiredOption('--destination <path>', 'Export destination path')
        .requiredOption('--workspace <path>', 'Workspace root path')
        .option('--setup-cicd', 'Run Terraform for CI/CD setup after export')
        .option('--github-username <name>', 'GitHub username for remote', 'devabacus')
        .option('--json', 'Output as JSON (default)', true)
        .option('--human', 'Output as human-readable text')
        .action(async (opts: ExportMicroserviceOptions) => {
            await handleExportMicroservice(opts);
        });
}

async function handleExportMicroservice(opts: ExportMicroserviceOptions): Promise<void> {
    const jsonMode = !opts.human;
    const logger = new CliLogger(jsonMode);
    const startTime = Date.now();

    try {
        const inner = new DefaultFileSystem();
        const fileSystem = new TrackingFileSystem(inner, logger);

        const sourcePath = path.join(opts.workspace, 'microservices', opts.microservice);
        if (!await fileSystem.exists(sourcePath)) {
            logger.error(`Microservice not found: ${sourcePath}`);
            logger.emitResult('export-microservice', false, startTime);
            process.exit(1);
        }

        // Detect language
        const languageType = await detectLanguage(sourcePath, fileSystem);
        if (!languageType) {
            logger.error('Could not detect project language.');
            logger.emitResult('export-microservice', false, startTime);
            process.exit(1);
        }

        const language = getLanguage(languageType);
        const targetPath = path.join(opts.destination, opts.microservice);
        logger.info(`Exporting ${language.displayName} microservice "${opts.microservice}"...`);

        // Export
        const microserviceService = new MicroserviceService(fileSystem, language);
        await microserviceService.exportProject(sourcePath, targetPath, opts.microservice, opts.workspace);

        // Git init
        logger.info('Initializing git...');
        const gitCommands = [
            'git init',
            'git add .',
            `git commit -m "init${opts.setupCicd ? '' : ' [skip ci]'}"`,
            `gh repo create ${opts.microservice} --private`,
            `git remote add origin https://github.com/${opts.githubUsername}/${opts.microservice}.git`,
        ];
        await cliExecSequence(gitCommands, targetPath, logger);

        // CI/CD setup
        if (opts.setupCicd) {
            const terraformPath = path.join(targetPath, 'terraform');
            if (await fileSystem.exists(terraformPath)) {
                logger.info('Setting up CI/CD via Terraform...');
                await cliExecSequence([
                    'terraform init',
                    `terraform apply -var="repo_name=${opts.microservice}" -auto-approve`
                ], terraformPath, logger);
            }
        }

        // Push
        await cliExec('git push -u origin master', targetPath, logger);

        logger.emitResult('export-microservice', true, startTime);
    } catch (error) {
        logger.error(String(error));
        logger.emitResult('export-microservice', false, startTime);
        process.exit(1);
    }
}
