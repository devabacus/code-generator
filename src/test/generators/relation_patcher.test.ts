import * as assert from 'assert';
import { RelationPatcher } from '../../features/generation/generators/relation_patcher';
import { GenerationConfig } from '../../features/generation/config/generation_config';
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
            ],
        };

        await patcher.patch(config, model);

        const result = await mockFs.readFile(multiWordDestPath);
        assert.ok(result.includes('// === generated_start:oneToManyMethods ==='), 'marker should be inserted at snake_case path');
        assert.ok(result.includes('getCorrectionButtonsByShiftId'), 'method should use camelCase identifier');
    });
});
