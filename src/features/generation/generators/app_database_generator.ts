import path from "path";
import { IFileSystem } from "../../../core/interfaces/file_system";
import { snakeToPascalCase } from "../../../utils/text_work/text_util";
import { GenerationConfig } from "../config/generation_config";

/**
 * Generator for AppDatabase file.
 * Scans all table files in the project and inserts their imports
 * and classes into the main database file.
 */
export class AppDatabaseGenerator {
    constructor(
        private fileSystem: IFileSystem,
        private config: GenerationConfig
    ) { }

    public async generate(): Promise<void> {
        const destinationDir = this.config.coreDataLocalPath;
        const coreDatabasePath = path.join(destinationDir, 'database.dart');

        const templateDatabasePath = path.join(this.config.templFlutterLibPath, 'core', 'data', 'datasources', 'local', 'database.dart');

        let existingContent = '';
        let existingTableClasses: Set<string> = new Set();
        let currentSchemaVersion = 1;

        if (await this.fileSystem.exists(coreDatabasePath)) {
            existingContent = await this.fileSystem.readFile(coreDatabasePath);
            existingTableClasses = this.extractSectionContent(existingContent, '// === GENERATED_TABLES_START ===', '// === GENERATED_TABLES_END ===');
            currentSchemaVersion = this.extractSchemaVersion(existingContent);
        } else {
            existingContent = await this.fileSystem.readFile(templateDatabasePath);
            existingContent = this.updateSection(existingContent, '// === GENERATED_IMPORTS_START ===', '// === GENERATED_IMPORTS_END ===', '');
            existingContent = this.updateSection(existingContent, '// === GENERATED_TABLES_START ===', '// === GENERATED_TABLES_END ===', '');
            existingContent = this.updateSection(existingContent, '// === GENERATED_MIGRATION_START ===', '// === GENERATED_MIGRATION_END ===', '');
            existingContent = existingContent.replace(/int get schemaVersion => \d+;/, 'int get schemaVersion => 1;');
        }

        // Сканируем ВСЕ feature-директории и собираем live table files (BUG-005).
        // Не полагаемся на инкрементальные правки existing-секций — это давало пустые
        // секции при определённом порядке вызовов.
        // BUG-008 (2026-05-02): дополнительно сканируем `lib/core/**/*_table.dart` —
        // sync_core 0.3.0 кладёт `sync_queue_table.dart` в `lib/core/sync/` (вне `features/`).
        // Без этого scan generated `database.dart` теряет SyncQueueTable → cascade 170+ analyzer errors.
        const featureTableFiles = await this.scanAllFeatureTableFiles();
        const coreTableFiles = await this.scanCoreTableFiles();
        const liveTableFiles = [...featureTableFiles, ...coreTableFiles]
            // Стабильный детерминированный порядок (BUG-005 idempotency invariant)
            .sort((a, b) => a.fileName.localeCompare(b.fileName));

        const allImports = new Set(
            liveTableFiles.map(({ absolutePath }) => {
                const rel = path.relative(destinationDir, absolutePath).replaceAll('\\', '/');
                return `import '${rel}';`;
            }),
        );

        const liveTableClassesArr = liveTableFiles.map(({ fileName }) => `${snakeToPascalCase(fileName.replace(/\.dart$/, ''))},`);
        const allTableClasses = new Set(liveTableClassesArr);
        const liveTableClassNames = new Set(liveTableClassesArr.map(c => c.replace(/,\s*$/, '')));

        // BUG-D7/Bomb#2 (defensive strip — independent of template state):
        // Если template (или existing target file) содержит fixed-line `import '..._table.dart';`
        // строки ВНЕ markers `:GENERATED_IMPORTS:` — и тот же файл уже найден scan'ом —
        // удаляем дубликат из existing content ДО применения markers. То же для table class
        // mentions ВНЕ `:GENERATED_TABLES:`. Это closes loop независимо от template repo state
        // (см. round 2 reviews 2026-05-02 — fix template только в working tree → не воспроизводимо
        // на fresh clone). Здесь generator сам — single source of truth, template-state-agnostic.
        const scanImportFilenames = new Set(
            liveTableFiles.map(({ fileName }) => fileName),
        );
        existingContent = this.stripDuplicateFixedLineImports(existingContent, scanImportFilenames);
        existingContent = this.stripDuplicateFixedLineTables(existingContent, liveTableClassNames);

        let finalContent = this.updateSection(
            existingContent,
            '// === GENERATED_IMPORTS_START ===',
            '// === GENERATED_IMPORTS_END ===',
            [...allImports].join('\n'),
        );

        finalContent = this.updateSection(
            finalContent,
            '// === GENERATED_TABLES_START ===',
            '// === GENERATED_TABLES_END ===',
            [...allTableClasses].join('\n    '),
        );

        // Migration — append-only: добавляем только реально новые таблицы.
        const actuallyNewTables = liveTableClassesArr.filter(tableClass => !existingTableClasses.has(tableClass));
        if (actuallyNewTables.length > 0) {
            finalContent = this.updateMigration(finalContent, currentSchemaVersion, actuallyNewTables);
        }

        // Чистим `await m.createTable(xxx);` для исчезнувших таблиц (но schemaVersion не понижаем).
        finalContent = this.removeStaleMigrationLines(finalContent, liveTableClassNames);

        finalContent = this.updateDatabaseName(finalContent, this.config.targetProject);

        await this.fileSystem.createFile(coreDatabasePath, finalContent);
    }

