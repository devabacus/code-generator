import * as assert from 'assert';
import * as path from 'path';
import { GenerationService } from '../../features/generation/generators/generation_service';
import { GenerationConfig } from '../../features/generation/config/generation_config';
import { CodegenLedger, sha256 } from '../../features/generation/generators/ledger';
import { GenerationConflictError } from '../../features/generation/generators/preflight';
import { scanRegions } from '../../features/generation/generators/region_parser';
import { ServerpodModel } from '../../features/generation/parsers/formatters/types';
import { MockFileSystem } from '../mocks/mock_file_system';

/**
 * TASK-042 / BUG-029 — двухфазный fail-closed preflight + ledger.
 *
 * Покрывает критерии приёмки задачи end-to-end через `GenerationService`
 * на `MockFileSystem`: классификация по трём точкам сравнения
 * (`existing ↔ ledger ↔ render`), отсутствие записей при конфликте,
 * порядок записи ledger'а, поведение merge-файлов и legacy state machine.
 */

const TEMPLATES_ROOT = '/test/templates';
const PROJECTS_ROOT = '/test/projects';
const TARGET_PROJECT = 'app1';
const TEMPL_PROJECT = 't115';

const PROJECT_ROOT = `${PROJECTS_ROOT}/${TARGET_PROJECT}`;
const LEDGER_PATH = `${PROJECT_ROOT}/.codegen/ledger.json`;

const FEATURE_TEMPLATE_DIR = [
    TEMPLATES_ROOT, 'flutter', TEMPL_PROJECT, `${TEMPL_PROJECT}_flutter`, 'lib', 'features', 'tasks',
].join('/');
const FEATURE_TARGET_DIR = `${PROJECT_ROOT}/${TARGET_PROJECT}_flutter/lib/features/tasks`;

/** Шаблон, которым генератор владеет целиком (СТРАТЕГИЯ 2 — 65 из 81 файла t115). */
const ENTITY_TEMPLATE_PATH = `${FEATURE_TEMPLATE_DIR}/domain/entities/category_entity.dart`;
const ENTITY_TARGET_PATH = `${FEATURE_TARGET_DIR}/domain/entities/category_entity.dart`;
const ENTITY_TARGET_REL = `${TARGET_PROJECT}_flutter/lib/features/tasks/domain/entities/category_entity.dart`;

/** Шаблон с `:base` (СТРАТЕГИЯ 1 — merge). */
const DAO_TEMPLATE_PATH = `${FEATURE_TEMPLATE_DIR}/data/datasources/local/daos/category/category_dao.dart`;
const DAO_TARGET_PATH = `${FEATURE_TARGET_DIR}/data/datasources/local/daos/category/category_dao.dart`;
const DAO_TARGET_REL = `${TARGET_PROJECT}_flutter/lib/features/tasks/data/datasources/local/daos/category/category_dao.dart`;

const ENTITY_TEMPLATE_V1 = [
    '// manifest: entity',
    'class CategoryEntity {',
    '  final String title;',
    '}',
    '',
].join('\n');

const ENTITY_TEMPLATE_V2 = [
    '// manifest: entity',
    'class CategoryEntity {',
    '  final String title;',
    '  final bool isDeleted;',
    '}',
    '',
].join('\n');

const DAO_TEMPLATE_V1 = [
    '// manifest: entity',
    '// === generated_start:base ===',
    'class CategoryDao {',
    '  int version() => 1;',
    '}',
    '// === generated_end:base ===',
    '',
].join('\n');

const DAO_TEMPLATE_V2 = [
    '// manifest: entity',
    '// === generated_start:base ===',
    'class CategoryDao {',
    '  int version() => 2;',
    '}',
    '// === generated_end:base ===',
    '',
].join('\n');

function setupTemplates(fs: MockFileSystem, entity = ENTITY_TEMPLATE_V1, dao = DAO_TEMPLATE_V1): void {
    fs.setFile(ENTITY_TEMPLATE_PATH, entity);
    fs.setFile(DAO_TEMPLATE_PATH, dao);
}

