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

    test('cold start: scan-based — подключает все таблицы из всех фич сразу (BUG-005)', async () => {
        // 3 фичи на диске. Конфиг указывает на одну (correction_button), но scan
        // должен найти все.
        const featRoot = `${PROJECTS_PATH}/weight/weight_flutter/lib/features`;
        mockFs.setFile(`${featRoot}/correction_button/data/datasources/local/tables/correction_button_table.dart`, '// stub');
        mockFs.setFile(`${featRoot}/tasks/data/datasources/local/tables/category_table.dart`, '// stub');
        mockFs.setFile(`${featRoot}/tasks/data/datasources/local/tables/tag_table.dart`, '// stub');

        const gen = new AppDatabaseGenerator(mockFs, makeConfig('correctionButton', 'correction_button'));
        await gen.generate();

        const result = await mockFs.readFile(TARGET_DB_PATH);
        assert.ok(result.includes('correction_button_table.dart'));
        assert.ok(result.includes('CorrectionButtonTable'));
        assert.ok(result.includes('category_table.dart'));
        assert.ok(result.includes('CategoryTable'));
        assert.ok(result.includes('tag_table.dart'));
        assert.ok(result.includes('TagTable'));
    });

    test('drops imports + tables + migration lines for DELETED features', async () => {
        // gadget был ранее в database.dart, но папка фичи удалена пользователем.
        // На regen — gadget полностью вычищается (scan не находит → не подключает).
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

        // Gadget на диске НЕТ. Только correction_button.
        const cbFeaturePath = `${PROJECTS_PATH}/weight/weight_flutter/lib/features/correction_button/data/datasources/local/tables`;
        mockFs.setFile(`${cbFeaturePath}/correction_button_table.dart`, '// stub');

        const gen = new AppDatabaseGenerator(mockFs, makeConfig('correctionButton', 'correction_button'));
        await gen.generate();

        const result = await mockFs.readFile(TARGET_DB_PATH);
        assert.ok(!result.includes('gadget_table.dart'), 'stale gadget import must be removed');
        assert.ok(!result.includes('GadgetTable'), 'stale gadget table class must be removed');
        assert.ok(!result.includes('await m.createTable(gadgetTable)'), 'stale gadget migration line must be removed');
        assert.ok(result.includes('correction_button_table.dart'));
    });

    test('rejects camelCase legacy imports (filename pattern: snake_case _table.dart)', async () => {
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

        // Live файл — snake_case (после фикса BUG-002)
        const featurePath = `${PROJECTS_PATH}/weight/weight_flutter/lib/features/correction_button/data/datasources/local/tables`;
        mockFs.setFile(`${featurePath}/correction_button_table.dart`, '// stub');

        const gen = new AppDatabaseGenerator(mockFs, makeConfig('correctionButton', 'correction_button'));
        await gen.generate();

        const result = await mockFs.readFile(TARGET_DB_PATH);
        assert.ok(!result.includes('correctionButton_table.dart'), 'stale camelCase import must be removed');
        assert.ok(result.includes('correction_button_table.dart'), 'live snake_case import must be present');
    });

    test('idempotent: повторный gen на одном состоянии даёт identical content', async () => {
        const featRoot = `${PROJECTS_PATH}/weight/weight_flutter/lib/features`;
        mockFs.setFile(`${featRoot}/tasks/data/datasources/local/tables/category_table.dart`, '// stub');
        mockFs.setFile(`${featRoot}/tasks/data/datasources/local/tables/tag_table.dart`, '// stub');

        const gen = new AppDatabaseGenerator(mockFs, makeConfig('category', 'tasks'));
        await gen.generate();
        const after1 = await mockFs.readFile(TARGET_DB_PATH);

        await gen.generate();
        const after2 = await mockFs.readFile(TARGET_DB_PATH);

        assert.strictEqual(after1, after2, 'two consecutive generates must produce identical content');
    });

    test('migration: новые ветки append в КОНЕЦ блока (BUG-006)', async () => {
        // Существующая БД: schemaVersion=3, в migration-блоке две ветки `< 2` и `< 3`
        // в возрастающем порядке. После добавления новой фичи (newcomer) ожидаем что
        // ветка `< 4` появится В КОНЦЕ, после `< 3`, а не перед `< 2`.
        const existingDb = `import 'package:drift/drift.dart';
import 'tables/sync_metadata_table.dart';
// === GENERATED_IMPORTS_START ===
import '../../../../features/alpha/data/datasources/local/tables/alpha_table.dart';
import '../../../../features/beta/data/datasources/local/tables/beta_table.dart';
// === GENERATED_IMPORTS_END ===

@DriftDatabase(tables: [
    SyncMetadataTable,
// === GENERATED_TABLES_START ===
AlphaTable,
    BetaTable,
// === GENERATED_TABLES_END ===
])
class AppDatabase extends _$AppDatabase {
  int get schemaVersion => 3;
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (Migrator m) { return m.createAll(); },
    onUpgrade: (Migrator m, int from, int to) async {
        // === GENERATED_MIGRATION_START ===
        if (from < 2) {
            await m.createTable(alphaTable);
        }
        if (from < 3) {
            await m.createTable(betaTable);
        }
        // === GENERATED_MIGRATION_END ===
    },
  );
}
`;
        mockFs.setFile(TARGET_DB_PATH, existingDb);

        // Все три фичи живут на диске: alpha, beta, и новая newcomer
        const featRoot = `${PROJECTS_PATH}/weight/weight_flutter/lib/features`;
        mockFs.setFile(`${featRoot}/alpha/data/datasources/local/tables/alpha_table.dart`, '// stub');
        mockFs.setFile(`${featRoot}/beta/data/datasources/local/tables/beta_table.dart`, '// stub');
        mockFs.setFile(`${featRoot}/newcomer/data/datasources/local/tables/newcomer_table.dart`, '// stub');

        const gen = new AppDatabaseGenerator(mockFs, makeConfig('newcomer', 'newcomer'));
        await gen.generate();

        const result = await mockFs.readFile(TARGET_DB_PATH);

        // schemaVersion бамп
        assert.ok(result.includes('int get schemaVersion => 4'), 'schemaVersion должен бампнуться до 4');

        // Все три ветки должны быть в правильном (возрастающем) порядке
        const branchOrderRegex = /if \(from < (\d+)\)/g;
        const versions: number[] = [];
        let m: RegExpExecArray | null;
        while ((m = branchOrderRegex.exec(result)) !== null) {
            versions.push(parseInt(m[1], 10));
        }
        assert.deepStrictEqual(
            versions,
            [2, 3, 4],
            `Ветки должны идти в возрастающем порядке [2, 3, 4], получено [${versions.join(', ')}]`,
        );

        // Семантическая проверка: alpha (< 2) идёт ДО newcomer (< 4)
        const alphaIdx = result.indexOf('await m.createTable(alphaTable)');
        const newcomerIdx = result.indexOf('await m.createTable(newcomerTable)');
        assert.ok(alphaIdx >= 0 && newcomerIdx >= 0, 'оба createTable должны присутствовать');
        assert.ok(alphaIdx < newcomerIdx, 'alpha createTable должна быть ДО newcomer createTable');
    });

    test('scans core/* tables in addition to features/* (BUG-008 regression)', async () => {
        // BUG-008: AppDatabaseGenerator scan игнорировал tables вне features/*/.../tables/.
        // sync_core 0.3.0 кладёт sync_queue_table.dart в lib/core/sync/ — путь вне whitelist'а.
        // После fix scan расширен на lib/core/**/*_table.dart.
        const flutterLib = `${PROJECTS_PATH}/weight/weight_flutter/lib`;
        mockFs.setFile(`${flutterLib}/features/category/data/datasources/local/tables/category_table.dart`, '// stub');
        mockFs.setFile(`${flutterLib}/core/sync/sync_queue_table.dart`, '// stub');

        const gen = new AppDatabaseGenerator(mockFs, makeConfig('category', 'tasks'));
        await gen.generate();

        const result = await mockFs.readFile(TARGET_DB_PATH);

        // Оба import path'а присутствуют (relative к lib/core/data/datasources/local/database.dart)
        assert.ok(
            result.includes('features/category/data/datasources/local/tables/category_table.dart'),
            'feature category_table import должен присутствовать',
        );
        assert.ok(
            result.includes('sync/sync_queue_table.dart'),
            'core/sync/sync_queue_table.dart import должен присутствовать (BUG-008 fix)',
        );

        // Оба class в @DriftDatabase(tables: [...])
        assert.ok(result.includes('CategoryTable'), 'CategoryTable должен быть в tables list');
        assert.ok(result.includes('SyncQueueTable'), 'SyncQueueTable должен быть в tables list (BUG-008 fix)');
    });

    test('core+features scan idempotent on repeat (BUG-008)', async () => {
        // BUG-005 invariant: повторный run на том же FS state → identical content.
        // Проверка что merge feature + core scan не нарушает idempotency.
        const flutterLib = `${PROJECTS_PATH}/weight/weight_flutter/lib`;
        mockFs.setFile(`${flutterLib}/features/category/data/datasources/local/tables/category_table.dart`, '// stub');
        mockFs.setFile(`${flutterLib}/features/tag/data/datasources/local/tables/tag_table.dart`, '// stub');
        mockFs.setFile(`${flutterLib}/core/sync/sync_queue_table.dart`, '// stub');

        const gen = new AppDatabaseGenerator(mockFs, makeConfig('category', 'tasks'));
        await gen.generate();
        const after1 = await mockFs.readFile(TARGET_DB_PATH);

        await gen.generate();
        const after2 = await mockFs.readFile(TARGET_DB_PATH);

        assert.strictEqual(
            after1,
            after2,
            'two consecutive generates with core+features mix must produce identical content',
        );

        // Sanity: оба core и feature tables присутствуют после первого прогона
        assert.ok(after1.includes('SyncQueueTable'));
        assert.ok(after1.includes('CategoryTable'));
        assert.ok(after1.includes('TagTable'));
    });

    test('D7 regression: template без fixed-line core imports → scan единственный источник, нет дублей', async () => {
        // BUG D7 (Drift duplicate): раньше template database.dart имел fixed-line
        // imports `tables/sync_metadata_table.dart` ВНЕ markers, плюс scan находил
        // тот же файл по absolute path → результат: 2x import + 2x SyncMetadataTable.
        // После Variant 7.A fix: template без fixed-line core imports, scan = single source.
        const newTemplateContent = `import 'package:drift/drift.dart';
// === GENERATED_IMPORTS_START ===
// === GENERATED_IMPORTS_END ===

@DriftDatabase(tables: [
// === GENERATED_TABLES_START ===
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
        mockFs.setFile(TEMPLATE_DB_PATH, newTemplateContent);

        const flutterLib = `${PROJECTS_PATH}/weight/weight_flutter/lib`;
        // Все три файла, которые раньше дублировались (template fixed + scan):
        mockFs.setFile(`${flutterLib}/core/data/datasources/local/tables/sync_metadata_table.dart`, '// stub');
        mockFs.setFile(`${flutterLib}/core/sync/sync_queue_table.dart`, '// stub');
        mockFs.setFile(`${flutterLib}/features/configuration/data/datasources/local/tables/configuration_table.dart`, '// stub');

        const gen = new AppDatabaseGenerator(mockFs, makeConfig('configuration', 'configuration'));
        await gen.generate();

        const result = await mockFs.readFile(TARGET_DB_PATH);

        // Каждый import / table class встречается ровно 1 раз:
        const syncMetadataImportCount = (result.match(/sync_metadata_table\.dart/g) || []).length;
        const syncQueueImportCount = (result.match(/sync_queue_table\.dart/g) || []).length;
        const configImportCount = (result.match(/configuration_table\.dart/g) || []).length;
        assert.strictEqual(syncMetadataImportCount, 1, 'sync_metadata_table.dart должен встречаться ровно 1 раз (D7 dedup)');
        assert.strictEqual(syncQueueImportCount, 1, 'sync_queue_table.dart должен встречаться ровно 1 раз (D7 dedup)');
        assert.strictEqual(configImportCount, 1, 'configuration_table.dart должен встречаться ровно 1 раз (D7 dedup)');

        const syncMetadataTableClassCount = (result.match(/SyncMetadataTable/g) || []).length;
        const syncQueueTableClassCount = (result.match(/SyncQueueTable/g) || []).length;
        const configurationTableClassCount = (result.match(/ConfigurationTable/g) || []).length;
        assert.strictEqual(syncMetadataTableClassCount, 1, 'SyncMetadataTable class должен встречаться ровно 1 раз');
        assert.strictEqual(syncQueueTableClassCount, 1, 'SyncQueueTable class должен встречаться ровно 1 раз');
        assert.strictEqual(configurationTableClassCount, 1, 'ConfigurationTable class должен встречаться ровно 1 раз');
    });

    test('G1 defensive strip: real-world template state с fixed-line imports/tables вне markers → generator сам стрипает дубликаты', async () => {
        // Reproduce реального t153 disk scenario (round 2 reviews 2026-05-02):
        // template (или existing target file) имеет fixed-line `import '..._table.dart';`
        // ВНЕ markers `:GENERATED_IMPORTS:`, плюс scan находит тот же файл.
        // До G1 fix → final file содержит import дважды (один outside markers, один inside)
        // → `flutter analyze` reports `duplicate_import` warning.
        // После G1 fix → defensive strip в generator удаляет outside-markers fixed-line
        // если scan нашёл тот же файл, независимо от template state.
        const templateWithFixedLineImports = `import 'package:drift/drift.dart';
import 'tables/sync_metadata_table.dart';
import '../../../../features/configuration/data/datasources/local/tables/configuration_table.dart';
// === GENERATED_IMPORTS_START ===
// === GENERATED_IMPORTS_END ===

@DriftDatabase(tables: [
    SyncMetadataTable,
    ConfigurationTable,
// === GENERATED_TABLES_START ===
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
        mockFs.setFile(TEMPLATE_DB_PATH, templateWithFixedLineImports);

        const flutterLib = `${PROJECTS_PATH}/weight/weight_flutter/lib`;
        // Scan найдёт sync_metadata_table.dart (через core scan) — exact filename совпадает с
        // fixed-line import в template (`tables/sync_metadata_table.dart` → basename =
        // `sync_metadata_table.dart`).
        mockFs.setFile(`${flutterLib}/core/data/datasources/local/tables/sync_metadata_table.dart`, '// stub');
        // Scan найдёт configuration_table.dart (через features scan).
        mockFs.setFile(`${flutterLib}/features/configuration/data/datasources/local/tables/configuration_table.dart`, '// stub');
        // Scan найдёт sync_queue_table.dart (через core scan, новая table — не было в template).
        mockFs.setFile(`${flutterLib}/core/sync/sync_queue_table.dart`, '// stub');

        const gen = new AppDatabaseGenerator(mockFs, makeConfig('configuration', 'configuration'));
        await gen.generate();

        const result = await mockFs.readFile(TARGET_DB_PATH);

        // Critical: каждый import строго 1 раз (не 2):
        const syncMetadataImportCount = (result.match(/import\s+'[^']*sync_metadata_table\.dart'/g) || []).length;
        const configImportCount = (result.match(/import\s+'[^']*configuration_table\.dart'/g) || []).length;
        const syncQueueImportCount = (result.match(/import\s+'[^']*sync_queue_table\.dart'/g) || []).length;
        assert.strictEqual(syncMetadataImportCount, 1, 'G1: sync_metadata_table.dart import должен быть 1× (defensive strip удаляет fixed-line вне markers)');
        assert.strictEqual(configImportCount, 1, 'G1: configuration_table.dart import должен быть 1×');
        assert.strictEqual(syncQueueImportCount, 1, 'G1: sync_queue_table.dart import должен быть 1×');

        // Critical: каждый class в @DriftDatabase(tables: [...]) строго 1 раз:
        const syncMetadataClassCount = (result.match(/SyncMetadataTable/g) || []).length;
        const configurationClassCount = (result.match(/ConfigurationTable/g) || []).length;
        const syncQueueClassCount = (result.match(/SyncQueueTable/g) || []).length;
        assert.strictEqual(syncMetadataClassCount, 1, 'G1: SyncMetadataTable class должен быть 1× (defensive strip удаляет fixed-line вне markers)');
        assert.strictEqual(configurationClassCount, 1, 'G1: ConfigurationTable class должен быть 1×');
        assert.strictEqual(syncQueueClassCount, 1, 'G1: SyncQueueTable class должен быть 1×');
    });

    test('G1 defensive strip idempotency: повторный run на already-stripped output → identical', async () => {
        // Idempotency invariant: generator на already-clean output не должен менять content
        // (commutative с собой). Critical для reproducibility — verify работает consistently.
        const templateWithFixedLineImports = `import 'package:drift/drift.dart';
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
    onCreate: (Migrator m) { return m.createAll(); },
    onUpgrade: (Migrator m, int from, int to) async {},
  );
}
`;
        mockFs.setFile(TEMPLATE_DB_PATH, templateWithFixedLineImports);

        const flutterLib = `${PROJECTS_PATH}/weight/weight_flutter/lib`;
        mockFs.setFile(`${flutterLib}/core/data/datasources/local/tables/sync_metadata_table.dart`, '// stub');

        const gen = new AppDatabaseGenerator(mockFs, makeConfig('configuration', 'configuration'));
        await gen.generate();
        const after1 = await mockFs.readFile(TARGET_DB_PATH);

        await gen.generate();
        const after2 = await mockFs.readFile(TARGET_DB_PATH);

        assert.strictEqual(after1, after2, 'G1: repeat generate на already-stripped output должен дать identical content');

        // Sanity: первый прогон уже clean (1× import, 1× table class)
        const syncMetadataImportCount = (after1.match(/import\s+'[^']*sync_metadata_table\.dart'/g) || []).length;
        const syncMetadataClassCount = (after1.match(/SyncMetadataTable/g) || []).length;
        assert.strictEqual(syncMetadataImportCount, 1);
        assert.strictEqual(syncMetadataClassCount, 1);
    });

    test('игнорирует .g.dart, .freezed.dart, и файлы не *_table.dart', async () => {
        const featPath = `${PROJECTS_PATH}/weight/weight_flutter/lib/features/tasks/data/datasources/local/tables`;
        mockFs.setFile(`${featPath}/category_table.dart`, '// stub');
        mockFs.setFile(`${featPath}/category_table.g.dart`, '// gen');
        mockFs.setFile(`${featPath}/category_table.freezed.dart`, '// freezed');
        mockFs.setFile(`${featPath}/some_helper.dart`, '// not a table');
        mockFs.setFile(`${featPath}/extensions/category_table_extension.dart`, '// extension');

        const gen = new AppDatabaseGenerator(mockFs, makeConfig('category', 'tasks'));
        await gen.generate();

        const result = await mockFs.readFile(TARGET_DB_PATH);
        assert.ok(result.includes('category_table.dart'));
        assert.ok(!result.includes('category_table.g.dart'));
        assert.ok(!result.includes('category_table.freezed.dart'));
        assert.ok(!result.includes('some_helper.dart'));
        assert.ok(!result.includes('category_table_extension.dart'));
    });
});
