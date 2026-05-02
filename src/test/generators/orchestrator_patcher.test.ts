import * as assert from 'assert';
import { OrchestratorPatcher } from '../../features/generation/generators/orchestrator_patcher';
import { GenerationConfig } from '../../features/generation/config/generation_config';
import { ServerpodModel, ServerpodField } from '../../features/generation/parsers/formatters/types';
import { MockFileSystem } from '../mocks/mock_file_system';

const TEMPLATES_PATH = '/test/templates';
const PROJECTS_PATH = '/test/projects';
const TARGET_PROJECT = 'weight';
const ORCHESTRATOR_PATH = `${PROJECTS_PATH}/${TARGET_PROJECT}/${TARGET_PROJECT}_flutter/lib/core/sync/sync_orchestrator_provider.dart`;

/**
 * Initial orchestrator state — Configuration-only baseline (post-Phase-A0/B).
 * 3 marker pairs обёрнуты вокруг Configuration imports/entityType/register.
 */
const ORCHESTRATOR_BASELINE = `// manifest: startProject
import 'dart:async';

import 'package:sync_core/sync_core.dart';

import '../data/datasources/local/providers/database_provider.dart';
// === generated_start:syncImports ===
import '../../features/configuration/data/adapters/configuration/configuration_event_adapter.dart';
import '../../features/configuration/data/adapters/configuration/configuration_local_apply.dart';
import '../../features/configuration/data/adapters/configuration/configuration_payload_codec.dart';
import '../../features/configuration/data/adapters/configuration/configuration_pull_adapter.dart';
import '../../features/configuration/data/adapters/configuration/configuration_remote_adapter.dart';
import '../../features/configuration/data/datasources/local/daos/configuration/configuration_dao.dart';
import '../../features/configuration/domain/entities/configuration/configuration_entity.dart';
// === generated_end:syncImports ===
import 'app_lifecycle_provider.dart';

const List<String> syncEntityTypes = <String>[
  // === generated_start:syncEntityTypes ===
  'configuration',
  // === generated_end:syncEntityTypes ===
];

SyncOrchestrator syncOrchestrator(Ref ref) {
  final orchestrator = SyncOrchestrator(...);

  // === generated_start:syncRegistrations ===
  // ── Adapter bundle: Configuration ───────────────────────────────────────
  orchestrator.register<ConfigurationEntity>(
    'configuration',
    AdapterBundle<ConfigurationEntity>(
      writeAdapter: ConfigurationRemoteAdapter(client),
      codec: const ConfigurationPayloadCodec(),
      localApply: ConfigurationLocalApply(ConfigurationDao(dbService)),
      pullAdapter: ConfigurationPullAdapter(client),
      eventAdapter: ConfigurationEventAdapter(client),
    ),
  );
  // === generated_end:syncRegistrations ===

  return orchestrator;
}
`;

function makeConfig(): GenerationConfig {
    return new GenerationConfig({
        templProject: 't115',
        templEntity: 'category',
        targetEntity: '',
        templatesPath: TEMPLATES_PATH,
        projectsPath: PROJECTS_PATH,
        targetProject: TARGET_PROJECT,
        templFeatureName: 'tasks',
        targetFeaturePath: `${PROJECTS_PATH}/${TARGET_PROJECT}/${TARGET_PROJECT}_flutter/lib/features/expense`,
        workspacesPath: `${PROJECTS_PATH}/${TARGET_PROJECT}`,
    });
}

function makeModel(className: string): ServerpodModel {
    return {
        className,
        tableName: className.toLowerCase(),
        isRelation: false,
        fields: [
            { name: 'id', type: 'UuidValue', nullable: true },
            { name: 'userId', type: 'int', nullable: false },
            { name: 'customerId', type: 'UuidValue', nullable: false },
        ],
    };
}

