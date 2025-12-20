import path from "path";
import { ServiceLocator } from "../../../core/services/service_locator";
import { parseServerDataYaml } from "../parsers/server_data_parser";
import { ConfigMapGenerator } from "../generators/k8s/configmap_generator";
import { DeploymentGenerator } from "../generators/k8s/deployment_generator";
import { IngressGenerator } from "../generators/k8s/ingress_generator";
import { ServiceGenerator } from "../generators/k8s/service_generator";
import { JobGenerator } from "../generators/k8s/job_generator";
import { NamespaceGenerator } from "../generators/k8s/namespace_generator";
import { PgProxyPodGenerator } from "../generators/k8s/pg_proxy_pod_generator";
import { ClusterIssuerGenerator } from "../generators/k8s/cluster_issuer_generator";
import { DockerfileProdGenerator } from "../generators/k8s/dockerfile_prod_generator";
import { DeploymentDockerGenerator } from "../generators/k8s/deployment_docker_generator";
import { TerraformMainGenerator } from "../generators/terraform/terraform_main_generator";
import { TerraformVariablesGenerator } from "../generators/terraform/terraform_variables_generator";
import { TerraformTfvarsExampleGenerator } from "../generators/terraform/terraform_tfvars_example_generator";
import { TerraformApplyScriptGenerator } from "../generators/terraform/terraform_apply_script_generator";
import { EnvGenerator } from "../generators/flutter/env_generator";
import { getRootWorkspaceFolders } from "../../../utils/path_util";
import { window } from "vscode";

/**
 * Генерирует K8s манифесты, Terraform файлы и .env для Serverpod проекта.
 * @param workspacePathOverride Опциональный путь. Если не указан — берёт текущий workspace.
 */
export async function generateServerpodK8s(workspacePathOverride?: string): Promise<void> {
    const fileSystem = ServiceLocator.getInstance().getFileSystem();
    const workspacePath = workspacePathOverride ?? getRootWorkspaceFolders();

    if (!workspacePath) {
        window.showErrorMessage('No workspace folder found');
        return;
    }

    const projectName = path.basename(workspacePath);
    const serverPath = path.join(workspacePath, `${projectName}_server`);
    const serverDataPath = path.join(serverPath, "server_data.yaml");

    // Check if server_data.yaml exists
    if (!await fileSystem.exists(serverDataPath)) {
        window.showErrorMessage(`server_data.yaml not found at ${serverDataPath}`);
        return;
    }

    try {
        // Read and parse server_data.yaml
        const yamlContent = await fileSystem.readFile(serverDataPath);
        const serverData = parseServerDataYaml(yamlContent);

        // Generate all K8s and Terraform files
        const generators = [
            // K8s generators
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
            // Terraform generators
            new TerraformMainGenerator(fileSystem),
            new TerraformVariablesGenerator(fileSystem),
            new TerraformTfvarsExampleGenerator(fileSystem),
            new TerraformApplyScriptGenerator(fileSystem),
            // Flutter generators
            new EnvGenerator(fileSystem),
        ];

        for (const generator of generators) {
            await generator.generate(workspacePath, undefined, serverData);
        }

        window.showInformationMessage(`✅ K8s files generated for ${projectName}`);
    } catch (error) {
        window.showErrorMessage(`Error generating K8s files: ${error}`);
    }
}
