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

    test('BUG-024: field "text" (Drift builder name) → RESERVED_FIELD_NAME error', () => {
        const model = standardModel({ fields: [...standardModel().fields, field('text')] });
        const errors = EntityYamlValidator.validate(model);
        const reserved = errors.filter(e => e.code === 'RESERVED_FIELD_NAME');
        assert.strictEqual(reserved.length, 1);
        assert.ok(reserved[0].message.includes('text'));
        assert.ok(reserved[0].message.includes('Drift'));
    });

    test('BUG-024: multiple reserved field names → one error each', () => {
        const model = standardModel({
            fields: [...standardModel().fields, field('text'), field('boolean'), field('dateTime')],
        });
        const reserved = EntityYamlValidator.validate(model).filter(e => e.code === 'RESERVED_FIELD_NAME');
        assert.strictEqual(reserved.length, 3);
    });

    test('BUG-024: reserved name caught even in junction (pre-table-gen collision)', () => {
        const model = standardModel({
            className: 'TaskTagMap', tableName: 'task_tag_map', isRelation: true,
            fields: [field('id'), fkField('taskId', 'Task'), fkField('tagId', 'Tag'), field('text')],
        });
        const reserved = EntityYamlValidator.validate(model).filter(e => e.code === 'RESERVED_FIELD_NAME');
        assert.strictEqual(reserved.length, 1);
    });

    test('BUG-024: non-reserved field (body) → no reserved error', () => {
        const model = standardModel({ fields: [...standardModel().fields, field('body')] });
        const reserved = EntityYamlValidator.validate(model).filter(e => e.code === 'RESERVED_FIELD_NAME');
        assert.strictEqual(reserved.length, 0);
    });

    test('BUG-024: standard 6-field entity stays clean (createdAt/lastModified не reserved)', () => {
        const errors = EntityYamlValidator.validate(standardModel());
        assert.strictEqual(errors.length, 0);
    });

    // ── BUG-015: cross-feature junction guard (TASK-039 loud-guard) ──────────
    //
    // Junction, у которого оба parent-entity живут в РАЗНЫХ features, генерит
    // broken cross-feature импорты (repository/providers/domain/presentation — 5
    // подсистем без reuse-резолвера). Пока полный feature-aware резолвер не сделан
    // (backlog), pre-flight guard превращает silent misgeneration в громкий отказ.
    // Проверенный рабочий сценарий (t201/t206 control) — оба parent в ОДНОЙ feature.

    /** Создаёт feature-tree с entity-файлами по указанным (feature → [entity]) парам. */
    function makeFeaturesTree(spec: Record<string, string[]>): string {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codegen-feat-'));
        for (const [feature, entities] of Object.entries(spec)) {
            for (const entity of entities) {
                const dir = path.join(root, feature, 'domain', 'entities', entity);
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(path.join(dir, `${entity}_entity.dart`), '// stub');
            }
        }
        return root;
    }

    function junctionModel(entity1: string, entity2: string): ServerpodModel {
        return standardModel({
            className: 'AuthorBookMap',
            tableName: 'author_book_map',
            isRelation: true,
            entity1,
            entity2,
            fields: [
                field('id'),
                fkField(`${entity1}Id`, entity1.charAt(0).toUpperCase() + entity1.slice(1)),
                fkField(`${entity2}Id`, entity2.charAt(0).toUpperCase() + entity2.slice(1)),
            ],
        });
    }

    test('BUG-015: junction parents в РАЗНЫХ features → CROSS_FEATURE_JUNCTION error', () => {
        const featuresRoot = makeFeaturesTree({ authors: ['author'], books: ['book'] });
        try {
            const errors = EntityYamlValidator.validateJunctionColocation(
                junctionModel('author', 'book'), featuresRoot,
            );
            assert.strictEqual(errors.length, 1);
            assert.strictEqual(errors[0].code, 'CROSS_FEATURE_JUNCTION');
            assert.ok(errors[0].message.includes('author'), 'сообщение называет parent author');
            assert.ok(errors[0].message.includes('book'), 'сообщение называет parent book');
            assert.ok(/feature/i.test(errors[0].message), 'сообщение объясняет про feature');
        } finally {
            fs.rmSync(featuresRoot, { recursive: true, force: true });
        }
    });

    test('BUG-015: junction parents в ОДНОЙ feature → no error (доказанный t201 сценарий)', () => {
        const featuresRoot = makeFeaturesTree({ catalog: ['product', 'vendor'] });
        try {
            const errors = EntityYamlValidator.validateJunctionColocation(
                junctionModel('product', 'vendor'), featuresRoot,
            );
            assert.strictEqual(errors.length, 0);
        } finally {
            fs.rmSync(featuresRoot, { recursive: true, force: true });
        }
    });

    test('BUG-015: non-junction entity → guard пропускает (no error)', () => {
        const featuresRoot = makeFeaturesTree({ catalog: ['weighing'] });
        try {
            const errors = EntityYamlValidator.validateJunctionColocation(standardModel(), featuresRoot);
            assert.strictEqual(errors.length, 0);
        } finally {
            fs.rmSync(featuresRoot, { recursive: true, force: true });
        }
    });

    test('BUG-015: parent entity не найден ни в одной feature → guard не падает (не его зона)', () => {
        // Отсутствие entity-файла — забота других проверок/генерации, не co-location
        // guard'а. Guard срабатывает только когда ОБА parent найдены в РАЗНЫХ features.
        const featuresRoot = makeFeaturesTree({ authors: ['author'] });
        try {
            const errors = EntityYamlValidator.validateJunctionColocation(
                junctionModel('author', 'book'), featuresRoot,
            );
            assert.strictEqual(errors.length, 0, 'book не найден → co-location недоказуема → guard молчит');
        } finally {
            fs.rmSync(featuresRoot, { recursive: true, force: true });
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
