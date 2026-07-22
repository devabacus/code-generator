import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generateDriftTableImports } from '../../features/generation/generators/relation_generation';
import { GenerationConfig } from '../../features/generation/config/generation_config';
import { ServerpodModel, ServerpodField } from '../../features/generation/parsers/formatters/types';

/**
 * TASK-016 / BUG-012 — `generateDriftTableImports` regression suite.
 *
 * Coverage: производственный landmine `terminalSet_table.dart` filename для
 * multi-word lowerCamel `relatedModel`. После parser fix `parent=terminal_set`
 * → `relatedModel='terminalSet'` (lowerCamel). Без `toSnakeCase()` wrap файлы
 * получают broken `terminalSet_table.dart` имя вместо `terminal_set_table.dart`.
 *
 * Тесты используют non-existent `featuresPath` — `findTableInFeatures` возвращает
 * null, fallback path выполняется, и мы видим именно generated filename без
 * disk-resolution side effects.
 */
suite('generateDriftTableImports — BUG-012 snake_case path normalization', () => {

    function makeConfig(): GenerationConfig {
        return new GenerationConfig({
            templProject: 't115',
            templEntity: 'order',
            targetEntity: 'Order',
            templatesPath: '/nonexistent/templates',
            projectsPath: '/nonexistent/projects',
            targetProject: 'test_project',
            workspacesPath: '/nonexistent/workspaces/test_project',
            // Целенаправленно несуществующий path — тест на pure filename derivation.
            targetFeaturePath: '/nonexistent/workspaces/test_project/test_project_flutter/lib/features/orders',
        });
    }

    function fkField(name: string, related: string): ServerpodField {
        return {
            name,
            type: 'UuidValue',
            nullable: false,
            isRelation: true,
            relationType: 'manyToOne',
            relatedModel: related,
        };
    }

    function makeModel(fields: ServerpodField[]): ServerpodModel {
        return {
            className: 'Order',
            tableName: 'order',
            isRelation: false,
            fields: [
                { name: 'id', type: 'UuidValue', nullable: true },
                { name: 'userId', type: 'int', nullable: false },
                ...fields,
            ],
        };
    }

    test('single-word lowerCamel: relatedModel=member → import "member_table.dart"', () => {
        const model = makeModel([fkField('assigneeId', 'member')]);
        const result = generateDriftTableImports(model, makeConfig());

        assert.strictEqual(result, "import 'member_table.dart';",
            'Single-word lowerCamel parent → snake-case filename (no-op для single word)');
    });

    test('multi-word lowerCamel: relatedModel=terminalSet → import "terminal_set_table.dart"', () => {
        // Production landmine — confirmed weight customer_user.spy.yaml:
        //   defaultTerminalSetId, parent=terminal_set
        // After parser fix, relatedModel='terminalSet'. Filename должен быть snake.
        const model = makeModel([fkField('defaultTerminalSetId', 'terminalSet')]);
        const result = generateDriftTableImports(model, makeConfig());

        assert.strictEqual(result, "import 'terminal_set_table.dart';",
            'BUG-012: terminalSet → terminal_set_table.dart (НЕ terminalSet_table.dart)');

        // NEGATIVE: broken landmine string.
        assert.ok(
            !result.includes('terminalSet_table.dart'),
            'BUG-012 landmine: terminalSet_table.dart НЕ должен присутствовать',
        );
    });

    test('three-word lowerCamel: relatedModel=accessControlPolicy → import "access_control_policy_table.dart"', () => {
        const model = makeModel([fkField('policyId', 'accessControlPolicy')]);
        const result = generateDriftTableImports(model, makeConfig());

        assert.strictEqual(result, "import 'access_control_policy_table.dart';");
    });

    test('multiple FK fields: deduped + each snake_case', () => {
        const model = makeModel([
            fkField('assigneeId', 'teamMember'),
            fkField('reporterId', 'teamMember'),  // duplicate relatedModel
            fkField('priorityId', 'taskPriority'),
        ]);
        const result = generateDriftTableImports(model, makeConfig());

        // Set dedup → 2 distinct imports.
        assert.ok(result.includes("import 'team_member_table.dart';"));
        assert.ok(result.includes("import 'task_priority_table.dart';"));
        // Должно быть ровно 2 lines.
        const lineCount = result.split('\n').length;
        assert.strictEqual(lineCount, 2, 'duplicate relatedModel → один import');
    });

    test('customerId excluded (system field, не FK для table imports)', () => {
        const model = makeModel([
            fkField('customerId', 'customer'),       // excluded
            fkField('assigneeId', 'member'),
        ]);
        const result = generateDriftTableImports(model, makeConfig());

        assert.strictEqual(result, "import 'member_table.dart';",
            'customerId должен быть skipped (system field, не FK target)');
    });

    test('no relations → empty string', () => {
        const model = makeModel([]);
        const result = generateDriftTableImports(model, makeConfig());

        assert.strictEqual(result, '');
    });
});

