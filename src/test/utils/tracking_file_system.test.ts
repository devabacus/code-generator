import * as assert from 'assert';
import { TrackingFileSystem } from '../../adapters/cli/utils/cli_file_system';
import { CliLogger } from '../../adapters/cli/utils/cli_logger';
import { DefaultFileSystem } from '../../core/implementations/default_file_system';
import { MockFileSystem } from '../mocks/mock_file_system';

/**
 * TASK-042 — учёт файлов в CLI-отчёте при атомарной записи ledger'а
 * (`createFile(<путь>.tmp)` + `rename`).
 *
 * Отчёт `files_created` / `files_modified` — контракт для вызывающих скриптов и
 * агентов. Temp-файл в нём — ложь: после успешного rename его не существует, а
 * при сбое rename его удаляет `CodegenLedger.save()` в своём `finally`.
 */
suite('TASK-042: TrackingFileSystem.rename и правдивость отчёта', () => {

    const TEMP = '/proj/.codegen/ledger.json.tmp';
    const TARGET = '/proj/.codegen/ledger.json';

    let inner: MockFileSystem;
    let logger: CliLogger;
    let fs: TrackingFileSystem;

    /** Приватные списки логгера — из них собирается `CliResult`. */
    function tracked(): { created: string[]; modified: string[] } {
        const internals = logger as unknown as { filesCreated: string[]; filesModified: string[] };
        return { created: internals.filesCreated, modified: internals.filesModified };
    }

    setup(() => {
        inner = new MockFileSystem();
        logger = new CliLogger(true);
        fs = new TrackingFileSystem(inner as unknown as DefaultFileSystem, logger);
    });

    test('успешный rename: temp снят с учёта, в отчёте — реальный destination', async () => {
        await fs.createFile(TEMP, '{}');
        assert.deepStrictEqual(tracked().created, [TEMP], 'предусловие: temp попал в отчёт');

        await fs.rename(TEMP, TARGET);

        assert.deepStrictEqual(tracked().created, [TARGET]);
        assert.deepStrictEqual(tracked().modified, []);
    });

    test('сбой rename: temp всё равно снят с учёта (его удалит вызывающий)', async () => {
        await fs.createFile(TEMP, '{}');
        inner.setRenameFailure(source => source.endsWith('.tmp'));

        await assert.rejects(() => fs.rename(TEMP, TARGET), 'ошибка обязана дойти до вызывающего');

        assert.deepStrictEqual(tracked().created, [],
            'отчёт не должен утверждать, что создан файл, которого не останется');
        assert.deepStrictEqual(tracked().modified, []);
    });
});
