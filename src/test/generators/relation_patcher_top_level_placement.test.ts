import * as assert from 'assert';
import { RelationPatcher } from '../../features/generation/generators/relation_patcher';
import { GenerationConfig } from '../../features/generation/config/generation_config';
import { ServerpodModel, ServerpodField } from '../../features/generation/parsers/formatters/types';
import { MockFileSystem } from '../mocks/mock_file_system';

// BUG-013 regression coverage — top-level EOF marker placement (usecases/providers).
// Existing relation_patcher.test.ts covers DAO template ending `}` (in-class placement).
// Этот тест-сюит покрывает Gemini_1 critical requirement (Discussion #4):
// marker в template ending comment должен appendиться at EOF, НЕ inside class —
// иначе isBlockInClass heuristic вставит generated block перед последней `}` → syntax garbage.

const TEMPLATES_PATH = '/test/templates';
const PROJECTS_PATH = '/test/projects';

const SRC_BASE = `${TEMPLATES_PATH}/flutter/t115/t115_flutter/lib/features/tasks`;
const DEST_BASE = `${PROJECTS_PATH}/weight/weight_flutter/lib/features/weighing`;

// task_usecases.dart-style: template ending comment (top-level EOF marker)
const TASK_USECASES_PATH = `${SRC_BASE}/domain/usecases/task_usecases.dart`;
const CATEGORY_USECASES_PATH = `${SRC_BASE}/domain/usecases/category_usecases.dart`;
const DEST_USECASES_PATH = `${DEST_BASE}/domain/usecases/weighing_usecases.dart`;

const TASK_USECASES_TEMPLATE = `// manifest: entity
// === generated_start:base ===
class CreateTaskUseCase {
  final ITaskRepository _repository;
  CreateTaskUseCase(this._repository);
  Future<UuidValue?> call(TaskEntity entity) => _repository.createTask(entity);
}

class WatchTasksUseCase {
  final ITaskRepository _repository;
  WatchTasksUseCase(this._repository);
  Stream<List<TaskEntity>> call() => _repository.watchTasks();
}
// === generated_end:base ===

// === generated_start:oneToManyMethods ===

class GetTasksByCategoryIdUseCase {
  final ITaskRepository _repository;

  GetTasksByCategoryIdUseCase(this._repository);

  Future<List<TaskEntity>> call(String categoryId) {
    return _repository.getTasksByCategoryId(categoryId);
  }
}

// === generated_end:oneToManyMethods ===
`;

const CATEGORY_USECASES_TEMPLATE = `// manifest: entity
// === generated_start:base ===
class CreateCategoryUseCase {}
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

suite('RelationPatcher Top-Level EOF Placement (BUG-013)', () => {
    let mockFs: MockFileSystem;
    let patcher: RelationPatcher;

    setup(() => {
        mockFs = new MockFileSystem();
        patcher = new RelationPatcher(mockFs);
        mockFs.setFile(CATEGORY_USECASES_PATH, CATEGORY_USECASES_TEMPLATE);
        mockFs.setFile(TASK_USECASES_PATH, TASK_USECASES_TEMPLATE);
    });

    test('top-level EOF placement: template ending comment + destination ending `}` → block appended AFTER destination class (NOT inside)', async () => {
        // Gemini_1 critical Discussion #4 requirement:
        // Если template ending comment (isBlockInClass=false) — patcher append at EOF.
        // Destination ending `}` (closing class) — block должен идти ПОСЛЕ class,
        // не внутри (иначе syntax garbage от inserting перед `}`).
        const dest = `// === generated_start:base ===
class CreateWeighingUseCase {
  final IWeighingRepository _repository;
  CreateWeighingUseCase(this._repository);
}