/**
 * BUG-015 (TASK-039) — cross-feature junction table imports.
 *
 * Junction, у которого parent-таблицы живут в РАЗНЫХ features (напр. `author` в
 * feature `authors`, `book` в feature `books`, junction `author_book_map` — в
 * `authors`). Drift `references(BookTable, #id)` требует, чтобы `book_table.dart`
 * был импортирован по КОРРЕКТНОМУ cross-feature пути, а не как плоский sibling
 * `import 'book_table.dart';` (который резолвится в feature junction'а, где файла нет
 * → `BookTable is not a class!` на build_runner).
 *
 * `generateDriftTableImports` уже умеет sibling-features lookup
 * (`findTableInFeatures` через `config.featuresPath`) — эти тесты фиксируют, что для
 * junction-модели он выдаёт правильный относительный путь до parent из чужой feature,
 * при этом same-feature parent остаётся плоским sibling'ом.
 *
 * Используется РЕАЛЬНАЯ temp-структура на диске (не Mock) — потому что
 * `generateDriftTableImports` ходит в `fs` напрямую (`fs.existsSync`,
 * `fs.readdirSync`, `path.relative`).
 */
suite('generateDriftTableImports — BUG-015 cross-feature junction resolution', () => {
    let tmpRoot: string;
    let featuresDir: string;
    const project = 'test';

    function junctionModel(): ServerpodModel {
        return {
            className: 'AuthorBookMap',
            tableName: 'author_book_map',
            isRelation: true,
            fields: [
                { name: 'id', type: 'UuidValue', nullable: true },
                { name: 'authorId', type: 'UuidValue', nullable: false, isRelation: true, relationType: 'manyToOne', relatedModel: 'author' },
                { name: 'bookId', type: 'UuidValue', nullable: false, isRelation: true, relationType: 'manyToOne', relatedModel: 'book' },
                { name: 'userId', type: 'int', nullable: false },
                { name: 'customerId', type: 'UuidValue', nullable: false, isRelation: true, relationType: 'manyToOne', relatedModel: 'customer' },
            ],
        };
    }

    function makeTablesDir(feature: string): string {
        const dir = path.join(featuresDir, feature, 'data', 'datasources', 'local', 'tables');
        fs.mkdirSync(dir, { recursive: true });
        return dir;
    }

    function junctionConfig(junctionFeature: string): GenerationConfig {
        return new GenerationConfig({
            templProject: 't115',
            templEntity: 'task',
            targetEntity: 'AuthorBookMap',
            templatesPath: '/nonexistent/templates',
            projectsPath: '/nonexistent/projects',
            targetProject: project,
            workspacesPath: tmpRoot,
            targetFeaturePath: path.join(featuresDir, junctionFeature),
        });
    }

    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bug015-'));
        featuresDir = path.join(tmpRoot, `${project}_flutter`, 'lib', 'features');
        fs.mkdirSync(featuresDir, { recursive: true });
    });

    teardown(() => {
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
    });

    test('cross-feature: same-feature parent = плоский sibling, чужая feature = относительный путь', () => {
        // author_table в authors (feature junction'а), book_table в books.
        fs.writeFileSync(path.join(makeTablesDir('authors'), 'author_table.dart'), '// author');
        fs.writeFileSync(path.join(makeTablesDir('books'), 'book_table.dart'), '// book');

        const result = generateDriftTableImports(junctionModel(), junctionConfig('authors'));

        assert.ok(
            result.includes("import 'author_table.dart';"),
            'author_table (same feature) должен остаться плоским sibling-импортом',
        );
        assert.ok(
            result.includes("import '../../../../../books/data/datasources/local/tables/book_table.dart';"),
            `book_table (чужая feature) должен резолвиться в cross-feature путь. Получено:\n${result}`,
        );
        // NEGATIVE: broken плоский sibling для чужой feature НЕ должен присутствовать.
        assert.ok(
            !/^import 'book_table\.dart';$/m.test(result),
            `BUG-015 landmine: плоский import 'book_table.dart' резолвится в feature junction'а (нет файла) → BookTable is not a class!.\n${result}`,
        );
    });

    test('оба parent в чужих features → оба резолвятся cross-feature', () => {
        // Junction в feature `links`, оба parent (author/book) в своих features.
        fs.writeFileSync(path.join(makeTablesDir('authors'), 'author_table.dart'), '// author');
        fs.writeFileSync(path.join(makeTablesDir('books'), 'book_table.dart'), '// book');
        makeTablesDir('links'); // junction feature, no parent tables inside

        const result = generateDriftTableImports(junctionModel(), junctionConfig('links'));

        assert.ok(
            result.includes("import '../../../../../authors/data/datasources/local/tables/author_table.dart';"),
            `author_table должен резолвиться cross-feature. Получено:\n${result}`,
        );
        assert.ok(
            result.includes("import '../../../../../books/data/datasources/local/tables/book_table.dart';"),
            `book_table должен резолвиться cross-feature. Получено:\n${result}`,
        );
        assert.ok(!result.includes('customer'), 'customerId excluded — parent customer не импортируется');
    });

    test('same-feature junction (control): оба parent в feature junction → оба плоские sibling', () => {
        // Регрессионный контроль — t201-сценарий: author/book/junction в одной feature.
        const tables = makeTablesDir('library');
        fs.writeFileSync(path.join(tables, 'author_table.dart'), '// author');
        fs.writeFileSync(path.join(tables, 'book_table.dart'), '// book');

        const result = generateDriftTableImports(junctionModel(), junctionConfig('library'));

        assert.ok(result.includes("import 'author_table.dart';"), 'author_table плоский sibling');
        assert.ok(result.includes("import 'book_table.dart';"), 'book_table плоский sibling');
        assert.ok(!result.includes('/data/datasources/'), 'same-feature → без cross-feature путей');
    });
});
