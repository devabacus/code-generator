/**
 * Модуль патчинга developer_tools_page.dart.
 */
import path from 'path';
import { WorkflowDependencies, toPascalCase } from './types';

/**
 * Патчит developer_tools_page.dart.
 */
export async function patchDeveloperToolsPage(
    deps: WorkflowDependencies,
    workspacePath: string,
    serviceName: string
): Promise<void> {
    const projectName = path.basename(workspacePath);
    const pagePath = path.join(workspacePath, `${projectName}_flutter`, 'lib', 'features', 'developer_tools', 'presentation', 'pages', 'developer_tools_page.dart');

    if (!await deps.fileSystem.exists(pagePath)) {
        return;
    }

    let content = await deps.fileSystem.readFile(pagePath);
    const pascalName = toPascalCase(serviceName);

    if (content.includes(`${pascalName}HealthCheckCard`)) {
        return;
    }

    // Добавляем import
    const importLine = `import '../../../${serviceName}/presentation/widgets/${serviceName}_health_check_card.dart';`;
    const importPattern = /(import '\.\.\/\.\.\/\.\.\/\w+\/presentation\/widgets\/\w+_health_check_card\.dart';)/g;
    const importMatches = [...content.matchAll(importPattern)];

    if (importMatches.length > 0) {
        const lastImport = importMatches[importMatches.length - 1][0];
        content = content.replace(lastImport, `${lastImport}\n${importLine}`);
    }

    // Добавляем widget
    const widgetLine = `\n            ${pascalName}HealthCheckCard(client: client),\n            const SizedBox(height: 16),`;
    const anchor = '// Microservice Health Check Cards';

    if (content.includes(anchor)) {
        content = content.replace(anchor, `${anchor}${widgetLine}`);
    }

    await deps.fileSystem.createFile(pagePath, content);
}

/**
 * Удаляет импорт и виджет из developer_tools_page.dart.
 */
export async function unpatchDeveloperToolsPage(
    deps: WorkflowDependencies,
    workspacePath: string,
    serviceName: string
): Promise<void> {
    const projectName = path.basename(workspacePath);
    const pagePath = path.join(workspacePath, `${projectName}_flutter`, 'lib', 'features', 'developer_tools', 'presentation', 'pages', 'developer_tools_page.dart');

    if (!await deps.fileSystem.exists(pagePath)) {
        return;
    }

    let content = await deps.fileSystem.readFile(pagePath);
    const pascalName = toPascalCase(serviceName);

    // Удаляем import
    const importPattern = new RegExp(`import\\s+'\\.\\.\\/\\.\\.\\/\\.\\.\\/${serviceName}\\/presentation\\/widgets\\/${serviceName}_health_check_card\\.dart';\\n?`, 'g');
    content = content.replace(importPattern, '');

    // Удаляем widget
    const widgetPattern = new RegExp(`\\s+${pascalName}HealthCheckCard\\(client: client\\),\\n\\s+const SizedBox\\(height: 16\\),`, 'g');
    content = content.replace(widgetPattern, '');

    await deps.fileSystem.createFile(pagePath, content);
}
