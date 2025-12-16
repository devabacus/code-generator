import * as path from 'path';
import { IFileSystem } from '../../../../core/interfaces/file_system';
import { ParsedEndpoint, camelToSnake } from '../../parsers/openapi_parser';

const MARKER_START = '// === generated_start:pythonMethods ===';
const MARKER_END = '// === generated_end:pythonMethods ===';

/**
 * Generates Python endpoint methods for Serverpod from OpenAPI spec.
 * Uses marker-based merge - only replaces content between markers.
 */
export class PythonEndpointGenerator {
    constructor(private fileSystem: IFileSystem) { }

    getPath(basePath: string): string {
        const projectName = path.basename(basePath);
        return path.join(basePath, `${projectName}_server`, 'lib', 'src', 'endpoints', 'python_endpoint.dart');
    }

    /**
     * Update python_endpoint.dart with methods from OpenAPI endpoints
     */
    async generate(basePath: string, endpoints: ParsedEndpoint[]): Promise<void> {
        const filePath = this.getPath(basePath);

        if (!await this.fileSystem.exists(filePath)) {
            throw new Error(
                `python_endpoint.dart not found. Run "Add Python to project" first.`
            );
        }

        const existing = await this.fileSystem.readFile(filePath);

        // Check for markers
        if (!existing.includes(MARKER_START) || !existing.includes(MARKER_END)) {
            throw new Error(
                `python_endpoint.dart doesn't have markers. ` +
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

    private buildMethodsBlock(endpoints: ParsedEndpoint[]): string {
        const lines: string[] = [
            `  ${MARKER_START}`,
            '  // Auto-generated from OpenAPI spec',
            '  // Run "Generate Python Bridge" to update',
            '',
        ];

        for (const ep of endpoints) {
            lines.push(this.buildMethod(ep));
            lines.push('');
        }

        lines.push(`  ${MARKER_END}`);
        return lines.join('\n');
    }

    private buildMethod(ep: ParsedEndpoint): string {
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

        const desc = ep.description || `Call Python ${ep.name} endpoint`;
        const httpMethod = ep.method.toLowerCase();

        if (httpMethod === 'get') {
            return `  /// ${desc}
  Future<String> ${ep.name}(${params.join(', ')}) async {
    try {
      final response = await http
          .get(Uri.parse('\$_pythonServiceUrl${ep.path}'))
          .timeout(const Duration(seconds: 30));
      if (response.statusCode == 200) {
        return response.body;
      }
      throw Exception('Python error: \${response.statusCode}');
    } catch (e) {
      session.log('Python ${ep.name}: \$e', level: LogLevel.error);
      rethrow;
    }
  }`;
        }

        return `  /// ${desc}
  Future<String> ${ep.name}(${params.join(', ')}) async {
    try {
      final response = await http
          .post(
            Uri.parse('\$_pythonServiceUrl${ep.path}'),
            headers: {'Content-Type': 'application/json'},
            ${bodyCode}
          )
          .timeout(const Duration(seconds: 30));
      if (response.statusCode == 200) {
        return response.body;
      }
      throw Exception('Python error: \${response.statusCode}');
    } catch (e) {
      session.log('Python ${ep.name}: \$e', level: LogLevel.error);
      rethrow;
    }
  }`;
    }

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
