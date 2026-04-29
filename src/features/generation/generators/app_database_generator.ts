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
        const liveTableFiles = await this.scanAllFeatureTableFiles();

        const allImports = new Set(
            liveTableFiles.map(({ absolutePath }) => {
                const rel = path.relative(destinationDir, absolutePath).replaceAll('\\', '/');
                return `import '${rel}';`;
            }),
        );

        const liveTableClassesArr = liveTableFiles.map(({ fileName }) => `${snakeToPascalCase(fileName.replace(/\.dart$/, ''))},`);
        const allTableClasses = new Set(liveTableClassesArr);
        const liveTableClassNames = new Set(liveTableClassesArr.map(c => c.replace(/,\s*$/, '')));

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