class WatchWeighingsUseCase {
  final IWeighingRepository _repository;
  WatchWeighingsUseCase(this._repository);
}
// === generated_end:base ===
`;
        mockFs.setFile(DEST_USECASES_PATH, dest);

        await patcher.patch(makeConfig(), makeModel([relationField('contractorId', 'contractor')]));

        const result = await mockFs.readFile(DEST_USECASES_PATH);

        // Marker должен быть вставлен
        assert.ok(result.includes('// === generated_start:oneToManyMethods ==='),
            'marker should be inserted');
        assert.ok(result.includes('GetWeighingsByContractorIdUseCase'),
            'use case class should be added with substituted name');

        // Critical Gemini_1 requirement: marker block после WatchWeighingsUseCase closing `}`,
        // НЕ внутри class. Verify через position сравнение:
        const watchClassEndIdx = result.indexOf('class WatchWeighingsUseCase');
        const markerStartIdx = result.indexOf('// === generated_start:oneToManyMethods ===');
        assert.ok(watchClassEndIdx !== -1, 'WatchWeighingsUseCase должен присутствовать');
        assert.ok(markerStartIdx > watchClassEndIdx,
            'marker block должен быть после WatchWeighingsUseCase declaration (top-level), не внутри');

        // Verify нет syntax garbage от inserting перед last `}`:
        // Если patcher ошибочно использовал isBlockInClass=true — было бы }`перед marker block.
        // При correct top-level placement — все class declarations целые, marker ниже.
        assert.ok(!result.includes('GetWeighingsByContractorIdUseCase\n}\n'),
            'класс не должен иметь dangling `}` после генерации (syntax garbage признак)');
    });

    test('top-level EOF placement: idempotent regen для usecases-style template', async () => {
        // Idempotency check для top-level EOF path (отдельно от DAO covered в existing test).
        // BUG-013: regen с тем же model должен produce identical content.
        const dest = `// === generated_start:base ===
class CreateWeighingUseCase {}
class WatchWeighingsUseCase {}
// === generated_end:base ===
`;
        mockFs.setFile(DEST_USECASES_PATH, dest);

        await patcher.patch(makeConfig(), makeModel([relationField('contractorId', 'contractor')]));
        const after1 = await mockFs.readFile(DEST_USECASES_PATH);

        await patcher.patch(makeConfig(), makeModel([relationField('contractorId', 'contractor')]));
        const after2 = await mockFs.readFile(DEST_USECASES_PATH);

        assert.strictEqual(after1, after2,
            'patching twice с тем же input должно produce identical content');

        const startMarkers = (after2.match(/generated_start:oneToManyMethods/g) || []).length;
        assert.strictEqual(startMarkers, 1,
            'должен быть ровно один marker block (no duplicates)');

        const useCaseClasses = (after2.match(/class GetWeighingsByContractorIdUseCase/g) || []).length;
        assert.strictEqual(useCaseClasses, 1,
            'use case class не должен быть duplicated');
    });

    test('top-level EOF placement: multiple FK iteration produces multiple use case classes в одном marker block', async () => {
        // Multi-FK regression coverage для top-level EOF path (existing test covers DAO).
        // BUG-013: каждая FK relation должна produce свою use case class в одном
        // marker block (top-level EOF, после WatchWeighingsUseCase).
        const dest = `// === generated_start:base ===
class CreateWeighingUseCase {}
class WatchWeighingsUseCase {}
// === generated_end:base ===
`;
        mockFs.setFile(DEST_USECASES_PATH, dest);

        await patcher.patch(makeConfig(), makeModel([
            relationField('contractorId', 'contractor'),
            relationField('vehicleId', 'vehicle'),
        ]));

        const result = await mockFs.readFile(DEST_USECASES_PATH);

        // Both use case classes должны присутствовать
        assert.ok(result.includes('class GetWeighingsByContractorIdUseCase'),
            'contractor use case class должен быть added');
        assert.ok(result.includes('class GetWeighingsByVehicleIdUseCase'),
            'vehicle use case class должен быть added');

        // Один marker block, не два
        const startMarkers = (result.match(/generated_start:oneToManyMethods/g) || []).length;
        const endMarkers = (result.match(/generated_end:oneToManyMethods/g) || []).length;
        assert.strictEqual(startMarkers, 1, 'должен быть ровно один start marker');
        assert.strictEqual(endMarkers, 1, 'должен быть ровно один end marker');

        // Both classes в правильном порядке (contractor first, vehicle second per relation order)
        const contractorIdx = result.indexOf('class GetWeighingsByContractorIdUseCase');
        const vehicleIdx = result.indexOf('class GetWeighingsByVehicleIdUseCase');
        assert.ok(contractorIdx < vehicleIdx,
            'use cases должны быть в порядке declaration в model.fields');
    });
});
