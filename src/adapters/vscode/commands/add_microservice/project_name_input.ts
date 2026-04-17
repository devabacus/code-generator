/**
 * Ввод имени проекта.
 */
import { window } from 'vscode';

/**
 * Запрашивает имя проекта (RFC 1123 compatible для Kubernetes).
 */
export async function inputProjectName(defaultName: string): Promise<string | undefined> {
    return window.showInputBox({
        prompt: 'Enter project folder name (lowercase, no underscores)',
        value: defaultName.toLowerCase().replace(/_/g, '-'),
        validateInput: (value) => {
            if (!value || value.trim().length === 0) {
                return 'Name cannot be empty';
            }
            if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(value)) {
                return 'Name must be lowercase, start/end with letter or number, use only hyphens';
            }
            return null;
        }
    });
}
