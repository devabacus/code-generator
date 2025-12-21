/**
 * WorkflowModifier — фасад над модульными функциями.
 * Сохраняет обратную совместимость, делегируя вызовы в core/services/workflow/.
 */
import { IFileSystem } from '../../../core/interfaces/file_system';
import * as workflow from '../../../core/services/workflow';

export class WorkflowModifier {
    private readonly deps: workflow.WorkflowDependencies;

    constructor(private readonly fileSystem: IFileSystem) {
        this.deps = { fileSystem };
    }

    async updateForStandalone(projectPath: string, projectName: string, templateName: string): Promise<void> {
        return workflow.updateForStandalone(this.deps, projectPath, projectName, templateName);
    }

    async updateEnvExample(projectPath: string, projectName: string, templateName: string): Promise<void> {
        return workflow.updateEnvExample(this.deps, projectPath, projectName, templateName);
    }

    async revertToStandalone(projectPath: string, projectName: string): Promise<void> {
        return workflow.revertToStandalone(this.deps, projectPath, projectName);
    }

    async modifyForMonorepo(projectPath: string, projectName: string, relativePath: string, templateName: string): Promise<void> {
        return workflow.modifyForMonorepo(this.deps, projectPath, projectName, relativePath, templateName);
    }

    async moveWorkflowToRepoRoot(projectPath: string, repoRootPath: string, projectName: string): Promise<void> {
        return workflow.moveWorkflowToRepoRoot(this.deps, projectPath, repoRootPath, projectName);
    }

    async updateK8sManifests(projectPath: string, projectName: string, templateName: string): Promise<void> {
        return workflow.updateK8sManifests(this.deps, projectPath, projectName, templateName);
    }

    async updateServerpodDeploymentEnv(workspacePath: string, serviceName: string, port: number = 8000): Promise<void> {
        return workflow.updateServerpodDeploymentEnv(this.deps, workspacePath, serviceName, port);
    }

    async copyFlutterHealthCheckWidget(workspacePath: string, serviceName: string, templatesPath: string): Promise<void> {
        return workflow.copyFlutterHealthCheckWidget(this.deps, workspacePath, serviceName, templatesPath);
    }

    async copyServerpodEndpoint(workspacePath: string, serviceName: string, templatesPath: string): Promise<void> {
        return workflow.copyServerpodEndpoint(this.deps, workspacePath, serviceName, templatesPath);
    }

    async patchDeveloperToolsPage(workspacePath: string, serviceName: string): Promise<void> {
        return workflow.patchDeveloperToolsPage(this.deps, workspacePath, serviceName);
    }

    async removeServerpodDeploymentEnv(workspacePath: string, serviceName: string): Promise<void> {
        return workflow.removeServerpodDeploymentEnv(this.deps, workspacePath, serviceName);
    }

    async unpatchDeveloperToolsPage(workspacePath: string, serviceName: string): Promise<void> {
        return workflow.unpatchDeveloperToolsPage(this.deps, workspacePath, serviceName);
    }
}
