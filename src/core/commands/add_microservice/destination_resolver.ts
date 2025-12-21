/**
 * Определение пути назначения для проекта.
 */
import { window } from 'vscode';
import path from 'path';
import { getRootWorkspaceFolders } from '../../../utils/path_util';
import { getDestinationChoice } from '../../../modules/python/ui/project_picker';

export interface DestinationInfo {
    targetPath: string;
    isMonorepo: boolean;
    relativePath: string;
    workspacePath: string | undefined;
}

/**
 * Определяет путь назначения для проекта.
 */
export async function resolveDestination(projectName: string): Promise<DestinationInfo | undefined> {
    const destination = await getDestinationChoice();
    if (!destination) return undefined;

    const workspacePath = getRootWorkspaceFolders();
    let targetPath: string;
    let isMonorepo = false;
    let relativePath = '';

    switch (destination.type) {
        case 'microservices':
            if (!workspacePath) {
                window.showErrorMessage('No workspace folder open');
                return undefined;
            }
            targetPath = path.join(workspacePath, 'microservices', projectName);
            isMonorepo = true;
            relativePath = `microservices/${projectName}`;
            break;
        case 'root':
            if (!workspacePath) {
                window.showErrorMessage('No workspace folder open');
                return undefined;
            }
            targetPath = path.join(workspacePath, projectName);
            isMonorepo = true;
            relativePath = projectName;
            break;
        case 'standalone':
            if (!destination.path) return undefined;
            targetPath = path.join(destination.path, projectName);
            break;
        default:
            return undefined;
    }

    return { targetPath, isMonorepo, relativePath, workspacePath };
}
