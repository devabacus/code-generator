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

/**
 * Junction-style model fixture (TASK-013 regression). Используется для testing
 * junction detection через JunctionDetector.isJunctionEntity() (replacement
 * legacy `endsWith('Map')` heuristic).
 *
 * Shape: 2+ FK relation fields + базовые системные поля. Без `Map` суффикса
 * (главный fix point — RolePermission/CustomerUser в weight были false-negatives).
 */
function makeJunctionModel(
    className: string,
    fkFields: ServerpodField[],
    extraFields: ServerpodField[] = [],
): ServerpodModel {
    return {
        className,
        tableName: className.toLowerCase(),
        isRelation: true, // populated to true since we know this is junction
        fields: [
            { name: 'id', type: 'UuidValue', nullable: true },
            ...fkFields,
            ...extraFields,
        ],
    };
}

function fkField(name: string, related?: string): ServerpodField {
    return {
        name,
        type: 'UuidValue',
        nullable: false,
        isRelation: true,
        relationType: 'manyToOne',
        relatedModel: related ?? name.replace(/Id$/, ''),
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

    test('single entity add: 3 marker блока обновлены + full import path correct (BUG-009 fix)', async () => {
        mockFs.setFile(ORCHESTRATOR_PATH, ORCHESTRATOR_BASELINE);

        await patcher.patch(makeConfig(), makeModel('Expense'));

        const result = await mockFs.readFile(ORCHESTRATOR_PATH);

        // BUG-009 fix: Full import paths должны использовать target feature segment
        // (`features/expense/`), не template literal (`features/tasks/`).
        assert.ok(
            result.includes("import '../../features/expense/data/adapters/expense/expense_remote_adapter.dart';"),
            'expense_remote_adapter import должен иметь полный путь features/expense/data/adapters/expense/'
        );
        assert.ok(
            result.includes("import '../../features/expense/data/adapters/expense/expense_event_adapter.dart';"),
            'expense_event_adapter import full path'
        );
        assert.ok(
            result.includes("import '../../features/expense/data/adapters/expense/expense_local_apply.dart';"),
            'expense_local_apply import full path'
        );
        assert.ok(
            result.includes("import '../../features/expense/data/adapters/expense/expense_payload_codec.dart';"),
            'expense_payload_codec import full path'
        );
        assert.ok(
            result.includes("import '../../features/expense/data/adapters/expense/expense_pull_adapter.dart';"),
            'expense_pull_adapter import full path'
        );
        assert.ok(
            result.includes("import '../../features/expense/data/datasources/local/daos/expense/expense_dao.dart';"),
            'expense_dao import full path'
        );
        assert.ok(
            result.includes("import '../../features/expense/domain/entities/expense/expense_entity.dart';"),
            'expense_entity import full path'
        );

        // BUG-009 negative assertion: НЕТ literal `features/tasks/expense*` (template feature
        // не должен утечь в target import path).
        assert.ok(
            !result.includes('features/tasks/data/adapters/expense'),
            'BUG-009: features/tasks/...expense import path должен отсутствовать (template literal не leak)'
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

    test('BUG-009: feature segment substitution для non-tasks feature (.../features/<custom>)', async () => {
        // Конфигурация emulates real flow: developer вызывает
        // `generate-entity --feature-path .../features/billing` на свежем create-project'е,
        // где `features/tasks/` НЕ существует. Patcher ДОЛЖЕН substitute template's
        // `features/tasks/` literal на target `features/billing/`.
        const configWithCustomFeature = new GenerationConfig({
            templProject: 't115',
            templEntity: 'category',
            targetEntity: '',
            templatesPath: TEMPLATES_PATH,
            projectsPath: PROJECTS_PATH,
            targetProject: TARGET_PROJECT,
            templFeatureName: 'tasks',
            targetFeaturePath: `${PROJECTS_PATH}/${TARGET_PROJECT}/${TARGET_PROJECT}_flutter/lib/features/billing`,
            workspacesPath: `${PROJECTS_PATH}/${TARGET_PROJECT}`,
        });

        mockFs.setFile(ORCHESTRATOR_PATH, ORCHESTRATOR_BASELINE);

        await patcher.patch(configWithCustomFeature, makeModel('Invoice'));

        const result = await mockFs.readFile(ORCHESTRATOR_PATH);

        // POSITIVE: imports должны указывать на features/billing/, НЕ features/tasks/
        assert.ok(
            result.includes("import '../../features/billing/data/adapters/invoice/invoice_remote_adapter.dart';"),
            'BUG-009 fix: imports содержат features/billing/ (target feature segment)'
        );
        assert.ok(
            result.includes("import '../../features/billing/data/datasources/local/daos/invoice/invoice_dao.dart';"),
            'BUG-009 fix: dao import path resolves correctly'
        );

        // NEGATIVE: template feature literal НЕ должен утечь.
        assert.ok(
            !result.includes('features/tasks/'),
            'BUG-009 fix: template literal `features/tasks/` НЕ leak в target imports'
        );
    });

    test('BUG-009: junction entity также получает правильный feature segment', async () => {
        // Junction (*Map) imports тоже должны substitute features/tasks/ → features/<target>/.
        const configWithCustomFeature = new GenerationConfig({
            templProject: 't115',
            templEntity: 'category',
            targetEntity: '',
            templatesPath: TEMPLATES_PATH,
            projectsPath: PROJECTS_PATH,
            targetProject: TARGET_PROJECT,
            templFeatureName: 'tasks',
            targetFeaturePath: `${PROJECTS_PATH}/${TARGET_PROJECT}/${TARGET_PROJECT}_flutter/lib/features/access_control`,
            workspacesPath: `${PROJECTS_PATH}/${TARGET_PROJECT}`,
        });

        mockFs.setFile(ORCHESTRATOR_PATH, ORCHESTRATOR_BASELINE);

        // TASK-013: junction fixture теперь требует FK relation fields (не className suffix).
        const userPermissionMap = makeJunctionModel('UserPermissionMap', [
            fkField('userId', 'User'),
            fkField('permissionId', 'Permission'),
        ]);
        await patcher.patch(configWithCustomFeature, userPermissionMap);

        const result = await mockFs.readFile(ORCHESTRATOR_PATH);

        // POSITIVE: junction imports use access_control feature segment
        assert.ok(
            result.includes("import '../../features/access_control/data/adapters/user_permission_map/user_permission_map_remote_adapter.dart';"),
            'BUG-009 fix: junction remote adapter import имеет access_control feature segment'
        );

        // NEGATIVE
        assert.ok(
            !result.includes('features/tasks/'),
            'BUG-009 fix: junction template literal `features/tasks/` НЕ leak'
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

        // TASK-013: junction detection через JunctionDetector — теперь требует
        // 2+ FK relation fields (не className suffix). Backward compat: *Map
        // entity с правильной junction signature (2 FK + base only) всё ещё
        // detected как junction.
        const userPermissionMap = makeJunctionModel('UserPermissionMap', [
            fkField('userId', 'User'),
            fkField('permissionId', 'Permission'),
        ]);
        await patcher.patch(makeConfig(), userPermissionMap);

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

    test('eventual consistency apply: A→B и B→A содержат тот же набор entities (set-equality)', async () => {
        // D10 (per Standard Finding #3 + Adversarial Bomb #6 reformulation):
        //
        // **Honest claim:** patcher НЕ обеспечивает байт-в-байт commutativity
        // (apply order влияет на line ordering — append-only behavior). НО он
        // обеспечивает **eventual consistency**: final orchestrator state содержит
        // одинаковый **set** entries независимо от порядка применения.
        //
        // **Why это OK для production use case:** orchestrator file правится
        // sequentially (один `generate-entity` за раз). Concurrent generate-entity
        // не supported (file locking concern, не проверяется). Set-equality
        // достаточна для invariant "финальный state содержит N expected register'ов".
        //
        // **Если бы потребовалась true bytewise commutativity:** patcher должен
        // был бы sort'ировать entries (по entity name) при insert. Это можно
        // добавить как future hardening (TASK-013 backlog scope или separate task),
        // но не блокер для TASK-011 acceptance.

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

        // ---- Set-equality assertion ----
        // Извлекаем все `register<XEntity>` имена из обоих результатов и сравниваем
        // как множества (set-equality, порядко-независимо).
        const extractRegistrationNames = (content: string): Set<string> => {
            const matches = content.match(/register<(\w+)>/g) || [];
            return new Set(matches);
        };
        const setAB = extractRegistrationNames(resultAB);
        const setBA = extractRegistrationNames(resultBA);
        assert.deepStrictEqual(
            [...setAB].sort(),
            [...setBA].sort(),
            'D10: A→B и B→A должны иметь одинаковый set register'
        );

        // Аналогично для imports.
        const extractImportPaths = (content: string): Set<string> => {
            const matches = content.match(/import '[^']+';/g) || [];
            return new Set(matches);
        };
        const importsAB = extractImportPaths(resultAB);
        const importsBA = extractImportPaths(resultBA);
        assert.deepStrictEqual(
            [...importsAB].sort(),
            [...importsBA].sort(),
            'D10: A→B и B→A должны иметь одинаковый set imports'
        );

        // Sanity: оба содержат и Alpha и Beta.
        assert.ok(setAB.has('register<AlphaEntity>') && setAB.has('register<BetaEntity>'), 'AB: Alpha + Beta');
        assert.ok(setBA.has('register<AlphaEntity>') && setBA.has('register<BetaEntity>'), 'BA: Alpha + Beta');

        // Counts identical.
        const countAlphaAB = (resultAB.match(/register<AlphaEntity>/g) || []).length;
        const countAlphaBA = (resultBA.match(/register<AlphaEntity>/g) || []).length;
        assert.strictEqual(countAlphaAB, 1, 'AB: ровно 1 Alpha register');
        assert.strictEqual(countAlphaBA, 1, 'BA: ровно 1 Alpha register');
    });

    // ── TASK-013 regression: junction detection через JunctionDetector ──────

    test('TASK-013: RolePermission (no Map suffix, 2 FK only) → junction routing', async () => {
        // Воспроизводит false-negative #1 из weight repo. Без TASK-013 fix
        // RolePermission получал regular template routing. После fix — должен
        // routing'ить через _JUNCTION_* templates.
        mockFs.setFile(ORCHESTRATOR_PATH, ORCHESTRATOR_BASELINE);

        const rolePermission = makeJunctionModel('RolePermission', [
            fkField('roleId', 'Role'),
            fkField('permissionId', 'Permission'),
        ]);

        await patcher.patch(makeConfig(), rolePermission);

        const result = await mockFs.readFile(ORCHESTRATOR_PATH);

        // Junction-specific docstring должен присутствовать.
        assert.ok(
            result.includes('Junction-specific'),
            'TASK-013: RolePermission должен получить junction docstring',
        );

        // PascalCase + Entity suffix в register.
        assert.ok(
            result.includes('register<RolePermissionEntity>'),
            'TASK-013: register<RolePermissionEntity> должен присутствовать',
        );

        // snake_case path для file imports.
        assert.ok(
            result.includes('role_permission_remote_adapter.dart'),
            'TASK-013: role_permission imports (snake_case path)',
        );

        // entityType id в snake_case.
        assert.ok(
            result.includes(`'role_permission',`),
            `TASK-013: 'role_permission' entityType должен быть в syncEntityTypes`,
        );
    });

    test('TASK-013: CustomerUser (3 FK + nullable FK, no Map suffix) → junction routing', async () => {
        // Воспроизводит false-negative #2 из weight repo. Nullable FK = FK для detection.
        mockFs.setFile(ORCHESTRATOR_PATH, ORCHESTRATOR_BASELINE);

        const customerUser = makeJunctionModel('CustomerUser', [
            fkField('customerId', 'Customer'),
            { name: 'userId', type: 'int', nullable: false },
            fkField('roleId', 'Role'),
            { name: 'defaultTerminalSetId', type: 'UuidValue', nullable: true, isRelation: true, relationType: 'manyToOne', relatedModel: 'TerminalSet' },
        ]);

        await patcher.patch(makeConfig(), customerUser);

        const result = await mockFs.readFile(ORCHESTRATOR_PATH);

        assert.ok(
            result.includes('Junction-specific'),
            'TASK-013: CustomerUser должен получить junction docstring (nullable FK counted as FK)',
        );
        assert.ok(
            result.includes('register<CustomerUserEntity>'),
            'TASK-013: register<CustomerUserEntity>',
        );
        assert.ok(
            result.includes('customer_user_remote_adapter.dart'),
            'TASK-013: customer_user imports (snake_case)',
        );
    });

    test('TASK-013 backward compat: TaskTagMap (с Map suffix) → junction routing preserved', async () => {
        // Verify что existing *Map entities продолжают detect как junction после
        // TASK-013 (drop *Map suffix heuristic + structural detection вместо).
        mockFs.setFile(ORCHESTRATOR_PATH, ORCHESTRATOR_BASELINE);

        const taskTagMap = makeJunctionModel('TaskTagMap', [
            fkField('taskId', 'Task'),
            fkField('tagId', 'Tag'),
        ]);

        await patcher.patch(makeConfig(), taskTagMap);

        const result = await mockFs.readFile(ORCHESTRATOR_PATH);

        assert.ok(
            result.includes('Junction-specific'),
            'TASK-013 backward compat: TaskTagMap (с Map suffix) detected as junction',
        );
        assert.ok(
            result.includes('register<TaskTagMapEntity>'),
            'TASK-013 backward compat: TaskTagMap register block',
        );
    });

    // ── TASK-014 regression: junction docstring FK parametrization ─────────

    test('TASK-014: RolePermission docstring → "junction FK→role+permission" (NOT task+tag)', async () => {
        // Bomb #6 closure: junction docstring был hardcoded `task+tag` literals
        // и `ByTaskAndTag` substring — для RolePermission это semantically wrong.
        // После TASK-014 — substitute через __FK1__/__FK2__ placeholders.
        mockFs.setFile(ORCHESTRATOR_PATH, ORCHESTRATOR_BASELINE);

        const rolePermission = makeJunctionModel('RolePermission', [
            fkField('roleId', 'Role'),
            fkField('permissionId', 'Permission'),
        ]);

        await patcher.patch(makeConfig(), rolePermission);

        const result = await mockFs.readFile(ORCHESTRATOR_PATH);

        // Docstring должен содержать `junction FK→role+permission`.
        assert.ok(
            result.includes('junction FK→role+permission') || result.includes('junction FK→role+permission'),
            `TASK-014: RolePermission docstring должен содержать "junction FK→role+permission"`,
        );

        // Method name reference — `ByRoleAndPermission` (НЕ `ByTaskAndTag`).
        assert.ok(
            result.includes('ByRoleAndPermission'),
            'TASK-014: docstring должен ссылаться на ByRoleAndPermission method-name fragment',
        );

        // NEGATIVE: hardcoded `task+tag` / `ByTaskAndTag` НЕ должны leak.
        assert.ok(
            !result.includes('task+tag'),
            'TASK-014: hardcoded `task+tag` literal НЕ должен присутствовать для RolePermission',
        );
        assert.ok(
            !result.includes('ByTaskAndTag'),
            'TASK-014: hardcoded `ByTaskAndTag` literal НЕ должен присутствовать для RolePermission',
        );
    });

    test('TASK-014 backward compat: TaskTagMap docstring сохраняет "junction FK→task+tag"', async () => {
        // Backward compat для TaskTagMap junction: FK extraction даёт task+tag,
        // substitution производит identical output (`junction FK→task+tag` +
        // `ByTaskAndTag` method name).
        mockFs.setFile(ORCHESTRATOR_PATH, ORCHESTRATOR_BASELINE);

        const taskTagMap = makeJunctionModel('TaskTagMap', [
            fkField('taskId', 'Task'),
            fkField('tagId', 'Tag'),
        ]);

        await patcher.patch(makeConfig(), taskTagMap);

        const result = await mockFs.readFile(ORCHESTRATOR_PATH);

        // Docstring backward compat: `junction FK→task+tag` присутствует.
        assert.ok(
            result.includes('junction FK→task+tag') || result.includes('junction FK→task+tag'),
            'TASK-014 backward compat: TaskTagMap docstring сохраняет junction FK→task+tag',
        );
        // Method name preserved.
        assert.ok(
            result.includes('ByTaskAndTag'),
            'TASK-014 backward compat: TaskTagMap docstring имеет ByTaskAndTag method-name',
        );
    });

    test('TASK-013 negative: regular entity с 1 FK → НЕ junction (no false-positive)', async () => {
        // Configuration-style: 1 FK (customerId) + business fields → regular routing.
        mockFs.setFile(ORCHESTRATOR_PATH, ORCHESTRATOR_BASELINE);

        const configWithSingleFk: ServerpodModel = {
            className: 'Subscription',
            tableName: 'subscription',
            isRelation: false,
            fields: [
                { name: 'id', type: 'UuidValue', nullable: true },
                { name: 'userId', type: 'int', nullable: false },
                fkField('customerId', 'Customer'),
                { name: 'feature', type: 'String', nullable: false },
                { name: 'status', type: 'String', nullable: false },
            ],
        };

        await patcher.patch(makeConfig(), configWithSingleFk);

        const result = await mockFs.readFile(ORCHESTRATOR_PATH);

        // Regular template — НЕ должно быть junction docstring.
        assert.ok(
            !result.match(/register<SubscriptionEntity>[\s\S]{0,300}Junction-specific/),
            'TASK-013: Subscription (regular) НЕ должна получить junction docstring',
        );
        assert.ok(
            result.includes('register<SubscriptionEntity>'),
            'Subscription register block присутствует (regular template)',
        );
    });
});
