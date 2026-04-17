/**
 * Выбор шаблона для создания микросервиса.
 */
import { window } from 'vscode';
import path from 'path';
import { TemplateService, TemplateInfo } from '../../../../core/services/template_service';
import { IFileSystem } from '../../../../core/interfaces/file_system';

/**
 * Показывает QuickPick для выбора шаблона.
 */
export async function pickTemplate(
    fileSystem: IFileSystem,
    templatesPath: string,
    category: string,
    languageDisplayName: string
): Promise<TemplateInfo | undefined> {
    const templateService = new TemplateService(fileSystem);
    const templates = await templateService.scanTemplates(templatesPath, category);

    if (templates.length === 0) {
        window.showWarningMessage(`No ${languageDisplayName} templates found in ${path.join(templatesPath, category)}`);
        return undefined;
    }

    const items = templates.map(t => ({
        label: t.name,
        description: t.description || '',
        detail: t.path,
        template: t
    }));

    const selected = await window.showQuickPick(items, {
        placeHolder: `Select ${languageDisplayName} template`,
        matchOnDescription: true,
    });

    return selected?.template;
}
