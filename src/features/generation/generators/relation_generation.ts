import { toSnakeCase } from '../../../utils/text_work/text_util';
import { CodeFormatter } from '../parsers/formatters/code_formatter';
import { ServerpodModel } from '../parsers/formatters/types';

export function generateDriftTableImports(model: ServerpodModel): string {
    const relationFields = model.fields.filter(field =>
        field.isRelation && field.relationType === 'manyToOne' &&
        field.relatedModel && field.name !== 'customerId'
    );
    if (relationFields.length === 0) { return ''; }

    const imports = relationFields.map(field => {
        const tableFileName = `${field.relatedModel!}_table.dart`;
        return `import '${tableFileName}';`;
    });
    return [...new Set(imports)].join('\n');
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
