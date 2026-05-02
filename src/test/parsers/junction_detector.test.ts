import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { JunctionDetector, JunctionValidationError } from '../../features/generation/parsers/junction_detector';
import { ServerpodYamlParser } from '../../features/generation/parsers/server_yaml_parser';
import { ServerpodModel, ServerpodField } from '../../features/generation/parsers/formatters/types';

/**
 * Helpers — небольшие фабрики для построения ServerpodModel/ServerpodField без
 * boilerplate. Используются в всех structural test cases.
 */
function fk(name: string, opts: { nullable?: boolean; relatedModel?: string } = {}): ServerpodField {
    return {
        name,
        type: 'UuidValue',
        nullable: opts.nullable ?? false,
        isRelation: true,
        relationType: 'manyToOne',
        relatedModel: opts.relatedModel ?? name.replace(/Id$/, ''),
    };
}

function field(name: string, type = 'String', nullable = false): ServerpodField {
    return { name, type, nullable };
}

function model(className: string, fields: ServerpodField[]): ServerpodModel {
    return {
        className,
        tableName: className.toLowerCase(),
        fields,
        isRelation: false,
    };
}

const baseFields: ServerpodField[] = [
    { name: 'id', type: 'UuidValue', nullable: true, defaultPersist: 'random_v7' },
    field('userId', 'int'),
    fk('customerId', { relatedModel: 'Customer' }),
    field('createdAt', 'DateTime'),
    field('lastModified', 'DateTime'),
    { name: 'isDeleted', type: 'bool', nullable: false, defaultValue: 'false' },
];