    /**
     * Сканирует все feature-директории и возвращает live `*_table.dart` файлы.
     * Конвенция t115: `<flutterLib>/features/<feature>/data/datasources/local/tables/*_table.dart`.
     * `*.g.dart` пропускаются.
     */
    private async scanAllFeatureTableFiles(): Promise<{ absolutePath: string; fileName: string }[]> {
        const featuresDir = path.join(this.config.targetFlutterLibPath, 'features');
        if (!await this.fileSystem.exists(featuresDir)) { return []; }

        const featureNames = await this.fileSystem.readDirectory(featuresDir);
        const result: { absolutePath: string; fileName: string }[] = [];

        for (const featureName of featureNames) {
            const tablesDir = path.join(featuresDir, featureName, 'data', 'datasources', 'local', 'tables');
            if (!await this.fileSystem.exists(tablesDir)) { continue; }
            const files = await this.fileSystem.readDirectory(tablesDir);
            for (const file of files) {
                if (!file.endsWith('.dart')) { continue; }
                if (file.endsWith('.g.dart') || file.endsWith('.freezed.dart')) { continue; }
                if (!file.endsWith('_table.dart')) { continue; }
                result.push({
                    absolutePath: path.join(tablesDir, file),
                    fileName: file,
                });
            }
        }
        // Стабильный порядок (детерминированный вывод) — алфавитно по имени файла
        result.sort((a, b) => a.fileName.localeCompare(b.fileName));
        return result;
    }

    /**
     * Сканирует `<flutterLib>/core/**` и возвращает live `*_table.dart` файлы (BUG-008).
     * Любые core-уровневые tables (sync_core's `sync_queue_table.dart`, потенциальные
     * future `core/auth/session_table.dart` и т.д.) попадают в `database.dart`.
     * `*.g.dart` / `*.freezed.dart` / non-`*_table.dart` пропускаются.
     */
    private async scanCoreTableFiles(): Promise<{ absolutePath: string; fileName: string }[]> {
        const coreDir = path.join(this.config.targetFlutterLibPath, 'core');
        if (!await this.fileSystem.exists(coreDir)) { return []; }

        const allCoreFiles = await this.fileSystem.readDirectoryRecursive(coreDir);
        const result: { absolutePath: string; fileName: string }[] = [];

        for (const absolutePath of allCoreFiles) {
            const fileName = path.basename(absolutePath);
            if (!fileName.endsWith('.dart')) { continue; }
            if (fileName.endsWith('.g.dart') || fileName.endsWith('.freezed.dart')) { continue; }
            if (!fileName.endsWith('_table.dart')) { continue; }
            result.push({ absolutePath, fileName });
        }
        // Сортировка применяется в caller'е после merge с feature files.
        return result;
    }