suite('OrchestratorPatcher Test Suite', () => {
    let mockFs: MockFileSystem;
    let patcher: OrchestratorPatcher;

    setup(() => {
        mockFs = new MockFileSystem();
        patcher = new OrchestratorPatcher(mockFs);
    });

    test('empty state: no orchestrator file → no-op', async () => {
        // Don't pre-populate orchestrator file.
        await patcher.patch(makeConfig(), makeModel('Expense'));

        const exists = await mockFs.exists(ORCHESTRATOR_PATH);
        assert.strictEqual(exists, false, 'patcher must not create orchestrator file from scratch');
    });

    test('single entity add: 3 marker блока обновлены', async () => {
        mockFs.setFile(ORCHESTRATOR_PATH, ORCHESTRATOR_BASELINE);

        await patcher.patch(makeConfig(), makeModel('Expense'));

        const result = await mockFs.readFile(ORCHESTRATOR_PATH);

        // Imports: добавлен ExpenseRemoteAdapter import
        assert.ok(
            result.includes('expense_remote_adapter.dart'),
            'expense remote adapter import должен присутствовать'
        );
        assert.ok(
            result.includes('expense_dao.dart'),
            'expense_dao.dart import должен присутствовать'
        );
        assert.ok(
            result.includes('expense_entity.dart'),
            'expense_entity.dart import должен присутствовать'
        );

        // Configuration imports preserved
        assert.ok(
            result.includes('configuration_remote_adapter.dart'),
            'Configuration imports должны сохраниться'
        );

        // EntityType: 'expense' добавлен в const list
        assert.ok(
            result.includes(`'expense',`),
            `'expense' entityType должен быть в syncEntityTypes`
        );
        assert.ok(
            result.includes(`'configuration',`),
            `'configuration' entityType должен сохраниться`
        );

        // Register: ExpenseEntity register block
        assert.ok(
            result.includes('register<ExpenseEntity>'),
            'register<ExpenseEntity>(...) должен присутствовать'
        );
        assert.ok(
            result.includes('ExpenseRemoteAdapter(client)'),
            'ExpenseRemoteAdapter(client) должен быть в register block'
        );
        assert.ok(
            result.includes('register<ConfigurationEntity>'),
            'Configuration register block должен сохраниться'
        );
    });

    test('idempotent re-run: повторный patch с тем же model → identical content', async () => {
        mockFs.setFile(ORCHESTRATOR_PATH, ORCHESTRATOR_BASELINE);

        await patcher.patch(makeConfig(), makeModel('Expense'));
        const after1 = await mockFs.readFile(ORCHESTRATOR_PATH);

        await patcher.patch(makeConfig(), makeModel('Expense'));
        const after2 = await mockFs.readFile(ORCHESTRATOR_PATH);

        assert.strictEqual(after1, after2, 'patching twice with same model must yield identical content');

        // Не должно быть дублей
        const expenseImportCount = (after2.match(/expense_remote_adapter\.dart/g) || []).length;
        assert.strictEqual(expenseImportCount, 1, 'expense_remote_adapter.dart должен встречаться ровно 1 раз');

        const expenseRegisterCount = (after2.match(/register<ExpenseEntity>/g) || []).length;
        assert.strictEqual(expenseRegisterCount, 1, 'register<ExpenseEntity> должен встречаться ровно 1 раз');

        // 'expense', встречается дважды по дизайну: в entityTypes list literal и
        // в register block ('expense' arg). Проверяем что **в syncEntityTypes block**
        // ровно 1 раз (без дубликатов от idempotent re-run).
        const entityTypesBlockMatch = after2.match(
            /generated_start:syncEntityTypes[\s\S]*?generated_end:syncEntityTypes/
        );
        assert.ok(entityTypesBlockMatch, 'syncEntityTypes block должен присутствовать');
        const expenseInListCount = (entityTypesBlockMatch![0].match(/'expense',/g) || []).length;
        assert.strictEqual(expenseInListCount, 1, `'expense' в syncEntityTypes должен встречаться ровно 1 раз`);
    });

    test('junction entity (*Map): routing через manyToMany словарь + docstring', async () => {
        mockFs.setFile(ORCHESTRATOR_PATH, ORCHESTRATOR_BASELINE);

        // Junction entity: className.endsWith('Map')
        await patcher.patch(makeConfig(), makeModel('UserPermissionMap'));

        const result = await mockFs.readFile(ORCHESTRATOR_PATH);

        // Имена правильно конвертированы:
        // - PascalCase: UserPermissionMap (регистр не меняется)
        // - snake_case path: user_permission_map
        // - lowercase id: 'user_permission_map'
        assert.ok(
            result.includes('user_permission_map_remote_adapter.dart'),
            'junction remote adapter import (snake_case) должен присутствовать'
        );
        assert.ok(
            result.includes(`'user_permission_map',`),
            `junction entityType id (snake_case) должен быть`
        );
        assert.ok(
            result.includes('register<UserPermissionMapEntity>'),
            'junction register должен использовать PascalCase + Entity suffix'
        );

        // Junction-specific docstring
        assert.ok(
            result.includes('Junction-specific'),
            'junction docstring "Junction-specific" должен присутствовать'
        );
    });

    test('multiple entities sequential: 3 add\'а → 3 register блока + 3 imports + 3 entries', async () => {
        mockFs.setFile(ORCHESTRATOR_PATH, ORCHESTRATOR_BASELINE);

        await patcher.patch(makeConfig(), makeModel('Expense'));
        await patcher.patch(makeConfig(), makeModel('Income'));
        await patcher.patch(makeConfig(), makeModel('Budget'));

        const result = await mockFs.readFile(ORCHESTRATOR_PATH);

        // 3 entity imports присутствуют (плюс Configuration baseline)
        assert.ok(result.includes('expense_remote_adapter.dart'), 'expense imports');
        assert.ok(result.includes('income_remote_adapter.dart'), 'income imports');
        assert.ok(result.includes('budget_remote_adapter.dart'), 'budget imports');
        assert.ok(result.includes('configuration_remote_adapter.dart'), 'configuration baseline imports');

        // 3 entityTypes
        assert.ok(result.includes(`'expense',`), `'expense' entityType`);
        assert.ok(result.includes(`'income',`), `'income' entityType`);
        assert.ok(result.includes(`'budget',`), `'budget' entityType`);
        assert.ok(result.includes(`'configuration',`), `'configuration' baseline entityType`);

        // 3 register блока
        assert.ok(result.includes('register<ExpenseEntity>'), 'expense register');
        assert.ok(result.includes('register<IncomeEntity>'), 'income register');
        assert.ok(result.includes('register<BudgetEntity>'), 'budget register');
        assert.ok(result.includes('register<ConfigurationEntity>'), 'configuration baseline register');

        // Никаких дублей
        const expenseRegisterCount = (result.match(/register<ExpenseEntity>/g) || []).length;
        const incomeRegisterCount = (result.match(/register<IncomeEntity>/g) || []).length;
        const budgetRegisterCount = (result.match(/register<BudgetEntity>/g) || []).length;
        assert.strictEqual(expenseRegisterCount, 1);
        assert.strictEqual(incomeRegisterCount, 1);
        assert.strictEqual(budgetRegisterCount, 1);
    });

    test('recovery from legacy duplicates: 3 marker pairs → схлопываются в 1', async () => {
        // Симулируем повреждённое состояние от старой версии: 3 duplicate marker pairs.
        const corruptedState = `// manifest: startProject
import 'package:sync_core/sync_core.dart';

// === generated_start:syncImports ===
import '../../features/configuration/data/adapters/configuration/configuration_remote_adapter.dart';
// === generated_end:syncImports ===

// === generated_start:syncImports ===
import '../../features/expense/data/adapters/expense/expense_remote_adapter.dart';
// === generated_end:syncImports ===

// === generated_start:syncImports ===
import '../../features/income/data/adapters/income/income_remote_adapter.dart';
// === generated_end:syncImports ===

const List<String> syncEntityTypes = <String>[
  // === generated_start:syncEntityTypes ===
  'configuration',
  // === generated_end:syncEntityTypes ===

  // === generated_start:syncEntityTypes ===
  'expense',
  // === generated_end:syncEntityTypes ===
];

void wireUp() {
  // === generated_start:syncRegistrations ===
  orchestrator.register<ConfigurationEntity>('configuration', ...);
  // === generated_end:syncRegistrations ===

  // === generated_start:syncRegistrations ===
  orchestrator.register<ExpenseEntity>('expense', ...);
  // === generated_end:syncRegistrations ===
}
`;
        mockFs.setFile(ORCHESTRATOR_PATH, corruptedState);

        await patcher.patch(makeConfig(), makeModel('Income'));

        const result = await mockFs.readFile(ORCHESTRATOR_PATH);

        // Каждый marker name должен встречаться ровно 1 раз (start + end).
        const importsStartCount = (result.match(/generated_start:syncImports/g) || []).length;
        const importsEndCount = (result.match(/generated_end:syncImports/g) || []).length;
        assert.strictEqual(importsStartCount, 1, 'syncImports: ровно 1 start marker после recovery');
        assert.strictEqual(importsEndCount, 1, 'syncImports: ровно 1 end marker после recovery');

        const entityTypesStartCount = (result.match(/generated_start:syncEntityTypes/g) || []).length;
        const entityTypesEndCount = (result.match(/generated_end:syncEntityTypes/g) || []).length;
        assert.strictEqual(entityTypesStartCount, 1);
        assert.strictEqual(entityTypesEndCount, 1);

        const registrationsStartCount = (result.match(/generated_start:syncRegistrations/g) || []).length;
        const registrationsEndCount = (result.match(/generated_end:syncRegistrations/g) || []).length;
        assert.strictEqual(registrationsStartCount, 1);
        assert.strictEqual(registrationsEndCount, 1);

        // Все existing entities должны сохраниться + новый Income.
        assert.ok(result.includes('configuration_remote_adapter.dart'), 'configuration сохранён');
        assert.ok(result.includes('expense_remote_adapter.dart'), 'expense сохранён');
        assert.ok(result.includes('income_remote_adapter.dart'), 'income (новый) добавлен');
    });

    test('commutative apply: A→B == B→A (порядок не влияет на final state)', async () => {
        // Apply A → B
        mockFs.setFile(ORCHESTRATOR_PATH, ORCHESTRATOR_BASELINE);
        await patcher.patch(makeConfig(), makeModel('Alpha'));
        await patcher.patch(makeConfig(), makeModel('Beta'));
        const resultAB = await mockFs.readFile(ORCHESTRATOR_PATH);

        // Reset mock + apply B → A
        const mockFs2 = new MockFileSystem();
        const patcher2 = new OrchestratorPatcher(mockFs2);
        mockFs2.setFile(ORCHESTRATOR_PATH, ORCHESTRATOR_BASELINE);
        await patcher2.patch(makeConfig(), makeModel('Beta'));
        await patcher2.patch(makeConfig(), makeModel('Alpha'));
        const resultBA = await mockFs2.readFile(ORCHESTRATOR_PATH);

        // Final state: оба содержат и Alpha и Beta.
        assert.ok(resultAB.includes('register<AlphaEntity>'), 'AB: AlphaEntity');
        assert.ok(resultAB.includes('register<BetaEntity>'), 'AB: BetaEntity');
        assert.ok(resultBA.includes('register<AlphaEntity>'), 'BA: AlphaEntity');
        assert.ok(resultBA.includes('register<BetaEntity>'), 'BA: BetaEntity');

        // Counts identical.
        const countAlphaAB = (resultAB.match(/register<AlphaEntity>/g) || []).length;
        const countAlphaBA = (resultBA.match(/register<AlphaEntity>/g) || []).length;
        assert.strictEqual(countAlphaAB, 1);
        assert.strictEqual(countAlphaBA, 1);
    });
});
