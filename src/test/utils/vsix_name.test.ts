import * as assert from 'assert';
import { vsixFileName } from '../../adapters/vscode/utils/vsix_name';

/**
 * TASK-036 — имя .vsix выводится из package.json name+version (а не хардкод
 * `code-generator-0.0.1.vsix`), чтобы авто-bump версии в reinstall-handler
 * не ломал путь к пакету.
 */
suite('vsixFileName — TASK-036', () => {

    test('собирает <name>-<version>.vsix', () => {
        assert.strictEqual(vsixFileName('code-generator', '0.0.1'), 'code-generator-0.0.1.vsix');
    });

    test('отражает поднятую версию (clarity-сигнал)', () => {
        assert.strictEqual(vsixFileName('code-generator', '0.0.2'), 'code-generator-0.0.2.vsix');
        assert.strictEqual(vsixFileName('code-generator', '0.1.0'), 'code-generator-0.1.0.vsix');
    });

    test('не хардкодит имя пакета', () => {
        assert.strictEqual(vsixFileName('other-ext', '1.2.3'), 'other-ext-1.2.3.vsix');
    });
});
