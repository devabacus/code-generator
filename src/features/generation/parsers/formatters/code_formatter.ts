import { cap } from '../../../../utils/text_work/text_util';
import { Field, ICodeFormatter } from './code_formatter.interface';
import { ServerpodField } from './types';

export class CodeFormatter implements ICodeFormatter {

    formatClassFields(fields: Field[]): string {
        const fieldRows = fields.map(field => `final ${field.type}${field.nullable ? '?' : ''} ${field.name};`);
        return fieldRows.join('\n');
    }

    formatRequiredFields(fields: Field[]): string {
        const fieldRows = fields.map(field => `required this.${field.name},`);
        return fieldRows.join('\n');
    }

    formatRequiredTypeFields(fieldsWithStatic: Field[] | ServerpodField[]): string {
        const fields = this.fieldsFilter(fieldsWithStatic);
        const fieldRows = fields.map(field => {
            const typeString = `${field.type}${field.nullable ? '?' : ''}`;
            let _type = typeString;
            let _name = field.name;

            // Relations (UuidValue → String)
            if (field.isRelation && field.relationType === 'manyToOne') {
                _type = field.nullable ? 'String?' : 'String';
            }

            // Enums → String
            if (field.isEnum) {
                _type = field.nullable ? 'String?' : 'String';
            }

            if (field.nullable) {
                return `${_type} ${_name},`;
            } else {
                if (_name === 'id') {
                    return `${_type} ${_name},`;
                }
                return `required ${_type} ${_name},`;
            }
        });
        return fieldRows.join('\n    ');
    }

    formatConstructorParams(fields: Field[] | ServerpodField[], instanceName?: string): string {
        const prefix = instanceName ? `${instanceName}.` : '';
        const params = fields.map(field => `${field.name}: ${prefix}${field.name}`);
        return params.join(', ');
    }

    formatFieldsComma(fields: Field[] | ServerpodField[]): string {
        return fields.map(field => field.name).join(', ');
    }

    formatValueWrappedFields(fields: ServerpodField[]): string {
        const wrappedFiltered = this.fieldsFilter(fields);
        const wrapped = wrappedFiltered.map(field => {
            let _name = field.name;
            let _value = field.name;
            if (field.isRelation && field.relationType === 'manyToOne') {
                _name = field.name.endsWith('Id') ? field.name : `${field.name}Id`;
                _value = field.name.endsWith('Id')
                    ? `${field.name}${field.nullable ? '?' : ''}.toString()`
                    : `${field.name}`;
            }
            // Enums: use .name to convert to String for Drift
            if (field.isEnum) {
                _value = field.nullable ? `${field.name}?.name` : `${field.name}.name`;
            }
            return `${_name}: Value(${_value})`;
        });
        return wrapped.join(',\n');
    }

    fieldsFilter(fields: ServerpodField[]): ServerpodField[] {
        const exactExcludes = ['isDeleted', 'id', 'userId', 'lastModified', 'syncStatus', 'createdAt', 'customerId'];

        return fields.filter(field =>
            !exactExcludes.includes(field.name) &&
            !field.name.includes('Map') && !field.scope?.includes('serverOnly'));
    }

    formatSimpleFields(fields: Field[] | ServerpodField[]): string {
        const simple = this.fieldsFilter(fields as Field[]).map((field) => {
            let _field_name = field.name;
            let _field_value = field.name;

            if (field.isRelation && field.relationType === 'manyToOne') {
                _field_value = `${field.name}`;
            }
            return `${_field_name}: ${_field_value}`;
        });
        return simple.join(',\n');
    }

    formatSimpleFieldsWithoutId(fields: Field[] | ServerpodField[]): string {
        const withoutId = fields.filter(field => field.name !== 'id');
        return this.formatSimpleFields(withoutId);
    }

    getParamsWithOutId(row: string): string {
        return row.replace(/.*id,\s?/, '');
    }

    getFieldsValueForTest(fields: Field[]): string[] {
        return [];
    }

    getFieldsExpectValueTest(fields: Field[]): string[] {
        return fields.slice(1, 3).map((field, index) => `.${field.name}, '${field.name} ${index + 1}'`);
    }

    formatInsertCompanionParams(fields: ServerpodField[]): string {
        const paramFilter = this.fieldsFilter(fields);
        const params = paramFilter.map(field => {
            let _field_name = field.name;
            let _field_value = field.name;

            if (field.isRelation && field.relationType === 'manyToOne') {
                _field_value = `${field.name}`;
            }

            return `${_field_name}: Value(${_field_value})`;
        });
        return params.join(', ');
    }

    generateDriftTableColumns(fields: ServerpodField[]): string {
        const columns: string[] = [];

        for (const field of fields) {
            if (this.shouldSkipServerpodField(field)) {
                continue;
            }

            if (field.isRelation && field.relationType === 'manyToOne') {
                const foreignKeyColumn = this.generateForeignKeyColumn(field);
                columns.push(`  ${foreignKeyColumn}`);
            } else {
                const columnDefinition = this.generateColumnDefinition(field);
                columns.push(`  ${columnDefinition}`);
            }
        }

        return columns.join('\n');
    }

    private generateColumnDefinition(field: ServerpodField): string {
        const columnType = this.mapServerpodTypeToDriftColumn(field.type);
        let columnClass = columnType === 'integer' ? 'Int' : cap(columnType);
        if (columnType === 'boolean') { columnClass = 'Bool'; }
        const nullable = field.nullable ? '.nullable()' : '';

        return `${columnClass}Column get ${field.name} => ${columnType}()${nullable}();`;
    }

    mapServerpodTypeToDriftColumn(serverpodType: string): string {
        const typeMap: Record<string, string> = {
            'UuidValue': 'text',
            'String': 'text',
            'int': 'integer',
            'DateTime': 'dateTime',
            'bool': 'boolean',
            'double': 'real'
        };

        return typeMap[serverpodType] || 'text';
    }

    shouldSkipServerpodField(field: ServerpodField): boolean {
        const staticFields = ['id', 'userId', 'lastModified', 'syncStatus', 'isDeleted', 'Map', 'customerId', 'createdAt'];
        if (staticFields.includes(field.name) || field.scope?.includes('serverOnly')) {
            return true;
        }

        if (field.isRelation && field.relationType === 'oneToMany') {
            return true;
        }
        return false;
    }

    private generateForeignKeyColumn(field: ServerpodField): string {
        const foreignKeyFieldName = field.name.endsWith('Id') ? field.name : `${field.name}Id`;
        const nullable = field.nullable ? '.nullable()' : '';
        const relatedTableName = field.relatedModel ? `${field.relatedModel}Table` : '';
        const references = relatedTableName ? `.references(${cap(relatedTableName)}, #id, onDelete: KeyAction.setNull)` : '';

        return `TextColumn get ${foreignKeyFieldName} => text()${nullable}${references}();`;
    }
}
