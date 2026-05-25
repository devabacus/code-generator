import { cap, pluralConvert, toSnakeCase, unCap } from "../../../utils/text_work/text_util";
import { ReplacementRule } from "../generators/replacing_file_processor";
import { GenerationConfig } from "../config/generation_config";

export const Dictionaries = {
    COMMON: 'common',
    ENTITY: 'entity',
    MANY_TO_MANY: 'manyToMany',
} as const;

export type DictionaryName = typeof Dictionaries[keyof typeof Dictionaries];

type RuleGenerator = (config: GenerationConfig) => ReplacementRule[];

const dictionaryRegistry: Record<DictionaryName, RuleGenerator> = {
    [Dictionaries.COMMON]: (config) => [
        { from: config.templProject, to: config.targetProject },
    ],
    [Dictionaries.ENTITY]: (config) => {
        if (!config.targetEntity) { return []; }

        const baseForms = {
            Ds: pluralConvert(cap(config.templEntity)),
            ds: pluralConvert(unCap(config.templEntity)),
            D: cap(config.templEntity),
            d: unCap(config.templEntity),
        };

        const newForms = {
            Ds: pluralConvert(cap(config.targetEntity)),
            ds: pluralConvert(unCap(config.targetEntity)),
            D: cap(config.targetEntity),
            d: unCap(config.targetEntity),
            // snake_case form для путей и snake_case-идентификаторов (BUG-002)
            // например `category_table.dart` → `correction_button_table.dart`
            dSnake: toSnakeCase(unCap(config.targetEntity)),
        };

        return [
            { from: baseForms.Ds, to: newForms.Ds },
            { from: baseForms.ds, to: newForms.ds },
            { from: baseForms.D, to: newForms.D },
            // snake-case rule должен идти ПЕРЕД camelCase d-rule:
            // ловит `category` за которым следует `_`, `/`, `.dart`, либо quote `'`/`"`
            // (entityType string literals). Не трогает `categoryTable`, `category.id` и
            // подобные identifier-контексты — те обрабатываются d-rule.
            // TASK-026 (weight TASK-019 Bug 1 pack): quote-boundary добавлен для
            // устранения mismatch между `_<entity>EntityType = 'cargoType'` (camelCase) и
            // orchestrator registration `'cargo_type'` (snake) — sync push/pull
            // молча не находили bundle для multi-word entity (weight TASK-019).
            { from: `${baseForms.d}(?=_|/|\\.dart\\b|'|")`, to: newForms.dSnake },
            { from: baseForms.d, to: newForms.d },
        ];
    },

    [Dictionaries.MANY_TO_MANY]: (config) => {
        if (!config.targetEntity1 || !config.targetEntity2) { return []; }

        // TASK-014: template entity names параметризованы через config (default `task`/`tag`
        // для t115 TaskTagMap baseline). Раньше hardcoded — это значит non-Map junctions
        // (RolePermission, CustomerUser) получали неправильный rewrite — `task` менялся на
        // `role`, `tag` на `permission`, но `taskTagMap`/`task_tag_map`/`TaskTagMap` literals
        // оставались без изменений → класс становился `RolePermissionMap` вместо `RolePermission`.
        const templEntity1 = config.templEntity1;
        const templEntity2 = config.templEntity2;

        // TASK-014: junction class name substitution. Template имеет literals
        // `TaskTagMap` (PascalCase), `taskTagMap` (camelCase), `task_tag_map` (snake_case).
        // Для targetJunctionClassName = `RolePermission` нужно заменить эти literals на
        // `RolePermission` / `rolePermission` / `role_permission` (без `Map` суффикса).
        // Backward compat: если targetJunctionClassName = `TaskTagMap` — substitution
        // identity (no-op). Если empty — propagate legacy `<E1><E2>Map` shape (BackCompat
        // для старых VS Code callers, которые не set'ят `targetJunctionClassName`).
        const tplJunctionPascal = cap(templEntity1) + cap(templEntity2) + 'Map';
        const tplJunctionCamel = unCap(templEntity1) + cap(templEntity2) + 'Map';
        const tplJunctionSnake = `${toSnakeCase(unCap(templEntity1))}_${toSnakeCase(unCap(templEntity2))}_map`;

        let targetJunctionPascal: string;
        let targetJunctionCamel: string;
        let targetJunctionSnake: string;
        if (config.targetJunctionClassName && config.targetJunctionClassName.length > 0) {
            targetJunctionPascal = cap(config.targetJunctionClassName);
            targetJunctionCamel = unCap(config.targetJunctionClassName);
            targetJunctionSnake = toSnakeCase(unCap(config.targetJunctionClassName));
        } else {
            // Legacy fallback: имя `<E1><E2>Map` (backward compat для VS Code path
            // который не set'ит targetJunctionClassName).
            targetJunctionPascal = cap(config.targetEntity1) + cap(config.targetEntity2) + 'Map';
            targetJunctionCamel = unCap(config.targetEntity1) + cap(config.targetEntity2) + 'Map';
            targetJunctionSnake = `${toSnakeCase(unCap(config.targetEntity1))}_${toSnakeCase(unCap(config.targetEntity2))}_map`;
        }

        const rules: ReplacementRule[] = [];

        // 1) Junction class name substitution идёт ПЕРВЫМ — длинные tokens заменяются
        //    раньше чем подкомпоненты `task`/`tag`, иначе entity1/entity2 substitutions
        //    разорвут junction literal в середине (e.g. `task_tag_map` → `role_tag_map`
        //    после первой замены). Snake_case длиннее camelCase/PascalCase, поэтому идёт
        //    первым в группе.
        rules.push(
            { from: tplJunctionSnake, to: targetJunctionSnake },
            { from: tplJunctionPascal, to: targetJunctionPascal },
            { from: tplJunctionCamel, to: targetJunctionCamel },
        );

        rules.push(
            { from: pluralConvert(cap(templEntity1)), to: pluralConvert(cap(config.targetEntity1)) },
            { from: cap(templEntity1), to: cap(config.targetEntity1) },
            // TASK-026: quote-boundary в lookahead (симметрично ENTITY snake-rule)
            { from: `${unCap(templEntity1)}(?=_|/|\\.dart\\b|'|")`, to: toSnakeCase(unCap(config.targetEntity1)) },
            { from: unCap(templEntity1), to: unCap(config.targetEntity1) },
        );

        rules.push(
            { from: pluralConvert(cap(templEntity2)), to: pluralConvert(cap(config.targetEntity2)) },
            { from: cap(templEntity2), to: cap(config.targetEntity2) },
            // TASK-026: quote-boundary в lookahead (симметрично ENTITY snake-rule)
            { from: `${unCap(templEntity2)}(?=_|/|\\.dart\\b|'|")`, to: toSnakeCase(unCap(config.targetEntity2)) },
            { from: unCap(templEntity2), to: unCap(config.targetEntity2) },
        );
        return rules;
    },
};


export function getDictionaryRules(dictionaries: readonly DictionaryName[], config: GenerationConfig): ReplacementRule[] {
    const allRules: ReplacementRule[] = [];

    for (const dictName of dictionaries) {
        const ruleGenerator = dictionaryRegistry[dictName];
        if (ruleGenerator) {
            allRules.push(...ruleGenerator(config));
        }
    }

    return allRules;
}
