import * as assert from 'assert';
import { getDictionaryRules, Dictionaries } from '../../features/generation/replacement/replacement_util';
import { GenerationConfig } from '../../features/generation/config/generation_config';

/**
 * TASK-026 (Bug 1 из weight TASK-019 sync_core pack) — quote-boundary в ENTITY +
 * MANY_TO_MANY snake-rule lookahead.
 *
 * **Корень бага:** template'ы simplified `*_repository_impl.dart` + `*_event_adapter.dart`
 * содержат `const String _categoryEntityType = 'category';`. Для multi-word target
 * (e.g. `CargoType`) literal `'category'` имел за собой `'` (single quote), который
 * **НЕ** входил в snake-rule lookahead `(?=_|/|\\.dart\\b)` → срабатывал camelCase
 * d-rule → результат `'cargoType'`. Но `orchestrator_patcher.ts` использует
 * `toSnakeCase(unCap(...))` для registration → `'cargo_type'`. **Mismatch** между
 * `_<entity>EntityType` и orchestrator key → sync_core не находил bundle → push/pull
 * молча не срабатывали для 7 multi-word сущностей weight.
 *
 * **Фикс TASK-026:** расширить lookahead до `(?=_|/|\\.dart\\b|'|")` — quote-boundary
 * включён в snake-context (любой literal в кавычках — это string которая должна
 * быть snake_case для sync_core entityType, JSON payload keys, etc.).
 *
 * **Симметрия:** MANY_TO_MANY entity1/entity2 snake-rules расширены аналогично
 * для consistency (хотя junction literals в кавычках редки — pattern coherency).
 */

function applyRules(content: string, rules: { from: string | RegExp; to: string }[]): string {
    let result = content;
    for (const rule of rules) {
        const re = rule.from instanceof RegExp ? rule.from : new RegExp(rule.from, 'g');
        result = result.replace(re, rule.to);
    }
    return result;
}

function configForEntity(targetEntity: string): GenerationConfig {
    return new GenerationConfig({
        templProject: 't115',
        templEntity: 'category',
        targetEntity,
        templatesPath: '/test/templates',
        projectsPath: '/test/projects',
        targetProject: 'weight',
        templFeatureName: 'tasks',
        targetFeaturePath: '/test/dest',
        workspacesPath: '/test',
    });
}

function configForJunction(
    targetEntity1: string,
    targetEntity2: string,
    targetJunctionClassName?: string,
): GenerationConfig {
    return new GenerationConfig({
        templProject: 't115',
        templEntity: 'category',
        targetEntity: 'category',
        templatesPath: '/test/templates',
        projectsPath: '/test/projects',
        targetProject: 'weight',
        templFeatureName: 'tasks',
        targetFeaturePath: '/test/dest',
        workspacesPath: '/test',
        templEntity1: 'task',
        templEntity2: 'tag',
        targetEntity1,
        targetEntity2,
        targetJunctionClassName,
    });
}

