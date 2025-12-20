import { window } from "vscode";
import path from "path";
import { terminalCommands } from "./terminal_handle";

interface GitInitOptions {
    /** Запускать ли terraform для настройки GitHub Secrets */
    setupCICD?: boolean;
    /** GitHub username для remote URL */
    githubUsername?: string;
}

/**
 * Инициализирует git репозиторий, создаёт GitHub repo и пушит.
 * Опционально настраивает CI/CD через terraform.
 */
export async function gitInit(
    projectPath: string,
    projectName: string,
    options: GitInitOptions = {}
) {
    const { setupCICD = false, githubUsername = 'devabacus' } = options;

    // Базовые команды git
    const gitCommands = [
        'git init',
        'git add .',
        // Если настраиваем CI/CD, skip ci не нужен - секреты будут готовы
        `git commit -m "init${setupCICD ? '' : ' [skip ci]'}"`,
        `gh repo create ${projectName} --private`,
        `git remote add origin https://github.com/${githubUsername}/${projectName}.git`,
    ];

    // Выполняем git init и создаём репозиторий
    await terminalCommands(gitCommands, projectPath);

    // Настраиваем CI/CD через terraform (если нужно)
    if (setupCICD) {
        const terraformPath = path.join(projectPath, 'terraform');
        window.showInformationMessage('🔧 Configuring GitHub Secrets via Terraform...');

        await terminalCommands([
            'terraform init',
            `terraform apply -var="repo_name=${projectName}" -auto-approve`
        ], terraformPath);

        window.showInformationMessage('✅ GitHub Secrets configured!');
    }

    // Push после настройки секретов
    await terminalCommands(['git push -u origin master'], projectPath);

    window.showInformationMessage(`✅ Git initialized and pushed to GitHub: ${projectName}`);
}
