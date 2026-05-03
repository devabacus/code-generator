import * as assert from 'assert';
import { RelationPatcher } from '../../features/generation/generators/relation_patcher';
import { GenerationConfig } from '../../features/generation/config/generation_config';
import { t115TemplateConfig } from '../../features/generation/config/template_config';
import { ServerpodModel, ServerpodField } from '../../features/generation/parsers/formatters/types';
import { MockFileSystem } from '../mocks/mock_file_system';

const TEMPLATES_PATH = '/test/templates';
const PROJECTS_PATH = '/test/projects';

const SRC_BASE = `${TEMPLATES_PATH}/flutter/t115/t115_flutter/lib/features/tasks`;
const DEST_BASE = `${PROJECTS_PATH}/weight/weight_flutter/lib/features/weighing`;

const CATEGORY_DAO_PATH = `${SRC_BASE}/data/datasources/local/daos/category/category_dao.dart`;
const TASK_DAO_PATH = `${SRC_BASE}/data/datasources/local/daos/task/task_dao.dart`;
const DEST_DAO_PATH = `${DEST_BASE}/data/datasources/local/daos/weighing/weighing_dao.dart`;

const TASK_DAO_TEMPLATE = `// manifest: entity
// === generated_start:base ===
class TaskDao {
  Future<void> placeholder() => Future.value();
  // === generated_end:base ===

  // === generated_start:oneToManyMethods ===
  Future<List<TaskTableData>> getTasksByCategoryId(String categoryId) =>
      _db.select(taskTable);
  // === generated_end:oneToManyMethods ===
}
`;

const CATEGORY_DAO_TEMPLATE = `// manifest: entity
// === generated_start:base ===
class CategoryDao {}
// === generated_end:base ===
`;

function relationField(name: string, relatedModel: string): ServerpodField {
    return {
        name,
        type: 'UuidValue',
        nullable: false,
        isRelation: true,
        relationType: 'manyToOne',
        relatedModel,
    };
}

function makeModel(extraRelations: ServerpodField[]): ServerpodModel {
    return {
        className: 'Weighing',
        tableName: 'weighing',
        isRelation: false,
        fields: [
            { name: 'id', type: 'UuidValue', nullable: true },
            { name: 'userId', type: 'int', nullable: false },
            relationField('customerId', 'customer'),
            ...extraRelations,
            // TASK-013: domain field обязателен — без него JunctionDetector
            // classifies fixture как junction (2+ FK + 0 business fields), и
            // RelationPatcher skips. Реальный Weighing содержит ticketNumber/etc.
            { name: 'ticketNumber', type: 'String', nullable: false },
        ],
    };
}

function makeConfig(): GenerationConfig {
    return new GenerationConfig({
        templProject: 't115',
        templEntity: 'category',
        targetEntity: 'weighing',
        templatesPath: TEMPLATES_PATH,
        projectsPath: PROJECTS_PATH,
        targetProject: 'weight',
        templFeatureName: 'tasks',
        targetFeaturePath: DEST_BASE,
        workspacesPath: `${PROJECTS_PATH}/weight`,
    });
}