function makeConfig(): GenerationConfig {
    return new GenerationConfig({
        templProject: TEMPL_PROJECT,
        templEntity: 'category',
        targetEntity: 'category',
        templatesPath: TEMPLATES_ROOT,
        projectsPath: PROJECTS_ROOT,
        targetProject: TARGET_PROJECT,
        templFeatureName: 'tasks',
        targetFeaturePath: FEATURE_TARGET_DIR,
        workspacesPath: PROJECT_ROOT,
        manifest: ['entity'],
    });
}

function makeModel(): ServerpodModel {
    return {
        className: 'Category',
        tableName: 'category',
        fields: [
            { name: 'id', type: 'UuidValue?', nullable: true },
            { name: 'title', type: 'String', nullable: false },
        ],
        isRelation: false,
    };
}

function readLedger(fs: MockFileSystem): { schemaVersion: number; files: Record<string, any> } | null {
    const raw = fs.getFilesSnapshot().get(LEDGER_PATH);
    return raw ? JSON.parse(raw) : null;
}

async function expectConflict(run: () => Promise<unknown>): Promise<GenerationConflictError> {
    try {
        await run();
    } catch (error) {
        assert.ok(error instanceof GenerationConflictError,
            `ожидался GenerationConflictError, получено: ${String(error)}`);
        return error as GenerationConflictError;
    }
    assert.fail('ожидался конфликт, но генерация завершилась успешно');
}

