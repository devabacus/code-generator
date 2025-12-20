import { window } from 'vscode';
import path from 'path';
import { getRootWorkspaceFolders } from '../../../utils/path_util';
import { terminalCommands } from '../../../utils/terminal_handle';
import { ServiceLocator } from '../../../core/services/service_locator';

/**
 * Команда настройки CI/CD через Terraform.
 * Запускает terraform init && terraform apply для настройки GitHub Secrets и инфраструктуры.
 * Работает как для Serverpod, так и для Python/Node/Go проектов.
 */
export async function setupCICD(): Promise<void> {
    const fileSystem = ServiceLocator.getInstance().getFileSystem();
    const workspacePath = getRootWorkspaceFolders();

    if (!workspacePath) {
        window.showErrorMessage('No workspace folder open');
        return;
    }

    const projectName = path.basename(workspacePath);

    // Ищем папку terraform в разных местах
    // 1. Для Python/Go/Node: в корне проекта
    // 2. Для Serverpod: в папке {projectName}_server/terraform
    const possiblePaths = [
        path.join(workspacePath, 'terraform'),
        path.join(workspacePath, `${projectName}_server`, 'terraform'),
    ];

    let terraformPath: string | null = null;
    for (const p of possiblePaths) {
        if (await fileSystem.exists(p)) {
            terraformPath = p;
            break;
        }
    }

    if (!terraformPath) {
        window.showErrorMessage(
            `Terraform folder not found. Checked:\n` +
            possiblePaths.map(p => `  - ${p}`).join('\n')
        );
        return;
    }

    // Проверяем наличие main.tf
    const mainTfPath = path.join(terraformPath, 'main.tf');
    if (!await fileSystem.exists(mainTfPath)) {
        window.showErrorMessage('main.tf not found in terraform folder');
        return;
    }

    const confirm = await window.showWarningMessage(
        `This will run Terraform to configure GitHub Secrets for "${projectName}". Continue?`,
        'Yes, configure CI/CD',
        'Cancel'
    );

    if (confirm !== 'Yes, configure CI/CD') {
        return;
    }

    try {
        window.showInformationMessage('🔧 Running terraform init...');

        await terminalCommands([
            'terraform init',
            `terraform apply -var="repo_name=${projectName}" -auto-approve`
        ], terraformPath);

        window.showInformationMessage(`✅ CI/CD configured for ${projectName}! GitHub Secrets are set.`);
    } catch (error) {
        window.showErrorMessage(`Error configuring CI/CD: ${error}`);
    }
}
