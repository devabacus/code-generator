/**
 * Модуль поиска workflow файлов.
 */
import path from 'path';
import { WorkflowDependencies } from './types';

/**
 * Ищет workflow файл в директории.
 * Сначала ищет deployment-*.yml (standalone), потом deployment.yml.
 */
export async function findWorkflowFile(
    deps: WorkflowDependencies,
    workflowDir: string
): Promise<string | null> {
    if (!await deps.fileSystem.exists(workflowDir)) {
        return null;
    }

    const files = await deps.fileSystem.readDirectory(workflowDir);

    // Сначала ищем deployment-*.yml (standalone проекты)
    const renamedWorkflow = files.find(f => f.startsWith('deployment-') && f.endsWith('.yml'));
    if (renamedWorkflow) {
        return path.join(workflowDir, renamedWorkflow);
    }

    // Затем ищем deployment.yml (оригинальный шаблон)
    const defaultWorkflow = path.join(workflowDir, 'deployment.yml');
    if (await deps.fileSystem.exists(defaultWorkflow)) {
        return defaultWorkflow;
    }

    return null;
}
