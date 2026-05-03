import * as assert from 'assert';
import { snakeToLowerCamelCase } from '../../utils/text_work/text_util';

/**
 * TASK-016 / BUG-012 — `snakeToLowerCamelCase` helper edge cases.
 *
 * Coverage for criterion #6:
 *   - простые case'ы: `terminal_set`, `cargo_type2`, `member` (no-op)
 *   - throw на ill-formed input: `_bad`, `bad_`, `double__bad`, `''`
 *
 * Validation regex: `/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/`
 *
 * Rationale (Discussion #5 unanimous): fail-fast vs silent corruption когда
 * parser попадает на malformed YAML — `parent=__bad` лучше throw чем silent
 * generate junk. Parser catches и attaches field-name context.
 */
suite('snakeToLowerCamelCase Test Suite', () => {

    // ── Happy path ────────────────────────────────────────────────────────────

    test('simple two-word snake: terminal_set → terminalSet', () => {
        assert.strictEqual(snakeToLowerCamelCase('terminal_set'), 'terminalSet');
    });

    test('snake with digit suffix: cargo_type2 → cargoType2', () => {
        assert.strictEqual(snakeToLowerCamelCase('cargo_type2'), 'cargoType2');
    });

    test('three-word snake: user_role_permission → userRolePermission', () => {
        assert.strictEqual(snakeToLowerCamelCase('user_role_permission'), 'userRolePermission');
    });

    test('single word — no-op: member → member', () => {
        assert.strictEqual(snakeToLowerCamelCase('member'), 'member');
    });

    test('single word with digit: tag1 → tag1', () => {
        assert.strictEqual(snakeToLowerCamelCase('tag1'), 'tag1');
    });

    test('production-shaped: access_permission → accessPermission', () => {
        assert.strictEqual(snakeToLowerCamelCase('access_permission'), 'accessPermission');
    });

    // ── Throw cases (ill-formed input) ────────────────────────────────────────

    test('throws on leading underscore: _bad', () => {
        assert.throws(
            () => snakeToLowerCamelCase('_bad'),
            /Invalid snake_case identifier: '_bad'/
        );
    });

    test('throws on trailing underscore: bad_', () => {
        assert.throws(
            () => snakeToLowerCamelCase('bad_'),
            /Invalid snake_case identifier: 'bad_'/
        );
    });

    test('throws on double underscore: double__bad', () => {
        assert.throws(
            () => snakeToLowerCamelCase('double__bad'),
            /Invalid snake_case identifier: 'double__bad'/
        );
    });

    test('throws on empty string', () => {
        assert.throws(
            () => snakeToLowerCamelCase(''),
            /Invalid snake_case identifier: ''/
        );
    });

    test('throws on uppercase first char: Bad', () => {
        assert.throws(
            () => snakeToLowerCamelCase('Bad'),
            /Invalid snake_case identifier: 'Bad'/
        );
    });

    test('throws on uppercase mid-word: bad_Word', () => {
        assert.throws(
            () => snakeToLowerCamelCase('bad_Word'),
            /Invalid snake_case identifier: 'bad_Word'/
        );
    });

    test('throws on hyphen: bad-word', () => {
        assert.throws(
            () => snakeToLowerCamelCase('bad-word'),
            /Invalid snake_case identifier: 'bad-word'/
        );
    });

    test('throws on starting digit: 1bad', () => {
        assert.throws(
            () => snakeToLowerCamelCase('1bad'),
            /Invalid snake_case identifier: '1bad'/
        );
    });
});
