import * as assert from 'assert';
import { generateEntityToServerpodParams, generateServerpodToModelParams } from '../../features/generation/generators/relation_generation';
import { ServerpodModel, ServerpodField } from '../../features/generation/parsers/formatters/types';

/**
 * TASK-027 (Bug 2 из weight TASK-019 sync_core pack) — enum-парсинг graceful
 * через `tryParseEnum` вместо `byName`.
 *
 * **Корень бага:** `generateEntityToServerpodParams` emit'ил
 * `serverpod.EnumType.values.byName(raw)` для enum-полей в `*_entity_extension.dart`
 * `toServerpod<X>()` методе. `byName` бросает `StateError` на unknown raw → весь
 * push в sync_core фейлится → outbox retry в loop → silent freeze. В weight TASK-019
 * это всплыло на `WeighingStatus`/`Direction`/`TaraSource` (Bug A2).
 *
 * **Фикс TASK-027:** emit `tryParseEnum(serverpod.EnumType.values, raw, serverpod.EnumType.values.first)`.
 * Helper в shared template `lib/core/utils/enum_parse.dart` (manifest: startProject) —
 * возвращает defaultValue (first enum value) на unknown raw, без crash.
 *
 * **Design:** Option A shared helper (DRY, idiomatic Dart, single test target).
 * Import unconditional в template `category_entity_extension.dart` (с `// ignore: unused_import`
 * для entities без enum полей).
 */

function makeModel(fields: ServerpodField[]): ServerpodModel {
    return {
        className: 'Weighing',
        tableName: 'weighing',
        isRelation: false,
        fields: [
            { name: 'id', type: 'String', nullable: false },
            { name: 'userId', type: 'int', nullable: false },
            { name: 'customerId', type: 'String', nullable: false, isRelation: true, relationType: 'manyToOne' as const, relatedModel: 'customer' },
            { name: 'createdAt', type: 'DateTime', nullable: false },
            { name: 'lastModified', type: 'DateTime', nullable: false },
            { name: 'isDeleted', type: 'bool', nullable: false },
            ...fields,
        ],
    };
}

