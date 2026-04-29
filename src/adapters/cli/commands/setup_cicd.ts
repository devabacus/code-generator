import { Command } from 'commander';
import path from 'path';
import { DefaultFileSystem } from '../../../core/implementations/default_file_system';
import { CliLogger } from '../utils/cli_logger';
import { cliExecSequence } from '../utils/cli_exec';

interface SetupCicdOptions {
    workspace: string;
    confirm?: boolean;
    human?: boolean;
}

export function registerSetupCicd(program: Command): void {
    program
        .command('setup-cicd')
        .description('Setup CI/CD via Terraform (GitHub Secrets)')
        .requiredOption('--workspace <path>', 'Workspace root path')
        .option('--confirm', 'Skip confirmation (required for non-interactive use)')
        .option('--json', 'Output as JSON (default)', true)
        .option('--human', 'Output as human-readable text')
        .action(async (opts: SetupCicdOptions) => {
            await handleSetupCicd(opts);
        });
}

async function handleSetupCicd(opts: SetupCicdOptions): Promise<void> {
    const jsonMode = !opts.human;
    const logger = new CliLogger(jsonMode);
    const startTime = Date.now();

    try {
        if (!opts.confirm) {
            logger.error('--confirm flag is required. This will run Terraform to configure GitHub Secrets.');
            logger.emitResult('setup-cicd', false, startTime);
            process.exit(1);
        }

        const inner = new DefaultFileSystem();
        const workspacePath = opts.workspace;
        const projectName = path.basename(workspacePath);

        // Find terraform folder
        const possiblePaths = [
            path.join(workspacePath, 'terraform'),
            path.join(workspacePath, `${projectName}_server`, 'terraform'),
        ];

        let terraformPath: string | null = null;
        for (const p of possiblePaths) {
            if (await inner.exists(p)) {
                terraformPath = p;
                break;
            }
        }

        if (!terraformPath) {
            logger.error(`Terraform folder not found. Checked:\n${possiblePaths.map(p => `  - ${p}`).join('\n')}`);
            logger.emitResult('setup-cicd', false, startTime);
            process.exit(1);
        }

        const mainTfPath = path.join(terraformPath, 'main.tf');
        if (!await inner.exists(mainTfPath)) {
            logger.error('main.tf not found in terraform folder');
            logger.emitResult('setup-cicd', false, startTime);
            process.exit(1);
        }

        logger.info(`Running Terraform in ${terraformPath}...`);
        await cliExecSequence([
            'terraform init',
            `terraform apply -var="repo_name=${projectName}" -auto-approve`
        ], terraformPath, logger);

        logger.emitResult('setup-cicd', true, startTime);
    } catch (error) {
        logger.error(String(error));
        logger.emitResult('setup-cicd', false, startTime);
        process.exit(1);
    }
}
