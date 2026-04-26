import * as assert from 'assert';
import { AppDatabaseGenerator } from '../../features/generation/generators/app_database_generator';
import { GenerationConfig } from '../../features/generation/config/generation_config';
import { MockFileSystem } from '../mocks/mock_file_system';

const TEMPLATES_PATH = '/test/templates';
const PROJECTS_PATH = '/test/projects';

// templFlutterLibPath в GenerationConfig резолвится через projectsPath (не templatesPath),
// поэтому шаблонный database.dart мокаем по этому пути.
const TEMPLATE_DB_PATH = `${PROJECTS_PATH}/t115/t115_flutter/lib/core/data/datasources/local/database.dart`;
const TARGET_DB_PATH = `${PROJECTS_PATH}/weight/weight_flutter/lib/core/data/datasources/local/database.dart`;

const TEMPLATE_DB_CONTENT = `import 'package:drift/drift.dart';
import 'tables/sync_metadata_table.dart';
// === GENERATED_IMPORTS_START ===
// === GENERATED_IMPORTS_END ===

@DriftDatabase(tables: [
    SyncMetadataTable,
// === GENERATED_TABLES_START ===
// === GENERATED_TABLES_END ===
])
class AppDatabase extends _$AppDatabase {
  int get schemaVersion => 1;

  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (Migrator m) {
      return m.createAll();
    },
    onUpgrade: (Migrator m, int from, int to) async {
    },
  );
}
`;

function makeConfig(targetEntity: string, targetFeature: string): GenerationConfig {
    return new GenerationConfig({
        templProject: 't115',
        templEntity: 'category',
        targetEntity,
        templatesPath: TEMPLATES_PATH,
        projectsPath: PROJECTS_PATH,
        targetProject: 'weight',
        templFeatureName: 'tasks',
        targetFeaturePath: `${PROJECTS_PATH}/weight/weight_flutter/lib/features/${targetFeature}`,
        workspacesPath: `${PROJECTS_PATH}/weight`,
    });
}