suite('TASK-027: generateEntityToServerpodParams — tryParseEnum для enum-полей (Bug 2)', () => {

    test('non-null enum field: emit tryParseEnum с serverpod.EnumType.values.first как default', () => {
        const model = makeModel([
            { name: 'status', type: 'WeighingStatus', nullable: false, isEnum: true },
        ]);
        const result = generateEntityToServerpodParams(model);
        assert.ok(
            result.includes('status: tryParseEnum(serverpod.WeighingStatus.values, status, serverpod.WeighingStatus.values.first)'),
            'expected tryParseEnum emission для non-null enum field, got: ' + result,
        );
        // Anti-pattern должен быть истреблён
        assert.ok(
            !result.includes('byName'),
            'BUG-022 anti-pattern `byName` должен быть истреблён, got: ' + result,
        );
    });

    test('nullable enum field: null-passthrough + tryParseEnum в not-null ветке', () => {
        const model = makeModel([
            { name: 'direction', type: 'Direction', nullable: true, isEnum: true },
        ]);
        const result = generateEntityToServerpodParams(model);
        // Null passthrough preserved (если raw === null → null, не default)
        assert.ok(
            result.includes('direction != null ? tryParseEnum(serverpod.Direction.values, direction, serverpod.Direction.values.first) : null'),
            'expected null-passthrough idiom для nullable enum, got: ' + result,
        );
        assert.ok(
            !result.includes('byName'),
            'BUG-022 anti-pattern в nullable case тоже должен быть истреблён, got: ' + result,
        );
    });

    test('multiple enum fields: tryParseEnum для каждого', () => {
        const model = makeModel([
            { name: 'status', type: 'Status', nullable: false, isEnum: true },
            { name: 'direction', type: 'Direction', nullable: false, isEnum: true },
            { name: 'source', type: 'TaraSource', nullable: true, isEnum: true },
        ]);
        const result = generateEntityToServerpodParams(model);
        const tryParseEnumCount = (result.match(/tryParseEnum/g) ?? []).length;
        const byNameCount = (result.match(/byName/g) ?? []).length;
        assert.strictEqual(tryParseEnumCount, 3, 'expected 3 tryParseEnum emissions (one per enum field)');
        assert.strictEqual(byNameCount, 0, 'expected 0 byName (anti-pattern istreblён)');
    });

    test('non-enum field (String): не trog\'ается, plain field: field assignment', () => {
        const model = makeModel([
            { name: 'note', type: 'String', nullable: true },
        ]);
        const result = generateEntityToServerpodParams(model);
        assert.ok(result.includes('note: note'), 'String field плan passthrough');
        assert.ok(!result.includes('tryParseEnum'), 'tryParseEnum НЕ должен срабатывать для не-enum');
        assert.ok(!result.includes('byName'), 'byName НЕ должен срабатывать для не-enum');
    });

    test('non-enum field (int): plain passthrough', () => {
        const model = makeModel([
            { name: 'amount', type: 'int', nullable: false },
        ]);
        const result = generateEntityToServerpodParams(model);
        assert.ok(result.includes('amount: amount'), 'int field plain passthrough');
        assert.ok(!result.includes('tryParseEnum'));
    });

    test('FK relation field: НЕ trog\'ается tryParseEnum (UuidValue.fromString preserved)', () => {
        const model = makeModel([
            { name: 'assigneeId', type: 'String', nullable: false, isRelation: true, relationType: 'manyToOne' as const, relatedModel: 'member' },
        ]);
        const result = generateEntityToServerpodParams(model);
        assert.ok(
            result.includes('assigneeId: serverpod.UuidValue.fromString(assigneeId)'),
            'FK relation должна остаться UuidValue.fromString',
        );
        assert.ok(!result.includes('tryParseEnum'), 'FK ≠ enum');
    });

    test('mixed: enum + relation + plain — каждый получает свой treatment', () => {
        const model = makeModel([
            { name: 'status', type: 'Status', nullable: false, isEnum: true },
            { name: 'assigneeId', type: 'String', nullable: true, isRelation: true, relationType: 'manyToOne' as const, relatedModel: 'member' },
            { name: 'note', type: 'String', nullable: true },
        ]);
        const result = generateEntityToServerpodParams(model);
        assert.ok(result.includes('status: tryParseEnum(serverpod.Status.values, status, serverpod.Status.values.first)'));
        assert.ok(result.includes('assigneeId == null ? null : serverpod.UuidValue.fromString(assigneeId!)'));
        assert.ok(result.includes('note: note'));
        assert.ok(!result.includes('byName'), 'no anti-pattern anywhere в mixed scenario');
    });
});

suite('TASK-027: generateServerpodToModelParams — `.name` direction unchanged (safe regression)', () => {

    test('enum field — .name direction safe (не tryParseEnum, не byName)', () => {
        // serverpod → local направление безопасно: typed enum → String через .name.
        // Не должно превратиться в tryParseEnum случайно.
        const model = makeModel([
            { name: 'status', type: 'Status', nullable: false, isEnum: true },
        ]);
        const result = generateServerpodToModelParams(model);
        assert.ok(result.includes('status: status.name'), 'enum .name passthrough preserved');
        assert.ok(!result.includes('tryParseEnum'), 'tryParseEnum НЕ для serverpod→model direction');
        assert.ok(!result.includes('byName'), 'no byName');
    });

    test('nullable enum field — ?.name preserved', () => {
        const model = makeModel([
            { name: 'direction', type: 'Direction', nullable: true, isEnum: true },
        ]);
        const result = generateServerpodToModelParams(model);
        assert.ok(result.includes('direction: direction?.name'), 'nullable .name preserved');
    });
});
