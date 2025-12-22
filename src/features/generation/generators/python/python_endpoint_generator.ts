import * as path from 'path';
import { IFileSystem } from '../../../../core/interfaces/file_system';
import { ParsedEndpoint } from '../../parsers/openapi_parser';

const MARKER_START = '// === generated_start:methods ===';
const MARKER_END = '// === generated_end:methods ===';

/**
 * Converts camelCase to PascalCase
 */
function toPascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Converts serviceName to snake_case for file naming
 */
function toSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

/**
 * Generates microservice endpoint methods for Serverpod from OpenAPI spec.
 * Creates endpoints that extend MicroserviceEndpoint base class.
 * Supports Python, Node, Go and other services.
 */
export class PythonEndpointGenerator {
  constructor(private fileSystem: IFileSystem) { }

  getPath(basePath: string, serviceName: string): string {
    const projectName = path.basename(basePath);
    const fileName = `${toSnakeCase(serviceName)}_endpoint.dart`;
    return path.join(basePath, `${projectName}_server`, 'lib', 'src', 'endpoints', fileName);
  }

  /**
   * Update {serviceName}_endpoint.dart with methods from OpenAPI endpoints.
   * Creates the file if it doesn't exist.
   */
  async generate(basePath: string, endpoints: ParsedEndpoint[], serviceName: string = 'python', defaultPort: number = 8000): Promise<void> {
    const filePath = this.getPath(basePath, serviceName);

    // Создаём файл если не существует
    if (!await this.fileSystem.exists(filePath)) {
      await this.createInitialFile(filePath, serviceName, defaultPort);
    }

    const existing = await this.fileSystem.readFile(filePath);

    // Check for markers
    if (!existing.includes(MARKER_START) || !existing.includes(MARKER_END)) {
      throw new Error(
        `${serviceName}_endpoint.dart doesn't have markers. ` +
        `Add "${MARKER_START}" and "${MARKER_END}" to enable generation.`
      );
    }

    // Generate methods block
    const methodsBlock = this.buildMethodsBlock(endpoints);

    // Replace between markers
    const updated = existing.replace(
      new RegExp(`\\s*${this.escapeRegex(MARKER_START)}[\\s\\S]*?${this.escapeRegex(MARKER_END)}`, 'g'),
      '\n\n' + methodsBlock
    );

    await this.fileSystem.createFile(filePath, updated);
  }

  /**
   * Создаёт начальный {serviceName}_endpoint.dart с маркерами для генерации.
   * Использует MicroserviceEndpoint как базовый класс.
   */
  private async createInitialFile(filePath: string, serviceName: string, defaultPort: number): Promise<void> {
    const className = `${toPascalCase(serviceName)}Endpoint`;
    const envVarName = `${serviceName.toUpperCase().replace(/-/g, '_')}_SERVICE_URL`;

    const content = `import 'package:serverpod/serverpod.dart';
import 'shared/microservice_endpoint.dart';

/// Endpoint для ${serviceName} микросервиса.
/// Автоматически сгенерирован. Методы между маркерами перезаписываются.
class ${className} extends MicroserviceEndpoint {
  @override
  String get serviceUrl => const String.fromEnvironment(
    '${envVarName}',
    defaultValue: 'http://localhost:${defaultPort}',
  );

  @override
  String get serviceName => '${serviceName}';

  ${MARKER_START}
  // Auto-generated from OpenAPI spec
  // Run "Generate Python Bridge" to update
  
  ${MARKER_END}
}
`;
    // Создаём папку если не существует
    const dir = path.dirname(filePath);
    await this.fileSystem.createFolder(dir);
    await this.fileSystem.createFile(filePath, content);
  }

  private buildMethodsBlock(endpoints: ParsedEndpoint[]): string {
    const lines: string[] = [
      `  ${MARKER_START}`,
      '  // Auto-generated from OpenAPI spec',
      '  // Run "Generate Python Bridge" to update',
      '',
    ];

    // Detect duplicate names and add HTTP method suffix
    const nameCounts = new Map<string, number>();
    for (const ep of endpoints) {
      nameCounts.set(ep.name, (nameCounts.get(ep.name) || 0) + 1);
    }

    const usedNames = new Set<string>();
    for (const ep of endpoints) {
      let methodName = ep.name;

      // If duplicate name, append HTTP method suffix
      if (nameCounts.get(ep.name)! > 1) {
        methodName = `${ep.name}${toPascalCase(ep.method.toLowerCase())}`;
      }

      // If still duplicate (shouldn't happen), add counter
      if (usedNames.has(methodName)) {
        let counter = 1;
        while (usedNames.has(`${methodName}${counter}`)) {
          counter++;
        }
        methodName = `${methodName}${counter}`;
      }

      usedNames.add(methodName);
      lines.push(this.buildMethod(ep, methodName));
      lines.push('');
    }

    lines.push(`  ${MARKER_END}`);
    return lines.join('\n');
  }

  private buildMethod(ep: ParsedEndpoint, methodName: string): string {
    // Parameters: always Session first, then request fields
    const params = ['Session session'];
    const bodyParams: string[] = [];

    for (const f of ep.requestFields) {
      const nullMark = f.nullable ? '?' : '';
      params.push(`${f.type}${nullMark} ${f.name}`);

      // Build body map entries
      if (f.nullable) {
        bodyParams.push(`      if (${f.name} != null) '${f.originalName}': ${f.name}`);
      } else {
        bodyParams.push(`      '${f.originalName}': ${f.name}`);
      }
    }

    const desc = ep.description || `Call ${ep.name} endpoint`;
    const httpMethod = ep.method.toLowerCase();

    // Simple one-liner for methods with base class
    if (httpMethod === 'get') {
      return `  /// ${desc}
  Future<String> ${methodName}(${params.join(', ')}) =>
      callGet(session, '${ep.path}');`;
    }

    if (httpMethod === 'delete') {
      return `  /// ${desc}
  Future<String> ${methodName}(${params.join(', ')}) =>
      callDelete(session, '${ep.path}');`;
    }

    // POST/PUT with body
    const methodCall = httpMethod === 'put' ? 'callPut' : 'callPost';

    if (bodyParams.length === 0) {
      return `  /// ${desc}
  Future<String> ${methodName}(${params.join(', ')}) =>
      ${methodCall}(session, '${ep.path}');`;
    }

    return `  /// ${desc}
  Future<String> ${methodName}(${params.join(', ')}) =>
      ${methodCall}(session, '${ep.path}', {
${bodyParams.join(',\n')},
      });`;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