suite('TASK-042: preflight + ledger (BUG-029)', () => {

    let fs: MockFileSystem;
    let service: GenerationService;

    setup(() => {
        fs = new MockFileSystem();
        setupTemplates(fs);
        service = new GenerationService(fs);
    });

    suite('первый запуск и ledger', () => {

        test('свежий проект → файлы созданы, ledger записан со схемой v1', async () => {
            const result = await service.generate(makeConfig(), makeModel());

            const snapshot = fs.getFilesSnapshot();
            assert.ok(snapshot.has(ENTITY_TARGET_PATH), 'generated-файл должен быть создан');
            assert.ok(snapshot.has(DAO_TARGET_PATH), 'merge-файл должен быть создан');

            const ledger = readLedger(fs)!;
            assert.strictEqual(ledger.schemaVersion, 1);
            assert.strictEqual(ledger.files[ENTITY_TARGET_REL].ownership, 'generated');
            assert.strictEqual(ledger.files[DAO_TARGET_REL].ownership, 'merge');
            assert.ok(ledger.files[DAO_TARGET_REL].regions.base, 'merge-запись хранит хеш региона base');
            assert.strictEqual(result.ledgerPath.replace(/\\/g, '/'), LEDGER_PATH);
        });

        test('ledger хранит project-relative пути (переносимость через git)', async () => {
            await service.generate(makeConfig(), makeModel());
            for (const key of Object.keys(readLedger(fs)!.files)) {
                assert.ok(!key.startsWith('/'), `путь обязан быть относительным: ${key}`);
                assert.ok(!key.includes(PROJECTS_ROOT), `путь не должен содержать корень FS: ${key}`);
            }
        });

        test('ledger записывается ПОСЛЕ файлов: падение посередине apply не оставляет baseline', async () => {
            fs.setWriteFailure(p => p === DAO_TARGET_PATH);
            await assert.rejects(() => service.generate(makeConfig(), makeModel()));

            assert.strictEqual(readLedger(fs), null,
                'ledger не должен существовать, если apply не завершился — иначе он утверждал бы «файл нетронут» о незаписанном файле');
        });
    });

    suite('повторный запуск без правок — без prompt fatigue', () => {

        test('render не менялся → второй запуск молчит', async () => {
            await service.generate(makeConfig(), makeModel());
            const afterFirst = fs.getFilesSnapshot().get(ENTITY_TARGET_PATH);

            await service.generate(makeConfig(), makeModel());
            assert.strictEqual(fs.getFilesSnapshot().get(ENTITY_TARGET_PATH), afterFirst);
        });

        test('existing == ledger, но render ИЗМЕНИЛСЯ → молчаливая перезапись', async () => {
            await service.generate(makeConfig(), makeModel());

            // Шаблон обновился (добавили поле) — именно этот сценарий превращал бы
            // guard без ledger'а в конфликт на каждом штатном regen.
            setupTemplates(fs, ENTITY_TEMPLATE_V2, DAO_TEMPLATE_V2);

            await service.generate(makeConfig(), makeModel());

            const entity = fs.getFilesSnapshot().get(ENTITY_TARGET_PATH)!;
            assert.ok(entity.includes('isDeleted'), 'обновление шаблона должно доехать без подтверждения');
            const dao = fs.getFilesSnapshot().get(DAO_TARGET_PATH)!;
            assert.ok(dao.includes('version() => 2'), 'merge-файл тоже обновляется молча');

            // Ledger пересеян на новое содержимое.
            assert.strictEqual(readLedger(fs)!.files[ENTITY_TARGET_REL].sha256, sha256(entity));
        });
    });

    suite('existing != ledger → fail-closed', () => {

        test('ручная правка generated-файла → конфликт с diff и без единой записи', async () => {
            await service.generate(makeConfig(), makeModel());
            await fs.createFile(ENTITY_TARGET_PATH, ENTITY_TEMPLATE_V1 + '\n// моя ручная правка\n');
            setupTemplates(fs, ENTITY_TEMPLATE_V2, DAO_TEMPLATE_V2);

            const before = fs.getFilesSnapshot();
            const error = await expectConflict(() => service.generate(makeConfig(), makeModel()));

            assert.strictEqual(error.conflicts.length, 1);
            assert.strictEqual(error.conflicts[0].path, ENTITY_TARGET_REL);
            assert.strictEqual(error.conflicts[0].reason, 'user-modified');
            assert.ok(error.conflicts[0].diff.includes('моя ручная правка'),
                `diff должен показывать теряемое содержимое:\n${error.conflicts[0].diff}`);

            const after = fs.getFilesSnapshot();
            assert.deepStrictEqual([...after.entries()].sort(), [...before.entries()].sort(),
                'при конфликте filesystem обязана остаться нетронутой');
        });

        test('конфликт в ОДНОМ файле → второй (чистый) файл тоже не записан [двухфазность]', async () => {
            await service.generate(makeConfig(), makeModel());
            await fs.createFile(ENTITY_TARGET_PATH, '// подменённое пользователем содержимое\n');
            setupTemplates(fs, ENTITY_TEMPLATE_V2, DAO_TEMPLATE_V2);

            const daoBefore = fs.getFilesSnapshot().get(DAO_TARGET_PATH);
            await expectConflict(() => service.generate(makeConfig(), makeModel()));

            assert.strictEqual(fs.getFilesSnapshot().get(DAO_TARGET_PATH), daoBefore,
                'чистый merge-файл не должен быть записан из-за конфликта в соседнем файле');
            assert.ok(!fs.getFilesSnapshot().get(DAO_TARGET_PATH)!.includes('version() => 2'));
        });

        test('«оставить как есть» (конфликт не подтверждён) НЕ сеет baseline', async () => {
            await service.generate(makeConfig(), makeModel());
            const ledgerBefore = fs.getFilesSnapshot().get(LEDGER_PATH);

            await fs.createFile(ENTITY_TARGET_PATH, '// ручная правка\n');
            await expectConflict(() => service.generate(makeConfig(), makeModel()));

            assert.strictEqual(fs.getFilesSnapshot().get(LEDGER_PATH), ledgerBefore,
                'ledger не должен меняться после отказа — иначе следующий regen молча сотрёт правку');
        });
    });

    suite('--overwrite-existing (reviewed overwrite)', () => {

        test('подтверждение записывает render и обновляет ledger хешем render', async () => {
            await service.generate(makeConfig(), makeModel());
            await fs.createFile(ENTITY_TARGET_PATH, '// ручная правка, которую сознательно теряем\n');
            setupTemplates(fs, ENTITY_TEMPLATE_V2, DAO_TEMPLATE_V2);

            const result = await service.generate(makeConfig(), makeModel(), { overwriteExisting: true });

            const written = fs.getFilesSnapshot().get(ENTITY_TARGET_PATH)!;
            assert.ok(written.includes('isDeleted'), 'после подтверждения записывается render');
            assert.ok(!written.includes('ручная правка'));
            assert.strictEqual(result.overwritten.length, 1);
            assert.strictEqual(readLedger(fs)!.files[ENTITY_TARGET_REL].sha256, sha256(written),
                'ledger обязан хешировать именно render, а не прежнее содержимое');
        });

        test('после подтверждённой перезаписи следующий запуск снова молчит', async () => {
            await service.generate(makeConfig(), makeModel());
            await fs.createFile(ENTITY_TARGET_PATH, '// правка\n');
            await service.generate(makeConfig(), makeModel(), { overwriteExisting: true });

            await service.generate(makeConfig(), makeModel());  // не должно бросить
        });
    });

    suite('merge-файлы: регионы, а не файл целиком', () => {

        test('правка в CUSTOM-зоне не даёт конфликта и переживает regen', async () => {
            await service.generate(makeConfig(), makeModel());

            const withCustom = fs.getFilesSnapshot().get(DAO_TARGET_PATH)! +
                '\nextension CategoryDaoX on CategoryDao {\n  void mine() {}\n}\n';
            await fs.createFile(DAO_TARGET_PATH, withCustom);
            setupTemplates(fs, ENTITY_TEMPLATE_V1, DAO_TEMPLATE_V2);

            await service.generate(makeConfig(), makeModel());

            const after = fs.getFilesSnapshot().get(DAO_TARGET_PATH)!;
            assert.ok(after.includes('void mine()'), 'custom-зона обязана пережить regen');
            assert.ok(after.includes('version() => 2'), 'machine-owned регион обязан обновиться');
        });

        test('merge при живом target не гоняет шаблон через SectionReplacer (нет шума в stderr)', async () => {
            // `:base` — не секционный генератор; полный render для merge-ветки не
            // нужен и считается лениво. Иначе каждый regen печатает
            // «[SectionReplacer] Generator function not found for name: base»
            // по строке на каждый merge-шаблон (в t115 их 16).
            await service.generate(makeConfig(), makeModel());

            const warnings: string[] = [];
            const originalWarn = console.warn;
            console.warn = (...args: unknown[]): void => { warnings.push(args.join(' ')); };
            try {
                await service.generate(makeConfig(), makeModel());
            } finally {
                console.warn = originalWarn;
            }

            assert.deepStrictEqual(warnings.filter(w => w.includes('[SectionReplacer]')), [],
                `merge-ветка не должна вызывать SectionReplacer: ${warnings.join(' | ')}`);
        });

        test('правка ВНУТРИ :base → конфликт', async () => {
            await service.generate(makeConfig(), makeModel());

            const tampered = fs.getFilesSnapshot().get(DAO_TARGET_PATH)!
                .replace('int version() => 1;', 'int version() => 1; // моя правка в owned-зоне');
            await fs.createFile(DAO_TARGET_PATH, tampered);

            const error = await expectConflict(() => service.generate(makeConfig(), makeModel()));
            assert.strictEqual(error.conflicts[0].path, DAO_TARGET_REL);
            assert.strictEqual(error.conflicts[0].reason, 'region-modified');
        });

        test('generated_end закрывает ЧУЖОЙ регион → broken-markers с указанием base', async () => {
            // Атрибуция причины: `generated_start:base` в файле ЕСТЬ, поэтому
            // «маркеров нет» (missing-markers) было бы прямой дезинформацией.
            await service.generate(makeConfig(), makeModel());
            const mismatched = fs.getFilesSnapshot().get(DAO_TARGET_PATH)!
                .replace('// === generated_end:base ===', '// === generated_end:other ===');
            await fs.createFile(DAO_TARGET_PATH, mismatched);

            const error = await expectConflict(() => service.generate(makeConfig(), makeModel()));
            assert.strictEqual(error.conflicts[0].reason, 'broken-markers');
            assert.ok(error.conflicts[0].message.includes('"base"'),
                `сообщение обязано называть пострадавший регион: ${error.conflicts[0].message}`);
            assert.ok(error.conflicts[0].message.includes('other'),
                `сообщение обязано называть чужой закрывающий маркер: ${error.conflicts[0].message}`);
        });

        test('маркеры :base потеряны → конфликт (silent staleness закрыт)', async () => {
            await service.generate(makeConfig(), makeModel());
            await fs.createFile(DAO_TARGET_PATH, 'class CategoryDao {}\n// маркеров больше нет\n');

            const error = await expectConflict(() => service.generate(makeConfig(), makeModel()));
            assert.strictEqual(error.conflicts[0].reason, 'missing-markers');
        });

        test('маркеры :base дублированы → конфликт независимо от хешей', async () => {
            await service.generate(makeConfig(), makeModel());
            const doubled = fs.getFilesSnapshot().get(DAO_TARGET_PATH)! +
                '\n// === generated_start:base ===\nX\n// === generated_end:base ===\n';
            await fs.createFile(DAO_TARGET_PATH, doubled);

            const error = await expectConflict(() => service.generate(makeConfig(), makeModel()));
            assert.strictEqual(error.conflicts[0].reason, 'broken-markers');
        });

        test('маркер :base не закрыт → конфликт', async () => {
            await service.generate(makeConfig(), makeModel());
            const broken = fs.getFilesSnapshot().get(DAO_TARGET_PATH)!
                .replace('// === generated_end:base ===', '// маркер конца стёрт');
            await fs.createFile(DAO_TARGET_PATH, broken);

            const error = await expectConflict(() => service.generate(makeConfig(), makeModel()));
            assert.strictEqual(error.conflicts[0].reason, 'broken-markers');
        });

        test('подтверждённая перезапись merge-файла с битыми маркерами восстанавливает разметку', async () => {
            await service.generate(makeConfig(), makeModel());
            await fs.createFile(DAO_TARGET_PATH, 'class CategoryDao {}\n');

            await service.generate(makeConfig(), makeModel(), { overwriteExisting: true });

            const after = fs.getFilesSnapshot().get(DAO_TARGET_PATH)!;
            assert.ok(after.includes('generated_start:base'), 'маркеры должны вернуться');
            assert.strictEqual(readLedger(fs)!.files[DAO_TARGET_REL].ownership, 'merge');
        });
    });

    suite('ledger разошёлся с диском не по вине пользователя (самовосстановление)', () => {

        /**
         * Портит ТОЛЬКО запись в ledger, файл на диске оставляет как есть.
         * Воспроизводит все четыре реальных пути: `ledger.save()` упал после
         * успешного apply (Windows: rename → EPERM/EBUSY), throw между apply и save
         * (`OrchestratorPatcher` бросает по дизайну — BUG-025), Ctrl-C в том же
         * промежутке, разрешение git-конфликта в закоммиченном `.codegen/ledger.json`.
         */
        async function staleLedgerEntry(mutate: (files: Record<string, any>) => void): Promise<void> {
            const doc = readLedger(fs)!;
            mutate(doc.files);
            await fs.createFile(LEDGER_PATH, JSON.stringify(doc));
        }

        test('generated: диск == render, запись в ledger устарела → тишина, ledger пересеян', async () => {
            await service.generate(makeConfig(), makeModel());
            const onDisk = fs.getFilesSnapshot().get(ENTITY_TARGET_PATH)!;
            await staleLedgerEntry(files => {
                files[ENTITY_TARGET_REL].sha256 = sha256('хеш из другой вселенной');
            });

            // Конфликта быть НЕ должно: на диске побайтово то, что генератор и
            // записал бы. Иначе единственный предлагаемый выход — деструктивный
            // --overwrite-existing там, где терять нечего (prompt fatigue).
            const result = await service.generate(makeConfig(), makeModel());

            assert.strictEqual(fs.getFilesSnapshot().get(ENTITY_TARGET_PATH), onDisk,
                'файл не должен измениться — писать было нечего');
            assert.ok(result.seeded.includes(ENTITY_TARGET_REL),
                `ожидался seed без записи. seeded=${result.seeded.join(', ')}`);
            assert.strictEqual(readLedger(fs)!.files[ENTITY_TARGET_REL].sha256, sha256(onDisk),
                'ledger обязан пересеяться — иначе он остаётся расходящимся навсегда');
        });

        test('merge: регион == render, запись в ledger устарела → тишина, ledger пересеян', async () => {
            await service.generate(makeConfig(), makeModel());
            const withCustom = fs.getFilesSnapshot().get(DAO_TARGET_PATH)! + '\n// мой хвост\n';
            await fs.createFile(DAO_TARGET_PATH, withCustom);
            await staleLedgerEntry(files => {
                files[DAO_TARGET_REL].regions.base = sha256('baseline из другой вселенной');
            });

            const result = await service.generate(makeConfig(), makeModel());

            const after = fs.getFilesSnapshot().get(DAO_TARGET_PATH)!;
            assert.strictEqual(after, withCustom, 'merge-файл не должен измениться');
            assert.ok(result.seeded.includes(DAO_TARGET_REL),
                `ожидался seed без записи. seeded=${result.seeded.join(', ')}`);
            assert.strictEqual(
                readLedger(fs)!.files[DAO_TARGET_REL].regions.base,
                sha256(scanRegions(after).regions.get('base')!),
                'baseline региона обязан пересеяться',
            );
        });

        test('устаревшая запись НЕ ослабляет guard: диск != render → по-прежнему конфликт', async () => {
            await service.generate(makeConfig(), makeModel());
            await fs.createFile(ENTITY_TARGET_PATH, ENTITY_TEMPLATE_V1 + '\n// моя правка\n');
            await staleLedgerEntry(files => {
                files[ENTITY_TARGET_REL].sha256 = sha256('хеш из другой вселенной');
            });

            const error = await expectConflict(() => service.generate(makeConfig(), makeModel()));
            assert.strictEqual(error.conflicts[0].reason, 'user-modified');
        });

        test('ни один конфликт не печатает diff «(содержимое совпадает)»', async () => {
            // Отчёт, чья причина опровергается собственным diff'ом, обесценивает
            // guard: он учит игнорировать конфликты.
            await service.generate(makeConfig(), makeModel());
            await fs.createFile(ENTITY_TARGET_PATH, '// чужой код\n');
            await staleLedgerEntry(files => {
                files[ENTITY_TARGET_REL].sha256 = sha256('хеш из другой вселенной');
            });

            const error = await expectConflict(() => service.generate(makeConfig(), makeModel()));
            for (const conflict of error.conflicts) {
                assert.ok(!conflict.diff.includes('содержимое совпадает'),
                    `конфликт ${conflict.path} (${conflict.reason}) сам себя опровергает`);
            }
        });
    });

    suite('legacy без записи в ledger (инвариант «в»)', () => {

        /** Имитация проекта, сгенерированного до появления ledger'а. */
        async function makeLegacyProject(): Promise<void> {
            await service.generate(makeConfig(), makeModel());
            await fs.deleteFile(LEDGER_PATH);
        }

        test('existing == render → seed без prompt', async () => {
            await makeLegacyProject();
            assert.strictEqual(readLedger(fs), null);

            const result = await service.generate(makeConfig(), makeModel());

            const ledger = readLedger(fs)!;
            assert.ok(ledger.files[ENTITY_TARGET_REL], 'baseline должен быть засеян');
            assert.ok(result.seeded.includes(ENTITY_TARGET_REL),
                `ожидался seed без записи. seeded=${result.seeded.join(', ')}`);
        });

        test('existing != render → конфликт (усыновление запрещено)', async () => {
            await makeLegacyProject();
            await fs.createFile(ENTITY_TARGET_PATH, ENTITY_TEMPLATE_V1 + '\n// неизвестно, чей это код\n');

            const error = await expectConflict(() => service.generate(makeConfig(), makeModel()));
            assert.strictEqual(error.conflicts[0].reason, 'legacy-mismatch');
        });

        test('legacy-конфликт без подтверждения → baseline НЕ засеян ни для одного файла', async () => {
            await makeLegacyProject();
            await fs.createFile(ENTITY_TARGET_PATH, '// чужой код\n');

            await expectConflict(() => service.generate(makeConfig(), makeModel()));
            assert.strictEqual(readLedger(fs), null,
                'после отказа ledger обязан остаться отсутствующим — иначе BUG-029 просто отложен на один запуск');
        });

        test('legacy merge-файл: правка в custom-зоне принимается без baseline, регион совпал → seed', async () => {
            await makeLegacyProject();
            const withCustom = fs.getFilesSnapshot().get(DAO_TARGET_PATH)! + '\n// мой хвост\n';
            await fs.createFile(DAO_TARGET_PATH, withCustom);

            const result = await service.generate(makeConfig(), makeModel());

            assert.ok(result.seeded.includes(DAO_TARGET_REL),
                `merge-файл с нетронутым регионом должен засеяться. seeded=${result.seeded.join(', ')}`);
            assert.ok(fs.getFilesSnapshot().get(DAO_TARGET_PATH)!.includes('мой хвост'));
        });

        test('legacy merge-файл: изменён owned-регион → конфликт', async () => {
            await makeLegacyProject();
            const tampered = fs.getFilesSnapshot().get(DAO_TARGET_PATH)!
                .replace('int version() => 1;', 'int version() => 42;');
            await fs.createFile(DAO_TARGET_PATH, tampered);

            const error = await expectConflict(() => service.generate(makeConfig(), makeModel()));
            assert.strictEqual(error.conflicts[0].reason, 'legacy-mismatch');
        });

        test('подтверждённый legacy-overwrite хеширует render, а не прежнее содержимое', async () => {
            await makeLegacyProject();
            await fs.createFile(ENTITY_TARGET_PATH, '// чужой код\n');

            await service.generate(makeConfig(), makeModel(), { overwriteExisting: true });

            const written = fs.getFilesSnapshot().get(ENTITY_TARGET_PATH)!;
            assert.ok(!written.includes('чужой код'));
            assert.strictEqual(readLedger(fs)!.files[ENTITY_TARGET_REL].sha256, sha256(written));
        });
    });

    suite('корень ledger', () => {

        test('create-project flow (workspacesPath пуст) → ledger в корне монорепо', async () => {
            const config = new GenerationConfig({
                templProject: TEMPL_PROJECT,
                templEntity: 'category',
                targetEntity: 'category',
                templatesPath: TEMPLATES_ROOT,
                projectsPath: PROJECTS_ROOT,
                targetProject: TARGET_PROJECT,
                templFeatureName: 'tasks',
                targetFeaturePath: FEATURE_TARGET_DIR,
                manifest: ['entity'],
            });
            const result = await service.generate(config, makeModel());
            assert.strictEqual(
                result.ledgerPath.replace(/\\/g, '/'),
                path.posix.join(PROJECT_ROOT, '.codegen', 'ledger.json'),
            );
        });

        test('CodegenLedger.filePath — единая точка вычисления пути', () => {
            assert.strictEqual(
                CodegenLedger.filePath(PROJECT_ROOT).replace(/\\/g, '/'),
                LEDGER_PATH,
            );
        });
    });
});
