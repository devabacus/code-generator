import * as fs from 'fs';
import * as path from 'path';
import { ServerpodModel } from './formatters/types';

export type ValidationErrorCode = 'MISSING_FIELD' | 'MISSING_SYNC_EVENT';

export interface ValidationError {
    code: ValidationErrorCode;
    message: string;
}

/**
 * Profile-aware validator (TASK-016 / audit point 4.1).
 *
 * Поле `profile` в `.spy.yaml`:
 *  - `customerScoped` (default): требует userId + customerId + isDeleted (6-field pattern).
 *  - `userScoped`: требует только userId + isDeleted (5-field pattern, todo-style).
 *
 * Backward-compat: YAML без явного `profile` поля → `customerScoped` (текущее поведение).
 */
export type SyncProfile = 'customerScoped' | 'userScoped';

export class EntityYamlValidator {
    private static readonly REQUIRED_BY_PROFILE: Record<SyncProfile, readonly string[]> = {
        customerScoped: ['userId', 'customerId', 'isDeleted'],
        userScoped: ['userId', 'isDeleted'],
    };

    static validate(model: ServerpodModel): ValidationError[] {
        if (model.isRelation) { return []; }

        const errors: ValidationError[] = [];
        const fieldNames = new Set(model.fields.map(f => f.name));

        const profile: SyncProfile = (model.profile ?? 'customerScoped') as SyncProfile;
        const required = this.REQUIRED_BY_PROFILE[profile];
        if (!required) {
            errors.push({
                code: 'MISSING_FIELD',
                message: `Entity "${model.className}" has unknown profile "${model.profile}". Allowed: customerScoped, userScoped.`,
            });
            return errors;
        }

        for (const requiredField of required) {
            if (!fieldNames.has(requiredField)) {
                errors.push({
                    code: 'MISSING_FIELD',
                    message: `Entity "${model.className}" (profile=${profile}) missing required field "${requiredField}". ${this.profileHint(profile)}`,
                });
            }
        }

        return errors;
    }

    private static profileHint(profile: SyncProfile): string {
        if (profile === 'userScoped') {
            return 'userScoped profile expects 5-field pattern (id, userId, createdAt, lastModified, isDeleted).';
        }
        return 'customerScoped profile expects 6-field pattern (id, userId, customerId, createdAt, lastModified, isDeleted).';
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
        const hint = `\nFor user-only entities (no customerId), set 'profile: userScoped' in YAML to use the 5-field pattern. ` +
            `For system-scoped entities (no userId/customerId), generate manually.`;
        return `${header}\n${list}${hint}`;
    }
}
