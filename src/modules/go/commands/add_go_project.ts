import { window } from 'vscode';
import path from 'path';
import { ServiceLocator } from '../../../core/services/service_locator';
import { TemplateService, TemplateInfo } from '../../../core/services/template_service';
import { getRootWorkspaceFolders } from '../../../utils/path_util';
import { getTemplatesPath, getDestinationChoice } from '../../python/ui/project_picker';
import { GoInitializer } from '../services/go_initializer';
import { WorkflowModifier } from '../../python/services/workflow_modifier';

/**
 * Команда добавления Go проекта из шаблона.
 */
export async function addGoProject(): Promise<void> {
    const fileSystem = ServiceLocator.getInstance().getFileSystem();
    const templateService = new TemplateService(fileSystem);
    const initializer = new GoInitializer();
    const workflowModifier = new WorkflowModifier(fileSystem);

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
            await workflowModifier.modifyForMonorepo(targetPath, projectName, relativePath);
            await workflowModifier.moveWorkflowToRepoRoot(targetPath, workspacePath, projectName);
            await workflowModifier.updateK8sManifests(targetPath, projectName);
        } else {
            // Standalone — обновляем workflow и K8s манифесты
            await workflowModifier.updateForStandalone(targetPath, projectName);
        }

        await initializer.initialize(targetPath);
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
