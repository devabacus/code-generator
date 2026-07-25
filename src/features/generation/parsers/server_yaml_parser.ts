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

        const className: string = parsed.class || '';

        // TASK-040 (ADR-0006 / дискуссия #13): migration-guard. Старый носитель —
        // YAML-**ключ** `junction` — отвергается Serverpod'ом (`The "junction"
        // property is not allowed for class type`). Файл с таким ключом нерабочий
        // end-to-end, поэтому падаем громко с инструкцией переноса, а не молча
        // продолжаем парсить.
        this.assertNoLegacyJunctionKey(parsed, className);

        // TASK-040: директива читается из YAML-**комментария** `# codegen:junction:`
        // (см. `parseJunctionMarker`). Комментарий Serverpod физически не видит →
        // файл на диске в покое валиден для `serverpod generate` без предобработки.
        //
        // Обе формы (TASK-013 / TASK-037) живут на новом носителе:
        //   1. `# codegen:junction: true`   → explicit junction override (принудительная
        //      классификация как junction; пара entity1/entity2 всё ещё выводится
        //      эвристикой «первые 2 relation-поля»).
        //   2. `# codegen:junction: [a, b]` → explicit-parents directive (BUG-026).
        //      Массив авторитетно задаёт junction-родителей: entity1=a, entity2=b.
        //      Array-форма ТАКЖЕ подразумевает junction (как `true`) — иначе
        //      директива без структурного junction была бы бессмысленна.
        const markerValue = this.parseJunctionMarker(yamlContent, className);
        const junctionDirective: [string, string] | undefined =
            this.parseJunctionDirective(markerValue, className);
        const explicitJunction: boolean | undefined =
            typeof markerValue === 'boolean'
                ? markerValue
                : junctionDirective !== undefined
                    ? true
                    : undefined;

        const model: ServerpodModel = {
            className,
            tableName: parsed.table || '',
            isRelation: false, // populated below через JunctionDetector
            fields,
            indexes: this.parseIndexes(parsed.indexes),
        };

        model.isRelation = JunctionDetector.isJunctionEntity(model, explicitJunction);

        if (model.isRelation) {
            // TASK-037: единый источник пары entity1/entity2 для ВСЕХ трёх junction-
            // кодопутей (parser → orchestrator читает model.entity1/entity2). С
            // директивой — пара берётся из неё; без директивы — текущая эвристика
            // (первые 2 relation-поля) байт-в-байт как раньше.
            const entities = junctionDirective !== undefined
                ? this.resolveJunctionDirective(model, junctionDirective)
                : this.extractManyToManyEntities(model);
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

    /**
     * TASK-040: маркер codegen-директивы junction в YAML-комментарии.
     *
     * Якорь на **колонку 0** (`^#` без отступа) — это снимает единственный сценарий
     * ложного срабатывания: `#` внутри block scalar или строкового default'а.
     * Содержимое block scalar / поля обязано быть с отступом, поэтому на колонке 0
     * его быть не может. Тот же приём применён в `parseField` для quoted-строк
     * (BUG-012 side-fix).
     *
     * `[ \t]*` после `#` — любой горизонтальный отступ (0, 1 или несколько пробелов/
     * табов): `#codegen:`, `# codegen:` и `#  codegen:` эквивалентны. Опечатка в
     * пробеле не должна молча ронять директиву в fallback (review minor #1, TASK-040).
     * `[ \t]` (а не `\s`) намеренно — `\s` матчит `\n` и мог бы перепрыгнуть на
     * следующую строку, сломав якорь колонки 0.
     *
     * `m` — multiline (`^` матчит начало строки, не только строки целиком).
     * `\r?$`-хвост нормализуется trim'ом в `parseJunctionMarker` (CRLF-файлы).
     */
    private static readonly JUNCTION_MARKER_RE = /^#[ \t]*codegen:junction:(.*)$/gm;

    /**
     * TASK-040 (ADR-0006): читает директиву junction из YAML-**комментария**
     * по сырому содержимому файла — ДО `yaml.load`.
     *
     * Контракт (консенсус дискуссии #13):
     *   - маркер якорится на колонку 0 (`^# codegen:junction:`);
     *   - разрешён ровно ОДИН такой маркер, дубликат — ошибка;
     *   - RHS — `true` или flow-массив `[a, b]`; всё остальное (пустой RHS,
     *     `false`, произвольный текст) → fail-fast, НЕ тихая деградация к
     *     эвристике.
     *
     * @returns `true` (форма override), `[a, b]`-массив (форма explicit-parents)
     *          или `undefined` если маркера нет.
     * @throws Error при дубликате маркера или нераспознаваемом RHS.
     */
    private static parseJunctionMarker(
        yamlContent: string,
        className: string,
    ): boolean | string[] | undefined {
        const matches = [...yamlContent.matchAll(this.JUNCTION_MARKER_RE)];

        if (matches.length === 0) {
            return undefined;
        }
        if (matches.length > 1) {
            throw new Error(
                `Entity "${className}": найдено ${matches.length} маркеров `
                + `\`# codegen:junction:\` — разрешён ровно один (дубликат директивы). `
                + `Удалите лишние строки.`,
            );
        }

        const rhs = matches[0][1].trim();

        if (rhs === '') {
            throw new Error(
                `Entity "${className}": маркер \`# codegen:junction:\` без значения. `
                + `Ожидается \`# codegen:junction: true\` или \`# codegen:junction: [entity1, entity2]\`.`,
            );
        }
        if (rhs === 'true') {
            return true;
        }
        if (rhs.startsWith('[')) {
            // Разбираем flow-массив тем же YAML-парсером, что и раньше разбирал
            // значение ключа — правила валидации RHS остаются идентичными.
            let parsedRhs: unknown;
            try {
                parsedRhs = yaml.load(rhs);
            } catch (e) {
                throw new Error(
                    `Entity "${className}": маркер \`# codegen:junction: ${rhs}\` — `
                    + `невалидный YAML-массив: ${(e as Error).message}`,
                );
            }
            if (!Array.isArray(parsedRhs)) {
                throw new Error(
                    `Entity "${className}": маркер \`# codegen:junction: ${rhs}\` — `
                    + `ожидался массив \`[entity1, entity2]\`.`,
                );
            }
            return parsedRhs as string[];
        }

        throw new Error(
            `Entity "${className}": нераспознанное значение маркера `
            + `\`# codegen:junction: ${rhs}\`. Допустимо только \`true\` `
            + `или \`[entity1, entity2]\`. `
            + `(\`false\` не поддерживается — negative override может скрыть structural junction.)`,
        );
    }

    /**
     * TASK-040 (ADR-0006): migration-guard на старый носитель.
     *
     * YAML-ключ `junction` живёт в namespace'е Serverpod-валидатора, который его
     * отвергает: `The "junction" property is not allowed for class type. Valid keys
     * are {class, sealed, extends, immutable, table, managedMigration, serverOnly,
     * fields, indexes}`. Такой файл нерабочий end-to-end (пользователь вынужден
     * снимать ключ руками перед каждым `serverpod generate`), поэтому падаем
     * громко с инструкцией переноса — иначе сценарий «забыл снять» просто живёт
     * дальше в тишине.
     */
    private static assertNoLegacyJunctionKey(parsed: any, className: string): void {
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return;
        }
        if (!Object.prototype.hasOwnProperty.call(parsed, 'junction')) {
            return;
        }
        const raw = parsed.junction;
        const rendered = Array.isArray(raw)
            ? `[${raw.join(', ')}]`
            : String(raw);
        throw new Error(
            `Entity "${className}": YAML-ключ \`junction\` больше не поддерживается — `
            + `Serverpod отвергает этот ключ ("The \\"junction\\" property is not allowed `
            + `for class type"), поэтому \`serverpod generate\` на таком файле падает. `
            + `Перенесите директиву в комментарий: замените строку \`junction: ${rendered}\` `
            + `на \`# codegen:junction: ${rendered}\` (комментарий Serverpod не видит). `
            + `См. ADR-0006 / TASK-040.`,
        );
    }

    /**
     * TASK-037: парсит junction directive в форме массива `[a, b]`.
     * TASK-040: источник значения — маркер-комментарий `# codegen:junction:`
     * (раньше — YAML-ключ `junction`). Правила валидации RHS не изменились.
     *
     * Возвращает:
     *   - `[a, b]` если значение маркера — массив ровно из 2 непустых строк.
     *   - `undefined` если маркера нет или он в boolean-форме
     *     (boolean-форма обрабатывается отдельно как explicit override).
     *
     * @throws Error если значение — массив, но некорректной формы (не 2 элемента,
     *         не строки, пустые) — fail-fast, чтобы malformed директива не
     *         деградировала silently до эвристики.
     */
    private static parseJunctionDirective(
        junctionValue: unknown,
        className: string,
    ): [string, string] | undefined {
        if (junctionValue === undefined || junctionValue === null) {
            return undefined;
        }
        if (typeof junctionValue === 'boolean') {
            return undefined;
        }
        if (!Array.isArray(junctionValue)) {
            throw new Error(
                `Entity "${className}" has invalid junction directive: expected `
                + `\`# codegen:junction: true\` or \`# codegen:junction: [a, b]\`, `
                + `got ${typeof junctionValue}.`,
            );
        }
        if (junctionValue.length !== 2) {
            throw new Error(
                `Entity "${className}" junction directive must have exactly 2 elements `
                + `(\`# codegen:junction: [entity1, entity2]\`), got ${junctionValue.length}.`,
            );
        }
        const [a, b] = junctionValue;
        if (typeof a !== 'string' || typeof b !== 'string' || a.trim() === '' || b.trim() === '') {
            throw new Error(
                `Entity "${className}" junction directive elements must be non-empty strings, `
                + `got [${JSON.stringify(a)}, ${JSON.stringify(b)}].`,
            );
        }
        const aTrimmed = a.trim();
        const bTrimmed = b.trim();
        // Дубликат/self-junction: пара entity1=entity2 коррумпирует downstream
        // substitution (DAO/adapters привязываются к одной сущности дважды).
        if (aTrimmed === bTrimmed) {
            throw new Error(
                `Entity "${className}" junction directive parents must be distinct: `
                + `"${aTrimmed}" is specified twice `
                + `(\`# codegen:junction: [a, b]\` requires two different parents).`,
            );
        }
        return [aTrimmed, bTrimmed];
    }

    /**
     * TASK-037: резолвит junction directive `[a, b]` в пару entity1/entity2.
     *
     * Каждый элемент директивы (entity/parent-имя, напр. `task`, `terminal_set`)
     * сопоставляется с relation-полем модели одним из двух способов:
     *   1. По имени поля `<element>Id` (напр. `task` → поле `taskId`).
     *   2. По `relatedModel` поля (напр. `terminal_set` → поле с
     *      relatedModel `terminalSet`, покрывает FK-alias случай parent=X).
     *
     * Порядок `[a, b]` авторитетен: entity1 = resolved(a), entity2 = resolved(b).
     * Возвращаемое значение — `relatedModel` найденного поля (canonical lowerCamel),
     * консистентно с `extractEntityNameFromField` (тот же downstream contract).
     *
     * @throws Error если элемент директивы не сопоставляется ни с одним relation-полем.
     */
    private static resolveJunctionDirective(
        model: ServerpodModel,
        directive: [string, string],
    ): { entity1: string; entity2: string } {
        const entity1 = this.resolveJunctionElement(model, directive[0]);
        const entity2 = this.resolveJunctionElement(model, directive[1]);
        return { entity1, entity2 };
    }

    /**
     * TASK-037: сопоставляет один элемент директивы с relation-полем и возвращает
     * его canonical entity-имя (`relatedModel` / strip-Id fallback).
     */
    private static resolveJunctionElement(model: ServerpodModel, element: string): string {
        const relationFields = model.fields.filter(f => f.isRelation);

        // Кандидат в lowerCamel для сравнения с relatedModel (директива может быть
        // в snake_case: `terminal_set`). Не throw'аем на невалидный snake — просто
        // используем element как есть для второго способа сопоставления.
        let elementCamel = element;
        try {
            elementCamel = snakeToLowerCamelCase(element);
        } catch {
            elementCamel = element;
        }
        const expectedFieldName = `${elementCamel}Id`;

        for (const field of relationFields) {
            // Способ 1: имя поля = `<element>Id`.
            if (field.name === expectedFieldName || field.name === `${element}Id`) {
                return this.extractEntityNameFromField(field) ?? elementCamel;
            }
            // Способ 2: relatedModel поля совпадает с элементом (FK-alias / parent=X).
            const related = this.extractEntityNameFromField(field);
            if (related && (related === elementCamel || related === element)) {
                return related;
            }
        }

        const available = relationFields.map(f => f.name).join(', ') || '(нет relation-полей)';
        throw new Error(
            `Entity "${model.className}" junction directive references "${element}", `
            + `but no relation field matches it (expected field "${expectedFieldName}" or a `
            + `relation with parent="${element}"). Available relation fields: [${available}].`,
        );
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
