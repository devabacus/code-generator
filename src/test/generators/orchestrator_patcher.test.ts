import * as assert from 'assert';
import { OrchestratorPatcher } from '../../features/generation/generators/orchestrator_patcher';
import { GenerationConfig } from '../../features/generation/config/generation_config';
import { t115TemplateConfig, simplifiedTemplateConfig } from '../../features/generation/config/template_config';
import { ServerpodModel, ServerpodField } from '../../features/generation/parsers/formatters/types';
import { JunctionDetector } from '../../features/generation/parsers/junction_detector';
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

    test('BUG-025: orchestrator существует, но маркеры отсутствуют → throw (не silent no-op)', async () => {
        // Файл есть (проект bootstrap'нут), но marker-пары удалены/отсутствуют.
        const noMarkers = `// manifest: startProject
import 'dart:async';
import 'package:sync_core/sync_core.dart';

const List<String> syncEntityTypes = <String>['configuration'];

SyncOrchestrator syncOrchestrator(Ref ref) {
  final orchestrator = SyncOrchestrator();
  return orchestrator;
}
`;
        mockFs.setFile(ORCHESTRATOR_PATH, noMarkers);
        await assert.rejects(
            () => patcher.patch(makeConfig(), makeModel('Expense')),
            /BUG-025|marker/i,
            'patch должен бросить, а не молча пропустить регистрацию',
        );
    });

    test('BUG-025: частично отсутствующий маркер (нет syncRegistrations) → throw с именем', async () => {
        // baseline без блока syncRegistrations.
        const partial = ORCHESTRATOR_BASELINE.replace(
            /\/\/ === generated_start:syncRegistrations ===[\s\S]*?\/\/ === generated_end:syncRegistrations ===/,
            '// (registrations removed)',
        );
        mockFs.setFile(ORCHESTRATOR_PATH, partial);
        await assert.rejects(
            () => patcher.patch(makeConfig(), makeModel('Expense')),
            /syncRegistrations/,
            'сообщение должно называть отсутствующий маркер',
        );
    });

    test('BUG-025: все 3 маркера на месте → patch проходит без throw (regression)', async () => {
        mockFs.setFile(ORCHESTRATOR_PATH, ORCHESTRATOR_BASELINE);
        await assert.doesNotReject(() => patcher.patch(makeConfig(), makeModel('Expense')));
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
        // BUG-012 (TASK-016): relatedModel хранится в lowerCamel form (parser convention).
        const userPermissionMap = makeJunctionModel('UserPermissionMap', [
            fkField('userId', 'user'),
            fkField('permissionId', 'permission'),
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
            fkField('userId', 'user'),
            fkField('permissionId', 'permission'),
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
            fkField('roleId', 'role'),
            fkField('permissionId', 'permission'),
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
            fkField('customerId', 'customer'),
            { name: 'userId', type: 'int', nullable: false },
            fkField('roleId', 'role'),
            // BUG-012 (TASK-016): relatedModel = lowerCamel `terminalSet` (после snake→camel в parser)
            { name: 'defaultTerminalSetId', type: 'UuidValue', nullable: true, isRelation: true, relationType: 'manyToOne', relatedModel: 'terminalSet' },
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

        // TASK-014 round 1 adversarial Bomb #6 — semantic assertion.
        // Fixes current FK extraction behavior: relationFields=[customerId, roleId, defaultTerminalSetId],
        // первые 2 FK = customer+role (userId: int пропускается т.к. НЕ FK). Catches docstring/method-name
        // regression если FK extraction algorithm change'нется в future. Documented в
        // docs-code-generator/sync-core-integration.md "Junction FK extraction — known limitation"
        // + TASK-015 backlog для robust pseudo-FK detection.
        assert.ok(
            result.includes('junction FK→customer+role'),
            'TASK-014 Bomb #6: CustomerUser docstring должен явно отражать current FK extraction (customer+role) — catches regression',
        );
        assert.ok(
            result.includes('deleteCustomerUserByCustomerAndRole'),
            'TASK-014 Bomb #6: method-name должен быть deleteCustomerUserByCustomerAndRole (current behavior)',
        );
        // NEGATIVE: template defaults НЕ должны leak.
        assert.ok(
            !result.includes('junction FK→task+tag'),
            'TASK-014 Bomb #6: template default `task+tag` НЕ должен leak в CustomerUser docstring',
        );
        assert.ok(
            !result.includes('deleteCustomerUserByTaskAndTag'),
            'TASK-014 Bomb #6: template default `ByTaskAndTag` НЕ должен leak в method-name',
        );
    });

    test('TASK-013 backward compat: TaskTagMap (с Map suffix) → junction routing preserved', async () => {
        // Verify что existing *Map entities продолжают detect как junction после
        // TASK-013 (drop *Map suffix heuristic + structural detection вместо).
        mockFs.setFile(ORCHESTRATOR_PATH, ORCHESTRATOR_BASELINE);

        const taskTagMap = makeJunctionModel('TaskTagMap', [
            fkField('taskId', 'task'),
            fkField('tagId', 'tag'),
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
            fkField('roleId', 'role'),
            fkField('permissionId', 'permission'),
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
            fkField('taskId', 'task'),
            fkField('tagId', 'tag'),
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
                fkField('customerId', 'customer'),
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

    // ── BUG-012 (TASK-016) regression — multi-word lowerCamel parent ──────────

    // ====================================================================================
    // TASK-022 / Phase B1 — TemplateConfig injection tests
    //
    // Verifies что `OrchestratorPatcher` строит orchestrator path из
    // `config.templateConfig.orchestrator.relativePath` вместо hardcoded
    // `['lib', 'core', 'sync', 'sync_orchestrator_provider.dart']`.
    // ====================================================================================

    test('TASK-022 / TemplateConfig: t115 default produces hardcoded-equivalent orchestrator path (regression)', async () => {
        // Verify default GenerationConfig (без explicit templateConfig) использует
        // t115TemplateConfig() literals → orchestrator at lib/core/sync/sync_orchestrator_provider.dart.
        const config = makeConfig();
        assert.strictEqual(config.templateConfig.name, 't115');
        assert.deepStrictEqual(
            config.templateConfig.orchestrator.relativePath,
            ['lib', 'core', 'sync', 'sync_orchestrator_provider.dart'],
            't115 default: orchestrator relativePath = lib/core/sync/sync_orchestrator_provider.dart',
        );

        // Behavioral: orchestrator под default path читается, patcher работает идемпотентно.
        mockFs.setFile(ORCHESTRATOR_PATH, ORCHESTRATOR_BASELINE);
        await patcher.patch(config, makeModel('Expense'));
        const result = await mockFs.readFile(ORCHESTRATOR_PATH);
        assert.ok(result.includes('register<ExpenseEntity>'),
            't115 default config: register block produced под conventional path');
    });

    test('TASK-022 / TemplateConfig: alt config routes к alt target file', async () => {
        // Alt path: orchestrator файл в alternate location. Patcher должен искать там,
        // не в hardcoded `lib/core/sync/sync_orchestrator_provider.dart`.
        const altOrchestratorPath = `${PROJECTS_PATH}/${TARGET_PROJECT}/${TARGET_PROJECT}_flutter/lib/core/orchestrator/alt_orchestrator.dart`;
        const altConfig = new GenerationConfig({
            templProject: 't115',
            templEntity: 'category',
            targetEntity: '',
            templatesPath: TEMPLATES_PATH,
            projectsPath: PROJECTS_PATH,
            targetProject: TARGET_PROJECT,
            templFeatureName: 'tasks',
            targetFeaturePath: `${PROJECTS_PATH}/${TARGET_PROJECT}/${TARGET_PROJECT}_flutter/lib/features/expense`,
            workspacesPath: `${PROJECTS_PATH}/${TARGET_PROJECT}`,
            templateConfig: {
                name: 't115',
                relationPatcher: t115TemplateConfig().relationPatcher,
                orchestrator: {
                    ...t115TemplateConfig().orchestrator,
                    relativePath: ['lib', 'core', 'orchestrator', 'alt_orchestrator.dart'],
                },
                database: t115TemplateConfig().database,
            },
        });

        // Setup orchestrator at alt path.
        mockFs.setFile(altOrchestratorPath, ORCHESTRATOR_BASELINE);

        await patcher.patch(altConfig, makeModel('Expense'));

        // Positive: alt path was patched (register block written there).
        const altResult = await mockFs.readFile(altOrchestratorPath);
        assert.ok(altResult.includes('register<ExpenseEntity>'),
            'alt path: register block written в alternate orchestrator file');

        // Negative: default ORCHESTRATOR_PATH should NOT exist (patcher не trying conventional path).
        const defaultExists = await mockFs.exists(ORCHESTRATOR_PATH);
        assert.strictEqual(defaultExists, false,
            'alt path: default conventional path file НЕ должен быть создан/затронут');
    });

    test('TASK-022 / TemplateConfig: existing patching behavior unchanged под explicit t115 config (regression)', async () => {
        // Equivalence test: explicit t115TemplateConfig() vs default = identical output.
        const explicitConfig = new GenerationConfig({
            templProject: 't115',
            templEntity: 'category',
            targetEntity: '',
            templatesPath: TEMPLATES_PATH,
            projectsPath: PROJECTS_PATH,
            targetProject: TARGET_PROJECT,
            templFeatureName: 'tasks',
            targetFeaturePath: `${PROJECTS_PATH}/${TARGET_PROJECT}/${TARGET_PROJECT}_flutter/lib/features/expense`,
            workspacesPath: `${PROJECTS_PATH}/${TARGET_PROJECT}`,
            templateConfig: t115TemplateConfig(),
        });
        mockFs.setFile(ORCHESTRATOR_PATH, ORCHESTRATOR_BASELINE);
        await patcher.patch(explicitConfig, makeModel('Expense'));
        const explicitResult = await mockFs.readFile(ORCHESTRATOR_PATH);

        // Reset + default config.
        const mockFs2 = new MockFileSystem();
        const patcher2 = new OrchestratorPatcher(mockFs2);
        mockFs2.setFile(ORCHESTRATOR_PATH, ORCHESTRATOR_BASELINE);
        await patcher2.patch(makeConfig(), makeModel('Expense'));
        const defaultResult = await mockFs2.readFile(ORCHESTRATOR_PATH);

        assert.strictEqual(explicitResult, defaultResult,
            'explicit t115TemplateConfig() = default config output (regression invariant)');
    });

    // ====================================================================================
    // TASK-023 / Phase B2 — BUG-019 fix: snippet content из templateConfig
    //
    // Verifies что `OrchestratorPatcher` строит imports / register snippets из
    // `config.templateConfig.orchestrator.{entityImportsTemplate, entityRegisterTemplate,
    // junctionImportsTemplate, junctionRegisterTemplate, regularEntityFallback,
    // junctionEntityFallback, junctionFkFallbacks, templateFeatureSegment}` вместо
    // hardcoded constants `_ENTITY_*_TEMPLATE` / `_JUNCTION_*_TEMPLATE` + literal
    // fallbacks `'category'` / `'taskTagMap'` / `'task'` / `'tag'`.
    //
    // Reference: ai/bug-reports/019-orchestrator-snippet-hardcoded-literals.md
    // ====================================================================================

    test('TASK-023 / BUG-019: simplifiedTemplateConfig() factory exposes snippet content fields', async () => {
        // Smoke: simplified factory returns shape с расширенными polymorphism полями.
        const config = simplifiedTemplateConfig();
        assert.strictEqual(config.name, 'simplified');

        // Snippet content presence
        assert.ok(config.orchestrator.entityImportsTemplate.length > 0,
            'simplified entityImportsTemplate should be non-empty');
        assert.ok(config.orchestrator.entityRegisterTemplate.length > 0,
            'simplified entityRegisterTemplate should be non-empty');
        assert.ok(config.orchestrator.junctionImportsTemplate.length > 0,
            'simplified junctionImportsTemplate should be non-empty');
        assert.ok(config.orchestrator.junctionRegisterTemplate.length > 0,
            'simplified junctionRegisterTemplate should be non-empty');

        // Fallbacks (Session E3d2: aligned с t115 — Configuration = startProject baseline,
        // не template fixture; simplified inherits `features/tasks/` Category fixture).
        assert.strictEqual(config.orchestrator.regularEntityFallback, 'category',
            'simplified regularEntityFallback = `category` (E3d2: aligned с t115 — Configuration baseline копируется как-есть, не substitution source)');
        assert.strictEqual(config.orchestrator.junctionEntityFallback, 'taskTagMap',
            'simplified junctionEntityFallback = `taskTagMap` (E3d2: aligned с t115 consolidated fixture)');
        assert.deepStrictEqual(config.orchestrator.junctionFkFallbacks, { fk1: 'task', fk2: 'tag' },
            'simplified junctionFkFallbacks = `task`/`tag` (E3d2: aligned с t115 TaskTagMap junction)');
        assert.strictEqual(config.orchestrator.templateFeatureSegment, 'tasks',
            'simplified templateFeatureSegment = `tasks` (E3d2: aligned с t115 Category fixture location)');

        // Simplified snippet содержит Category / category literals (E3d2: aligned с t115).
        // Configuration baseline (per ADR-0005 §3.1) копируется как-есть startProject manifest,
        // не входит в substitution flow.
        assert.ok(config.orchestrator.entityImportsTemplate.includes('category_remote_adapter.dart'),
            'simplified entityImportsTemplate содержит category adapter file path (E3d2: shared с t115)');
        assert.ok(config.orchestrator.entityImportsTemplate.includes('features/tasks/'),
            'simplified entityImportsTemplate содержит features/tasks/ feature segment (E3d2)');

        assert.ok(config.orchestrator.entityRegisterTemplate.includes('register<CategoryEntity>'),
            'simplified entityRegisterTemplate содержит CategoryEntity register (E3d2: shared с t115)');
    });

    test('TASK-023 / BUG-019: t115TemplateConfig() factory snippet content matches pre-TASK-023 hardcoded constants', async () => {
        // Regression: t115 factory returns identical snippet content к pre-TASK-023 file-local constants.
        const config = t115TemplateConfig();

        // entity imports — t115 had `category` + `features/tasks/`.
        assert.ok(config.orchestrator.entityImportsTemplate.includes('category_remote_adapter.dart'),
            't115 entityImportsTemplate содержит category_remote_adapter.dart (preserves pre-TASK-023 hardcoded)');
        assert.ok(config.orchestrator.entityImportsTemplate.includes('features/tasks/'),
            't115 entityImportsTemplate содержит features/tasks/ (preserves pre-TASK-023 hardcoded)');

        // junction imports — t115 had `task_tag_map`.
        assert.ok(config.orchestrator.junctionImportsTemplate.includes('task_tag_map_remote_adapter.dart'),
            't115 junctionImportsTemplate содержит task_tag_map_remote_adapter.dart');

        // entity register — t115 had `register<CategoryEntity>`.
        assert.ok(config.orchestrator.entityRegisterTemplate.includes('register<CategoryEntity>'),
            't115 entityRegisterTemplate содержит register<CategoryEntity>');

        // junction register — t115 had `register<TaskTagMapEntity>` + `__FK1__` placeholders.
        assert.ok(config.orchestrator.junctionRegisterTemplate.includes('register<TaskTagMapEntity>'),
            't115 junctionRegisterTemplate содержит register<TaskTagMapEntity>');
        assert.ok(config.orchestrator.junctionRegisterTemplate.includes('__FK1__'),
            't115 junctionRegisterTemplate содержит __FK1__ placeholder (TASK-014 substitution token)');

        // Fallbacks preserve pre-TASK-023 hardcoded literals.
        assert.strictEqual(config.orchestrator.regularEntityFallback, 'category');
        assert.strictEqual(config.orchestrator.junctionEntityFallback, 'taskTagMap');
        assert.deepStrictEqual(config.orchestrator.junctionFkFallbacks, { fk1: 'task', fk2: 'tag' });
        assert.strictEqual(config.orchestrator.templateFeatureSegment, 'tasks');
    });

    test('TASK-023 / BUG-019 + Session E3d2: simplified config substitution flow (positive proof)', async () => {
        // Session E3d2 update: simplified config теперь использует те же substitution
        // literals что t115 (Category fixture в `features/tasks/`). Configuration baseline
        // (per ADR-0005 §3.1) копируется как-есть startProject manifest, не входит в
        // substitution flow → не вызывает Configuration table duplication.
        //
        // Positive proof: patcher с simplified config produces output, где Category fixture
        // properly substituted к target entity. Substitution shape unified с t115 — это
        // правильно since simplified inherits Clean directory layout + same fixture location.
        const orchestratorBaseline = `// manifest: startProject
import 'package:sync_core/sync_core.dart';

// === generated_start:syncImports ===
// === generated_end:syncImports ===

const List<String> syncEntityTypes = <String>[
  // === generated_start:syncEntityTypes ===
  // === generated_end:syncEntityTypes ===
];

void wireUp() {
  // === generated_start:syncRegistrations ===
  // === generated_end:syncRegistrations ===
}
`;
        const altOrchestratorPath = `${PROJECTS_PATH}/${TARGET_PROJECT}/${TARGET_PROJECT}_flutter/lib/core/sync/sync_orchestrator_provider.dart`;

        const simplifiedConfig = new GenerationConfig({
            templProject: 'simplified',
            templEntity: 'category',
            targetEntity: '',
            templatesPath: TEMPLATES_PATH,
            projectsPath: PROJECTS_PATH,
            targetProject: TARGET_PROJECT,
            // E3d2: targetFeaturePath = lib/features/expense — substitution from simplified
            // template's `features/tasks/` anchor → `features/expense/` target.
            templFeatureName: 'tasks',
            targetFeaturePath: `${PROJECTS_PATH}/${TARGET_PROJECT}/${TARGET_PROJECT}_flutter/lib/features/expense`,
            workspacesPath: `${PROJECTS_PATH}/${TARGET_PROJECT}`,
            templateConfig: simplifiedTemplateConfig(),
        });

        mockFs.setFile(altOrchestratorPath, orchestratorBaseline);

        await patcher.patch(simplifiedConfig, makeModel('Expense'));

        const result = await mockFs.readFile(altOrchestratorPath);

        // POSITIVE: Expense imports (target entity properly substituted) + features/expense/ (target feature segment)
        assert.ok(
            result.includes("import '../../features/expense/data/adapters/expense/expense_remote_adapter.dart';"),
            'simplified config + target=Expense: substitution produces features/expense/expense_remote_adapter.dart',
        );
        assert.ok(
            result.includes('register<ExpenseEntity>'),
            'simplified config + target=Expense: register<ExpenseEntity> emitted',
        );

        // NEGATIVE: template literals (`features/tasks/` anchor + `category` entity) НЕ leak (substituted на target).
        assert.ok(
            !result.includes('features/tasks/'),
            'simplified config: template feature segment `features/tasks/` substituted на `features/expense/`',
        );
        assert.ok(
            !result.includes('category_remote_adapter.dart'),
            'simplified config: template entity literal `category_remote_adapter.dart` substituted на target',
        );
        assert.ok(
            !result.includes('register<CategoryEntity>'),
            'simplified config: template entity literal `register<CategoryEntity>` substituted на `register<ExpenseEntity>`',
        );
    });

    test('TASK-023 / BUG-019: alt config с custom snippets produces alt content (alt-config positive-path proof)', async () => {
        // Polymorphism proof: дёргаем patcher альтернативным templateConfig где snippet content
        // совершенно не похож на t115 ("custom_marker" sentinel). Patcher должен use alt content
        // (proof что snippet content идёт из config, не hardcoded constants).
        const altConfig = new GenerationConfig({
            templProject: 't115',
            templEntity: 'category',
            targetEntity: '',
            templatesPath: TEMPLATES_PATH,
            projectsPath: PROJECTS_PATH,
            targetProject: TARGET_PROJECT,
            templFeatureName: 'tasks',
            targetFeaturePath: `${PROJECTS_PATH}/${TARGET_PROJECT}/${TARGET_PROJECT}_flutter/lib/features/expense`,
            workspacesPath: `${PROJECTS_PATH}/${TARGET_PROJECT}`,
            templateConfig: {
                name: 't115',
                relationPatcher: t115TemplateConfig().relationPatcher,
                orchestrator: {
                    relativePath: t115TemplateConfig().orchestrator.relativePath,
                    // Custom alt snippets с sentinel literals (не похожи на t115 / simplified):
                    entityImportsTemplate: `// CUSTOM_ALT_IMPORTS_SENTINEL
import 'package:custom/altmarker/category_alt.dart';`,
                    entityRegisterTemplate: `  // CUSTOM_ALT_REGISTER_SENTINEL
  altRegister<CategoryAlt>('category', altBundle);`,
                    junctionImportsTemplate: `// CUSTOM_ALT_JUNCTION_IMPORTS`,
                    junctionRegisterTemplate: `  // CUSTOM_ALT_JUNCTION_REGISTER`,
                    regularEntityFallback: 'category',
                    junctionEntityFallback: 'taskTagMap',
                    junctionFkFallbacks: { fk1: 'task', fk2: 'tag' },
                    templateFeatureSegment: 'tasks',
                },
                database: t115TemplateConfig().database,
            },
        });

        mockFs.setFile(ORCHESTRATOR_PATH, ORCHESTRATOR_BASELINE);

        await patcher.patch(altConfig, makeModel('Expense'));

        const result = await mockFs.readFile(ORCHESTRATOR_PATH);

        // POSITIVE: alt sentinel snippets emitted (после substitution `category` → `expense`).
        assert.ok(
            result.includes('CUSTOM_ALT_IMPORTS_SENTINEL'),
            'alt config: CUSTOM_ALT_IMPORTS_SENTINEL должен присутствовать в output (proof что imports читаются из config)',
        );
        assert.ok(
            result.includes('CUSTOM_ALT_REGISTER_SENTINEL'),
            'alt config: CUSTOM_ALT_REGISTER_SENTINEL должен присутствовать в output (proof что register читается из config)',
        );
        // Alt template содержал `category_alt.dart` → substituted на `expense_alt.dart`.
        assert.ok(
            result.includes('expense_alt.dart'),
            'alt config: substitution `category` → `expense` корректно в alt snippet',
        );
        // Alt template содержал `altRegister<CategoryAlt>` → substituted на `altRegister<ExpenseAlt>`.
        assert.ok(
            result.includes('altRegister<ExpenseAlt>'),
            'alt config: substitution `Category` → `Expense` корректно в alt snippet (PascalCase form)',
        );

        // NEGATIVE: t115 hardcoded snippet content НЕ leak (proof что patcher больше не reads file-local constants).
        assert.ok(
            !result.includes("import '../../features/tasks/data/adapters/expense/expense_remote_adapter.dart';"),
            'alt config: t115 default imports format НЕ leak в output (snippet content НЕ из hardcoded constant)',
        );
        assert.ok(
            !result.includes('register<ExpenseEntity>'),
            'alt config: t115 default register format `register<ExpenseEntity>` НЕ leak (snippet content НЕ из hardcoded constant)',
        );
    });

    test('TASK-023 / BUG-019: junction with <2 FKs falls back to junctionFkFallbacks config (Round 2 H-2 restructured)', async () => {
        // Round 2 H-2 fix: previous test mislabeled — it provided 2 FK fields, so FK extraction
        // succeeded и junctionFkFallbacks branch (`fkFields.length < 2`) НЕ срабатывал. Это
        // оставляло `junctionFkFallbacks` config field полностью без test coverage.
        //
        // Restructured test: monkey-patch `JunctionDetector.isJunctionEntity` чтобы вернуть `true`
        // для модели с 1 FK field (структурно junction detection требует ≥2 FK через public API,
        // explicit `junction:true` flag throws JunctionValidationError при FK<2). Patch позволяет
        // exercise dead-defensive branch в `_buildRegisterSnippet:289-293`:
        //   ```
        //   const fk1Name = fkFields.length >= 1 ? extract(fkFields[0]) : fk1Fallback;
        //   const fk2Name = fkFields.length >= 2 ? extract(fkFields[1]) : fk2Fallback;
        //   ```
        // С 1 FK field: `fk1Name = extract(soloId) = 'solo'`, `fk2Name = fk2Fallback = 'sentinelFk2'`
        // (config-driven proof). Session E3d2: simplified и t115 теперь оба используют `task`/`tag`
        // FK fallbacks → нужен custom config с sentinel literal чтобы доказать config-driven dispatch
        // не hardcoded constant.
        const altConfig = new GenerationConfig({
            templProject: 'simplified',
            templEntity: 'category',
            targetEntity: '',
            templatesPath: TEMPLATES_PATH,
            projectsPath: PROJECTS_PATH,
            targetProject: TARGET_PROJECT,
            templFeatureName: 'tasks',
            targetFeaturePath: `${PROJECTS_PATH}/${TARGET_PROJECT}/${TARGET_PROJECT}_flutter/lib/features/configuration`,
            workspacesPath: `${PROJECTS_PATH}/${TARGET_PROJECT}`,
            // Custom config: derived from simplifiedTemplateConfig() с overridden junctionFkFallbacks.
            // Sentinel literals доказывают config-driven dispatch (не hardcoded).
            templateConfig: {
                ...simplifiedTemplateConfig(),
                orchestrator: {
                    ...simplifiedTemplateConfig().orchestrator,
                    junctionFkFallbacks: { fk1: 'sentinelFk1', fk2: 'sentinelFk2' },
                },
            },
        });

        const orchestratorBaseline = `// manifest: startProject
// === generated_start:syncImports ===
// === generated_end:syncImports ===
const List<String> syncEntityTypes = <String>[
  // === generated_start:syncEntityTypes ===
  // === generated_end:syncEntityTypes ===
];
void wireUp() {
  // === generated_start:syncRegistrations ===
  // === generated_end:syncRegistrations ===
}
`;
        const orchestratorPath = `${PROJECTS_PATH}/${TARGET_PROJECT}/${TARGET_PROJECT}_flutter/lib/core/sync/sync_orchestrator_provider.dart`;
        mockFs.setFile(orchestratorPath, orchestratorBaseline);

        // Junction model с 1 FK field. `JunctionDetector.isJunctionEntity()` через public API
        // НЕ classify это как junction (FK<2). Monkey-patch чтобы заставить patcher войти в
        // junction branch и exercise FK fallback.
        const junctionWithOneFk = makeJunctionModel('IncompleteJunction', [
            fkField('soloId', 'solo'),
        ]);

        const originalIsJunction = JunctionDetector.isJunctionEntity;
        JunctionDetector.isJunctionEntity = () => true;
        try {
            await patcher.patch(altConfig, junctionWithOneFk);
        } finally {
            JunctionDetector.isJunctionEntity = originalIsJunction;
        }

        const result = await mockFs.readFile(orchestratorPath);

        // POSITIVE: fk2 fallback из custom config junctionFkFallbacks (= `sentinelFk2`).
        // Доказывает что fallback config-driven, не hardcoded.
        assert.ok(
            result.includes('junction FK→solo+sentinelFk2'),
            'junction <2 FK: fk2 fallback `sentinelFk2` берётся из custom templateConfig.junctionFkFallbacks (proof config-driven)',
        );

        // NEGATIVE: default `tag` fallback (из simplifiedTemplateConfig defaults) НЕ leak,
        // потому что custom config override'ит fallback.
        assert.ok(
            !result.includes('junction FK→solo+tag'),
            'junction <2 FK: default `tag` fallback НЕ leak (proof custom config override governs)',
        );

        // NEGATIVE: hardcoded `task+tag` literal pair НЕ leak (proof что patcher не использует hardcoded constant).
        assert.ok(
            !result.includes('junction FK→task+tag'),
            'junction <2 FK: hardcoded `task+tag` pair НЕ leak (proof config-driven)',
        );
    });

    test('TASK-023 / BUG-019 / Round 2 H-1: --templ-feature CLI flag override consumed для feature substitution (regression)', async () => {
        // H-1 fix: pre-TASK-023 master `orchestrator_patcher.ts` использовал `config.templFeatureName`
        // (CLI `--templ-feature` flag value, default `'tasks'`) для feature segment anchor substitution.
        // Round 1 refactor сменил на `templateConfig.orchestrator.templateFeatureSegment` (hardcoded
        // в factory) → user-overridden `--templ-feature foo` против t115 templateConfig silently broken
        // (snippet substitution искал `features/foo/` anchor который в t115 template = `features/tasks/`,
        // не matched, no-op output retained literal `features/tasks/` import paths).
        //
        // Round 2: restored CLI flag primary с config fallback —
        // `config.templFeatureName ?? config.templateConfig.orchestrator.templateFeatureSegment`.
        //
        // Этот test exercises non-default CLI flag (templFeatureName='customFoo') против t115
        // templateConfig (templateFeatureSegment='tasks'). Output должен иметь `features/expense/`
        // (target feature, properly substituted из anchor), НЕ literal `features/tasks/` (silent
        // breakage от Round 1 regression).
        const altOrchestratorPath = `${PROJECTS_PATH}/${TARGET_PROJECT}/${TARGET_PROJECT}_flutter/lib/core/sync/sync_orchestrator_provider.dart`;
        const orchestratorBaseline = `// manifest: startProject
// === generated_start:syncImports ===
// === generated_end:syncImports ===
const List<String> syncEntityTypes = <String>[
  // === generated_start:syncEntityTypes ===
  // === generated_end:syncEntityTypes ===
];
void wireUp() {
  // === generated_start:syncRegistrations ===
  // === generated_end:syncRegistrations ===
}
`;

        // Custom template config где snippet содержит anchor `features/custom_foo/` —
        // эмулирует custom template's snippet literal. CLI flag value `customFoo` через
        // toSnakeCase → `custom_foo` → matches anchor.
        //
        // КЛЮЧЕВАЯ деталь H-1 fix verification: `templateFeatureSegment` (config field) остаётся
        // default `'tasks'` (из t115TemplateConfig spread). Pre-Round-2 patcher выбрал бы
        // `'tasks'` → toSnakeCase('tasks')='tasks' → искал `features/tasks/` anchor в snippet —
        // не нашёл (snippet содержит `features/custom_foo/`) → no-op → output retains literal
        // `features/custom_foo/` (НЕ substituted на target).
        //
        // Round 2 patcher выбирает CLI flag value (primary) → toSnakeCase('customFoo')='custom_foo'
        // → matches anchor `features/custom_foo/` → substitutes на target `features/expense/`.
        const customTemplateConfig = {
            ...t115TemplateConfig(),
            orchestrator: {
                ...t115TemplateConfig().orchestrator,
                // Snippet с anchor `features/custom_foo/` — substitution требует snake_case anchor
                // (per `_substitutePlaceholders` step 1: `features/${tplFeatureSnake}/`).
                entityImportsTemplate: `import '../../features/custom_foo/data/adapters/category/category_remote_adapter.dart';`,
                // templateFeatureSegment остаётся 'tasks' (default из t115TemplateConfig spread).
                // CLI flag (`templFeatureName: 'customFoo'`) должен win primary.
            },
        };

        const config = new GenerationConfig({
            templProject: 't115',
            templEntity: 'category',
            targetEntity: '',
            templatesPath: TEMPLATES_PATH,
            projectsPath: PROJECTS_PATH,
            targetProject: TARGET_PROJECT,
            // CLI flag override — non-default. Pre-Round-2 silently ignored.
            templFeatureName: 'customFoo',
            targetFeaturePath: `${PROJECTS_PATH}/${TARGET_PROJECT}/${TARGET_PROJECT}_flutter/lib/features/expense`,
            workspacesPath: `${PROJECTS_PATH}/${TARGET_PROJECT}`,
            templateConfig: customTemplateConfig,
        });

        mockFs.setFile(altOrchestratorPath, orchestratorBaseline);

        await patcher.patch(config, makeModel('Expense'));

        const result = await mockFs.readFile(altOrchestratorPath);

        // POSITIVE: CLI flag value `customFoo` (snake `custom_foo`) → matched anchor →
        // substituted на target `features/expense/`.
        assert.ok(
            result.includes('features/expense/'),
            'H-1 Round 2: CLI flag `templFeatureName: customFoo` (snake `custom_foo`) matches snippet anchor → substituted на target features/expense/',
        );

        // NEGATIVE: literal `features/custom_foo/` НЕ leak в output (substitution произошёл).
        assert.ok(
            !result.includes('features/custom_foo/'),
            'H-1 Round 2: substitution успешно произошёл; literal features/custom_foo/ НЕ leak',
        );

        // NEGATIVE: `features/tasks/` НЕ должен появиться в output. Если patcher mistakenly
        // использовал templateFeatureSegment='tasks' (Round 1 regression), anchor поиск
        // `features/tasks/` не matches snippet `features/custom_foo/` → no-op → output retains
        // literal `features/custom_foo/`. Тоже covered позитивным assertion выше через `expense`.
        assert.ok(
            !result.includes('features/tasks/'),
            'H-1 Round 2: t115 templateFeatureSegment default `tasks` НЕ leak (CLI flag won, не config fallback)',
        );
    });

    test('BUG-012: junction с multi-word snake parent (terminalSet) → docstring/methods используют lowerCamel form', async () => {
        // Discussion #5 confirmed weight production landmine: customer_user.spy.yaml
        // имеет defaultTerminalSetId, parent=terminal_set. Parser даёт relatedModel='terminalSet'
        // (snake→lowerCamel). Junction docstring + method name должны использовать lowerCamel
        // (не lowercase 'terminalset' который ломал cap() → 'Terminalset' вместо 'TerminalSet').
        mockFs.setFile(ORCHESTRATOR_PATH, ORCHESTRATOR_BASELINE);

        const customerTerminal = makeJunctionModel('CustomerTerminalLink', [
            fkField('customerId', 'customer'),
            { name: 'defaultTerminalSetId', type: 'UuidValue', nullable: false, isRelation: true, relationType: 'manyToOne', relatedModel: 'terminalSet' },
        ]);

        await patcher.patch(makeConfig(), customerTerminal);

        const result = await mockFs.readFile(ORCHESTRATOR_PATH);

        // Docstring lowerCamel form (не lowercase 'terminalset').
        assert.ok(
            result.includes('junction FK→customer+terminalSet'),
            'BUG-012: docstring должен содержать lowerCamel `terminalSet` (НЕ lowercase `terminalset`)',
        );

        // Method name PascalCase (cap('terminalSet')='TerminalSet').
        assert.ok(
            result.includes('ByCustomerAndTerminalSet'),
            'BUG-012: method-name должен использовать PascalCase `TerminalSet` (НЕ `Terminalset`)',
        );

        // Negative — no broken lowercase variant.
        assert.ok(
            !result.includes('terminalset'),
            'BUG-012: lowercase `terminalset` (broken old behavior) НЕ должен присутствовать',
        );
        assert.ok(
            !result.includes('Terminalset'),
            'BUG-012: incorrect PascalCase `Terminalset` НЕ должен присутствовать',
        );
    });
});
