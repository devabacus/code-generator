import * as yaml from 'js-yaml';
import { ServerpodModel, ServerpodField, ServerpodIndex } from './formatters/types';
import { RelationAnalyzer } from './relation-analyzer';

export class ServerpodYamlParser {

    static parse(yamlContent: string): ServerpodModel {
        const parsed = yaml.load(yamlContent) as any;

        const model: ServerpodModel = {
            className: parsed.class || '',
            tableName: parsed.table || '',
            isRelation: parsed.class.includes('Map'),
            fields: this.parseFields(parsed.fields || {}),
            indexes: this.parseIndexes(parsed.indexes),
        };

        if (model.isRelation) {
            const entities = this.extractManyToManyEntities(model);
            if (entities) {
                model.entity1 = entities.entity1;
                model.entity2 = entities.entity2;
            }
        }
        return model;
    }

    private static extractManyToManyEntities(model: ServerpodModel): { entity1: string; entity2: string } | null {
        const relationFields = model.fields.filter(field => field.isRelation);

        if (relationFields.length < 2) {
            return null;
        }

        const entity1 = this.extractEntityNameFromField(relationFields[0]);
        const entity2 = this.extractEntityNameFromField(relationFields[1]);

        if (!entity1 || !entity2) {
            return null;
        }

        return { entity1, entity2 };
    }

    private static extractEntityNameFromField(field: ServerpodField): string | null {
        if (field.relatedModel) {
            return field.relatedModel.toLowerCase();
        }
        return field.name.replace(/Id$/, '').toLowerCase();
    }

    private static parseFields(fieldsObj: any): ServerpodField[] {
        return Object.entries(fieldsObj).map(([name, definition]) =>
            this.parseField(name, definition as string)
        );
    }

    private static readonly DART_BUILT_IN_TYPES = new Set([
        'String', 'int', 'double', 'bool', 'DateTime', 'UuidValue',
        'Duration', 'ByteData', 'Map', 'List', 'Set',
    ]);

    private static isEnumType(type: string): boolean {
        const baseType = type.replace(/[?]$/, '');
        if (this.DART_BUILT_IN_TYPES.has(baseType)) return false;
        if (baseType.startsWith('List<') || baseType.startsWith('Map<')) return false;
        return true;
    }

    private static parseField(name: string, definition: string): ServerpodField {
        const parts = definition.split(',').map(part => part.trim());
        const typePart = parts[0];

        const nullable = typePart.endsWith('?');
        const type = nullable ? typePart.slice(0, -1) : typePart;

        const isRelation = parts.toString().includes('relation');
        const isEnum = !isRelation && this.isEnumType(type);

        const field: ServerpodField = {
            name,
            type,
            nullable,
            isRelation,
            isEnum,
        };

        if (isRelation) {
            field.relationType = RelationAnalyzer.analyzeRelationType(type);
            field.relatedModel = name.replace(/(.*)Id/, '$1');
        }

        for (let i = 1; i < parts.length; i++) {
            const param = parts[i];

            if (param.startsWith('default=')) {
                field.defaultValue = param.split('=')[1];
            }

            if (param.startsWith('defaultPersist=')) {
                field.defaultPersist = param.split('=')[1];
            }

            if (param.startsWith('scope=')) {
                field.scope = param.split('=')[1];
            }
        }

        return field;
    }

    private static parseIndexes(indexesObj: any): ServerpodIndex[] | undefined {
        if (!indexesObj || typeof indexesObj !== 'object') {
            return undefined;
        }

        return Object.entries(indexesObj).map(([name, definition]) =>
            this.parseIndex(name, definition as any)
        );
    }

    private static parseIndex(name: string, definition: any): ServerpodIndex {
        return {
            name,
            fields: definition.fields || [],
            unique: definition.unique || false
        };
    }
}