suite('RelationPatcher Test Suite', () => {
    let mockFs: MockFileSystem;
    let patcher: RelationPatcher;

    setup(() => {
        mockFs = new MockFileSystem();
        patcher = new RelationPatcher(mockFs);
        mockFs.setFile(CATEGORY_DAO_PATH, CATEGORY_DAO_TEMPLATE);
        mockFs.setFile(TASK_DAO_PATH, TASK_DAO_TEMPLATE);
    });

    test('inserts relation block into destination without :oneToManyMethods marker', async () => {
        const dest = `// === generated_start:base ===
class WeighingDao {
  Future<void> placeholder() => Future.value();
  // === generated_end:base ===
}
`;
        mockFs.setFile(DEST_DAO_PATH, dest);

        await patcher.patch(makeConfig(), makeModel([relationField('contractorId', 'contractor')]));

        const result = await mockFs.readFile(DEST_DAO_PATH);
        assert.ok(result.includes('// === generated_start:oneToManyMethods ==='), 'marker should be inserted');
        assert.ok(result.includes('getWeighingsByContractorId'), 'method should be added');
        assert.ok(result.includes('contractorId'), 'parameter should be renamed');
    });

    test('replaces existing :oneToManyMethods block on regen (idempotent)', async () => {
        const destBefore = `// === generated_start:base ===
class WeighingDao {
  Future<void> placeholder() => Future.value();
  // === generated_end:base ===

  // === generated_start:oneToManyMethods ===
  Future<List<WeighingTableData>> getWeighingsByContractorId(String contractorId) =>
      _db.select(weighingTable);
  // === generated_end:oneToManyMethods ===
}
`;
        mockFs.setFile(DEST_DAO_PATH, destBefore);

        await patcher.patch(makeConfig(), makeModel([relationField('contractorId', 'contractor')]));
        const after1 = await mockFs.readFile(DEST_DAO_PATH);

        await patcher.patch(makeConfig(), makeModel([relationField('contractorId', 'contractor')]));
        const after2 = await mockFs.readFile(DEST_DAO_PATH);

        assert.strictEqual(after1, after2, 'patching twice with same input must yield identical content');
        const occurrences = (after2.match(/getWeighingsByContractorId/g) || []).length;
        assert.strictEqual(occurrences, 1, 'method must not be duplicated');
    });

    test('adds new relation method on regen with extra relation (BUG-003 regression)', async () => {
        const destBefore = `// === generated_start:base ===
class WeighingDao {
  Future<void> placeholder() => Future.value();
  // === generated_end:base ===

  // === generated_start:oneToManyMethods ===
  Future<List<WeighingTableData>> getWeighingsByContractorId(String contractorId) =>
      _db.select(weighingTable);
  // === generated_end:oneToManyMethods ===
}
`;
        mockFs.setFile(DEST_DAO_PATH, destBefore);

        await patcher.patch(makeConfig(), makeModel([
            relationField('contractorId', 'contractor'),
            relationField('vehicleId', 'vehicle'),
        ]));

        const result = await mockFs.readFile(DEST_DAO_PATH);
        assert.ok(result.includes('getWeighingsByContractorId'), 'existing relation method retained');
        assert.ok(result.includes('getWeighingsByVehicleId'), 'new relation method added');
    });

    test('skips when destination file does not exist', async () => {
        await patcher.patch(makeConfig(), makeModel([relationField('contractorId', 'contractor')]));

        const exists = await mockFs.exists(DEST_DAO_PATH);
        assert.strictEqual(exists, false, 'patcher must not create the destination file');
    });

    test('consolidates legacy duplicate :oneToManyMethods marker pairs into a single block', async () => {
        // Симулируем повреждённое состояние от старой версии patcher'а: 4 marker-пары
        const destBefore = `// === generated_start:base ===
class WeighingDao {
  Future<void> placeholder() => Future.value();
  // === generated_end:base ===

  // === generated_start:oneToManyMethods ===
  Future<List<WeighingTableData>> getWeighingsByContractorId(String contractorId) => _db.select();
  // === generated_end:oneToManyMethods ===

  // === generated_start:oneToManyMethods ===
  Future<List<WeighingTableData>> getWeighingsByVehicleId(String vehicleId) => _db.select();
  // === generated_end:oneToManyMethods ===

  // === generated_start:oneToManyMethods ===
  Future<List<WeighingTableData>> getWeighingsByContractorId(String contractorId) => _db.select();
  // === generated_end:oneToManyMethods ===

  // === generated_start:oneToManyMethods ===
  Future<List<WeighingTableData>> getWeighingsByVehicleId(String vehicleId) => _db.select();
  // === generated_end:oneToManyMethods ===
}
`;
        mockFs.setFile(DEST_DAO_PATH, destBefore);

        await patcher.patch(makeConfig(), makeModel([
            relationField('contractorId', 'contractor'),
            relationField('vehicleId', 'vehicle'),
        ]));

        const result = await mockFs.readFile(DEST_DAO_PATH);
        const startMarkers = (result.match(/generated_start:oneToManyMethods/g) || []).length;
        const endMarkers = (result.match(/generated_end:oneToManyMethods/g) || []).length;
        assert.strictEqual(startMarkers, 1, 'should have exactly one start marker');
        assert.strictEqual(endMarkers, 1, 'should have exactly one end marker');
        assert.ok(result.includes('getWeighingsByContractorId'), 'contractor method retained');
        assert.ok(result.includes('getWeighingsByVehicleId'), 'vehicle method retained');
    });

    test('no-op when model has no manyToOne relations beyond customerId', async () => {
        const dest = `// === generated_start:base ===\nclass WeighingDao {}\n// === generated_end:base ===\n`;
        mockFs.setFile(DEST_DAO_PATH, dest);

        await patcher.patch(makeConfig(), makeModel([]));

        const result = await mockFs.readFile(DEST_DAO_PATH);
        assert.strictEqual(result, dest, 'destination file must remain unchanged');
    });

    // ====================================================================================
    // TASK-017 — DAO substitution rewrite (Approach A: order swap)
    //
    // Coverage: 5 mandatory test groups per Discussion #6 Decision item Q4.
    // Each group has BOTH positive and negative assertions (PR #8 paranoid pattern,
    // Decision item #10).
    //
    // Group 1: simple FK alias (assigneeId, parent=member)
    // Group 2: snake production-shaped (defaultTerminalSetId, parent=terminal_set)
    // Group 3: multiple FK aliases — verify processedBodies preservation, no cross-contamination
    // Group 4: backwards compat identity (categoryId, parent=category) — exact preservation
    // Group 5: 7 marker layers smoke (verified Discussion #6 audit)
    // ====================================================================================

    // Production-shaped DAO template для TASK-017 groups: содержит column refs
    // (`t.categoryId.equals(categoryId)`), что критично для verifying field-Id preservation
    // в DAO layer (matches actual t115/.../task_dao.dart shape).
    const TASK_DAO_PROD_TEMPLATE = `// manifest: entity
// === generated_start:base ===
class TaskDao {
  Future<void> placeholder() => Future.value();
  // === generated_end:base ===

  // === generated_start:oneToManyMethods ===
  Future<List<TaskTableData>> getTasksByCategoryId(
    String categoryId,
  ) =>
      (select(taskTable)..where((t) => t.categoryId.equals(categoryId))).get();
  // === generated_end:oneToManyMethods ===
}
`;

    test('TASK-017 / Group 1: simple FK alias (assigneeId, parent=member) — method/param/column preserved', async () => {
        // Field name 'assigneeId' is FK alias — relatedModel = 'member' (parent=member).
        // After fix: method/param/column refs preserve 'assigneeId'; class refs derive from 'member'.
        mockFs.setFile(TASK_DAO_PATH, TASK_DAO_PROD_TEMPLATE);
        const dest = `// === generated_start:base ===
class WeighingDao {
  Future<void> placeholder() => Future.value();
  // === generated_end:base ===
}
`;
        mockFs.setFile(DEST_DAO_PATH, dest);

        await patcher.patch(makeConfig(), makeModel([relationField('assigneeId', 'member')]));

        const result = await mockFs.readFile(DEST_DAO_PATH);

        // Positive — field alias preserved in method/param/column refs
        assert.ok(result.includes('getWeighingsByAssigneeId'), 'method name should preserve assigneeId field alias');
        assert.ok(result.includes('String assigneeId'), 'parameter name should preserve assigneeId field alias');
        assert.ok(result.includes('t.assigneeId.equals(assigneeId)'), 'column ref should preserve assigneeId');

        // Negative — НЕТ leak parent-derived names в method/param/column contexts
        assert.ok(!result.includes('getWeighingsByMemberId'), 'parent-derived method name MUST NOT leak (BUG-012 root regression)');
        assert.ok(!result.includes('String memberId'), 'parent-derived parameter MUST NOT leak');
        assert.ok(!result.includes('t.memberId'), 'parent-derived column ref MUST NOT leak');
        assert.ok(!result.includes('categoryId'), 'template literal categoryId MUST NOT remain');
        assert.ok(!result.includes('CategoryId'), 'template PascalCase CategoryId MUST NOT remain');
        assert.ok(!result.includes('teamMemberId'), 'should not contain teamMemberId (typo guard for adversarial cases)');
    });

    test('TASK-017 / Group 2: snake production-shaped (defaultTerminalSetId, parent=terminal_set → relatedModel terminalSet post-parser) — multi-word + snake leak guard', async () => {
        // Production-shaped scenario из weight (CustomerUser landmine).
        // YAML: `defaultTerminalSetId: UuidValue?, relation(parent=terminal_set, ...)`.
        // server_yaml_parser нормализует parent='terminal_set' → relatedModel='terminalSet' (camelCase, post-parser shape).
        // relation_patcher принимает уже camelCase relatedModel — fixture exercises post-parser shape.
        // After fix: method/param/column refs preserve 'defaultTerminalSetId';
        // НИГДЕ не должно быть snake leak `terminal_setId` (broken identifier).
        mockFs.setFile(TASK_DAO_PATH, TASK_DAO_PROD_TEMPLATE);
        const dest = `// === generated_start:base ===
class WeighingDao {
  Future<void> placeholder() => Future.value();
  // === generated_end:base ===
}
`;
        mockFs.setFile(DEST_DAO_PATH, dest);

        await patcher.patch(makeConfig(), makeModel([relationField('defaultTerminalSetId', 'terminalSet')]));

        const result = await mockFs.readFile(DEST_DAO_PATH);

        // Positive — multi-word field alias preserved
        assert.ok(result.includes('getWeighingsByDefaultTerminalSetId'), 'method name preserves multi-word field alias');
        assert.ok(result.includes('String defaultTerminalSetId'), 'parameter preserves multi-word field alias');
        assert.ok(result.includes('t.defaultTerminalSetId.equals(defaultTerminalSetId)'), 'column ref preserves multi-word field alias');

        // Negative — никаких snake leaks или partial substitutions
        assert.ok(!result.includes('terminal_setId'), 'snake_case leak `terminal_setId` MUST NOT appear (broken identifier)');
        assert.ok(!result.includes('getWeighingsByTerminalSetId'), 'parent-derived method MUST NOT leak (без default prefix)');
        assert.ok(!result.includes('String terminalSetId,'), 'parent-derived parameter MUST NOT leak (без default prefix)');
        assert.ok(!result.includes('categoryId'), 'template literal categoryId MUST NOT remain');
        assert.ok(!result.includes('CategoryId'), 'template PascalCase CategoryId MUST NOT remain');
    });

    test('TASK-017 / Group 3: multiple FK aliases — no cross-contamination между fields', async () => {
        // Receipt-style scenario: 2 FK aliases в одной сущности.
        // Verify processedBodies содержит BOTH methods, и aliases не leak друг в друга.
        mockFs.setFile(TASK_DAO_PATH, TASK_DAO_PROD_TEMPLATE);
        const dest = `// === generated_start:base ===
class WeighingDao {
  Future<void> placeholder() => Future.value();
  // === generated_end:base ===
}
`;
        mockFs.setFile(DEST_DAO_PATH, dest);

        await patcher.patch(makeConfig(), makeModel([
            relationField('assigneeId', 'member'),
            relationField('cargoTypeId', 'cargoType'),
        ]));

        const result = await mockFs.readFile(DEST_DAO_PATH);

        // Positive — оба method aliases preserved
        assert.ok(result.includes('getWeighingsByAssigneeId'), 'first FK alias method preserved');
        assert.ok(result.includes('String assigneeId'), 'first FK alias parameter preserved');
        assert.ok(result.includes('t.assigneeId.equals(assigneeId)'), 'first FK alias column ref preserved');

        assert.ok(result.includes('getWeighingsByCargoTypeId'), 'second FK alias method preserved');
        assert.ok(result.includes('String cargoTypeId'), 'second FK alias parameter preserved');
        assert.ok(result.includes('t.cargoTypeId.equals(cargoTypeId)'), 'second FK alias column ref preserved');

        // Negative — никакого cross-contamination или parent-derived leaks
        assert.ok(!result.includes('memberId'), 'first parent-derived MUST NOT leak');
        assert.ok(!result.includes('Member'), 'no Member contamination in any context (PascalCase parent name MUST NOT leak)');
        assert.ok(!result.includes('getWeighingsByMemberId'), 'first FK parent-name method MUST NOT leak');
        assert.ok(!result.includes('categoryId'), 'template literal categoryId MUST NOT remain');

        // Idempotency check — оба method present один раз каждый
        const assigneeOccurrences = (result.match(/getWeighingsByAssigneeId/g) || []).length;
        const cargoTypeOccurrences = (result.match(/getWeighingsByCargoTypeId/g) || []).length;
        assert.strictEqual(assigneeOccurrences, 1, 'assignee method should appear exactly once');
        assert.strictEqual(cargoTypeOccurrences, 1, 'cargoType method should appear exactly once');
    });

    test('TASK-017 / Group 4: backwards compat identity (categoryId, parent=category) — no regression', async () => {
        // Identity case: field name = templateRelatedEntity + 'Id'.
        // Substitution должен быть identity (no-op для field-Id refs), backwards compat preserved.
        mockFs.setFile(TASK_DAO_PATH, TASK_DAO_PROD_TEMPLATE);
        const dest = `// === generated_start:base ===
class WeighingDao {
  Future<void> placeholder() => Future.value();
  // === generated_end:base ===
}
`;
        mockFs.setFile(DEST_DAO_PATH, dest);

        await patcher.patch(makeConfig(), makeModel([relationField('categoryId', 'category')]));

        const result = await mockFs.readFile(DEST_DAO_PATH);

        // Positive — exact preservation как до TASK-017
        assert.ok(result.includes('getWeighingsByCategoryId'), 'identity case method name preserved');
        assert.ok(result.includes('String categoryId'), 'identity case parameter preserved');
        assert.ok(result.includes('t.categoryId.equals(categoryId)'), 'identity case column ref preserved');

        // Negative — никаких alias artifacts от order swap implementation
        assert.ok(!result.includes('teamMemberId'), 'no teamMemberId contamination (sanity)');
        assert.ok(!result.includes('TeamMember'), 'no TeamMember contamination (sanity)');
        assert.ok(!result.includes('assigneeId'), 'no assigneeId contamination (sanity)');
        assert.ok(!result.includes('AssigneeId'), 'no AssigneeId PascalCase contamination (sanity)');

        // Re-run idempotency check (regen with same input → same output)
        await patcher.patch(makeConfig(), makeModel([relationField('categoryId', 'category')]));
        const result2 = await mockFs.readFile(DEST_DAO_PATH);
        assert.strictEqual(result, result2, 'identity case must be idempotent on regen');
    });

    test('TASK-017 / Group 5: 7 marker layers smoke (DAO + repository_impl + interface variants)', async () => {
        // Discussion #6 verified: 7 marker consumers в `t115_flutter/lib/features/tasks/`:
        // 1. domain/repositories/task_repository.dart (interface)
        // 2. data/repositories/task_repository_impl.dart
        // 3. data/datasources/local/interfaces/task_local_datasource_service.dart (interface)
        // 4. data/datasources/local/datasources/task_local_data_source.dart (concrete)
        // 5. data/datasources/local/daos/task/task_dao.dart (concrete — column refs)
        // 6. domain/usecases/task_usecases.dart
        // 7. domain/providers/task/task_usecase_providers.dart
        //
        // Каждый layer имеет свой body shape. Mini-fixtures с FK alias (assigneeId, parent=member),
        // verify each destination получает field-alias-preserved body.

        // Helper для PascalCase variant в method name body
        const TASKS_REPO_INTERFACE = `// manifest: entity
// === generated_start:base ===
abstract class TaskRepository {
  // === generated_end:base ===

  // === generated_start:oneToManyMethods ===
  Future<List<TaskEntity>> getTasksByCategoryId(String categoryId);
  // === generated_end:oneToManyMethods ===
}
`;
        const TASKS_REPO_IMPL = `// manifest: entity
// === generated_start:base ===
class TaskRepositoryImpl {
  // === generated_end:base ===

  // === generated_start:oneToManyMethods ===
  @override
  Future<List<TaskEntity>> getTasksByCategoryId(String categoryId) =>
      _localDataSource.getTasksByCategoryId(categoryId);
  // === generated_end:oneToManyMethods ===
}
`;
        const TASKS_LDS_INTERFACE = `// manifest: entity
// === generated_start:base ===
abstract class TaskLocalDatasourceService {
  // === generated_end:base ===

  // === generated_start:oneToManyMethods ===
  Future<List<TaskTableData>> getTasksByCategoryId(String categoryId);
  // === generated_end:oneToManyMethods ===
}
`;
        const TASKS_LDS_CONCRETE = `// manifest: entity
// === generated_start:base ===
class TaskLocalDataSource {
  // === generated_end:base ===

  // === generated_start:oneToManyMethods ===
  @override
  Future<List<TaskTableData>> getTasksByCategoryId(String categoryId) =>
      _taskDao.getTasksByCategoryId(categoryId);
  // === generated_end:oneToManyMethods ===
}
`;
        const TASKS_USECASES = `// manifest: entity
// === generated_start:base ===
class TaskUseCases {
  // === generated_end:base ===

  // === generated_start:oneToManyMethods ===
  Future<List<TaskEntity>> getTasksByCategoryId(String categoryId) =>
      _repository.getTasksByCategoryId(categoryId);
  // === generated_end:oneToManyMethods ===
}
`;
        const TASKS_PROVIDERS = `// manifest: entity
// === generated_start:base ===
class TaskUseCaseProviders {
  // === generated_end:base ===

  // === generated_start:oneToManyMethods ===
  static final getTasksByCategoryIdProvider = Provider((ref) => ref.read(taskUseCasesProvider).getTasksByCategoryId);
  // === generated_end:oneToManyMethods ===
}
`;

        // Source layer paths (templEntity = 'category' sentinel — patcher делает swap к 'task' source)
        const CATEGORY_REPO_INTERFACE = `${SRC_BASE}/domain/repositories/category_repository.dart`;
        const TASK_REPO_INTERFACE = `${SRC_BASE}/domain/repositories/task_repository.dart`;
        const CATEGORY_REPO_IMPL = `${SRC_BASE}/data/repositories/category_repository_impl.dart`;
        const TASK_REPO_IMPL = `${SRC_BASE}/data/repositories/task_repository_impl.dart`;
        const CATEGORY_LDS_INTERFACE = `${SRC_BASE}/data/datasources/local/interfaces/category_local_datasource_service.dart`;
        const TASK_LDS_INTERFACE = `${SRC_BASE}/data/datasources/local/interfaces/task_local_datasource_service.dart`;
        const CATEGORY_LDS_CONCRETE = `${SRC_BASE}/data/datasources/local/datasources/category_local_data_source.dart`;
        const TASK_LDS_CONCRETE = `${SRC_BASE}/data/datasources/local/datasources/task_local_data_source.dart`;
        const CATEGORY_USECASES = `${SRC_BASE}/domain/usecases/category_usecases.dart`;
        const TASK_USECASES = `${SRC_BASE}/domain/usecases/task_usecases.dart`;
        const CATEGORY_PROVIDERS = `${SRC_BASE}/domain/providers/category/category_usecase_providers.dart`;
        const TASK_PROVIDERS = `${SRC_BASE}/domain/providers/task/task_usecase_providers.dart`;

        // Destination layer paths (target entity = weighing)
        const DEST_REPO_INTERFACE = `${DEST_BASE}/domain/repositories/weighing_repository.dart`;
        const DEST_REPO_IMPL = `${DEST_BASE}/data/repositories/weighing_repository_impl.dart`;
        const DEST_LDS_INTERFACE = `${DEST_BASE}/data/datasources/local/interfaces/weighing_local_datasource_service.dart`;
        const DEST_LDS_CONCRETE = `${DEST_BASE}/data/datasources/local/datasources/weighing_local_data_source.dart`;
        const DEST_USECASES = `${DEST_BASE}/domain/usecases/weighing_usecases.dart`;
        const DEST_PROVIDERS = `${DEST_BASE}/domain/providers/weighing/weighing_usecase_providers.dart`;

        // Setup all 7 source pairs (sentinel + task) — DAO already in setup()
        mockFs.setFile(CATEGORY_REPO_INTERFACE, '// manifest: entity\n// stub\n');
        mockFs.setFile(TASK_REPO_INTERFACE, TASKS_REPO_INTERFACE);
        mockFs.setFile(CATEGORY_REPO_IMPL, '// manifest: entity\n// stub\n');
        mockFs.setFile(TASK_REPO_IMPL, TASKS_REPO_IMPL);
        mockFs.setFile(CATEGORY_LDS_INTERFACE, '// manifest: entity\n// stub\n');
        mockFs.setFile(TASK_LDS_INTERFACE, TASKS_LDS_INTERFACE);
        mockFs.setFile(CATEGORY_LDS_CONCRETE, '// manifest: entity\n// stub\n');
        mockFs.setFile(TASK_LDS_CONCRETE, TASKS_LDS_CONCRETE);
        mockFs.setFile(CATEGORY_USECASES, '// manifest: entity\n// stub\n');
        mockFs.setFile(TASK_USECASES, TASKS_USECASES);
        mockFs.setFile(CATEGORY_PROVIDERS, '// manifest: entity\n// stub\n');
        mockFs.setFile(TASK_PROVIDERS, TASKS_PROVIDERS);

        // Setup all 7 destination layers
        const repoInterfaceDest = `// === generated_start:base ===\nabstract class WeighingRepository {}\n// === generated_end:base ===\n`;
        const repoImplDest = `// === generated_start:base ===\nclass WeighingRepositoryImpl {}\n// === generated_end:base ===\n`;
        const ldsInterfaceDest = `// === generated_start:base ===\nabstract class WeighingLocalDatasourceService {}\n// === generated_end:base ===\n`;
        const ldsConcreteDest = `// === generated_start:base ===\nclass WeighingLocalDataSource {}\n// === generated_end:base ===\n`;
        const usecasesDest = `// === generated_start:base ===\nclass WeighingUseCases {}\n// === generated_end:base ===\n`;
        const providersDest = `// === generated_start:base ===\nclass WeighingUseCaseProviders {}\n// === generated_end:base ===\n`;
        const daoDest = `// === generated_start:base ===\nclass WeighingDao {}\n// === generated_end:base ===\n`;

        mockFs.setFile(DEST_REPO_INTERFACE, repoInterfaceDest);
        mockFs.setFile(DEST_REPO_IMPL, repoImplDest);
        mockFs.setFile(DEST_LDS_INTERFACE, ldsInterfaceDest);
        mockFs.setFile(DEST_LDS_CONCRETE, ldsConcreteDest);
        mockFs.setFile(DEST_USECASES, usecasesDest);
        mockFs.setFile(DEST_PROVIDERS, providersDest);
        mockFs.setFile(DEST_DAO_PATH, daoDest);

        // FK alias scenario: assigneeId, parent=member
        await patcher.patch(makeConfig(), makeModel([relationField('assigneeId', 'member')]));

        // Layer-by-layer verification (positive + negative per layer)
        const layers = [
            { name: 'repository_interface', path: DEST_REPO_INTERFACE },
            { name: 'repository_impl', path: DEST_REPO_IMPL },
            { name: 'local_datasource_interface', path: DEST_LDS_INTERFACE },
            { name: 'local_data_source_concrete', path: DEST_LDS_CONCRETE },
            { name: 'usecases', path: DEST_USECASES },
            { name: 'usecase_providers', path: DEST_PROVIDERS },
            { name: 'dao', path: DEST_DAO_PATH },
        ];

        for (const layer of layers) {
            const layerResult = await mockFs.readFile(layer.path);

            // Positive: field alias preserved в method name (PascalCase part)
            assert.ok(
                layerResult.includes('getWeighingsByAssigneeId'),
                `[${layer.name}] method name should preserve assigneeId field alias`
            );

            // Negative: НЕТ parent-derived method name leak
            assert.ok(
                !layerResult.includes('getWeighingsByMemberId'),
                `[${layer.name}] parent-derived method MUST NOT leak (BUG-012 root regression)`
            );
            // Negative: НЕТ template literal `categoryId`
            assert.ok(
                !layerResult.includes('categoryId'),
                `[${layer.name}] template literal categoryId MUST NOT remain`
            );
            // Negative: НЕТ template PascalCase `CategoryId`
            assert.ok(
                !layerResult.includes('CategoryId'),
                `[${layer.name}] template PascalCase CategoryId MUST NOT remain`
            );
        }
    });

    // ====================================================================================
    // TASK-022 / Phase B1 — TemplateConfig injection tests
    //
    // Verifies что `RelationPatcher` читает literals из `config.templateConfig.relationPatcher.*`
    // вместо hardcoded `'task'` / `'category'` / `'oneToManyMethods'` / `['feature/', 'server/']`.
    // ====================================================================================

    test('TASK-022 / TemplateConfig: t115 config produces hardcoded-equivalent literals (regression)', async () => {
        // Verify что default GenerationConfig (без explicit templateConfig) использует
        // t115TemplateConfig() literals → behavior identical to pre-TASK-022 hardcoded.
        const config = makeConfig();
        // Sanity: default config содержит t115 literals.
        assert.strictEqual(config.templateConfig.name, 't115', 'default template config name = t115');
        assert.strictEqual(config.templateConfig.relationPatcher.templateMainEntity, 'task');
        assert.strictEqual(config.templateConfig.relationPatcher.templateRelatedEntity, 'category');
        assert.strictEqual(config.templateConfig.relationPatcher.markerName, 'oneToManyMethods');
        assert.deepStrictEqual(config.templateConfig.relationPatcher.scanDirectories, ['feature/', 'server/']);

        // Behavioral: используя default config, regular relation patching должен работать
        // как до TASK-022 (zero-diff invariant).
        const dest = `// === generated_start:base ===
class WeighingDao {
  Future<void> placeholder() => Future.value();
  // === generated_end:base ===
}
`;
        mockFs.setFile(DEST_DAO_PATH, dest);
        await patcher.patch(config, makeModel([relationField('contractorId', 'contractor')]));

        const result = await mockFs.readFile(DEST_DAO_PATH);
        assert.ok(result.includes('// === generated_start:oneToManyMethods ==='),
            't115 config: marker block inserted с oneToManyMethods (default markerName)');
        assert.ok(result.includes('getWeighingsByContractorId'),
            't115 config: relation method present (template behavior preserved)');
    });

    test('TASK-022 / TemplateConfig: alternate config (mock simplified-shaped) produces alt literals', async () => {
        // Mock alt-shaped TemplateConfig: подменяем `templateMainEntity` / `templateRelatedEntity` /
        // `markerName` на альтернативные literals. Эта tест демонстрирует proof-of-extensibility
        // (TASK-B2 simplified config будет plug-and-play).
        //
        // NOTE: alt config использует те же template files что и t115 (мы не создаём alternate
        // template fixtures — это TASK-B2 scope). Цель теста: verify что patcher reads literals
        // FROM CONFIG (по которым он строит markers + scan + entity swap), НЕ из hardcoded.
        const altMarkerName = 'altRelations';
        const altMainEntity = 'taskAlt'; // не существует в template files → patcher должен skip
        const altRelatedEntity = 'categoryAlt';
        const altConfigBuilder = (): GenerationConfig => new GenerationConfig({
            templProject: 't115',
            templEntity: altRelatedEntity, // sentinel для filter
            targetEntity: 'weighing',
            templatesPath: TEMPLATES_PATH,
            projectsPath: PROJECTS_PATH,
            targetProject: 'weight',
            templFeatureName: 'tasks',
            targetFeaturePath: DEST_BASE,
            workspacesPath: `${PROJECTS_PATH}/weight`,
            templateConfig: {
                name: 't115',
                relationPatcher: {
                    templateMainEntity: altMainEntity,
                    templateRelatedEntity: altRelatedEntity,
                    markerName: altMarkerName,
                    scanDirectories: ['feature/', 'server/'],
                },
                orchestrator: t115TemplateConfig().orchestrator,
                database: t115TemplateConfig().database,
            },
        });

        const dest = `// === generated_start:base ===
class WeighingDao {
  Future<void> placeholder() => Future.value();
  // === generated_end:base ===
}
`;
        mockFs.setFile(DEST_DAO_PATH, dest);

        // Existing TASK_DAO_PATH ('task_dao.dart') не matches `altMainEntity` ('taskAlt'),
        // поэтому patcher не найдёт template → no marker block insertion.
        await patcher.patch(altConfigBuilder(), makeModel([relationField('contractorId', 'contractor')]));

        const result = await mockFs.readFile(DEST_DAO_PATH);
        // Negative: марker block с altMarkerName НЕ должен быть в output (template файлов под
        // altMainEntity нет → patcher returns early).
        assert.ok(!result.includes(`generated_start:${altMarkerName}`),
            'alt config: no marker block т.к. template files не matches altMainEntity');
        // Negative: hardcoded `oneToManyMethods` literal не должен утечь
        assert.ok(!result.includes('generated_start:oneToManyMethods'),
            'alt config: hardcoded oneToManyMethods marker НЕ должен присутствовать (config-driven)');
        // Sanity: file content unchanged (patcher returned early, no destination write)
        assert.strictEqual(result, dest, 'alt config: dest file unchanged когда template missing');
    });

    test('TASK-022 / TemplateConfig: existing relation patching behavior unchanged под explicit t115 config (regression)', async () => {
        // Same as default makeConfig() but with EXPLICIT templateConfig: t115TemplateConfig()
        // — verify equivalence (zero-diff invariant с pre-TASK-022 hardcoded behavior).
        const explicitConfig = new GenerationConfig({
            templProject: 't115',
            templEntity: 'category',
            targetEntity: 'weighing',
            templatesPath: TEMPLATES_PATH,
            projectsPath: PROJECTS_PATH,
            targetProject: 'weight',
            templFeatureName: 'tasks',
            targetFeaturePath: DEST_BASE,
            workspacesPath: `${PROJECTS_PATH}/weight`,
            templateConfig: t115TemplateConfig(),
        });

        const dest = `// === generated_start:base ===
class WeighingDao {
  Future<void> placeholder() => Future.value();
  // === generated_end:base ===
}
`;
        mockFs.setFile(DEST_DAO_PATH, dest);

        await patcher.patch(explicitConfig, makeModel([relationField('vehicleId', 'vehicle')]));

        const resultExplicit = await mockFs.readFile(DEST_DAO_PATH);

        // Reset + run with default config (no explicit templateConfig).
        const mockFs2 = new MockFileSystem();
        const patcher2 = new RelationPatcher(mockFs2);
        mockFs2.setFile(CATEGORY_DAO_PATH, CATEGORY_DAO_TEMPLATE);
        mockFs2.setFile(TASK_DAO_PATH, TASK_DAO_TEMPLATE);
        mockFs2.setFile(DEST_DAO_PATH, dest);
        await patcher2.patch(makeConfig(), makeModel([relationField('vehicleId', 'vehicle')]));
        const resultDefault = await mockFs2.readFile(DEST_DAO_PATH);

        assert.strictEqual(resultExplicit, resultDefault,
            'explicit t115TemplateConfig() output identical to default config output (regression)');
    });

    test('multi-word target entity: destination path uses snake_case (BUG-002)', async () => {
        // Целевая сущность с составным именем — путь должен быть snake_case
        const multiWordDestPath = '/test/projects/weight/weight_flutter/lib/features/correction_button/data/datasources/local/daos/correction_button/correction_button_dao.dart';
        const destBefore = `// === generated_start:base ===
class CorrectionButtonDao {
  Future<void> placeholder() => Future.value();
  // === generated_end:base ===
}
`;
        mockFs.setFile(multiWordDestPath, destBefore);

        const config = new GenerationConfig({
            templProject: 't115',
            templEntity: 'category',
            targetEntity: 'correctionButton',
            templatesPath: TEMPLATES_PATH,
            projectsPath: PROJECTS_PATH,
            targetProject: 'weight',
            templFeatureName: 'tasks',
            targetFeaturePath: `${PROJECTS_PATH}/weight/weight_flutter/lib/features/correction_button`,
            workspacesPath: `${PROJECTS_PATH}/weight`,
        });

        const model: ServerpodModel = {
            className: 'CorrectionButton',
            tableName: 'correction_button',
            isRelation: false,
            fields: [
                { name: 'id', type: 'UuidValue', nullable: true },
                relationField('customerId', 'customer'),
                relationField('shiftId', 'shift'),
                // TASK-013: domain field обязателен — без него JunctionDetector
                // classifies fixture как junction (2 FK + 0 business). Реальная
                // CorrectionButton имеет position/label/value поля.
                { name: 'label', type: 'String', nullable: false },
            ],
        };

        await patcher.patch(config, model);

        const result = await mockFs.readFile(multiWordDestPath);
        assert.ok(result.includes('// === generated_start:oneToManyMethods ==='), 'marker should be inserted at snake_case path');
        assert.ok(result.includes('getCorrectionButtonsByShiftId'), 'method should use camelCase identifier');
    });
});
