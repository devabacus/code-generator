import { window, workspace, Uri } from 'vscode';

/**
 * Получает путь к шаблонам из настроек VS Code.
 */
export function getTemplatesPath(): string | undefined {
    const config = workspace.getConfiguration('codeGenerator');
    return config.get<string>('templatesPath');
}

/**
 * Тип места назначения для проекта.
 */
export interface DestinationChoice {
    type: 'microservices' | 'root' | 'standalone';
    path?: string; // Для standalone — путь к папке
}

/**
 * Показывает диалог выбора места назначения для проекта.
 */
export async function getDestinationChoice(): Promise<DestinationChoice | undefined> {
    const items = [
        {
            label: '$(folder) В папку microservices/',
            description: 'Добавить как микросервис',
            type: 'microservices' as const
        },
        {
            label: '$(root-folder) В корень workspace',
            description: 'Добавить рядом с основным проектом',
            type: 'root' as const
        },
        {
            label: '$(folder-opened) Создать отдельный проект...',
            description: 'Выбрать папку для standalone проекта',
            type: 'standalone' as const
        }
    ];

    const selected = await window.showQuickPick(items, {
        placeHolder: 'Куда добавить проект?'
    });

    if (!selected) {
        return undefined;
    }

    if (selected.type === 'standalone') {
        const pythonConfig = workspace.getConfiguration('codeGenerator');
        const pythonPath = pythonConfig.get<string>('pythonProjectsPath') || 'G:\\Projects\\Python';
        const folder = await window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            defaultUri: Uri.file(pythonPath),
            openLabel: 'Выбрать папку'
        });

        if (!folder || folder.length === 0) {
            return undefined;
        }

        return {
            type: 'standalone',
            path: folder[0].fsPath
        };
    }

    return { type: selected.type };
}
