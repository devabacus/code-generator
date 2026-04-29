import { window } from "vscode";
import path from "path";
import { terminalCommands } from "./terminal_handle";

interface GitInitOptions {
    setupCICD?: boolean;
    githubUsername?: string;
}

export async function gitInit(
    projectPath: string,
    projectName: string,
    options: GitInitOptions = {}
) {
    const { setupCICD = false, githubUsername = 'devabacus' } = options;

    const gitCommands = [
        'git init',
        'git add .',
        `git commit -m "init${setupCICD ? '' : ' [skip ci]'}"`,
        `gh repo create ${projectName} --private`,
        `git remote add origin https://github.com/${githubUsername}/${projectName}.git`,
    ];

    await terminalCommands(gitCommands, projectPath);

    if (setupCICD) {
        const terraformPath = path.join(projectPath, 'terraform');
        window.showInformationMessage('🔧 Configuring GitHub Secrets via Terraform...');

        await terminalCommands([
            'terraform init',
            `terraform apply -var="repo_name=${projectName}" -auto-approve`
        ], terraformPath);

        window.showInformationMessage('✅ GitHub Secrets configured!');
    }

    await terminalCommands(['git push -u origin master'], projectPath);

    window.showInformationMessage(`✅ Git initialized and pushed to GitHub: ${projectName}`);
}
