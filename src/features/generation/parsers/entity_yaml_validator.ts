import * as fs from 'fs';
import * as path from 'path';
import { ServerpodModel } from './formatters/types';
import { JunctionDetector } from './junction_detector';

export type ValidationErrorCode = 'MISSING_FIELD' | 'MISSING_SYNC_EVENT' | 'RESERVED_FIELD_NAME';

export interface ValidationError {
    code: ValidationErrorCode;
    message: string;
}

export class EntityYamlValidator {
    private static readonly REQUIRED_FIELDS = ['userId', 'customerId', 'isDeleted'];

    /**
     * BUG-024: имена полей, совпадающие с Drift `ColumnBuilder`-методами. Поле
     * `text` генерирует `TextColumn get text => text()()` — self-referential getter,
     * который роняет drift_dev. При этом `build_runner` exit 0 → stale
     * `database.g.dart` → каскад `flutter analyze` ошибок (silent broken build).
     * Ловим pre-flight, как BUG-018 для Serverpod reserved class names.
     */
    private static readonly RESERVED_DRIFT_COLUMN_NAMES = new Set([
        'text', 'integer', 'int64', 'boolean', 'dateTime', 'real', 'blob',
        'customType', 'intEnum', 'textEnum',
    ]);

    /**
     * BUG-024: проверяет имена полей на коллизию с Drift column-builder методами.
     * Запускается для ВСЕХ entities (включая junctions) — коллизия возникает на
     * уровне Drift table generation, до junction-специфичной логики.
     */
    private static validateReservedFieldNames(model: ServerpodModel): ValidationError[] {
        const errors: ValidationError[] = [];
        for (const f of model.fields) {
            if (this.RESERVED_DRIFT_COLUMN_NAMES.has(f.name)) {
                errors.push({
                    code: 'RESERVED_FIELD_NAME',
                    message: `Entity "${model.className}" field "${f.name}" collides with a Drift column-builder method — Drift would emit \`get ${f.name} => ${f.name}()()\` (self-referential), which crashes drift_dev while build_runner still exits 0 (silent broken build, BUG-024). Rename the field (e.g. "${f.name}" → "${f.name}Value" / "body" / "content").`,
                });
            }
        }
        return errors;
    }

    static validate(model: ServerpodModel): ValidationError[] {
        const errors: ValidationError[] = [];

        // BUG-024: reserved Drift column-builder name check — для ВСЕХ entities
        // (включая junctions), т.к. коллизия возникает на уровне table generation.
        errors.push(...this.validateReservedFieldNames(model));

        // TASK-013: junction detection через shared utility (Q3=A).
        // Replaces previous `model.isRelation` reliance (which itself was set от
        // legacy `parsed.class.includes('Map')` heuristic). Direct JunctionDetector
        // call гарантирует consistency между parser/validator/patcher даже если
        // `model.isRelation` flag не установлен (e.g. unit-test fixtures с raw model).
        // Junction пропускает required-field проверку, но reserved-name уже проверен выше.
        if (JunctionDetector.isJunctionEntity(model)) { return errors; }

        const fieldNames = new Set(model.fields.map(f => f.name));

        for (const required of this.REQUIRED_FIELDS) {
            if (!fieldNames.has(required)) {
                errors.push({
                    code: 'MISSING_FIELD',
                    message: `Entity "${model.className}" missing required field "${required}". The codegen template assumes the 6-field pattern (userId, customerId, isDeleted, createdAt, lastModified, id with defaultPersist).`,
                });
            }
        }

        return errors;
    }

    static validateSyncEvent(yamlPath: string, model: ServerpodModel): ValidationError[] {
        // TASK-013: junction skip через shared JunctionDetector (Q3=A).
        if (JunctionDetector.isJunctionEntity(model)) { return []; }

        const dir = path.dirname(yamlPath);
        const expectedFile = `${model.tableName}_sync_event.spy.yaml`;
        const expectedPath = path.join(dir, expectedFile);

        if (!fs.existsSync(expectedPath)) {
            return [{
                code: 'MISSING_SYNC_EVENT',
                message: `Entity "${model.className}" missing paired sync-event YAML at ${expectedFile}. Each codegen-managed entity requires a *_sync_event.spy.yaml in the same directory (offline-first sync pattern).`,
            }];
        }

        return [];
    }

    static formatErrors(errors: ValidationError[]): string {
        const header = `Non-standard entity detected. Codegen aborted to prevent broken Dart output (see BUG-004).`;
        const list = errors.map(e => `  - ${e.message}`).join('\n');
        // 6-field hint релевантен только для MISSING_FIELD ошибок. Для чистых
        // RESERVED_FIELD_NAME (BUG-024) сообщение самодостаточно — userId/customerId
        // паттерн к коллизии имени поля не относится.
        const hasMissingField = errors.some(e => e.code === 'MISSING_FIELD');
        const hint = hasMissingField
            ? `\nFor system-scoped entities (no userId/customerId), generate manually or extend YAML to include the 6-field pattern.`
            : '';
        return `${header}\n${list}${hint}`;
    }
}
