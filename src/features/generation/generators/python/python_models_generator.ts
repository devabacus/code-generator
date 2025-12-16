import * as path from 'path';
import { IFileSystem } from '../../../../core/interfaces/file_system';
import { ParsedModel, camelToSnake } from '../../parsers/openapi_parser';

/**
 * Generates Serverpod .spy.yaml model files from OpenAPI schemas.
 * Creates DTO models (no database table).
 */
export class PythonModelsGenerator {
    constructor(private fileSystem: IFileSystem) { }

    getModelsPath(basePath: string): string {
        const projectName = path.basename(basePath);
        return path.join(basePath, `${projectName}_server`, 'lib', 'src', 'models');
    }

    /**
     * Generate .spy.yaml files for each model
     * Returns list of generated model names
     */
    async generate(basePath: string, models: ParsedModel[]): Promise<string[]> {
        const modelsPath = this.getModelsPath(basePath);
        const generated: string[] = [];

        // Ensure models directory exists
        await this.fileSystem.createFolder(modelsPath);

        for (const model of models) {
            const fileName = `${camelToSnake(model.name)}.spy.yaml`;
            const filePath = path.join(modelsPath, fileName);
            const content = this.buildModelYaml(model);

            await this.fileSystem.createFile(filePath, content);
            generated.push(model.name);
        }

        return generated;
    }

    private buildModelYaml(model: ParsedModel): string {
        const lines: string[] = [
            `# Auto-generated from OpenAPI - DO NOT EDIT`,
            `# Run "Generate Python Bridge" to regenerate`,
            `class: ${model.name}`,
            `fields:`,
        ];

        for (const field of model.fields) {
            const nullMark = field.nullable ? '?' : '';
            lines.push(`  ${field.name}: ${field.type}${nullMark}`);
        }

        return lines.join('\n') + '\n';
    }
}