    /**
     * Defensive strip: удаляет fixed-line `import '..._table.dart';` строки **вне** markers
     * `:GENERATED_IMPORTS:` если соответствующий файл уже найден scan'ом и попадает внутрь
     * markers. Это closes Bomb #2 robustly — не зависит от того, очищен ли template на disk
     * (round 2 review 2026-05-02 нашёл что template fix живёт в uncommitted working tree
     * t115 → fresh clone reproduces duplicate. Defensive strip в generator делает problem
     * idempotent независимо от template state).
     */
    private stripDuplicateFixedLineImports(content: string, scanFilenames: Set<string>): string {
        const importsStart = '// === GENERATED_IMPORTS_START ===';
        const importsEnd = '// === GENERATED_IMPORTS_END ===';
        const startIdx = content.indexOf(importsStart);
        const endIdx = content.indexOf(importsEnd);

        // Если markers нет — нечего защищать (no-op).
        if (startIdx < 0 || endIdx < 0 || endIdx < startIdx) { return content; }

        const before = content.slice(0, startIdx);
        const inside = content.slice(startIdx, endIdx + importsEnd.length);
        const after = content.slice(endIdx + importsEnd.length);

        const importRegex = /^import\s+'([^']*_table\.dart)';\s*\r?\n/gm;
        const stripFn = (segment: string): string =>
            segment.replace(importRegex, (match, importPath: string) => {
                const fileName = path.basename(importPath);
                return scanFilenames.has(fileName) ? '' : match;
            });

        return stripFn(before) + inside + stripFn(after);
    }

    /**
     * Defensive strip для `@DriftDatabase(tables: [...])`: удаляет fixed-line упоминания
     * table classes (e.g. `SyncMetadataTable,` `ConfigurationTable,`) **вне** markers
     * `:GENERATED_TABLES:` если class уже в scan list. Pair с {@link stripDuplicateFixedLineImports}.
     */
    private stripDuplicateFixedLineTables(content: string, liveTableClassNames: Set<string>): string {
        const tablesStart = '// === GENERATED_TABLES_START ===';
        const tablesEnd = '// === GENERATED_TABLES_END ===';
        const driftDbRegex = /@DriftDatabase\s*\(\s*tables\s*:\s*\[([\s\S]*?)\]\s*\)/;
        const m = content.match(driftDbRegex);
        if (!m) { return content; }

        const blockInner = m[1];
        const startIdx = blockInner.indexOf(tablesStart);
        const endIdx = blockInner.indexOf(tablesEnd);
        if (startIdx < 0 || endIdx < 0) { return content; }

        const beforeMarkers = blockInner.slice(0, startIdx);
        const insideMarkers = blockInner.slice(startIdx, endIdx + tablesEnd.length);
        const afterMarkers = blockInner.slice(endIdx + tablesEnd.length);

        // Strip строки `ClassName,` (с возможным indent + trailing horizontal whitespace + newline)
        // только если ClassName в scan list. Не трогаем чужие классы (developer-defined).
        // ВАЖНО: после `,` используем только `[ \t]*\r?\n?` (горизонтальные whitespace + newline),
        // НЕ `\s*` — иначе матч съест newline + indent следующей строки и regex `^` не сработает
        // на ней (test edge case: 2 подряд class refs `SyncMetadataTable,\n    ConfigurationTable,`).
        const classRefRegex = /^[ \t]*([A-Z][A-Za-z0-9_]*)[ \t]*,[ \t]*\r?\n?/gm;
        const stripFn = (segment: string): string =>
            segment.replace(classRefRegex, (matched, className: string) => {
                return liveTableClassNames.has(className) ? '' : matched;
            });

        const newInner = stripFn(beforeMarkers) + insideMarkers + stripFn(afterMarkers);
        return content.replace(driftDbRegex, `@DriftDatabase(tables: [${newInner}])`);
    }

    private removeStaleMigrationLines(content: string, liveTableClassNames: Set<string>): string {
        // Snake-case вариант имени класса как camelCase variable
        const liveVarNames = new Set<string>();
        for (const cls of liveTableClassNames) {
            liveVarNames.add(cls.charAt(0).toLowerCase() + cls.slice(1));
        }
        const migrationStart = '// === GENERATED_MIGRATION_START ===';
        const migrationEnd = '// === GENERATED_MIGRATION_END ===';
        const blockRegex = new RegExp(`(${migrationStart})([\\s\\S]*?)(${migrationEnd})`);
        const m = content.match(blockRegex);
        if (!m) { return content; }
        const inner = m[2];
        // Убираем `await m.createTable(xxx);` если xxx не в liveVarNames
        const cleanedInner = inner.replace(/\s*await m\.createTable\((\w+)\);/g, (matched, varName) => {
            return liveVarNames.has(varName) ? matched : '';
        });
        // Убираем пустые `if (from < N) { }` блоки
        const cleanedNoEmptyIfs = cleanedInner.replace(/\s*if \(from < \d+\) \{\s*\}/g, '');
        return content.replace(blockRegex, `$1${cleanedNoEmptyIfs}$3`);
    }

    private extractSectionContent(content: string, startMarker: string, endMarker: string): Set<string> {
        const regex = new RegExp(`${startMarker}\\s*([\\s\\S]*?)\\s*${endMarker}`, 'g');
        const match = regex.exec(content);
        if (match && match[1]) {
            return new Set(match[1].split('\n').map(line => line.trim()).filter(Boolean));
        }
        return new Set();
    }

    private extractSchemaVersion(content: string): number {
        const regex = /int get schemaVersion => (\d+);/;
        const match = content.match(regex);
        return match ? parseInt(match[1], 10) : 1;
    }

    private updateSection(
        content: string,
        startMarker: string,
        endMarker: string,
        newContent: string
    ): string {
        const regex = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, 'g');
        const replacement = `${startMarker}\n${newContent}\n${endMarker}`;
        return content.replace(regex, replacement);
    }

    private updateMigration(content: string, currentVersion: number, newTableClasses: string[]): string {
        const newVersion = currentVersion + 1;
        const migrationMarker = '// === GENERATED_MIGRATION_START ===';
        const migrationEndMarker = '// === GENERATED_MIGRATION_END ===';

        const createTableStatements = newTableClasses
            .map(tableClass => {
                const cleanTableClass = tableClass.replace(/,\s*$/, '');
                const tableVarName = cleanTableClass.charAt(0).toLowerCase() + cleanTableClass.slice(1);
                return `await m.createTable(${tableVarName});`;
            })
            .join('\n            ');

        const newMigrationBlock = `
        if (from < ${newVersion}) {
            ${createTableStatements}
        }`;

        if (content.includes(migrationMarker)) {
            const existingContentRegex = new RegExp(`${migrationMarker}([\\s\\S]*?)${migrationEndMarker}`);
            const match = existingContentRegex.exec(content);
            const existingMigrations = match ? match[1] : '';

            // Drift migrations выполняются в порядке записи. Новые ветки `if (from < N)`
            // должны добавляться в КОНЕЦ блока (append), а не в начало (prepend), иначе
            // более поздние ветки выполнятся ДО ранних, ссылаясь на ещё несозданные
            // колонки/таблицы и валятся `SqliteException(1): no such column`.
            // См. BUG-006-migration-order.md
            const trimmedExisting = existingMigrations.replace(/\s+$/, '');
            const replacement = `${migrationMarker}${trimmedExisting}${newMigrationBlock}\n        ${migrationEndMarker}`;
            content = content.replace(existingContentRegex, replacement);
        } else {
            const onUpgradeRegex = /onUpgrade: \(Migrator m, int from, int to\) async {([\s\S]*?)}/;
            const newOnUpgrade = `onUpgrade: (Migrator m, int from, int to) async {
            ${migrationMarker}${newMigrationBlock}
        ${migrationEndMarker}
        }`;
            content = content.replace(onUpgradeRegex, newOnUpgrade);
        }

        content = content.replace(/int get schemaVersion => (\d+);/, `int get schemaVersion => ${newVersion};`);

        return content;
    }

    private updateDatabaseName(content: string, projectName: string): string {
        const dbNameRegex = /name:\s*'[^']+_flutter'/g;
        return content.replace(dbNameRegex, `name: '${projectName}_flutter'`);
    }
}
