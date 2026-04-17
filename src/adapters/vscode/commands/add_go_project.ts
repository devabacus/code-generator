import { window } from 'vscode';
import path from 'path';
import { ServiceLocator } from '../../../core/services/service_locator';
import { TemplateService, TemplateInfo } from '../../../core/services/template_service';
import { getRootWorkspaceFolders } from '../utils/path_util';
import { getTemplatesPath, getDestinationChoice } from '../ui/project_picker';
import { GoInitializer } from '../../../modules/go/services/go_initializer';
import * as workflow from '../../../core/services/workflow';
import { executeCommand } from '../utils/terminal_handle';
import { goLanguage } from '../../../modules/go/go_language';

/**
 * Команда добавления Go проекта из шаблона.
 */
export async function addGoProject(): Promise<void> {
    const fileSystem = ServiceLocator.getInstance().getFileSystem();
    const templateService = new TemplateService(fileSystem);
    const initializer = new GoInitializer();
    const deps: workflow.WorkflowDependencies = { fileSystem };

    const templatesPath = getTemplatesPath();
    if (!templatesPath) {
        window.showErrorMessage('Templates path not configured. Set codeGenerator.templatesPath in settings.');
        return;
    }

    const templates = await templateService.scanTemplates(templatesPath, 'go');
    if (templates.length === 0) {
        window.showWarningMessage(`No Go templates found in ${path.join(templatesPath, 'go')}`);
        return;
    }

    const selectedTemplate = await pickTemplate(templates);
    if (!selectedTemplate) {
        return;
    }

    const projectName = await window.showInputBox({
        prompt: 'Enter project folder name (lowercase, no underscores)',
        value: selectedTemplate.name.toLowerCase().replace(/_/g, '-'),
        validateInput: (value) => {
            if (!value || value.trim().length === 0) {
                return 'Name cannot be empty';
            }
            if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(value)) {
                return 'Name must be lowercase, start/end with letter or number, use only hyphens (no underscores)';
            }
            return null;
        }
    });

    if (!projectName) {
        return;
    }

    const destination = await getDestinationChoice();
    if (!destination) {
        return;
    }

    let targetPath: string;
    let isMonorepo = false;
    let relativePath = '';
    const workspacePath = getRootWorkspaceFolders();

    switch (destination.type) {
        case 'microservices':
            if (!workspacePath) {
                window.showErrorMessage('No workspace folder open');
                return;
            }
            targetPath = path.join(workspacePath, 'microservices', projectName);
            isMonorepo = true;
            relativePath = `microservices/${projectName}`;
            break;
        case 'root':
            if (!workspacePath) {
                window.showErrorMessage('No workspace folder open');
                return;
            }
            targetPath = path.join(workspacePath, projectName);
            isMonorepo = true;
            relativePath = projectName;
            break;
        case 'standalone':
            if (!destination.path) {
                return;
            }
            targetPath = path.join(destination.path, projectName);
            break;
        default:
            return;
    }

    if (await fileSystem.exists(targetPath)) {
        const overwrite = await window.showWarningMessage(
            `Folder ${projectName} already exists. Overwrite?`,
            'Yes', 'No'
        );
        if (overwrite !== 'Yes') {
            return;
        }
    }

    try {
        await templateService.copyTemplate(selectedTemplate.path, targetPath);

        if (isMonorepo && workspacePath) {
            await workflow.modifyForMonorepo(deps, targetPath, projectName, relativePath, selectedTemplate.name);
            await workflow.moveWorkflowToRepoRoot(deps, targetPath, workspacePath, projectName);
            await workflow.updateK8sManifests(deps, targetPath, projectName, selectedTemplate.name);
            await workflow.updateServerpodDeploymentEnv(deps, workspacePath, projectName, goLanguage.defaultPort);
            await workflow.copyServerpodEndpoint(deps, workspacePath, projectName, templatesPath);
            await workflow.copyFlutterHealthCheckWidget(deps, workspacePath, projectName, templatesPath);
            await workflow.patchDeveloperToolsPage(deps, workspacePath, projectName);

            // Запускаем serverpod generate
            const projectBaseName = path.basename(workspacePath);
            const serverPath = path.join(workspacePath, `${projectBaseName}_server`);
            window.showInformationMessage('⏳ Running serverpod generate...');
            await executeCommand('serverpod generate --experimental-features=all', serverPath);
        } else {
            // Standalone — обновляем workflow и K8s манифесты
            await workflow.updateForStandalone(deps, targetPath, projectName, selectedTemplate.name);
        }

        await initializer.initialize(targetPath, selectedTemplate.name, projectName);
        window.showInformationMessage(`✅ Go project "${projectName}" created successfully!`);
    } catch (error) {
        window.showErrorMessage(`Error creating Go project: ${error}`);
    }
}

async function pickTemplate(templates: TemplateInfo[]): Promise<TemplateInfo | undefined> {
    const items = templates.map(t => ({
        label: t.name,
        description: t.description || '',
        detail: t.path,
        template: t
    }));

    const selected = await window.showQuickPick(items, {
        placeHolder: 'Select Go template',
        matchOnDescription: true,
    });

    return selected?.template;
}
