/**
 * Модуль обновления K8s манифестов.
 */
import path from 'path';
import { WorkflowDependencies } from './types';

/**
 * Обновляет K8s манифесты с реальным именем сервиса.
 * Заменяет имя шаблона на {projectName}
 * 
 * @param templateName - имя папки шаблона (плейсхолдер)
 */
export async function updateK8sManifests(
    deps: WorkflowDependencies,
    projectPath: string,
    projectName: string,
    templateName: string
): Promise<void> {
    const k8sDir = path.join(projectPath, 'k8s');
    const files = ['deployment.yaml', 'service.yaml', 'configmap.yaml'];

    for (const file of files) {
        const filePath = path.join(k8sDir, file);
        if (await deps.fileSystem.exists(filePath)) {
            let content = await deps.fileSystem.readFile(filePath);
            // Заменяем имя шаблона на реальное имя проекта
            content = content.replace(new RegExp(templateName, 'g'), projectName);
            await deps.fileSystem.createFile(filePath, content);
        }
    }
}

/**
 * Обновляет .env.example с реальным именем сервиса.
 * 
 * @param templateName - имя папки шаблона (плейсхолдер)
 */
export async function updateEnvExample(
    deps: WorkflowDependencies,
    projectPath: string,
    projectName: string,
    templateName: string
): Promise<void> {
    const envPath = path.join(projectPath, '.env.example');

    if (await deps.fileSystem.exists(envPath)) {
        let content = await deps.fileSystem.readFile(envPath);
        // Заменяем имя шаблона на имя проекта в переменных окружения
        // Обычно в шаблонах используется {templateName}-service
        content = content.replace(new RegExp(templateName, 'g'), projectName);
        await deps.fileSystem.createFile(envPath, content);
    }
}
