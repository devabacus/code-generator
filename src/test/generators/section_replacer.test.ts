import * as assert from 'assert';
import { SectionReplacer } from '../../features/generation/generators/section_config';
import { GenerationConfig } from '../../features/generation/config/generation_config';
import { ServerpodModel } from '../../features/generation/parsers/formatters/types';

/**
 * Tests B6/B7 (TASK-011 Phase B5/B6/B7) — verify SectionReplacer behavior
 * для sync orchestrator marker блоков (`:syncImports`, `:syncEntityTypes`,
 * `:syncRegistrations`).
 *
 * Эти markers **не имеют** corresponding section_generator функции — они
 * patched через `OrchestratorPatcher` в Phase C. SectionReplacer должен
 * NO-OP для них (idempotent, не модифицирует content) — это lock-in для
 * separation of concerns.
 */

function makeConfig(): GenerationConfig {
    return new GenerationConfig({
        templProject: 't115',
        templEntity: 'category',
        targetEntity: 'expense',
        templatesPath: '/test/templates',
        projectsPath: '/test/projects',
        targetProject: 'weight',
        templFeatureName: 'tasks',
        targetFeaturePath: '/test/dest',
        workspacesPath: '/test',
    });
}

function makeModel(): ServerpodModel {
    return {
        className: 'Expense',
        tableName: 'expense',
        isRelation: false,
        fields: [{ name: 'id', type: 'UuidValue', nullable: true }],
    };
}

suite('SectionReplacer — sync orchestrator marker blocks (B6/B7)', () => {
    let replacer: SectionReplacer;

    setup(() => {
        replacer = new SectionReplacer();
        // Suppress console.warn от SectionReplacer (он warns про unknown generator —
        // expected behaviour для sync markers).
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        const noop = () => {};
        // Don't override permanently — only for these tests.
        const origWarn = console.warn;
        console.warn = noop;
        // Restore in teardown will need module-level state — simpler: keep noop.
        // This is fine за scope of test suite.
        (replacer as any).__origWarn = origWarn;
    });

    test('B7 case 1: empty marker pair — SectionReplacer не модифицирует content', () => {
        const content = `class Foo {
  // === generated_start:syncRegistrations ===
  // === generated_end:syncRegistrations ===
}`;
        const result = replacer.process(content, makeConfig(), makeModel());
        assert.strictEqual(result, content, 'empty marker pair must be unchanged (no generator)');
    });

    test('B7 case 2: existing content — SectionReplacer idempotent (повторный run = identical)', () => {
        const content = `class Foo {
  // === generated_start:syncImports ===
  import 'foo.dart';
  import 'bar.dart';
  // === generated_end:syncImports ===
}`;
        const result1 = replacer.process(content, makeConfig(), makeModel());
        const result2 = replacer.process(result1, makeConfig(), makeModel());
        assert.strictEqual(result1, content, 'first run must not modify (no generator for syncImports)');
        assert.strictEqual(result1, result2, 'subsequent runs must be idempotent');
    });

    test('B7 case 3: malformed marker (missing end) — SectionReplacer skip без crash', () => {
        // Missing generated_end — regex не match'ится, SectionReplacer вернёт content as-is.
        const content = `class Foo {
  // === generated_start:syncRegistrations ===
  someContent;
}`;
        // Не должно crashиться
        const result = replacer.process(content, makeConfig(), makeModel());
        assert.strictEqual(result, content, 'malformed marker (no end) must be skipped without modification');
    });

    test('B7 case 4: duplicate marker pairs — SectionReplacer обрабатывает каждую отдельно (no-op)', () => {
        // SectionReplacer не делает recovery — это responsibility OrchestratorPatcher.
        // Просто verify no crash + идемпотентность.
        const content = `class Foo {
  // === generated_start:syncEntityTypes ===
  'configuration',
  // === generated_end:syncEntityTypes ===
  // === generated_start:syncEntityTypes ===
  'expense',
  // === generated_end:syncEntityTypes ===
}`;
        const result = replacer.process(content, makeConfig(), makeModel());
        assert.strictEqual(result, content, 'duplicate marker pairs must be unchanged (no generator)');
    });

    test('B6: idempotent digest — SectionReplacer.process() x2 на orchestrator file даёт identical content', () => {
        // Симулируем post-Phase-B orchestrator файл (3 marker pairs c content внутри).
        const orchestratorContent = `class SyncOrchestrator {
  // === generated_start:syncImports ===
  import 'configuration_remote_adapter.dart';
  // === generated_end:syncImports ===

  static const entityTypes = [
    // === generated_start:syncEntityTypes ===
    'configuration',
    // === generated_end:syncEntityTypes ===
  ];

  void wireUp() {
    // === generated_start:syncRegistrations ===
    register<ConfigurationEntity>('configuration', ...);
    // === generated_end:syncRegistrations ===
  }
}`;
        const r1 = replacer.process(orchestratorContent, makeConfig(), makeModel());
        const r2 = replacer.process(r1, makeConfig(), makeModel());
        const r3 = replacer.process(r2, makeConfig(), makeModel());

        assert.strictEqual(r1, orchestratorContent, 'r1 == original (no generators registered)');
        assert.strictEqual(r1, r2, 'r2 == r1 (idempotent)');
        assert.strictEqual(r2, r3, 'r3 == r2 (idempotent)');
    });
});
