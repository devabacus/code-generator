/**
 * Unified addMicroservice command — добавление микросервиса любого языка.
 */
import { window } from 'vscode';
import { ServiceLocator } from '../../../../core/services/service_locator';
import { getTemplatesPath } from '../../ui/project_picker';
import { pickLanguage } from './language_picker';
import { pickTemplate } from './template_picker';
import { inputProjectName } from './project_name_input';
import { resolveDestination } from './destination_resolver';
import { createProject } from './project_creator';

/**
 * Главная команда добавления микросервиса.
 */
export async function addMicroservice(): Promise<void> {
    const fileSystem = ServiceLocator.getInstance().getFileSystem();

    // 1. Выбор языка
    const languageChoice = await pickLanguage();
    if (!languageChoice) return;

    // 2. Путь к шаблонам
    const templatesPath = getTemplatesPath();
    if (!templatesPath) {
        window.showErrorMessage('Templates path not configured. Set codeGenerator.templatesPath.');
        return;
    }

    // 3. Выбор шаблона
    const template = await pickTemplate(
        fileSystem, templatesPath,
        languageChoice.language.templateCategory,
        languageChoice.language.displayName
    );
    if (!template) return;

    // 4. Имя проекта
    const projectName = await inputProjectName(template.name);
    if (!projectName) return;

    // 5. Место назначения
    const dest = await resolveDestination(projectName);
    if (!dest) return;

    // 6. Проверяем существование
    if (await fileSystem.exists(dest.targetPath)) {
        const overwrite = await window.showWarningMessage(
            `Folder ${projectName} already exists. Overwrite?`, 'Yes', 'No'
        );
        if (overwrite !== 'Yes') return;
    }

    // 7. Создаём проект
    try {
        await createProject({
            fileSystem, template, projectName,
            targetPath: dest.targetPath, templatesPath,
            language: languageChoice.language,
            isMonorepo: dest.isMonorepo,
            relativePath: dest.relativePath,
            workspacePath: dest.workspacePath
        });

        const icon = languageChoice.type === 'python' ? '🐍' :
            languageChoice.type === 'node' ? '📦' : '🔷';
        window.showInformationMessage(
            `${icon} ${languageChoice.language.displayName} project "${projectName}" created!`
        );
    } catch (error) {
        window.showErrorMessage(`Error creating project: ${error}`);
    }
}
