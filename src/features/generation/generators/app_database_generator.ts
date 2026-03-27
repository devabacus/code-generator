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

        const allImports = new Set([...existingImports, ...newFeatureImports]);

        const newFeatureTableClasses = featureTableFiles.map(file => `${snakeToPascalCase(file.split('.')[0])},`);

        const allTableClasses = new Set([...existingTableClasses, ...newFeatureTableClasses]);

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

        finalContent = this.updateDatabaseName(finalContent, this.config.targetProject);

        await this.fileSystem.createFile(coreDatabasePath, finalContent);
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
