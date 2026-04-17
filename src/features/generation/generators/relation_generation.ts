import fs from 'fs';
import path from 'path';
import { toSnakeCase } from '../../../utils/text_work/text_util';
import { CodeFormatter } from '../parsers/formatters/code_formatter';
import { ServerpodModel } from '../parsers/formatters/types';
import { GenerationConfig } from '../config/generation_config';

export function generateDriftTableImports(model: ServerpodModel, config: GenerationConfig): string {
    const relationFields = model.fields.filter(field =>
        field.isRelation && field.relationType === 'manyToOne' &&
        field.relatedModel && field.name !== 'customerId'
    );
    if (relationFields.length === 0) { return ''; }

    const currentTablesDir = path.join(config.targetFeaturePath, 'data', 'datasources', 'local', 'tables');
    const featuresDir = config.featuresPath;

    const imports = relationFields.map(field => {
        const tableFileName = `${field.relatedModel!}_table.dart`;

        // Check if table exists in current feature's tables dir
        const localPath = path.join(currentTablesDir, tableFileName);
        if (fs.existsSync(localPath)) {
            return `import '${tableFileName}';`;
        }

        // Search in sibling features
        const relativePath = findTableInFeatures(featuresDir, tableFileName, currentTablesDir);
        if (relativePath) {
            return `import '${relativePath}';`;
        }

        // Fallback: plain filename (may need manual fix)
        return `import '${tableFileName}';`;
    });
    return [...new Set(imports)].join('\n');
}

function findTableInFeatures(featuresDir: string, tableFileName: string, fromDir: string): string | null {
    if (!fs.existsSync(featuresDir)) { return null; }

    const features = fs.readdirSync(featuresDir);
    for (const feature of features) {
        const tablesDir = path.join(featuresDir, feature, 'data', 'datasources', 'local', 'tables');
        const tablePath = path.join(tablesDir, tableFileName);
        if (fs.existsSync(tablePath)) {
            return path.relative(fromDir, tablePath).replace(/\\/g, '/');
        }
    }
    return null;
}

export function generateServerpodToModelParams(model: ServerpodModel): string {
    const formatter = new CodeFormatter();
    const fieldsToProcess = formatter.fieldsFilter(model.fields);

    return fieldsToProcess.map(field => {
        let fieldValue = field.name;
        // Relations: UuidValue → String
        if ((field.isRelation && field.relationType === 'manyToOne') || field.name === 'customerId') {
            fieldValue = `${field.name}${field.nullable ? '?' : ''}.toString()`;
        }
        // Enums: enum → String via .name
        if (field.isEnum) {
            fieldValue = field.nullable ? `${field.name}?.name` : `${field.name}.name`;
        }
        return `${field.name}: ${fieldValue}`;
    }).join(',\n      ');
}

export function generateEntityToServerpodParams(model: ServerpodModel): string {
    const formatter = new CodeFormatter();
    const fieldsToProcess = formatter.fieldsFilter(model.fields);

    return fieldsToProcess.map(field => {
        let fieldValue = field.name;
        // Relations: String → UuidValue
        if (field.isRelation && field.relationType === 'manyToOne') {
            fieldValue = field.nullable
                ? `${field.name} == null ? null : serverpod.UuidValue.fromString(${field.name}!)`
                : `serverpod.UuidValue.fromString(${field.name})`;
        }
        // Enums: String → enum via serverpod.EnumType.values.byName()
        if (field.isEnum) {
            fieldValue = field.nullable
                ? `${field.name} != null ? serverpod.${field.type}.values.byName(${field.name}!) : null`
                : `serverpod.${field.type}.values.byName(${field.name})`;
        }
        return `${field.name}: ${fieldValue}`;
    }).join(',\n      ');
}
