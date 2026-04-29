import { Command } from 'commander';
import path from 'path';
import { DefaultFileSystem } from '../../../core/implementations/default_file_system';
import { TrackingFileSystem } from '../utils/cli_file_system';
import { CliLogger } from '../utils/cli_logger';
import { cliExec } from '../utils/cli_exec';
import * as workflow from '../../../core/services/workflow';

interface RemoveMicroserviceOptions {
    microservice: string;
    workspace: string;
    confirm?: boolean;
    skipK8s?: boolean;
    human?: boolean;
}

export function registerRemoveMicroservice(program: Command): void {
    program
        .command('remove-microservice')
        .description('Remove a microservice from project')
        .requiredOption('--microservice <name>', 'Microservice name to remove')
        .requiredOption('--workspace <path>', 'Workspace root path')
        .option('--confirm', 'Skip confirmation (required for non-interactive use)')
        .option('--skip-k8s', 'Skip Kubernetes resource deletion')
        .option('--json', 'Output as JSON (default)', true)
        .option('--human', 'Output as human-readable text')
        .action(async (opts: RemoveMicroserviceOptions) => {
            await handleRemoveMicroservice(opts);
        });
}

async function handleRemoveMicroservice(opts: RemoveMicroserviceOptions): Promise<void> {
    const jsonMode = !opts.human;
    const logger = new CliLogger(jsonMode);
    const startTime = Date.now();

    try {
        if (!opts.confirm) {
            logger.error('--confirm flag is required. This operation is destructive and cannot be undone.');
            logger.emitResult('remove-microservice', false, startTime);
            process.exit(1);
        }

        const inner = new DefaultFileSystem();
        const fileSystem = new TrackingFileSystem(inner, logger);
        const deps: workflow.WorkflowDependencies = { fileSystem };
        const serviceName = opts.microservice;
        const workspacePath = opts.workspace;
        const repoName = path.basename(workspacePath);

        const microservicesPath = path.join(workspacePath, 'microservices');
        const servicePath = path.join(microservicesPath, serviceName);

        if (!await fileSystem.exists(servicePath)) {
            logger.error(`Microservice not found: ${servicePath}`);
            logger.emitResult('remove-microservice', false, startTime);
            process.exit(1);
        }

        logger.info(`Removing microservice "${serviceName}"...`);

        // 1. Remove workflow
        logger.info('Removing workflow...');
        const workflowPath = path.join(workspacePath, '.github', 'workflows', `deployment-${serviceName}.yml`);
        if (await fileSystem.exists(workflowPath)) {
            await fileSystem.deleteFile(workflowPath);
        }

        // 2. Remove Serverpod endpoint
        logger.info('Removing Serverpod endpoint...');
        const endpointPath = path.join(workspacePath, `${repoName}_server`, 'lib', 'src', 'endpoints', `${serviceName}_endpoint.dart`);
        if (await fileSystem.exists(endpointPath)) {
            await fileSystem.deleteFile(endpointPath);
        }

        // 3. Remove Serverpod integration
        logger.info('Removing Serverpod integration...');
        await workflow.removeServerpodDeploymentEnv(deps, workspacePath, serviceName);
        await workflow.unpatchDeveloperToolsPage(deps, workspacePath, serviceName);

        // 4. Remove Flutter feature folder
        logger.info('Removing Flutter feature...');
        const featurePath = path.join(workspacePath, `${repoName}_flutter`, 'lib', 'features', serviceName);
        if (await fileSystem.exists(featurePath)) {
            await fileSystem.deleteDirectory(featurePath);
        }

        // 5. Remove microservice folder
        logger.info('Removing microservice folder...');
        await fileSystem.deleteDirectory(servicePath);

        // 6. Run serverpod generate
        logger.info('Running serverpod generate...');
        const serverPath = path.join(workspacePath, `${repoName}_server`);
        await cliExec('serverpod generate', serverPath, logger);

        // 7. Remove from Kubernetes (optional)
        if (!opts.skipK8s) {
            logger.info('Removing from Kubernetes...');
            const namespace = repoName.replace(/_/g, '-');
            try {
                await cliExec(`kubectl delete deployment ${serviceName}-service -n ${namespace} --ignore-not-found=true`, workspacePath, logger);
                await cliExec(`kubectl delete service ${serviceName}-service -n ${namespace} --ignore-not-found=true`, workspacePath, logger);
                await cliExec(`kubectl delete configmap ${serviceName}-service-config -n ${namespace} --ignore-not-found=true`, workspacePath, logger);
            } catch {
                // Ignore kubectl errors (cluster may be unreachable)
            }
        }

        logger.emitResult('remove-microservice', true, startTime);
    } catch (error) {
        logger.error(String(error));
        logger.emitResult('remove-microservice', false, startTime);
        process.exit(1);
    }
}
