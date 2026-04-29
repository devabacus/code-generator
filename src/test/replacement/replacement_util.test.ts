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
