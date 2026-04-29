import * as fs from 'fs';
import * as path from 'path';
import { ServerpodModel } from './formatters/types';

export type ValidationErrorCode = 'MISSING_FIELD' | 'MISSING_SYNC_EVENT';

export interface ValidationError {
    code: ValidationErrorCode;
    message: string;
}

export class EntityYamlValidator {
    private static readonly REQUIRED_FIELDS = ['userId', 'customerId', 'isDeleted'];

    static validate(model: ServerpodModel): ValidationError[] {
        if (model.isRelation) { return []; }

        const errors: ValidationError[] = [];
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
        if (model.isRelation) { return []; }

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
        const hint = `\nFor system-scoped entities (no userId/customerId), generate manually or extend YAML to include the 6-field pattern.`;
        return `${header}\n${list}${hint}`;
    }
}
