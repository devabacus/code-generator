import * as path from 'path';
import { IFileSystem } from '../../../../core/interfaces/file_system';
import { ParsedEndpoint } from '../../parsers/openapi_parser';

const MARKER_START = '// === generated_start:pythonMethods ===';
const MARKER_END = '// === generated_end:pythonMethods ===';

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
 * Generates Python endpoint methods for Serverpod from OpenAPI spec.
 * Supports multiple microservices with custom naming.
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
  async generate(basePath: string, endpoints: ParsedEndpoint[], serviceName: string = 'python'): Promise<void> {
    const filePath = this.getPath(basePath, serviceName);

    // Создаём файл если не существует
    if (!await this.fileSystem.exists(filePath)) {
      await this.createInitialFile(filePath, serviceName);
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
    const methodsBlock = this.buildMethodsBlock(endpoints, serviceName);

    // Replace between markers
    const updated = existing.replace(
      new RegExp(`\\s*${this.escapeRegex(MARKER_START)}[\\s\\S]*?${this.escapeRegex(MARKER_END)}`, 'g'),
      '\n\n' + methodsBlock
    );

    await this.fileSystem.createFile(filePath, updated);
  }

  /**
   * Создаёт начальный {serviceName}_endpoint.dart с маркерами для генерации.
   */
  private async createInitialFile(filePath: string, serviceName: string): Promise<void> {
    const className = `${toPascalCase(serviceName)}Endpoint`;
    const serviceUrlVar = `_${serviceName}ServiceUrl`;
    const envVarName = `${serviceName.toUpperCase()}_SERVICE_URL`;

    const content = `import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:serverpod/serverpod.dart';

class ${className} extends Endpoint {
  // URL сервиса (из ConfigMap в K8s или localhost для dev)
  static const String ${serviceUrlVar} = 
      String.fromEnvironment('${envVarName}', defaultValue: 'http://localhost:8000');

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

  private buildMethodsBlock(endpoints: ParsedEndpoint[], serviceName: string): string {
    const serviceUrlVar = `_${serviceName}ServiceUrl`;
    const lines: string[] = [
      `  ${MARKER_START}`,
      '  // Auto-generated from OpenAPI spec',
      '  // Run "Generate Python Bridge" to update',
      '',
    ];

    for (const ep of endpoints) {
      lines.push(this.buildMethod(ep, serviceName, serviceUrlVar));
      lines.push('');
    }

    lines.push(`  ${MARKER_END}`);
    return lines.join('\n');
  }

  private buildMethod(ep: ParsedEndpoint, serviceName: string, serviceUrlVar: string): string {
    // Parameters: always Session first, then request fields
    const params = ['Session session'];
    for (const f of ep.requestFields) {
      const nullMark = f.nullable ? '?' : '';
      params.push(`${f.type}${nullMark} ${f.name}`);
    }

    // Body JSON fields
    const bodyFields = ep.requestFields.map(f => {
      if (f.nullable) {
        return `          if (${f.name} != null) '${f.originalName}': ${f.name},`;
      }
      return `          '${f.originalName}': ${f.name},`;
    });

    const bodyCode = bodyFields.length > 0
      ? `body: jsonEncode({\n${bodyFields.join('\n')}\n            }),`
      : '';

    const desc = ep.description || `Call ${serviceName} ${ep.name} endpoint`;
    const httpMethod = ep.method.toLowerCase();

    if (httpMethod === 'get') {
      return `  /// ${desc}
  Future<String> ${ep.name}(${params.join(', ')}) async {
    try {
      final response = await http
          .get(Uri.parse('\$${serviceUrlVar}${ep.path}'))
          .timeout(const Duration(seconds: 30));
      if (response.statusCode == 200) {
        return response.body;
      }
      throw Exception('${serviceName} error: \${response.statusCode}');
    } catch (e) {
      session.log('${serviceName} ${ep.name}: \$e', level: LogLevel.error);
      rethrow;
    }
  }`;
    }

    return `  /// ${desc}
  Future<String> ${ep.name}(${params.join(', ')}) async {
    try {
      final response = await http
          .post(
            Uri.parse('\$${serviceUrlVar}${ep.path}'),
            headers: {'Content-Type': 'application/json'},
            ${bodyCode}
          )
          .timeout(const Duration(seconds: 30));
      if (response.statusCode == 200) {
        return response.body;
      }
      throw Exception('${serviceName} error: \${response.statusCode}');
    } catch (e) {
      session.log('${serviceName} ${ep.name}: \$e', level: LogLevel.error);
      rethrow;
    }
  }`;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
