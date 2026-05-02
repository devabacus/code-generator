import * as assert from 'assert';
import { getDictionaryRules, Dictionaries } from '../../features/generation/replacement/replacement_util';
import { GenerationConfig } from '../../features/generation/config/generation_config';

function applyRules(content: string, rules: { from: string | RegExp; to: string }[]): string {
    let result = content;
    for (const rule of rules) {
        const re = rule.from instanceof RegExp ? rule.from : new RegExp(rule.from, 'g');
        result = result.replace(re, rule.to);
    }
    return result;
}

function configFor(targetEntity: string): GenerationConfig {
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

suite('Replacement Dictionary — ENTITY rules (BUG-002)', () => {

    test('multi-word entity: file path uses snake_case (correction_button_dao.dart)', () => {
        const rules = getDictionaryRules([Dictionaries.ENTITY], configFor('correctionButton'));
        const result = applyRules("import '../tables/category_table.dart';", rules);
        assert.strictEqual(result, "import '../tables/correction_button_table.dart';");
    });

    test('multi-word entity: directory uses snake_case (correction_button/)', () => {
        const rules = getDictionaryRules([Dictionaries.ENTITY], configFor('correctionButton'));
        const result = applyRules("import '../models/category/category_model.dart';", rules);
        assert.strictEqual(result, "import '../models/correction_button/correction_button_model.dart';");
    });

    test('multi-word entity: standalone .dart filename uses snake_case', () => {
        const rules = getDictionaryRules([Dictionaries.ENTITY], configFor('correctionButton'));
        const result = applyRules("part 'category.dart';", rules);
        assert.strictEqual(result, "part 'correction_button.dart';");
    });

    test('multi-word entity: variable identifier stays camelCase (categoryDao)', () => {
        const rules = getDictionaryRules([Dictionaries.ENTITY], configFor('correctionButton'));
        const result = applyRules('final CategoryDao _categoryDao = CategoryDao();', rules);
        assert.strictEqual(result, 'final CorrectionButtonDao _correctionButtonDao = CorrectionButtonDao();');
    });

    test('multi-word entity: Drift global getter stays camelCase (categoryTable)', () => {
        const rules = getDictionaryRules([Dictionaries.ENTITY], configFor('correctionButton'));
        const result = applyRules('select(categoryTable)..where(...)', rules);
        assert.strictEqual(result, 'select(correctionButtonTable)..where(...)');
    });

    test('multi-word entity: dot-access stays camelCase (category.id)', () => {
        const rules = getDictionaryRules([Dictionaries.ENTITY], configFor('correctionButton'));
        const result = applyRules('return category.id;', rules);
        assert.strictEqual(result, 'return correctionButton.id;');
    });

    test('multi-word entity: PascalCase class name (Category)', () => {
        const rules = getDictionaryRules([Dictionaries.ENTITY], configFor('correctionButton'));
        const result = applyRules('class Category extends Entity {}', rules);
        assert.strictEqual(result, 'class CorrectionButton extends Entity {}');
    });

    test('multi-word entity: plural lower (categories)', () => {
        const rules = getDictionaryRules([Dictionaries.ENTITY], configFor('correctionButton'));
        const result = applyRules('Future<List> getCategories() => _local.getCategories();', rules);
        assert.strictEqual(result, 'Future<List> getCorrectionButtons() => _local.getCorrectionButtons();');
    });

    test('multi-word entity: plural Pascal (Categories)', () => {
        const rules = getDictionaryRules([Dictionaries.ENTITY], configFor('correctionButton'));
        const result = applyRules('class CategoriesProvider {}', rules);
        assert.strictEqual(result, 'class CorrectionButtonsProvider {}');
    });

    test('single-word entity (gadget): paths and identifiers both lowercase', () => {
        const rules = getDictionaryRules([Dictionaries.ENTITY], configFor('gadget'));
        // path
        assert.strictEqual(
            applyRules("import '../tables/category_table.dart';", rules),
            "import '../tables/gadget_table.dart';"
        );
        // identifier
        assert.strictEqual(
            applyRules('select(categoryTable)', rules),
            'select(gadgetTable)'
        );
        // Pascal class
        assert.strictEqual(
            applyRules('class CategoryDao {}', rules),
            'class GadgetDao {}'
        );
    });

    test('mixed content: complex Dart fragment converts cleanly', () => {
        const rules = getDictionaryRules([Dictionaries.ENTITY], configFor('cargoType'));
        const input = `import '../tables/category_table.dart';
import '../models/category/category_model.dart';
class CategoryDao {
  final categoryTable = CategoryTable();
  Future<Category> findCategoryById(String id) async {
    return Category.empty();
  }
}`;
        const expected = `import '../tables/cargo_type_table.dart';
import '../models/cargo_type/cargo_type_model.dart';
class CargoTypeDao {
  final cargoTypeTable = CargoTypeTable();
  Future<CargoType> findCargoTypeById(String id) async {
    return CargoType.empty();
  }
}`;
        assert.strictEqual(applyRules(input, rules), expected);
    });

    test('ENTITY rules are empty when targetEntity is unset', () => {
        const config = new GenerationConfig({
            templProject: 't115',
            templEntity: 'category',
            templatesPath: '/test',
            projectsPath: '/test',
            targetProject: 'weight',
            workspacesPath: '/test',
        });
        const rules = getDictionaryRules([Dictionaries.ENTITY], config);
        assert.strictEqual(rules.length, 0);
    });
});

// ── TASK-014: M2M rules — junction file path/class generation ──────────────────

function m2mConfig(opts: {
    targetEntity1: string;
    targetEntity2: string;
    targetJunctionClassName?: string;
    templEntity1?: string;
    templEntity2?: string;
}): GenerationConfig {
    return new GenerationConfig({
        templProject: 't115',
        templEntity: 'category',
        targetEntity: '',
        targetEntity1: opts.targetEntity1,
        targetEntity2: opts.targetEntity2,
        targetJunctionClassName: opts.targetJunctionClassName,
        templEntity1: opts.templEntity1,
        templEntity2: opts.templEntity2,
        templatesPath: '/test/templates',
        projectsPath: '/test/projects',
        targetProject: 'weight',
        templFeatureName: 'tasks',
        targetFeaturePath: '/test/dest',
        workspacesPath: '/test',
    });
}

suite('Replacement Dictionary — MANY_TO_MANY rules (TASK-014)', () => {

    test('TASK-014 backward compat: TaskTagMap target → identical substitutions for class names + paths', () => {
        // Backward compat: TaskTagMap caller (default templEntity1='task'/templEntity2='tag'
        // + targetJunctionClassName='TaskTagMap') → all junction substitutions identity (no-op)
        // for TaskTagMap-targeted generation.
        const rules = getDictionaryRules(
            [Dictionaries.MANY_TO_MANY],
            m2mConfig({
                targetEntity1: 'task',
                targetEntity2: 'tag',
                targetJunctionClassName: 'TaskTagMap',
            }),
        );

        // PascalCase class — identity.
        assert.strictEqual(
            applyRules('class TaskTagMap extends Entity {}', rules),
            'class TaskTagMap extends Entity {}',
        );
        // snake_case path — identity.
        assert.strictEqual(
            applyRules("import '../adapters/task_tag_map/task_tag_map_dao.dart';", rules),
            "import '../adapters/task_tag_map/task_tag_map_dao.dart';",
        );
        // camelCase identifier — identity.
        assert.strictEqual(
            applyRules('final taskTagMap = TaskTagMap();', rules),
            'final taskTagMap = TaskTagMap();',
        );
    });

    test('TASK-014: RolePermission target → правильные substitutions без Map suffix leak', () => {
        // Critical case: non-Map junction. `TaskTagMap` literals в template должны
        // замениться на `RolePermission` (НЕ `RolePermissionMap`). Это закрывает
        // adversarial Bomb #2 — раньше template `Map` суффикс leak'ал в class name.
        const rules = getDictionaryRules(
            [Dictionaries.MANY_TO_MANY],
            m2mConfig({
                targetEntity1: 'role',
                targetEntity2: 'permission',
                targetJunctionClassName: 'RolePermission',
            }),
        );

        // Class name: TaskTagMap → RolePermission (NO Map suffix).
        assert.strictEqual(
            applyRules('class TaskTagMap extends Entity {}', rules),
            'class RolePermission extends Entity {}',
        );
        // Path: task_tag_map → role_permission (NO _map suffix).
        assert.strictEqual(
            applyRules("import '../adapters/task_tag_map/task_tag_map_dao.dart';", rules),
            "import '../adapters/role_permission/role_permission_dao.dart';",
        );
        // camelCase identifier.
        assert.strictEqual(
            applyRules('final taskTagMap = TaskTagMap();', rules),
            'final rolePermission = RolePermission();',
        );
        // Plural form.
        assert.strictEqual(
            applyRules('Future<List<TaskTagMap>> getTaskTagMaps();', rules),
            'Future<List<RolePermission>> getRolePermissions();',
        );
    });

    test('TASK-014: legacy fallback (no targetJunctionClassName) → <E1><E2>Map shape (VS Code path backward compat)', () => {
        // Если targetJunctionClassName empty (legacy VS Code call path), substitution
        // produces `<E1><E2>Map` shape — это identical к pre-TASK-014 output для
        // backward compat: VS Code не set'ил `targetJunctionClassName`, и до TASK-014
        // словарь только заменял `task→role` / `tag→permission` (Map оставлял).
        const rules = getDictionaryRules(
            [Dictionaries.MANY_TO_MANY],
            m2mConfig({
                targetEntity1: 'role',
                targetEntity2: 'permission',
                // targetJunctionClassName не set — fallback path.
            }),
        );

        // Class — RolePermissionMap (legacy *Map shape).
        assert.strictEqual(
            applyRules('class TaskTagMap extends Entity {}', rules),
            'class RolePermissionMap extends Entity {}',
        );
        // Path — role_permission_map.
        assert.strictEqual(
            applyRules("import '../adapters/task_tag_map/task_tag_map_dao.dart';", rules),
            "import '../adapters/role_permission_map/role_permission_map_dao.dart';",
        );
    });
});

