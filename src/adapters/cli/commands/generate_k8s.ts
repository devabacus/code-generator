import { Command } from 'commander';
import path from 'path';
import { parseServerDataYaml } from '../../../features/generation/parsers/server_data_parser';
import { ConfigMapGenerator } from '../../../features/generation/generators/k8s/configmap_generator';
import { DeploymentGenerator } from '../../../features/generation/generators/k8s/deployment_generator';
import { IngressGenerator } from '../../../features/generation/generators/k8s/ingress_generator';
import { ServiceGenerator } from '../../../features/generation/generators/k8s/service_generator';
import { JobGenerator } from '../../../features/generation/generators/k8s/job_generator';
import { NamespaceGenerator } from '../../../features/generation/generators/k8s/namespace_generator';
import { PgProxyPodGenerator } from '../../../features/generation/generators/k8s/pg_proxy_pod_generator';
import { ClusterIssuerGenerator } from '../../../features/generation/generators/k8s/cluster_issuer_generator';
import { DockerfileProdGenerator } from '../../../features/generation/generators/k8s/dockerfile_prod_generator';
import { DeploymentDockerGenerator } from '../../../features/generation/generators/k8s/deployment_docker_generator';
import { DeploymentFlutterWebGenerator } from '../../../features/generation/generators/k8s/deployment_flutter_web_generator';
import { DeploymentAdminWebGenerator } from '../../../features/generation/generators/k8s/deployment_admin_web_generator';
import { TerraformMainGenerator } from '../../../features/generation/generators/terraform/terraform_main_generator';
import { TerraformVariablesGenerator } from '../../../features/generation/generators/terraform/terraform_variables_generator';
import { TerraformTfvarsExampleGenerator } from '../../../features/generation/generators/terraform/terraform_tfvars_example_generator';
import { TerraformApplyScriptGenerator } from '../../../features/generation/generators/terraform/terraform_apply_script_generator';
import { DefaultFileSystem } from '../../../core/implementations/default_file_system';
import { TrackingFileSystem } from '../utils/cli_file_system';
import { CliLogger } from '../utils/cli_logger';

interface GenerateK8sOptions {
    workspace: string;
    json: boolean;
    human?: boolean;
}

export function registerGenerateK8s(program: Command): void {
    program
        .command('generate-k8s')
        .description('Generate K8s manifests, Terraform files for a Serverpod project')
        .requiredOption('--workspace <path>', 'Workspace root path')
        .option('--json', 'Output as JSON (default)', true)
        .option('--human', 'Output as human-readable text')
        .action(async (opts: GenerateK8sOptions) => {
            await handleGenerateK8s(opts);
        });
}

async function handleGenerateK8s(opts: GenerateK8sOptions): Promise<void> {
    const jsonMode = !opts.human;
    const logger = new CliLogger(jsonMode);
    const startTime = Date.now();

    try {
        const workspacePath = opts.workspace;
        const projectName = path.basename(workspacePath);
        const serverPath = path.join(workspacePath, `${projectName}_server`);
        const serverDataPath = path.join(serverPath, 'server_data.yaml');

        const inner = new DefaultFileSystem();
        const fileSystem = new TrackingFileSystem(inner, logger);

        if (!await fileSystem.exists(serverDataPath)) {
            logger.error(`server_data.yaml not found at ${serverDataPath}`);
            logger.emitResult('generate-k8s', false, startTime);
            process.exit(1);
        }

        logger.info(`Reading server_data.yaml...`);
        const yamlContent = await fileSystem.readFile(serverDataPath);
        const serverData = parseServerDataYaml(yamlContent);

        logger.info(`Generating K8s and Terraform files for ${projectName}...`);

        const generators = [
            new ConfigMapGenerator(fileSystem),
            new DeploymentGenerator(fileSystem),
            new IngressGenerator(fileSystem),
            new ServiceGenerator(fileSystem),
            new JobGenerator(fileSystem),
            new NamespaceGenerator(fileSystem),
            new PgProxyPodGenerator(fileSystem),
            new ClusterIssuerGenerator(fileSystem),
            new DockerfileProdGenerator(fileSystem),
            new DeploymentDockerGenerator(fileSystem),
            new DeploymentFlutterWebGenerator(fileSystem),
            new DeploymentAdminWebGenerator(fileSystem),
            new TerraformMainGenerator(fileSystem),
            new TerraformVariablesGenerator(fileSystem),
            new TerraformTfvarsExampleGenerator(fileSystem),
            new TerraformApplyScriptGenerator(fileSystem),
        ];

        for (const generator of generators) {
            await generator.generate(workspacePath, undefined, serverData);
        }

        logger.emitResult('generate-k8s', true, startTime);
    } catch (error) {
        logger.error(String(error));
        logger.emitResult('generate-k8s', false, startTime);
        process.exit(1);
    }
}