suite('JunctionDetector Test Suite', () => {

    // ── Structural detection (6 cases минимум, Discussion #2 Chatgpt_1) ──────

    test('case 1: 2 required FK + base fields → junction (RolePermission case)', () => {
        // Воспроизводит реальный RolePermission.spy.yaml в weight (false-negative #1).
        const m = model('RolePermission', [
            { name: 'id', type: 'UuidValue', nullable: true, defaultPersist: 'random_v7' },
            fk('roleId', { relatedModel: 'Role' }),
            fk('permissionId', { relatedModel: 'Permission' }),
        ]);
        const result = JunctionDetector.analyze(m);
        assert.strictEqual(result.isJunction, true);
        assert.strictEqual(result.reason, 'structural');
        assert.strictEqual(result.fkFields.length, 2);
        assert.strictEqual(result.extraFields.length, 0);
    });

    test('case 2: 2 FK, один nullable → junction (CustomerUser case — nullable FK = FK)', () => {
        // Воспроизводит CustomerUser.spy.yaml signature (false-negative #2).
        // Nullable FK (defaultTerminalSetId) тоже считается FK.
        const m = model('CustomerUser', [
            { name: 'id', type: 'UuidValue', nullable: true, defaultPersist: 'random_v7' },
            fk('customerId', { relatedModel: 'Customer' }),
            field('userId', 'int'),
            fk('roleId', { relatedModel: 'Role' }),
            fk('defaultTerminalSetId', { nullable: true, relatedModel: 'TerminalSet' }),
        ]);
        const result = JunctionDetector.analyze(m);
        assert.strictEqual(result.isJunction, true, 'CustomerUser должен быть junction');
        assert.strictEqual(result.reason, 'structural');
        // 2 required FK (customerId, roleId) + 1 nullable FK (defaultTerminalSetId) = 3 FK.
        // userId — int без relation declaration, не FK.
        assert.strictEqual(result.fkFields.length, 3);
        assert.strictEqual(result.extraFields.length, 0);
    });

    test('case 3: 3+ FK + base fields → junction', () => {
        const m = model('TripleJunction', [
            { name: 'id', type: 'UuidValue', nullable: true, defaultPersist: 'random_v7' },
            fk('aId'),
            fk('bId'),
            fk('cId'),
            field('userId', 'int'),
            field('createdAt', 'DateTime'),
        ]);
        const result = JunctionDetector.analyze(m);
        assert.strictEqual(result.isJunction, true);
        assert.strictEqual(result.fkFields.length, 3);
    });

    test('case 4: 2 FK + extra business field без junction:true → regular', () => {
        // 2 FK + assignedAt (не в base whitelist) → strict default classifies as regular.
        const m = model('UserPermission', [
            { name: 'id', type: 'UuidValue', nullable: true, defaultPersist: 'random_v7' },
            fk('userId', { relatedModel: 'User' }),
            fk('permissionId', { relatedModel: 'Permission' }),
            field('assignedAt', 'DateTime'),
        ]);
        const result = JunctionDetector.analyze(m);
        assert.strictEqual(result.isJunction, false);
        assert.strictEqual(result.reason, undefined);
        assert.strictEqual(result.fkFields.length, 2);
        assert.strictEqual(result.extraFields.length, 1);
        assert.strictEqual(result.extraFields[0].name, 'assignedAt');
    });

    test('case 5: 2 FK + extra field + junction:true → junction (override applied)', () => {
        // Same shape как case 4, но с explicit junction: true override.
        const m = model('UserPermission', [
            { name: 'id', type: 'UuidValue', nullable: true, defaultPersist: 'random_v7' },
            fk('userId', { relatedModel: 'User' }),
            fk('permissionId', { relatedModel: 'Permission' }),
            field('assignedAt', 'DateTime'),
        ]);
        const result = JunctionDetector.analyze(m, true);
        assert.strictEqual(result.isJunction, true);
        assert.strictEqual(result.reason, 'explicitOverride');
        assert.strictEqual(result.fkFields.length, 2);
        assert.strictEqual(result.extraFields.length, 1);
    });

    test('case 6: 1 FK + junction:true → throws JunctionValidationError', () => {
        const m = model('BadJunction', [
            { name: 'id', type: 'UuidValue', nullable: true },
            fk('roleId'),
        ]);
        assert.throws(
            () => JunctionDetector.analyze(m, true),
            (err: Error) => {
                assert.ok(err instanceof JunctionValidationError, 'must be JunctionValidationError');
                assert.ok(err.message.includes('junction requires 2+ relations') || err.message.includes('Junction requires 2+ relations'));
                assert.ok(err.message.includes('BadJunction'), 'message must reference className');
                return true;
            },
        );
    });

    // ── Negative tests (Q2=A reinforcement — drop *Map suffix entirely) ─────

    test('negative: RoadMap с domain fields (description/coordinates) → regular', () => {
        // suffix Map не должен trigger junction detection. Reality check.
        const m = model('RoadMap', [
            { name: 'id', type: 'UuidValue', nullable: true },
            field('userId', 'int'),
            fk('customerId'),
            field('description', 'String'),
            field('coordinates', 'String'),
            field('isDeleted', 'bool'),
        ]);
        const result = JunctionDetector.analyze(m);
        assert.strictEqual(result.isJunction, false, 'RoadMap (с domain fields) НЕ junction');
        assert.strictEqual(result.extraFields.length, 2, 'description + coordinates как extra');
    });

    test('negative: SiteMap с domain fields → regular', () => {
        const m = model('SiteMap', [
            { name: 'id', type: 'UuidValue', nullable: true },
            fk('customerId'),
            field('siteName', 'String'),
            field('layoutJson', 'String'),
        ]);
        const result = JunctionDetector.analyze(m);
        assert.strictEqual(result.isJunction, false);
    });

    test('negative: BitMap с single FK + domain → regular (не junction by FK count)', () => {
        const m = model('BitMap', [
            { name: 'id', type: 'UuidValue', nullable: true },
            fk('customerId'),
            field('bits', 'String'),
            field('width', 'int'),
            field('height', 'int'),
        ]);
        const result = JunctionDetector.analyze(m);
        assert.strictEqual(result.isJunction, false);
        assert.strictEqual(result.fkFields.length, 1, 'BitMap имеет 1 FK (customerId)');
    });

    // ── Boundary cases ───────────────────────────────────────────────────────

    test('boundary: single FK + base fields → regular (not enough FKs)', () => {
        const m = model('Configuration', [
            { name: 'id', type: 'UuidValue', nullable: true },
            field('userId', 'int'),
            fk('customerId'),
            field('createdAt', 'DateTime'),
            field('lastModified', 'DateTime'),
            field('isDeleted', 'bool'),
        ]);
        const result = JunctionDetector.analyze(m);
        assert.strictEqual(result.isJunction, false);
        assert.strictEqual(result.fkFields.length, 1, 'только customerId как FK');
    });

    test('boundary: empty extraFields с 2 FK → junction (TaskTagMap baseline)', () => {
        // TaskTagMap из t115 template — backward compat reference.
        const m = model('TaskTagMap', [
            { name: 'id', type: 'UuidValue', nullable: true, defaultPersist: 'random_v7' },
            fk('taskId', { relatedModel: 'Task' }),
            fk('tagId', { relatedModel: 'Tag' }),
            field('userId', 'int'),
            fk('customerId', { relatedModel: 'Customer' }),
            field('createdAt', 'DateTime'),
            field('lastModified', 'DateTime'),
            { name: 'isDeleted', type: 'bool', nullable: false, defaultValue: 'false' },
        ]);
        const result = JunctionDetector.analyze(m);
        assert.strictEqual(result.isJunction, true, 'TaskTagMap (existing junction) detected as junction');
        assert.strictEqual(result.reason, 'structural');
        // 2 business FK (taskId/tagId) + 1 base FK (customerId) = 3 FK total.
        assert.strictEqual(result.fkFields.length, 3);
    });

    test('boundary: explicitFlag=false → ignored (positive override only)', () => {
        // Q1=C: junction:false НЕ supported as override. explicitFlag=false ничего не меняет.
        const m = model('TaskTagMap', [
            { name: 'id', type: 'UuidValue', nullable: true },
            fk('taskId'),
            fk('tagId'),
        ]);
        // Без override → junction (structural).
        assert.strictEqual(JunctionDetector.isJunctionEntity(m), true);
        // С explicitFlag=false → всё равно junction (structural detection не overridden).
        assert.strictEqual(JunctionDetector.isJunctionEntity(m, false), true);
    });

    test('boundary: junction:true с valid 2 FK + базовые → junction (reason=explicitOverride)', () => {
        const m = model('PureFkPair', [
            { name: 'id', type: 'UuidValue', nullable: true },
            fk('aId'),
            fk('bId'),
        ]);
        const result = JunctionDetector.analyze(m, true);
        assert.strictEqual(result.isJunction, true);
        assert.strictEqual(result.reason, 'explicitOverride');
    });

    // ── Dynamic regression (Claude_1 enhancement) ────────────────────────────

    test('dynamic regression: ВСЕ existing *Map entities в t115 template должны detect как junction', () => {
        const t115ModelsDir = path.resolve(__dirname, '../../../../../../../Templates/flutter/t115/t115_server/lib/src/models');

        // Resolve fallback — если path doesn't exist (e.g. t115 не на disk в CI),
        // skip test без fail. На локальной dev машине t115 всегда присутствует.
        if (!fs.existsSync(t115ModelsDir)) {
            console.warn(`[skip] t115 models dir not found: ${t115ModelsDir}`);
            return;
        }

        const yamlFiles: string[] = [];
        const walk = (dir: string) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    walk(full);
                } else if (entry.name.endsWith('.spy.yaml') && !entry.name.endsWith('_sync_event.spy.yaml')) {
                    yamlFiles.push(full);
                }
            }
        };
        walk(t115ModelsDir);

        const mapEntities: { file: string; className: string }[] = [];

        for (const file of yamlFiles) {
            const content = fs.readFileSync(file, 'utf-8');
            const parsed = yaml.load(content) as any;
            if (!parsed || typeof parsed.class !== 'string') continue;
            if (parsed.class.endsWith('Map')) {
                mapEntities.push({ file, className: parsed.class });
            }
        }

        // Sanity: t115 содержит как минимум TaskTagMap.
        assert.ok(
            mapEntities.length > 0,
            `t115 template должен содержать хотя бы один *Map entity. Найдено: ${mapEntities.length}`,
        );

        // Per-entity assertion: каждый *Map в t115 должен быть detected как junction
        // через новую structural detection (durable contract — новый template entity
        // автоматически в regression suite).
        for (const { file, className } of mapEntities) {
            const content = fs.readFileSync(file, 'utf-8');
            const parsedModel = ServerpodYamlParser.parse(content);
            const isJunction = JunctionDetector.isJunctionEntity(parsedModel);
            assert.strictEqual(
                isJunction,
                true,
                `${className} (${path.relative(t115ModelsDir, file)}) должен detect как junction через structural analysis`,
            );
        }
    });

    // ── Integration с ServerpodYamlParser ────────────────────────────────────

    test('integration: server_yaml_parser sets model.isRelation через JunctionDetector', () => {
        // Воспроизводит реальный flow: parse YAML → check model.isRelation flag.
        const yamlContent = `
class: RolePermission
table: role_permission
fields:
  id: UuidValue?, defaultPersist=random_v7
  roleId: UuidValue, relation(parent=role, onDelete=Cascade)
  permissionId: UuidValue, relation(parent=permission, onDelete=Cascade)
`;
        const m = ServerpodYamlParser.parse(yamlContent);
        assert.strictEqual(m.isRelation, true, 'RolePermission через parser должен иметь isRelation=true');
        assert.strictEqual(m.entity1, 'role');
        assert.strictEqual(m.entity2, 'permission');
    });

    test('integration: explicit junction:true в YAML переключает entity с metadata в junction', () => {
        const yamlContent = `
class: UserPermission
table: user_permission
junction: true
fields:
  id: UuidValue?, defaultPersist=random_v7
  userId: UuidValue, relation(parent=user, onDelete=Cascade)
  permissionId: UuidValue, relation(parent=permission, onDelete=Cascade)
  assignedAt: DateTime
`;
        const m = ServerpodYamlParser.parse(yamlContent);
        assert.strictEqual(m.isRelation, true, 'junction:true override → isRelation=true');
    });

    test('integration: junction:true с 1 FK throws JunctionValidationError через parser', () => {
        const yamlContent = `
class: BadJunction
table: bad_junction
junction: true
fields:
  id: UuidValue?
  onlyOneFk: UuidValue, relation(parent=other, onDelete=Cascade)
`;
        assert.throws(
            () => ServerpodYamlParser.parse(yamlContent),
            JunctionValidationError,
        );
    });

    test('integration: regular Configuration entity → isRelation=false', () => {
        const yamlContent = `
class: Configuration
table: configuration
fields:
  id: UuidValue?, defaultPersist=random_v7
  group: String
  key: String
  value: String?
  userId: int
  customerId: UuidValue, relation(parent=customer, onDelete=Cascade)
  createdAt: DateTime
  lastModified: DateTime
  isDeleted: bool, default=false
`;
        const m = ServerpodYamlParser.parse(yamlContent);
        assert.strictEqual(m.isRelation, false);
    });

    test('integration: weight RolePermission YAML detected as junction (false-negative #1 fix)', () => {
        const realYamlPath = 'G:/Projects/Flutter/serverpod/weight/weight_server/lib/src/models/user/role_permission.spy.yaml';
        if (!fs.existsSync(realYamlPath)) {
            console.warn(`[skip] weight role_permission.spy.yaml not found: ${realYamlPath}`);
            return;
        }
        const content = fs.readFileSync(realYamlPath, 'utf-8');
        const m = ServerpodYamlParser.parse(content);
        assert.strictEqual(m.isRelation, true, 'weight RolePermission должен detect как junction');
    });

    test('integration: weight CustomerUser YAML detected as junction (false-negative #2 fix)', () => {
        const realYamlPath = 'G:/Projects/Flutter/serverpod/weight/weight_server/lib/src/models/user/customer_user.spy.yaml';
        if (!fs.existsSync(realYamlPath)) {
            console.warn(`[skip] weight customer_user.spy.yaml not found: ${realYamlPath}`);
            return;
        }
        const content = fs.readFileSync(realYamlPath, 'utf-8');
        const m = ServerpodYamlParser.parse(content);
        assert.strictEqual(m.isRelation, true, 'weight CustomerUser должен detect как junction (nullable FK = FK)');
    });
});
