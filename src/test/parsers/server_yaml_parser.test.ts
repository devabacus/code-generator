import * as assert from 'assert';
import { ServerpodYamlParser } from '../../features/generation/parsers/server_yaml_parser';

/**
 * TASK-016 / BUG-012 — `ServerpodYamlParser.parseField` regression suite.
 *
 * Parser ранее не имел unit tests (per agent_memory). Этот файл создан
 * как baseline coverage parser parsing logic для:
 *   - `relation(parent=X)` directive parsing (FK alias support)
 *   - snake_case → lowerCamelCase conversion для parent identifier
 *   - backwards compat (strip-Id fallback) когда `parent=` отсутствует
 *   - junction snake-snake parsing
 *   - negative test: substring `relation` в string default НЕ должен activate isRelation
 *
 * Rationale (Discussion #5 4-agent consensus):
 *   - parser fix без `parent=` parsing = formal closure без production resolution
 *     (`defaultTerminalSetId, parent=terminal_set` landmine в weight customer_user)
 *   - 5 mandatory test cases — minimal coverage для close BUG-012
 *
 * Tests use full YAML pipeline через `ServerpodYamlParser.parse()` чтобы
 * exercise полный flow: `parseFields → parseField → fullDefinition regex`.
 */
suite('ServerpodYamlParser parseField Test Suite — BUG-012 FK alias parsing', () => {

    /**
     * Helper: построить minimal valid YAML вокруг single field declaration
     * и вернуть parsed field.
     */
    function parseSingleField(fieldName: string, definition: string) {
        const yamlContent = `class: TestEntity
table: test_entity
fields:
  ${fieldName}: ${definition}
`;
        const model = ServerpodYamlParser.parse(yamlContent);
        return model.fields.find(f => f.name === fieldName)!;
    }

    // ── Mandatory case 1: simple FK alias (Discussion #5 #5.1) ────────────────

    test('case 1 — simple FK alias: assigneeId, parent=member → relatedModel=member', () => {
        const field = parseSingleField(
            'assigneeId',
            'UuidValue?, relation(parent=member, onDelete=SetNull)'
        );

        assert.strictEqual(field.name, 'assigneeId');
        assert.strictEqual(field.type, 'UuidValue');
        assert.strictEqual(field.nullable, true);
        assert.strictEqual(field.isRelation, true);
        assert.strictEqual(field.relationType, 'manyToOne');
        assert.strictEqual(field.relatedModel, 'member',
            'parent=member → relatedModel должно быть "member" (lowerCamel), не "assignee" (strip-Id)');
    });

    // ── Mandatory case 2: snake_case parent (production-shaped) #5.2 ──────────

    test('case 2 — snake parent: defaultTerminalSetId, parent=terminal_set → relatedModel=terminalSet', () => {
        const field = parseSingleField(
            'defaultTerminalSetId',
            'UuidValue?, relation(parent=terminal_set, onDelete=SetNull)'
        );

        assert.strictEqual(field.name, 'defaultTerminalSetId');
        assert.strictEqual(field.isRelation, true);
        assert.strictEqual(field.relationType, 'manyToOne');
        assert.strictEqual(field.relatedModel, 'terminalSet',
            'parent=terminal_set → relatedModel должно быть "terminalSet" (snake→lowerCamel)');
    });

    // ── Mandatory case 3: junction snake-snake (parser only) #5.3 ─────────────

    test('case 3 — junction snake-snake: roleId, parent=user_role + permissionId, parent=access_permission', () => {
        const yamlContent = `class: UserRoleAccessPermissionMap
table: user_role_access_permission_map
fields:
  roleId: int, relation(parent=user_role)
  permissionId: int, relation(parent=access_permission)
`;
        const model = ServerpodYamlParser.parse(yamlContent);
        const roleField = model.fields.find(f => f.name === 'roleId')!;
        const permField = model.fields.find(f => f.name === 'permissionId')!;

        assert.strictEqual(roleField.isRelation, true);
        assert.strictEqual(roleField.relatedModel, 'userRole',
            'parent=user_role → relatedModel должно быть "userRole"');

        assert.strictEqual(permField.isRelation, true);
        assert.strictEqual(permField.relatedModel, 'accessPermission',
            'parent=access_permission → relatedModel должно быть "accessPermission"');
    });

    // ── Mandatory case 4: backwards compat fallback #5.4 ──────────────────────

    test('case 4a — backwards compat: projectId без parent= → relatedModel=project (strip-Id)', () => {
        const field = parseSingleField(
            'projectId',
            'UuidValue, relation(onDelete=Cascade)'
        );

        assert.strictEqual(field.isRelation, true);
        assert.strictEqual(field.relatedModel, 'project',
            'Без parent= → fallback на name.endsWith("Id") ? slice(0, -2) : name');
    });

    test('case 4b — backwards compat: customerId с parent=customer → relatedModel=customer', () => {
        const field = parseSingleField(
            'customerId',
            'UuidValue, relation(parent=customer, onDelete=Cascade)'
        );

        assert.strictEqual(field.relatedModel, 'customer',
            'Existing convention parent=customer (matches strip-Id) → "customer"');
    });

    test('case 4c — defensive fallback: name без Id suffix + relation() → relatedModel=name as-is', () => {
        const field = parseSingleField(
            'parent',
            'UuidValue?, relation(parent=node, onDelete=SetNull)'
        );

        assert.strictEqual(field.isRelation, true);
        assert.strictEqual(field.relatedModel, 'node',
            'parent= override применяется даже если field name не ends в Id');
    });

    // ── Mandatory case 5: negative test — substring `relation` ≠ FK ───────────

    test('case 5 — negative: description с default содержащим "relation" substring → isRelation=false', () => {
        const field = parseSingleField(
            'description',
            "String, default='this relation is broken'"
        );

        assert.strictEqual(field.isRelation, false,
            'String default с substring "relation" НЕ должно activate isRelation (anchored \\brelation\\(...\\) regex)');
        // No isEnum either — это plain Dart String type
        assert.strictEqual(field.isEnum, false);
        assert.strictEqual(field.type, 'String');
    });

    test('case 5b — negative: field with type containing "relation" substring (defensive)', () => {
        // Hypothetical edge: enum named with "relation" substring — should not trigger relation parsing.
        // Since enums detected after isRelation=false, this exercises both anchors.
        const field = parseSingleField(
            'status',
            'OperationRelationKind, default=active'
        );

        assert.strictEqual(field.isRelation, false,
            'Type name containing "relation" substring без `relation(...)` directive не должно activate isRelation');
    });

    // ── BUG-012 Adversarial review post-Path-C: parens-inside-string-default landmine ──

    test('case 5c — DEAL-BREAKER: relation(parent=foo) substring внутри single-quoted string default НЕ должно activate isRelation', () => {
        // Production landmine caught Adversarial review TASK-016 Phase 6:
        //   `notes: String, default='See relation(parent=foo) docs'`
        // Without quote-stripping, `\brelation\(` regex matches inside string literal,
        // parser sets isRelation=true, relatedModel='foo' (silent corruption — String
        // field generates как FK reference to nonexistent 'foo' table).
        const field = parseSingleField(
            'notes',
            "String, default='See relation(parent=foo) docs'"
        );

        assert.strictEqual(field.isRelation, false,
            'relation(...) substring внутри string default НЕ должно activate isRelation (Adversarial fix)');
        assert.strictEqual(field.relatedModel, undefined,
            'relatedModel НЕ должен extract\'нуться из string default content');
        assert.strictEqual(field.type, 'String');
    });

    test('case 5d — DEAL-BREAKER: double-quoted string default с relation(...) substring also protected', () => {
        // Symmetric coverage для double quotes (Serverpod YAML may use either).
        const field = parseSingleField(
            'description',
            'String, default="contains relation(parent=other) syntax"'
        );

        assert.strictEqual(field.isRelation, false,
            'Double-quoted string default с relation() syntax НЕ должно activate isRelation');
        assert.strictEqual(field.relatedModel, undefined);
    });

    // ── Edge cases supplementary (defensive coverage) ─────────────────────────

    test('edge — parent= with extra whitespace: parent = terminal_set parses correctly', () => {
        const field = parseSingleField(
            'defaultTerminalSetId',
            'UuidValue?, relation(parent = terminal_set, onDelete=SetNull)'
        );

        assert.strictEqual(field.relatedModel, 'terminalSet',
            'Whitespace вокруг = должно быть tolerated в regex `parent\\s*=\\s*...`');
    });

    test('edge — multiple directives, parent= не первая: relation(onDelete=Cascade, parent=member)', () => {
        const field = parseSingleField(
            'assigneeId',
            'UuidValue?, relation(onDelete=Cascade, parent=member)'
        );

        assert.strictEqual(field.relatedModel, 'member',
            'parent= directive должна найтись независимо от порядка внутри relation()');
    });

    test('edge — relation() без parent= directive: fallback на strip-Id', () => {
        const field = parseSingleField(
            'projectId',
            'UuidValue, relation(onDelete=Cascade)'
        );

        assert.strictEqual(field.isRelation, true);
        assert.strictEqual(field.relatedModel, 'project',
            'relation() без parent= должно fallback на name.slice(0,-2)');
    });

    test('edge — malformed parent= with double underscore throws descriptive error', () => {
        assert.throws(
            () => parseSingleField('badId', 'UuidValue, relation(parent=double__bad)'),
            /Field 'badId' has malformed parent= directive: Invalid snake_case identifier: 'double__bad'/
        );
    });

    test('edge — malformed parent= with leading underscore throws', () => {
        assert.throws(
            () => parseSingleField('badId', 'UuidValue, relation(parent=_bad)'),
            /Field 'badId' has malformed parent= directive/
        );
    });
});
