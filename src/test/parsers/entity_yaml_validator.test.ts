import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { EntityYamlValidator } from '../../features/generation/parsers/entity_yaml_validator';
import { ServerpodModel } from '../../features/generation/parsers/formatters/types';

function field(name: string, type = 'String'): any {
    return { name, type, nullable: false };
}

/**
 * FK field helper — обязателен для junction fixtures после TASK-013.
 * JunctionDetector.isJunctionEntity() считает FK только поля с `isRelation: true`.
 */
function fkField(name: string, related?: string): any {
    return {
        name,
        type: 'UuidValue',
        nullable: false,
        isRelation: true,
        relationType: 'manyToOne',
        relatedModel: related ?? name.replace(/Id$/, ''),
    };
}

function standardModel(overrides: Partial<ServerpodModel> = {}): ServerpodModel {
    return {
        className: 'Weighing',
        tableName: 'weighing',
        fields: [
            { name: 'id', type: 'UuidValue', nullable: true, defaultPersist: 'random_v7' },
            { name: 'userId', type: 'int', nullable: false },
            { name: 'customerId', type: 'UuidValue', nullable: false, isRelation: true, relationType: 'manyToOne', relatedModel: 'Customer' },
            { name: 'isDeleted', type: 'bool', nullable: false, defaultValue: 'false' },
            { name: 'createdAt', type: 'DateTime', nullable: false },
            { name: 'lastModified', type: 'DateTime', nullable: false },
        ],
        isRelation: false,
        ...overrides,
    };
}

suite('EntityYamlValidator Test Suite', () => {

    test('valid entity with 6-field pattern returns no errors', () => {
        const model = standardModel();
        const errors = EntityYamlValidator.validate(model);
        assert.strictEqual(errors.length, 0);
    });

    test('missing userId triggers error', () => {
        const model = standardModel({ fields: standardModel().fields.filter(f => f.name !== 'userId') });
        const errors = EntityYamlValidator.validate(model);
        assert.strictEqual(errors.length, 1);
        assert.strictEqual(errors[0].code, 'MISSING_FIELD');
        assert.ok(errors[0].message.includes('userId'));
    });

    test('missing all 3 required fields triggers 3 errors', () => {
        const model = standardModel({
            className: 'AppSetting',
            tableName: 'app_setting',
            fields: [field('id'), field('key'), field('value')],
        });
        const errors = EntityYamlValidator.validate(model);
        assert.strictEqual(errors.length, 3);
        const codes = errors.map(e => e.code);
        assert.deepStrictEqual([...new Set(codes)], ['MISSING_FIELD']);
        const messageJoined = errors.map(e => e.message).join('|');
        assert.ok(messageJoined.includes('userId'));
        assert.ok(messageJoined.includes('customerId'));
        assert.ok(messageJoined.includes('isDeleted'));
    });

    test('M2M junction map skips validation', () => {
        // TASK-013: junction detection через JunctionDetector — FK fields обязаны
        // иметь `isRelation: true` flag. Старая fixture использовала `field()` helper
        // без relation flag → junction не detected → validation срабатывала.
        const model = standardModel({
            className: 'TaskTagMap',
            tableName: 'task_tag_map',
            isRelation: true,
            fields: [field('id'), fkField('taskId', 'Task'), fkField('tagId', 'Tag')],
        });
        const errors = EntityYamlValidator.validate(model);
        assert.strictEqual(errors.length, 0);
    });

    test('validateSyncEvent: paired file present → no errors', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codegen-test-'));
        try {
            const yamlPath = path.join(tmpDir, 'weighing.spy.yaml');
            const syncPath = path.join(tmpDir, 'weighing_sync_event.spy.yaml');
            fs.writeFileSync(yamlPath, 'class: Weighing');
            fs.writeFileSync(syncPath, 'class: WeighingSyncEvent');

            const errors = EntityYamlValidator.validateSyncEvent(yamlPath, standardModel());
            assert.strictEqual(errors.length, 0);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('validateSyncEvent: paired file missing → 1 error', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codegen-test-'));
        try {
            const yamlPath = path.join(tmpDir, 'weighing.spy.yaml');
            fs.writeFileSync(yamlPath, 'class: Weighing');

            const errors = EntityYamlValidator.validateSyncEvent(yamlPath, standardModel());
            assert.strictEqual(errors.length, 1);
            assert.strictEqual(errors[0].code, 'MISSING_SYNC_EVENT');
            assert.ok(errors[0].message.includes('weighing_sync_event.spy.yaml'));
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('validateSyncEvent: M2M skips check', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codegen-test-'));
        try {
            const yamlPath = path.join(tmpDir, 'task_tag_map.spy.yaml');
            fs.writeFileSync(yamlPath, 'class: TaskTagMap');
            const m2m = standardModel({
                className: 'TaskTagMap',
                tableName: 'task_tag_map',
                isRelation: true,
                fields: [field('id'), fkField('taskId', 'Task'), fkField('tagId', 'Tag')],
            });
            const errors = EntityYamlValidator.validateSyncEvent(yamlPath, m2m);
            assert.strictEqual(errors.length, 0);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('formatErrors produces user-readable message', () => {
        const errors = EntityYamlValidator.validate(standardModel({
            fields: [field('id'), field('key'), field('value')],
        }));
        const text = EntityYamlValidator.formatErrors(errors);
        assert.ok(text.includes('Non-standard entity detected'));
        assert.ok(text.includes('BUG-004'));
        assert.ok(text.includes('userId'));
    });
});