suite('TASK-026: ENTITY snake-rule — quote-boundary в lookahead (Bug 1)', () => {

    test("single quote: 'category' → 'cargo_type' (multi-word target)", () => {
        const config = configForEntity('cargoType');
        const rules = getDictionaryRules([Dictionaries.COMMON, Dictionaries.ENTITY], config);
        const input = "const String _categoryEntityType = 'category';";
        const expected = "const String _cargoTypeEntityType = 'cargo_type';";
        assert.strictEqual(applyRules(input, rules), expected);
    });

    test('double quote: "category" → "cargo_type" (JSON/payload context)', () => {
        const config = configForEntity('cargoType');
        const rules = getDictionaryRules([Dictionaries.COMMON, Dictionaries.ENTITY], config);
        const input = 'const String key = "category";';
        const expected = 'const String key = "cargo_type";';
        assert.strictEqual(applyRules(input, rules), expected);
    });

    test('identifier context preserved: categoryTable → cargoTypeTable (camelCase rule, не snake)', () => {
        const config = configForEntity('cargoType');
        const rules = getDictionaryRules([Dictionaries.COMMON, Dictionaries.ENTITY], config);
        const input = 'final db = ref.read(databaseProvider); final list = db.select(categoryTable).get();';
        const expected = 'final db = ref.read(databaseProvider); final list = db.select(cargoTypeTable).get();';
        assert.strictEqual(applyRules(input, rules), expected);
    });

    test('.field context preserved: category.id → cargoType.id (camelCase, не snake)', () => {
        const config = configForEntity('cargoType');
        const rules = getDictionaryRules([Dictionaries.COMMON, Dictionaries.ENTITY], config);
        const input = 'return CategoryEntity(id: category.id, name: category.name);';
        const expected = 'return CargoTypeEntity(id: cargoType.id, name: cargoType.name);';
        assert.strictEqual(applyRules(input, rules), expected);
    });

    test("single-word target Member: 'category' → 'member' (snake==camel, regression check)", () => {
        const config = configForEntity('member');
        const rules = getDictionaryRules([Dictionaries.COMMON, Dictionaries.ENTITY], config);
        const input = "const String _categoryEntityType = 'category';";
        const expected = "const String _memberEntityType = 'member';";
        assert.strictEqual(applyRules(input, rules), expected);
    });

    test('path/file context still works: category_table.dart → cargo_type_table.dart (regression BUG-002)', () => {
        const config = configForEntity('cargoType');
        const rules = getDictionaryRules([Dictionaries.COMMON, Dictionaries.ENTITY], config);
        const input = "import '../tables/category_table.dart';";
        const expected = "import '../tables/cargo_type_table.dart';";
        assert.strictEqual(applyRules(input, rules), expected);
    });

    test('end-to-end repository_impl snippet: declaration + payload (canonical case from weight TASK-019)', () => {
        const config = configForEntity('cargoType');
        const rules = getDictionaryRules([Dictionaries.COMMON, Dictionaries.ENTITY], config);
        const input = [
            "const String _categoryEntityType = 'category';",
            '',
            'class CategoryRepositoryImpl implements ICategoryRepository {',
            '  Future<void> createCategory(CategoryEntity category) async {',
            '    await _orchestrator.enqueue(scope, _categoryEntityType, category.id, op, payload);',
            '  }',
            '}',
        ].join('\n');
        const expected = [
            "const String _cargoTypeEntityType = 'cargo_type';",
            '',
            'class CargoTypeRepositoryImpl implements ICargoTypeRepository {',
            '  Future<void> createCargoType(CargoTypeEntity cargoType) async {',
            '    await _orchestrator.enqueue(scope, _cargoTypeEntityType, cargoType.id, op, payload);',
            '  }',
            '}',
        ].join('\n');
        assert.strictEqual(applyRules(input, rules), expected);
    });
});

suite('TASK-026: MANY_TO_MANY snake-rule — quote-boundary в lookahead (симметрия)', () => {

    test("M2M entity1 single quote: 'task' → 'cargo_type' (multi-word target)", () => {
        const config = configForJunction('cargoType', 'tag');
        const rules = getDictionaryRules([Dictionaries.MANY_TO_MANY], config);
        const input = "const String _taskKey = 'task';";
        const expected = "const String _cargoTypeKey = 'cargo_type';";
        assert.strictEqual(applyRules(input, rules), expected);
    });

    test("M2M entity2 single quote: 'tag' → 'custom_field' (multi-word target)", () => {
        const config = configForJunction('task', 'customField');
        const rules = getDictionaryRules([Dictionaries.MANY_TO_MANY], config);
        const input = "const String _tagKey = 'tag';";
        const expected = "const String _customFieldKey = 'custom_field';";
        assert.strictEqual(applyRules(input, rules), expected);
    });

    test('M2M entity1 identifier context preserved: taskTable → cargoTypeTable', () => {
        const config = configForJunction('cargoType', 'tag');
        const rules = getDictionaryRules([Dictionaries.MANY_TO_MANY], config);
        const input = 'db.select(taskTable).get();';
        const expected = 'db.select(cargoTypeTable).get();';
        assert.strictEqual(applyRules(input, rules), expected);
    });
});
