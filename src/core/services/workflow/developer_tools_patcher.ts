/**
 * Модуль патчинга developer_tools_page.dart.
 */
import path from 'path';
import { WorkflowDependencies, toPascalCase } from './types';

/**
 * Патчит developer_tools_page.dart.
 */
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
    const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
    const pascalName = toPascalCase(serviceName);

    if (content.includes(`${pascalName}HealthCheckCard`)) {
        return;
    }

    // Добавляем import
    const importLine = `import '../../../${serviceName}/presentation/widgets/${serviceName}_health_check_card.dart';`;
    const importPattern = /import\s+'\.\.\/\.\.\/\.\.\/[\w-]+\/presentation\/widgets\/[\w-]+_health_check_card\.dart';/g;
    const importMatches = [...content.matchAll(importPattern)];

    if (importMatches.length > 0) {
        const lastImport = importMatches[importMatches.length - 1][0];
        content = content.replace(lastImport, `${lastImport}${lineEnding}${importLine}`);
    } else {
        // Если импортов еще нет, ищем последний существующий импорт
        const anyImportPattern = /import\s+'[^']+';/g;
        const anyImports = [...content.matchAll(anyImportPattern)];
        if (anyImports.length > 0) {
            const lastImport = anyImports[anyImports.length - 1][0];
            content = content.replace(lastImport, `${lastImport}${lineEnding}${lineEnding}${importLine}`);
        }
    }

    // Добавляем widget
    const widgetLine = `${lineEnding}            ${pascalName}HealthCheckCard(client: client),${lineEnding}            const SizedBox(height: 16),`;
    const anchor = '// Microservice Health Check Cards';

    if (content.includes(anchor)) {
        content = content.replace(anchor, `${anchor}${widgetLine}`);
    } else {
        // Если якоря нет, ищем заголовок секции и вставляем после SizedBox
        const headerText = "'🔧 Microservices Health Check'";
        const headerIndex = content.indexOf(headerText);
        if (headerIndex !== -1) {
            const afterHeader = content.substring(headerIndex);
            const nextSizedBox = afterHeader.indexOf('const SizedBox(height: 16),');
            if (nextSizedBox !== -1) {
                const insertPos = headerIndex + nextSizedBox + 'const SizedBox(height: 16),'.length;
                content = content.substring(0, insertPos) + `${lineEnding}            ${anchor}` + widgetLine + content.substring(insertPos);
            }
        }
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

    // Удаляем import (включая перевод строки)
    const importPattern = new RegExp(`import\\s+'\\.\\.\\/\\.\\.\\/\\.\\.\\/${serviceName}\\/presentation\\/widgets\\/${serviceName}_health_check_card\\.dart';\\r?\\n?`, 'g');
    content = content.replace(importPattern, '');

    // Удаляем widget (включая SizedBox и переводы строк с отступами)
    const widgetPattern = new RegExp(`(\\r?\\n\\s*)?${pascalName}HealthCheckCard\\(client: client\\),\\r?\\n\\s*const SizedBox\\(height: 16\\),`, 'g');
    content = content.replace(widgetPattern, '');

    await deps.fileSystem.createFile(pagePath, content);
}
