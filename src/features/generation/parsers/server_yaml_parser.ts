import * as yaml from 'js-yaml';
import { ServerpodModel, ServerpodField, ServerpodIndex } from './formatters/types';
import { RelationAnalyzer } from './relation-analyzer';
import { JunctionDetector } from './junction_detector';
import { snakeToLowerCamelCase } from '../../../utils/text_work/text_util';

export class ServerpodYamlParser {

    static parse(yamlContent: string): ServerpodModel {
        const parsed = yaml.load(yamlContent) as any;

        // Dependency ordering (TASK-013, Discussion #2 Q3 Claude_1):
        //   1. parseFields() ДО junction detection — detector работает на already-parsed
        //      `ServerpodField[]` (с заполненными `isRelation` flags).
        //   2. Затем JunctionDetector.isJunctionEntity() устанавливает `model.isRelation`
        //      flag (drives manifest selection в generate_entity.ts:72 + create_data_files...).
        //
        // Legacy `parsed.class.includes('Map')` heuristic dropped (Q2=A) — производил
        // false-negatives для junction'ов без `Map` суффикса (RolePermission, CustomerUser
        // в weight). См. ai/bug-reports/junction-detection-audit.md.
        const fields = this.parseFields(parsed.fields || {});
        const explicitJunction: boolean | undefined =
            typeof parsed.junction === 'boolean' ? parsed.junction : undefined;

        const model: ServerpodModel = {
            className: parsed.class || '',
            tableName: parsed.table || '',
            isRelation: false, // populated below через JunctionDetector
            fields,
            indexes: this.parseIndexes(parsed.indexes),
        };

        model.isRelation = JunctionDetector.isJunctionEntity(model, explicitJunction);

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
        // BUG-012 (TASK-016): возвращаем `relatedModel` в lowerCamel form (после
        // parser fix `parent=terminal_set` → `relatedModel='terminalSet'`).
        // Previous `.toLowerCase()` ломало multi-word entities — `'terminalSet'`
        // → `'terminalset'` ломает downstream MANY_TO_MANY dictionary substitution
        // (cap/unCap/toSnakeCase ожидают lowerCamel input для produce
        // `TerminalSet`/`terminalSet`/`terminal_set`).
        if (field.relatedModel) {
            return field.relatedModel;
        }
        // Fallback: strip-Id from name, no lowerCase. Name is already lowerCamel
        // (Serverpod field convention `defaultTerminalSetId`).
        return field.name.endsWith('Id') ? field.name.slice(0, -2) : field.name;
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
        // BUG-012 (Discussion #5): preserve raw `definition` string для regex matching
        // ДО naive split по запятой. Naive split ломается на comma внутри `relation(...)`:
        //   "UuidValue?, relation(parent=member, onDelete=SetNull)"
        // → parts = ["UuidValue?", "relation(parent=member", "onDelete=SetNull)"]
        // Therefore relation directive parsing requires `fullDefinition` подход —
        // regex на полную raw строку, не на parts.
        const fullDefinition = definition;
        const parts = definition.split(',').map(part => part.trim());
        const typePart = parts[0];

        const nullable = typePart.endsWith('?');
        const type = nullable ? typePart.slice(0, -1) : typePart;

        // BUG-012 side-fix #2 (Adversarial review post-Path-C): strip quoted string
        // defaults из definition ДО `relation(` detection. Без этого regex matches
        // inside string literals — production landmine:
        //   `notes: String, default='See relation(parent=foo) docs'`
        // → false `isRelation=true`, `relatedModel='foo'` (silent corruption).
        // Approach: blank quoted regions in the working copy (preserve length для
        // accurate match positioning if needed later, replace content с пробелами).
        const definitionWithoutStrings = fullDefinition.replace(
            /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g,
            (m) => "'" + ' '.repeat(Math.max(0, m.length - 2)) + "'"
        );

        // BUG-012 side-fix (acceptance #9): replace `parts.toString().includes('relation')`
        // с anchored regex `\brelation\s*\(` чтобы избежать false-positives когда
        // `relation` встречается как substring в string default
        // (e.g. `description: String, default='this relation is broken'`).
        const isRelation = /\brelation\s*\(/.test(definitionWithoutStrings);
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

            // Defensive fallback (acceptance #4): `name.endsWith('Id') ? name.slice(0, -2) : name`.
            // Replaces previous `name.replace(/(.*)Id/, '$1')` which behaved странно
            // на names с `Id` НЕ в конце (e.g., `IdleTimeout` → `Idle`).
            field.relatedModel = name.endsWith('Id') ? name.slice(0, -2) : name;

            // BUG-012 core: override через explicit `relation(parent=X)` directive.
            // Regex extracts parent= identifier из directive's parameter list.
            // X expected in snake_case (Serverpod convention), converted to lowerCamel
            // через `snakeToLowerCamelCase` для consistency с downstream consumers
            // (which expect Pascal/lowerCamel/snake variants — see Discussion #5).
            // Use definitionWithoutStrings (per side-fix #2) для regex match —
            // защита от `parent=` внутри string default.
            const relationMatch = definitionWithoutStrings.match(/\brelation\(([^)]*)\)/);
            if (relationMatch) {
                const parentMatch = relationMatch[1].match(/(?:^|,\s*)parent\s*=\s*([a-z_][a-z0-9_]*)\b/);
                if (parentMatch) {
                    try {
                        field.relatedModel = snakeToLowerCamelCase(parentMatch[1]);
                    } catch (e) {
                        throw new Error(
                            `Field '${name}' has malformed parent= directive: ${(e as Error).message}`
                        );
                    }
                }
            }
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
