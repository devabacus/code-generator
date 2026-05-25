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
        // BUG-012 (TASK-016): table file paths должны быть snake_case даже когда
        // `relatedModel` хранится в lowerCamel. После parser fix `parent=terminal_set`
        // → `relatedModel='terminalSet'` (Discussion #5 Q2=A). Без `toSnakeCase()`
        // получим broken `terminalSet_table.dart` вместо `terminal_set_table.dart`.
        const tableFileName = `${toSnakeCase(field.relatedModel!)}_table.dart`;

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
        // Enums: String → enum via tryParseEnum (graceful fallback на unknown raw).
        // TASK-027 (BUG-022 / weight TASK-019 Bug 2 pack): `EnumType.values.byName(raw)`
        // бросает StateError на unknown raw → outbox retry loop → silent freeze.
        // `tryParseEnum` возвращает `EnumType.values.first` gracefully (lossy > crash).
        // Helper из `lib/core/utils/enum_parse.dart` (manifest: startProject) — import
        // statically включён в template category_entity_extension.dart.
        if (field.isEnum) {
            const enumRef = `serverpod.${field.type}`;
            fieldValue = field.nullable
                ? `${field.name} != null ? tryParseEnum(${enumRef}.values, ${field.name}, ${enumRef}.values.first) : null`
                : `tryParseEnum(${enumRef}.values, ${field.name}, ${enumRef}.values.first)`;
        }
        return `${field.name}: ${fieldValue}`;
    }).join(',\n      ');
}
