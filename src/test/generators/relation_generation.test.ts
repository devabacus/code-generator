import * as assert from 'assert';
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