suite('AppDatabaseGenerator Test Suite', () => {
    let mockFs: MockFileSystem;

    setup(() => {
        mockFs = new MockFileSystem();
        mockFs.setFile(TEMPLATE_DB_PATH, TEMPLATE_DB_CONTENT);
    });

    test('first generation creates database.dart with feature imports', async () => {
        // Tablet file для текущей фичи
        const featurePath = `${PROJECTS_PATH}/weight/weight_flutter/lib/features/gadget/data/datasources/local/tables`;
        mockFs.setFile(`${featurePath}/gadget_table.dart`, '// stub');

        const gen = new AppDatabaseGenerator(mockFs, makeConfig('gadget', 'gadget'));
        await gen.generate();

        const result = await mockFs.readFile(TARGET_DB_PATH);
        assert.ok(result.includes('gadget_table.dart'), 'should include gadget table import');
        assert.ok(result.includes('GadgetTable'), 'should include gadget table class');
    });

    test('regen filters stale imports for the current feature (BUG-002 cleanup)', async () => {
        // Симулируем существующий database.dart с stale импортом (camelCase до фикса BUG-002)
        const existingDb = `import 'package:drift/drift.dart';
import 'tables/sync_metadata_table.dart';
// === GENERATED_IMPORTS_START ===
import '../../../../features/correction_button/data/datasources/local/tables/correctionButton_table.dart';
// === GENERATED_IMPORTS_END ===

@DriftDatabase(tables: [
    SyncMetadataTable,
// === GENERATED_TABLES_START ===
CorrectionbuttonTable,
// === GENERATED_TABLES_END ===
])
class AppDatabase extends _$AppDatabase {
  int get schemaVersion => 1;
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (Migrator m) { return m.createAll(); },
    onUpgrade: (Migrator m, int from, int to) async {},
  );
}
`;
        mockFs.setFile(TARGET_DB_PATH, existingDb);

        // Live файл — теперь snake_case
        const featurePath = `${PROJECTS_PATH}/weight/weight_flutter/lib/features/correction_button/data/datasources/local/tables`;
        mockFs.setFile(`${featurePath}/correction_button_table.dart`, '// stub');

        const gen = new AppDatabaseGenerator(mockFs, makeConfig('correctionButton', 'correction_button'));
        await gen.generate();

        const result = await mockFs.readFile(TARGET_DB_PATH);
        assert.ok(
            !result.includes('correctionButton_table.dart'),
            'stale camelCase import must be removed',
        );
        assert.ok(
            result.includes('correction_button_table.dart'),
            'live snake_case import must be present',
        );
    });

    test('regen preserves imports from OTHER features (when their files still exist)', async () => {
        const existingDb = `import 'package:drift/drift.dart';
import 'tables/sync_metadata_table.dart';
// === GENERATED_IMPORTS_START ===
import '../../../../features/gadget/data/datasources/local/tables/gadget_table.dart';
// === GENERATED_IMPORTS_END ===

@DriftDatabase(tables: [
    SyncMetadataTable,
// === GENERATED_TABLES_START ===
GadgetTable,
// === GENERATED_TABLES_END ===
])
class AppDatabase extends _$AppDatabase {
  int get schemaVersion => 2;
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (Migrator m) { return m.createAll(); },
    onUpgrade: (Migrator m, int from, int to) async {},
  );
}
`;
        mockFs.setFile(TARGET_DB_PATH, existingDb);

        // Gadget файл всё ещё существует на диске → должен сохраниться
        const gadgetFeaturePath = `${PROJECTS_PATH}/weight/weight_flutter/lib/features/gadget/data/datasources/local/tables`;
        mockFs.setFile(`${gadgetFeaturePath}/gadget_table.dart`, '// stub');

        // Регенерируем correction_button
        const cbFeaturePath = `${PROJECTS_PATH}/weight/weight_flutter/lib/features/correction_button/data/datasources/local/tables`;
        mockFs.setFile(`${cbFeaturePath}/correction_button_table.dart`, '// stub');

        const gen = new AppDatabaseGenerator(mockFs, makeConfig('correctionButton', 'correction_button'));
        await gen.generate();

        const result = await mockFs.readFile(TARGET_DB_PATH);
        assert.ok(result.includes('gadget_table.dart'), 'other feature import should be preserved (file exists)');
        assert.ok(result.includes('GadgetTable'), 'other feature class should be preserved');
        assert.ok(result.includes('correction_button_table.dart'), 'new feature import added');
    });

    test('regen drops imports + tables + migration lines for DELETED features', async () => {
        // Симуляция: фича gadget была сгенерирована, в database.dart есть её import,
        // table-класс и migration-блок. Затем папка фичи удалена пользователем.
        // На regen другой фичи (correction_button) — gadget полностью вычищается.
        const existingDb = `import 'package:drift/drift.dart';
import 'tables/sync_metadata_table.dart';
// === GENERATED_IMPORTS_START ===
import '../../../../features/gadget/data/datasources/local/tables/gadget_table.dart';
// === GENERATED_IMPORTS_END ===

@DriftDatabase(tables: [
    SyncMetadataTable,
// === GENERATED_TABLES_START ===
GadgetTable,
// === GENERATED_TABLES_END ===
])
class AppDatabase extends _$AppDatabase {
  int get schemaVersion => 2;
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (Migrator m) { return m.createAll(); },
    onUpgrade: (Migrator m, int from, int to) async {
      // === GENERATED_MIGRATION_START ===
      if (from < 2) {
          await m.createTable(gadgetTable);
      }
      // === GENERATED_MIGRATION_END ===
    },
  );
}
`;
        mockFs.setFile(TARGET_DB_PATH, existingDb);

        // Gadget файла на диске НЕТ (фича удалена)
        // Регенерируем correction_button
        const cbFeaturePath = `${PROJECTS_PATH}/weight/weight_flutter/lib/features/correction_button/data/datasources/local/tables`;
        mockFs.setFile(`${cbFeaturePath}/correction_button_table.dart`, '// stub');

        const gen = new AppDatabaseGenerator(mockFs, makeConfig('correctionButton', 'correction_button'));
        await gen.generate();

        const result = await mockFs.readFile(TARGET_DB_PATH);
        assert.ok(!result.includes('gadget_table.dart'), 'stale gadget import must be removed');
        assert.ok(!result.includes('GadgetTable'), 'stale gadget table class must be removed');
        assert.ok(!result.includes('await m.createTable(gadgetTable)'), 'stale gadget migration line must be removed');
        assert.ok(result.includes('correction_button_table.dart'), 'new feature is added');
    });
});
