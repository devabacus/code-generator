/**
 * Создание проекта после выбора всех параметров.
 */
import { window } from 'vscode';
import path from 'path';
import { IFileSystem } from '../../interfaces/file_system';
import { MicroserviceLanguage } from '../../interfaces/microservice_language';
import { TemplateService, TemplateInfo } from '../../services/template_service';
import { WorkflowModifier } from '../../../modules/python/services/workflow_modifier';
import { executeCommand } from '../../../utils';

export interface CreateProjectOptions {
    fileSystem: IFileSystem;
    template: TemplateInfo;
    projectName: string;
    targetPath: string;
    templatesPath: string;
    language: MicroserviceLanguage;
    isMonorepo: boolean;
    relativePath: string;
    workspacePath: string | undefined;
}

/**
 * Создаёт проект: копирует шаблон, модифицирует workflow, инициализирует.
 */
export async function createProject(options: CreateProjectOptions): Promise<void> {
    const { fileSystem, template, projectName, targetPath, templatesPath,
        language, isMonorepo, relativePath, workspacePath } = options;

    const templateService = new TemplateService(fileSystem);
    const workflowModifier = new WorkflowModifier(fileSystem);

    // Копируем шаблон
    await templateService.copyTemplate(template.path, targetPath);

    // Модифицируем workflow для монорепо
    if (isMonorepo && workspacePath) {
        await workflowModifier.modifyForMonorepo(targetPath, projectName, relativePath, template.name);
        await workflowModifier.moveWorkflowToRepoRoot(targetPath, workspacePath, projectName);
        await workflowModifier.updateK8sManifests(targetPath, projectName, template.name);
        await workflowModifier.updateServerpodDeploymentEnv(workspacePath, projectName);
        await workflowModifier.copyServerpodEndpoint(workspacePath, projectName, templatesPath);
        await workflowModifier.copyFlutterHealthCheckWidget(workspacePath, projectName, templatesPath);
        await workflowModifier.patchDeveloperToolsPage(workspacePath, projectName);

        // serverpod generate для Dart интеграции
        const projectBaseName = path.basename(workspacePath);
        const serverPath = path.join(workspacePath, `${projectBaseName}_server`);
        window.showInformationMessage('⏳ Running serverpod generate...');
        await executeCommand('serverpod generate --experimental-features=all', serverPath);
    } else {
        // Standalone — обновляем workflow и K8s
        await workflowModifier.updateForStandalone(targetPath, projectName, template.name);
    }

    // Инициализируем проект (uv sync / npm install / go mod tidy)
    await language.initialize(targetPath);
}
