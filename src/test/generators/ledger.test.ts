import * as assert from 'assert';
import {
    CodegenLedger,
    LEDGER_SCHEMA_VERSION,
    LedgerReadError,
    sha256,
} from '../../features/generation/generators/ledger';
import { MockFileSystem } from '../mocks/mock_file_system';

/**
 * TASK-042 / BUG-029 — ledger машинного вывода (`.codegen/ledger.json`).
 */
suite('TASK-042: CodegenLedger', () => {

    const ROOT = '/proj/app1';
    const LEDGER_PATH = '/proj/app1/.codegen/ledger.json';
    let fs: MockFileSystem;

    setup(() => {
        fs = new MockFileSystem();
    });

    suite('sha256 — без lossy-нормализации', () => {

        test('разница только в пробелах ВНУТРИ строкового литерала → другой хеш', () => {
            // В Dart пробелы внутри литерала — содержимое. Схлопывание пробельных
            // прогонов сделало бы две разные программы одинаковыми для guard'а.
            const a = `const greeting = 'hello  world';`;
            const b = `const greeting = 'hello world';`;
            assert.notStrictEqual(sha256(a), sha256(b));
        });

        test('разница в отступе → другой хеш', () => {
            assert.notStrictEqual(sha256('void f() {\n  x();\n}'), sha256('void f() {\n    x();\n}'));
        });

        test('CRLF vs LF → другой хеш (line endings не нормализуются)', () => {
            assert.notStrictEqual(sha256('a\r\nb'), sha256('a\nb'));
        });

        test('trailing newline значим', () => {
            assert.notStrictEqual(sha256('a'), sha256('a\n'));
        });

        test('идентичное содержимое → идентичный хеш (детерминизм)', () => {
            assert.strictEqual(sha256('привет мир'), sha256('привет мир'));
        });

        test('UTF-8: кириллица хешируется как UTF-8 байты', () => {
            // Контрольное значение SHA-256 от UTF-8 строки "тест".
            assert.strictEqual(
                sha256('тест'),
                'e34f6dec12c4f4599eba078f31ae8139420d21b1bd2d7ced7d22b09c2074fb48',
            );
        });
    });

    suite('load', () => {

        test('файла нет → пустой ledger, НЕ ошибка', async () => {
            const ledger = await CodegenLedger.load(fs, ROOT);
            assert.strictEqual(ledger.size, 0);
            assert.strictEqual(ledger.get('any/path.dart'), undefined);
        });

        test('корректный файл → записи прочитаны', async () => {
            fs.setFile(LEDGER_PATH, JSON.stringify({
                schemaVersion: 1,
                files: {
                    'lib/a.dart': { ownership: 'generated', sha256: 'deadbeef' },
                    'lib/b.dart': { ownership: 'merge', regions: { base: 'cafe' } },
                },
            }));

            const ledger = await CodegenLedger.load(fs, ROOT);
            assert.strictEqual(ledger.size, 2);
            assert.deepStrictEqual(ledger.get('lib/a.dart'), { ownership: 'generated', sha256: 'deadbeef' });
            assert.deepStrictEqual(ledger.get('lib/b.dart'), { ownership: 'merge', regions: { base: 'cafe' } });
        });

        test('битый JSON → LedgerReadError (не «считаем пустым»)', async () => {
            fs.setFile(LEDGER_PATH, '{ это не json');
            await assert.rejects(() => CodegenLedger.load(fs, ROOT), (e: Error) => {
                assert.ok(e instanceof LedgerReadError, `ожидался LedgerReadError, получен ${e.name}`);
                return true;
            });
        });

        test('schemaVersion из будущего → LedgerReadError', async () => {
            fs.setFile(LEDGER_PATH, JSON.stringify({ schemaVersion: LEDGER_SCHEMA_VERSION + 1, files: {} }));
            await assert.rejects(() => CodegenLedger.load(fs, ROOT), LedgerReadError);
        });

        test('повреждённая запись → LedgerReadError', async () => {
            fs.setFile(LEDGER_PATH, JSON.stringify({
                schemaVersion: 1,
                files: { 'lib/a.dart': { ownership: 'generated' } },
            }));
            await assert.rejects(() => CodegenLedger.load(fs, ROOT), LedgerReadError);
        });
    });

    suite('project-relative пути', () => {

        test('абсолютный destination → posix-путь относительно корня проекта', async () => {
            const ledger = await CodegenLedger.load(fs, ROOT);
            assert.strictEqual(
                ledger.toRelative('/proj/app1/app1_flutter/lib/features/tasks/x.dart'),
                'app1_flutter/lib/features/tasks/x.dart',
            );
        });

        test('backslash-путь нормализуется в forward-slash', async () => {
            const ledger = await CodegenLedger.load(fs, 'C:/proj/app1');
            assert.strictEqual(ledger.toRelative('C:/proj/app1/lib\\a\\b.dart'), 'lib/a/b.dart');
        });
    });

    suite('запись baseline', () => {

        test('setGenerated хранит хеш всего содержимого', async () => {
            const ledger = await CodegenLedger.load(fs, ROOT);
            ledger.setGenerated('lib/a.dart', 'CONTENT');
            assert.deepStrictEqual(ledger.get('lib/a.dart'), {
                ownership: 'generated',
                sha256: sha256('CONTENT'),
            });
        });

        test('setMerge хранит хеш КАЖДОГО региона, а не файла целиком', async () => {
            const ledger = await CodegenLedger.load(fs, ROOT);
            ledger.setMerge('lib/dao.dart', new Map([['base', 'BODY']]));
            assert.deepStrictEqual(ledger.get('lib/dao.dart'), {
                ownership: 'merge',
                regions: { base: sha256('BODY') },
            });
        });

        test('remove снимает запись (инвариант «в»: не сеять baseline)', async () => {
            const ledger = await CodegenLedger.load(fs, ROOT);
            ledger.setGenerated('lib/a.dart', 'X');
            ledger.remove('lib/a.dart');
            assert.strictEqual(ledger.get('lib/a.dart'), undefined);
        });
    });

    suite('save — атомарность и форма файла', () => {

        test('пишет .codegen/ledger.json и не оставляет temp-файл', async () => {
            const ledger = await CodegenLedger.load(fs, ROOT);
            ledger.setGenerated('lib/a.dart', 'X');
            await ledger.save();

            const snapshot = fs.getFilesSnapshot();
            assert.ok(snapshot.has(LEDGER_PATH), `ledger должен существовать. Есть: ${[...snapshot.keys()].join(', ')}`);
            assert.ok(!snapshot.has(`${LEDGER_PATH}.tmp`), 'temp-файл должен быть переименован, а не оставлен');
        });

        test('содержимое — versioned JSON со схемой из контракта', async () => {
            const ledger = await CodegenLedger.load(fs, ROOT);
            ledger.setGenerated('lib/task_model.dart', 'M');
            ledger.setMerge('lib/task_dao.dart', new Map([['base', 'B']]));
            await ledger.save();

            const parsed = JSON.parse(fs.getFilesSnapshot().get(LEDGER_PATH)!);
            assert.strictEqual(parsed.schemaVersion, LEDGER_SCHEMA_VERSION);
            assert.strictEqual(parsed.files['lib/task_model.dart'].ownership, 'generated');
            assert.strictEqual(typeof parsed.files['lib/task_model.dart'].sha256, 'string');
            assert.strictEqual(parsed.files['lib/task_dao.dart'].ownership, 'merge');
            assert.strictEqual(parsed.files['lib/task_dao.dart'].regions.base, sha256('B'));
        });

        test('ключи отсортированы → детерминированный diff в git', async () => {
            const ledger = await CodegenLedger.load(fs, ROOT);
            ledger.setGenerated('lib/z.dart', '1');
            ledger.setGenerated('lib/a.dart', '2');
            await ledger.save();

            const keys = Object.keys(JSON.parse(fs.getFilesSnapshot().get(LEDGER_PATH)!).files);
            assert.deepStrictEqual(keys, ['lib/a.dart', 'lib/z.dart']);
        });

        test('сохранённый ledger читается обратно без потерь (round-trip)', async () => {
            const first = await CodegenLedger.load(fs, ROOT);
            first.setGenerated('lib/a.dart', 'X');
            first.setMerge('lib/dao.dart', new Map([['base', 'B']]));
            await first.save();

            const second = await CodegenLedger.load(fs, ROOT);
            assert.deepStrictEqual(second.snapshot(), first.snapshot());
        });

        test('падение rename → temp-файл убран, старый ledger не тронут', async () => {
            // Сбой именно на rename — единственная ветка, которая оставляет мусор:
            // temp к этому моменту уже создан. На Windows это не гипотетика
            // (EPERM/EBUSY, когда целевой файл держит антивирус/индексатор), а
            // `create-project` делает `git add .` — `.tmp` уехал бы в первый коммит
            // (в .gitignore его нет).
            const first = await CodegenLedger.load(fs, ROOT);
            first.setGenerated('lib/a.dart', 'OLD');
            await first.save();
            const before = fs.getFilesSnapshot().get(LEDGER_PATH)!;

            const second = await CodegenLedger.load(fs, ROOT);
            second.setGenerated('lib/a.dart', 'NEW');
            fs.setRenameFailure(source => source.endsWith('.tmp'));
            await assert.rejects(() => second.save());
            fs.setRenameFailure(null);

            const snapshot = fs.getFilesSnapshot();
            assert.ok(!snapshot.has(`${LEDGER_PATH}.tmp`),
                `temp обязан быть удалён при сбое. Файлы: ${[...snapshot.keys()].join(', ')}`);
            assert.strictEqual(snapshot.get(LEDGER_PATH), before,
                'при сбое rename должен остаться прежний ledger целиком');
        });

        test('падение записи temp-файла → старый ledger на диске не тронут', async () => {
            const first = await CodegenLedger.load(fs, ROOT);
            first.setGenerated('lib/a.dart', 'OLD');
            await first.save();
            const before = fs.getFilesSnapshot().get(LEDGER_PATH)!;

            const second = await CodegenLedger.load(fs, ROOT);
            second.setGenerated('lib/a.dart', 'NEW');
            fs.setWriteFailure(p => p.endsWith('.tmp'));
            await assert.rejects(() => second.save());
            fs.setWriteFailure(null);

            assert.strictEqual(fs.getFilesSnapshot().get(LEDGER_PATH), before,
                'при сбое записи должен остаться прежний ledger целиком');
        });
    });
});
