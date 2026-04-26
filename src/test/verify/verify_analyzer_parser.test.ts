import * as assert from 'assert';
import { parseAnalyzerCounts, lastLines } from '../../adapters/cli/commands/verify';

suite('verify — flutter analyze output parser', () => {

    test('counts errors, warnings, infos in real-world flutter analyze output', () => {
        const sample = `Analyzing weight_flutter...
   info - foo - lib/a.dart:1:1 - rule_a
   warning - bar - lib/b.dart:2:2 - rule_b
   error - baz - lib/c.dart:3:3 - rule_c
   info - foo2 - lib/d.dart:4:4 - rule_d
   error - baz2 - lib/e.dart:5:5 - rule_e
flutter : 5 issues found. (ran in 4.5s)`;
        const counts = parseAnalyzerCounts(sample);
        assert.strictEqual(counts.errors, 2);
        assert.strictEqual(counts.warnings, 1);
        assert.strictEqual(counts.infos, 2);
    });

    test('returns zeros on clean output', () => {
        const sample = `Analyzing weight_flutter...
No issues found! (ran in 2.1s)`;
        const counts = parseAnalyzerCounts(sample);
        assert.deepStrictEqual(counts, { errors: 0, warnings: 0, infos: 0 });
    });

    test('handles CRLF line endings (Windows)', () => {
        const sample = `Analyzing\r\n   error - foo - a.dart:1:1 - rule\r\n   warning - bar - b.dart:2:2 - rule\r\n`;
        const counts = parseAnalyzerCounts(sample);
        assert.strictEqual(counts.errors, 1);
        assert.strictEqual(counts.warnings, 1);
    });

    test('ignores lines that mention "error" outside the analyzer format', () => {
        const sample = `   info - this mentions error - bar.dart:1:1 - rule
some random line about errors
   error - real error - foo.dart:1:1 - rule_x`;
        const counts = parseAnalyzerCounts(sample);
        assert.strictEqual(counts.errors, 1);
        assert.strictEqual(counts.infos, 1);
    });

    test('handles empty input', () => {
        const counts = parseAnalyzerCounts('');
        assert.deepStrictEqual(counts, { errors: 0, warnings: 0, infos: 0 });
    });
});

suite('verify — lastLines helper', () => {
    test('returns last N non-empty lines', () => {
        const input = 'a\nb\n\nc\nd\n\n';
        assert.strictEqual(lastLines(input, 2), 'c\nd');
    });

    test('returns all lines if fewer than N', () => {
        assert.strictEqual(lastLines('only\nthese', 5), 'only\nthese');
    });

    test('handles empty input', () => {
        assert.strictEqual(lastLines('', 5), '');
    });

    test('handles CRLF line endings', () => {
        const input = 'a\r\nb\r\nc\r\n';
        assert.strictEqual(lastLines(input, 2), 'b\nc');
    });
});
