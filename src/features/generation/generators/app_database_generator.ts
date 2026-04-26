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
        const featureTablesDir = this.config.featureTablesPath;

        const templateDatabasePath = path.join(this.config.templFlutterLibPath, 'core', 'data', 'datasources', 'local', 'database.dart');

        let existingContent = '';
        let existingImports: Set<string> = new Set();
        let existingTableClasses: Set<string> = new Set();
        let currentSchemaVersion = 1;

        if (await this.fileSystem.exists(coreDatabasePath)) {
            existingContent = await this.fileSystem.readFile(coreDatabasePath);
            existingImports = this.extractSectionContent(existingContent, '// === GENERATED_IMPORTS_START ===', '// === GENERATED_IMPORTS_END ===');
            existingTableClasses = this.extractSectionContent(existingContent, '// === GENERATED_TABLES_START ===', '// === GENERATED_TABLES_END ===');
            currentSchemaVersion = this.extractSchemaVersion(existingContent);
        } else {
            existingContent = await this.fileSystem.readFile(templateDatabasePath);
            existingContent = this.updateSection(existingContent, '// === GENERATED_IMPORTS_START ===', '// === GENERATED_IMPORTS_END ===', '');
            existingContent = this.updateSection(existingContent, '// === GENERATED_TABLES_START ===', '// === GENERATED_TABLES_END ===', '');
            existingContent = this.updateSection(existingContent, '// === GENERATED_MIGRATION_START ===', '// === GENERATED_MIGRATION_END ===', '');
            existingContent = existingContent.replace(/int get schemaVersion => \d+;/, 'int get schemaVersion => 1;');
        }

        let featureTableFiles: string[] = [];
        if (await this.fileSystem.exists(featureTablesDir)) {
            featureTableFiles = (await this.fileSystem.readDirectory(featureTablesDir)).filter(file => file.endsWith('.dart'));
        }

        const newFeatureImports = featureTableFiles.map(file => {
            const relativeFeaturePath = path.relative(destinationDir, featureTablesDir).replaceAll('\\', '/');
            return `import '${relativeFeaturePath}/${file}';`;
        });

        // Фильтр 1: убираем все existingImports, файлы по которым больше не существуют
        // (фича удалена, либо файл переименован — например, после фикса BUG-002 старый
        // `correctionButton_table.dart` ушёл, остался `correction_button_table.dart`).
        const filteredExisting = new Set<string>();
        for (const imp of existingImports) {
            if (await this.isImportLive(imp, destinationDir)) {
                filteredExisting.add(imp);
            }
        }

        const allImports = new Set([...filteredExisting, ...newFeatureImports]);

        const newFeatureTableClasses = featureTableFiles.map(file => `${snakeToPascalCase(file.split('.')[0])},`);

        // Фильтр 2: класс таблицы остаётся, только если сохранился соответствующий import.
        // Если import убрали (фича удалена) — table-класс тоже выкидываем из @DriftDatabase.
        const liveTableClassNames = this.deriveTableClassNamesFromImports(allImports);
        const filteredExistingClasses = new Set<string>();
        for (const cls of existingTableClasses) {
            const clean = cls.replace(/,\s*$/, '');
            if (liveTableClassNames.has(clean)) {
                filteredExistingClasses.add(cls);
            }
        }

        const allTableClasses = new Set([...filteredExistingClasses, ...newFeatureTableClasses]);

        let finalContent = this.updateSection(
            existingContent,
            '// === GENERATED_IMPORTS_START ===',
            '// === GENERATED_IMPORTS_END ===',
            [...allImports].join('\n')
        );

        finalContent = this.updateSection(
            finalContent,
            '// === GENERATED_TABLES_START ===',
            '// === GENERATED_TABLES_END ===',
            [...allTableClasses].join('\n    ')
        );

        const actuallyNewTables = newFeatureTableClasses.filter(tableClass => !existingTableClasses.has(tableClass));
        if (actuallyNewTables.length > 0) {
            finalContent = this.updateMigration(finalContent, currentSchemaVersion, actuallyNewTables);
        }

        // Фильтр 3: убираем `await m.createTable(xxx);` для исчезнувших таблиц, чтобы
        // не было `undefined_identifier`. Schema version не понижаем — миграции — append-only.
        finalContent = this.removeStaleMigrationLines(finalContent, liveTableClassNames);

        finalContent = this.updateDatabaseName(finalContent, this.config.targetProject);

        await this.fileSystem.createFile(coreDatabasePath, finalContent);
    }

    private async isImportLive(importStatement: string, baseDir: string): Promise<boolean> {
        const match = importStatement.match(/import\s+['"]([^'"]+)['"]/);
        if (!match) { return true; }
        const importPath = match[1];
        // package:-импорты не трогаем (предполагаем что pub_get их разрешит)
        if (importPath.startsWith('package:') || importPath.startsWith('dart:')) { return true; }
        // Используем posix-семантику чтобы не привязываться к разделителям ОС.
        // path.resolve на Windows бы добавил `C:\` префикс, что не работает с MockFileSystem
        // в тестах и с forward-slash путями в production.
        const baseDirPosix = baseDir.replace(/\\/g, '/');
        const absolutePath = path.posix.normalize(path.posix.join(baseDirPosix, importPath));
        return await this.fileSystem.exists(absolutePath);
    }

    private deriveTableClassNamesFromImports(imports: Set<string>): Set<string> {
        const liveNames = new Set<string>();
        for (const imp of imports) {
            const match = imp.match(/['"]([^'"]+\.dart)['"]/);
            if (!match) { continue; }
            const baseName = path.basename(match[1], '.dart');
            // Паттерн файлов таблиц — `<entity>_table.dart` → класс `<Entity>Table`
            liveNames.add(snakeToPascalCase(baseName));
        }
        return liveNames;
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

            const replacement = `${migrationMarker}${newMigrationBlock}${existingMigrations}${migrationEndMarker}`;
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
