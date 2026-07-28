import * as assert from 'assert';
import { GenerationService } from '../../features/generation/generators/generation_service';
import { GenerationConfig } from '../../features/generation/config/generation_config';
import { sha256 } from '../../features/generation/generators/ledger';
import {
    GenerationConflictError,
    UnknownOverwriteSelectionError,
    formatOverwriteReport,
    normalizeSelectionPath,
    resolveOverwriteSelection,
} from '../../features/generation/generators/preflight';
import { sanitizeBackupRelativePath } from '../../features/generation/generators/backup';
import {
    PreservedFiles,
    formatPatchSkipReport,
} from '../../features/generation/generators/preflight';
import { AppDatabaseGenerator } from '../../features/generation/generators/app_database_generator';
import {
    ConflictingOverwriteFormsError,
    collectOverwritePaths,
    resolveOverwriteFlag,
} from '../../adapters/cli/commands/generate_entity';
import { ServerpodModel } from '../../features/generation/parsers/formatters/types';
import { MockFileSystem } from '../mocks/mock_file_system';

/**
 * TASK-043 / BUG-029 follow-up — per-file preserve вместо all-or-nothing
 * `--overwrite-existing` + backup перед деструктивной записью.
 *
 * Главный инвариант, который здесь защищается (инвариант «в» ADR-0007):
 * файл, который пользователь решил СОХРАНИТЬ, обязан остаться нетронутым **и его
 * baseline НЕ должен попасть в ledger**. Иначе следующий regen увидит
 * `existing == ledger` и молча сотрёт custom-код — BUG-029 вернётся, просто на
 * один запуск позже.
 */

const TEMPLATES_ROOT = '/test/templates';
const PROJECTS_ROOT = '/test/projects';
const TARGET_PROJECT = 'app1';
const TEMPL_PROJECT = 't115';

const PROJECT_ROOT = `${PROJECTS_ROOT}/${TARGET_PROJECT}`;
const LEDGER_PATH = `${PROJECT_ROOT}/.codegen/ledger.json`;
const CODEGEN_GITIGNORE_PATH = `${PROJECT_ROOT}/.codegen/.gitignore`;

const FEATURE_TEMPLATE_DIR = [
    TEMPLATES_ROOT, 'flutter', TEMPL_PROJECT, `${TEMPL_PROJECT}_flutter`, 'lib', 'features', 'tasks',
].join('/');
const FEATURE_TARGET_DIR = `${PROJECT_ROOT}/${TARGET_PROJECT}_flutter/lib/features/tasks`;
const FEATURE_REL = `${TARGET_PROJECT}_flutter/lib/features/tasks`;

/** Три шаблона СТРАТЕГИИ 2 (генератор владеет файлом целиком) — три будущих конфликта. */
const ENTITY_TEMPLATE_PATH = `${FEATURE_TEMPLATE_DIR}/domain/entities/category_entity.dart`;
const ENTITY_TARGET_PATH = `${FEATURE_TARGET_DIR}/domain/entities/category_entity.dart`;
const ENTITY_REL = `${FEATURE_REL}/domain/entities/category_entity.dart`;

const MODEL_TEMPLATE_PATH = `${FEATURE_TEMPLATE_DIR}/data/models/category_model.dart`;
const MODEL_TARGET_PATH = `${FEATURE_TARGET_DIR}/data/models/category_model.dart`;
const MODEL_REL = `${FEATURE_REL}/data/models/category_model.dart`;

const REPO_TEMPLATE_PATH = `${FEATURE_TEMPLATE_DIR}/data/repositories/category_repository_impl.dart`;
const REPO_TARGET_PATH = `${FEATURE_TARGET_DIR}/data/repositories/category_repository_impl.dart`;
const REPO_REL = `${FEATURE_REL}/data/repositories/category_repository_impl.dart`;

/** Merge-шаблон (СТРАТЕГИЯ 1) — остаётся БЕЗ конфликта, доказывает, что остальная генерация идёт. */
const DAO_TEMPLATE_PATH = `${FEATURE_TEMPLATE_DIR}/data/datasources/local/daos/category/category_dao.dart`;
const DAO_TARGET_PATH = `${FEATURE_TARGET_DIR}/data/datasources/local/daos/category/category_dao.dart`;

const ENTITY_TEMPLATE_V1 = '// manifest: entity\nclass CategoryEntity {\n  final String title;\n}\n';
const ENTITY_TEMPLATE_V2 = '// manifest: entity\nclass CategoryEntity {\n  final String title;\n  final bool isDeleted;\n}\n';
const MODEL_TEMPLATE_V1 = '// manifest: entity\nclass CategoryModel {\n  int v() => 1;\n}\n';
const MODEL_TEMPLATE_V2 = '// manifest: entity\nclass CategoryModel {\n  int v() => 2;\n}\n';
const REPO_TEMPLATE_V1 = '// manifest: entity\nclass CategoryRepositoryImpl {\n  int v() => 1;\n}\n';
const REPO_TEMPLATE_V2 = '// manifest: entity\nclass CategoryRepositoryImpl {\n  int v() => 2;\n}\n';

const DAO_TEMPLATE_V1 = [
    '// manifest: entity',
    '// === generated_start:base ===',
    'class CategoryDao {',
    '  int version() => 1;',
    '}',
    '// === generated_end:base ===',
    '',
].join('\n');
const DAO_TEMPLATE_V2 = DAO_TEMPLATE_V1.replace('version() => 1', 'version() => 2');

/** Ручные правки пользователя — то, что per-file preserve обязан сохранить. */
const ENTITY_USER_EDIT = ENTITY_TEMPLATE_V1 + '\n// ценный ручной код в entity\n';
const MODEL_USER_EDIT = MODEL_TEMPLATE_V1 + '\n// мусорное legacy-расхождение в model\n';
const REPO_USER_EDIT = REPO_TEMPLATE_V1 + '\n// ценный ручной код в repository_impl\n';

function setupTemplates(fs: MockFileSystem, v2 = false): void {
    fs.setFile(ENTITY_TEMPLATE_PATH, v2 ? ENTITY_TEMPLATE_V2 : ENTITY_TEMPLATE_V1);
    fs.setFile(MODEL_TEMPLATE_PATH, v2 ? MODEL_TEMPLATE_V2 : MODEL_TEMPLATE_V1);
    fs.setFile(REPO_TEMPLATE_PATH, v2 ? REPO_TEMPLATE_V2 : REPO_TEMPLATE_V1);
    fs.setFile(DAO_TEMPLATE_PATH, v2 ? DAO_TEMPLATE_V2 : DAO_TEMPLATE_V1);
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

suite('TASK-043: per-file preserve + backup (BUG-029 follow-up)', () => {

    let fs: MockFileSystem;
    let service: GenerationService;

    setup(() => {
        fs = new MockFileSystem();
        setupTemplates(fs);
        service = new GenerationService(fs);
    });

    /**
     * Доводит проект до состояния «три конфликта»: первый прогон засеял ledger,
     * затем пользователь правит три generated-файла, а шаблоны обновляются
     * (чтобы штатный regen действительно хотел писать во все файлы).
     */
    async function threeConflicts(): Promise<void> {
        await service.generate(makeConfig(), makeModel());
        await fs.createFile(ENTITY_TARGET_PATH, ENTITY_USER_EDIT);
        await fs.createFile(MODEL_TARGET_PATH, MODEL_USER_EDIT);
        await fs.createFile(REPO_TARGET_PATH, REPO_USER_EDIT);
        setupTemplates(fs, true);
    }

    suite('выбор по файлу (критерий приёмки: три конфликта → перезаписать один)', () => {

        test('перезаписан ровно выбранный файл, два других целы', async () => {
            await threeConflicts();

            const result = await service.generate(makeConfig(), makeModel(), {
                overwriteExisting: [MODEL_REL],
            });

            const after = fs.getFilesSnapshot();
            assert.ok(after.get(MODEL_TARGET_PATH)!.includes('v() => 2'),
                'выбранный файл обязан быть перезаписан render\'ом');
            assert.ok(!after.get(MODEL_TARGET_PATH)!.includes('мусорное legacy'),
                'прежнее содержимое выбранного файла заменено');

            assert.strictEqual(after.get(ENTITY_TARGET_PATH), ENTITY_USER_EDIT,
                'НЕ выбранный файл обязан остаться байт-в-байт прежним');
            assert.strictEqual(after.get(REPO_TARGET_PATH), REPO_USER_EDIT,
                'НЕ выбранный файл обязан остаться байт-в-байт прежним');

            assert.deepStrictEqual(result.overwritten.map(c => c.path), [MODEL_REL]);
            assert.deepStrictEqual(result.preserved.map(c => c.path).sort(), [ENTITY_REL, REPO_REL].sort());
        });

        test('ledger для сохранённых файлов НЕ изменился, для перезаписанного — пересеян', async () => {
            await threeConflicts();
            const before = readLedger(fs)!.files;
            const entityBaselineBefore = before[ENTITY_REL].sha256;
            const repoBaselineBefore = before[REPO_REL].sha256;

            await service.generate(makeConfig(), makeModel(), { overwriteExisting: [MODEL_REL] });

            const files = readLedger(fs)!.files;
            assert.strictEqual(files[ENTITY_REL].sha256, entityBaselineBefore,
                'baseline сохранённого файла обязан остаться прежним');
            assert.strictEqual(files[REPO_REL].sha256, repoBaselineBefore,
                'baseline сохранённого файла обязан остаться прежним');
            assert.strictEqual(
                files[MODEL_REL].sha256,
                sha256(fs.getFilesSnapshot().get(MODEL_TARGET_PATH)!),
                'baseline перезаписанного файла обязан хешировать новое содержимое',
            );
        });

        test('baseline сохранённого файла НЕ засеян → следующий regen снова конфликтует (BUG-029 не отложен)', async () => {
            await threeConflicts();
            await service.generate(makeConfig(), makeModel(), { overwriteExisting: [MODEL_REL] });

            // Ключевая проверка задачи: если бы preserve засеял хеш пользовательского
            // содержимого, здесь была бы ТИШИНА и молчаливое стирание custom-кода.
            const error = await expectConflict(() => service.generate(makeConfig(), makeModel()));

            assert.deepStrictEqual(error.conflicts.map(c => c.path).sort(), [ENTITY_REL, REPO_REL].sort());
            assert.strictEqual(fs.getFilesSnapshot().get(ENTITY_TARGET_PATH), ENTITY_USER_EDIT);
            assert.strictEqual(fs.getFilesSnapshot().get(REPO_TARGET_PATH), REPO_USER_EDIT);
        });

        test('неконфликтующие файлы записываются при частичном выборе', async () => {
            await threeConflicts();

            await service.generate(makeConfig(), makeModel(), { overwriteExisting: [MODEL_REL] });

            assert.ok(fs.getFilesSnapshot().get(DAO_TARGET_PATH)!.includes('version() => 2'),
                'merge-файл без конфликта обязан получить обновление шаблона');
        });

        test('выбор всех трёх путей эквивалентен all-or-nothing', async () => {
            await threeConflicts();

            const result = await service.generate(makeConfig(), makeModel(), {
                overwriteExisting: [ENTITY_REL, MODEL_REL, REPO_REL],
            });

            assert.strictEqual(result.preserved.length, 0);
            assert.strictEqual(result.overwritten.length, 3);
            for (const p of [ENTITY_TARGET_PATH, MODEL_TARGET_PATH, REPO_TARGET_PATH]) {
                assert.ok(!fs.getFilesSnapshot().get(p)!.includes('ручной код'));
                assert.ok(!fs.getFilesSnapshot().get(p)!.includes('legacy-расхождение'));
            }
            await service.generate(makeConfig(), makeModel());  // не должно бросить
        });

        test('`true` (флаг без значения) по-прежнему перезаписывает всё — обратная совместимость', async () => {
            await threeConflicts();

            const result = await service.generate(makeConfig(), makeModel(), { overwriteExisting: true });

            assert.strictEqual(result.overwritten.length, 3);
            assert.strictEqual(result.preserved.length, 0);
        });

        test('пустой список = подтверждения нет → fail-closed, ни одной записи', async () => {
            // `--overwrite-existing "$FILES"` при пустой переменной не должен
            // превращаться в «пиши всё»: подтверждено ноль файлов → подтверждения нет.
            await threeConflicts();
            const before = fs.getFilesSnapshot();

            const error = await expectConflict(() =>
                service.generate(makeConfig(), makeModel(), { overwriteExisting: [] }));

            assert.strictEqual(error.conflicts.length, 3);
            assert.deepStrictEqual([...fs.getFilesSnapshot().entries()].sort(), [...before.entries()].sort(),
                'filesystem обязана остаться нетронутой');
        });

        test('путь принимается в backslash- и «./»-форме (Windows copy-paste)', async () => {
            await threeConflicts();

            await service.generate(makeConfig(), makeModel(), {
                overwriteExisting: ['./' + MODEL_REL.replace(/\//g, '\\')],
            });

            assert.ok(fs.getFilesSnapshot().get(MODEL_TARGET_PATH)!.includes('v() => 2'));
        });

        test('абсолютный путь к конфликту тоже принимается', async () => {
            await threeConflicts();

            await service.generate(makeConfig(), makeModel(), { overwriteExisting: [MODEL_TARGET_PATH] });

            assert.ok(fs.getFilesSnapshot().get(MODEL_TARGET_PATH)!.includes('v() => 2'));
        });
    });

    suite('fail-fast на неизвестном пути', () => {

        test('путь не из списка конфликтов → ошибка с перечислением доступных, ни одной записи', async () => {
            await threeConflicts();
            const before = fs.getFilesSnapshot();

            await assert.rejects(
                () => service.generate(makeConfig(), makeModel(), {
                    overwriteExisting: [MODEL_REL, `${FEATURE_REL}/data/models/opechatka_model.dart`],
                }),
                (error: unknown) => {
                    assert.ok(error instanceof UnknownOverwriteSelectionError,
                        `ожидался UnknownOverwriteSelectionError, получено: ${String(error)}`);
                    assert.ok(error.message.includes('opechatka_model.dart'),
                        `сообщение обязано называть неизвестный путь: ${error.message}`);
                    assert.ok(error.message.includes(ENTITY_REL),
                        `сообщение обязано перечислять доступные конфликты: ${error.message}`);
                    return true;
                },
            );

            assert.deepStrictEqual([...fs.getFilesSnapshot().entries()].sort(), [...before.entries()].sort(),
                'опечатка в списке не должна приводить к частичной записи');
        });

        test('конфликтов нет вовсе, а список передан → тоже fail-fast (а не тихий no-op)', async () => {
            await service.generate(makeConfig(), makeModel());

            await assert.rejects(
                () => service.generate(makeConfig(), makeModel(), { overwriteExisting: [MODEL_REL] }),
                (error: unknown) => error instanceof UnknownOverwriteSelectionError,
            );
        });
    });

    suite('backup перед деструктивной записью', () => {

        test('прежнее содержимое перезаписанного файла лежит в .codegen/backup/<timestamp>/', async () => {
            await threeConflicts();

            const result = await service.generate(makeConfig(), makeModel(), {
                overwriteExisting: [MODEL_REL],
            });

            assert.ok(result.backupDir, 'путь backup обязан вернуться в результате (его печатает CLI)');
            const backupPath = `${result.backupDir!.replace(/\\/g, '/')}/${MODEL_REL}`;
            assert.strictEqual(fs.getFilesSnapshot().get(backupPath), MODEL_USER_EDIT,
                `backup обязан содержать прежнее содержимое. Есть: ${[...fs.getFilesSnapshot().keys()].filter(k => k.includes('backup')).join(', ')}`);
            assert.ok(result.backupDir!.replace(/\\/g, '/').startsWith(`${PROJECT_ROOT}/.codegen/backup/`),
                `backup обязан лежать внутри .codegen: ${result.backupDir}`);
        });

        test('сохранённые файлы в backup НЕ попадают (бэкапится только теряемое)', async () => {
            await threeConflicts();

            const result = await service.generate(makeConfig(), makeModel(), {
                overwriteExisting: [MODEL_REL],
            });

            const root = result.backupDir!.replace(/\\/g, '/');
            assert.strictEqual(fs.getFilesSnapshot().get(`${root}/${ENTITY_REL}`), undefined);
            assert.strictEqual(fs.getFilesSnapshot().get(`${root}/${REPO_REL}`), undefined);
        });

        test('без деструктивных записей backup не создаётся', async () => {
            const result = await service.generate(makeConfig(), makeModel());

            assert.strictEqual(result.backupDir, undefined);
            assert.strictEqual([...fs.getFilesSnapshot().keys()].filter(k => k.includes('/backup/')).length, 0);
        });

        test('.codegen/.gitignore прячет backup от git, ledger.json остаётся под контролем', async () => {
            await threeConflicts();
            await service.generate(makeConfig(), makeModel(), { overwriteExisting: [MODEL_REL] });

            const ignore = fs.getFilesSnapshot().get(CODEGEN_GITIGNORE_PATH);
            assert.ok(ignore, '.codegen/.gitignore обязан быть создан вместе с первым backup\'ом');

            // Проверяются ДЕЙСТВУЮЩИЕ паттерны, а не текст целиком: комментарий
            // вправе упоминать ledger.json, игнорировать его — нет.
            const patterns = ignore!
                .split(/\r?\n/)
                .map(line => line.trim())
                .filter(line => line.length > 0 && !line.startsWith('#'));
            assert.deepStrictEqual(patterns, ['backup/'],
                'единственным правилом обязан быть backup/ — ledger.json остаётся под контролем git (ADR-0007)');
        });

        test('существующий .codegen/.gitignore не затирается, строка дописывается', async () => {
            await threeConflicts();
            await fs.createFile(CODEGEN_GITIGNORE_PATH, '# моя строка\nsecrets.json\n');

            await service.generate(makeConfig(), makeModel(), { overwriteExisting: [MODEL_REL] });

            const ignore = fs.getFilesSnapshot().get(CODEGEN_GITIGNORE_PATH)!;
            assert.ok(ignore.includes('secrets.json'), 'пользовательские строки обязаны сохраниться');
            assert.ok(/^backup\/$/m.test(ignore), `строка "backup/" обязана быть дописана: ${ignore}`);
        });

        test('backup пишется ДО записи файла: сбой записи оставляет и прежний файл, и его копию', async () => {
            await threeConflicts();
            fs.setWriteFailure(p => p === MODEL_TARGET_PATH);

            await assert.rejects(() => service.generate(makeConfig(), makeModel(), {
                overwriteExisting: [MODEL_REL],
            }));

            const backups = [...fs.getFilesSnapshot().entries()].filter(([k]) => k.includes('/.codegen/backup/'));
            assert.ok(backups.some(([, v]) => v === MODEL_USER_EDIT),
                'копия обязана существовать до попытки записи — иначе смысл backup\'а теряется');
        });
    });

    suite('чистые функции выбора и отчёта', () => {

        test('normalizeSelectionPath приводит windows-формы к ключу ledger\'а', () => {
            assert.strictEqual(normalizeSelectionPath('a\\b\\c.dart'), 'a/b/c.dart');
            assert.strictEqual(normalizeSelectionPath('./a/b.dart'), 'a/b.dart');
            assert.strictEqual(normalizeSelectionPath('  a/b.dart  '), 'a/b.dart');
        });

        test('resolveOverwriteSelection: true → все, undefined/false → пусто', () => {
            const conflicts = [
                { path: 'a.dart', absolutePath: '/p/a.dart', reason: 'user-modified' as const, message: '', diff: '' },
                { path: 'b.dart', absolutePath: '/p/b.dart', reason: 'user-modified' as const, message: '', diff: '' },
            ];
            assert.deepStrictEqual([...resolveOverwriteSelection(true, conflicts)].sort(), ['a.dart', 'b.dart']);
            assert.strictEqual(resolveOverwriteSelection(undefined, conflicts).size, 0);
            assert.strictEqual(resolveOverwriteSelection(false, conflicts).size, 0);
            assert.deepStrictEqual([...resolveOverwriteSelection(['b.dart'], conflicts)], ['b.dart']);
        });

        test('formatOverwriteReport печатает diff и путь backup\'а, а не только пути файлов', () => {
            const report = formatOverwriteReport(
                [{
                    path: 'a.dart', absolutePath: '/p/a.dart', reason: 'user-modified',
                    message: 'есть ручные правки', diff: '@@ строка 3 @@\n- моя строка\n+ строка генератора',
                }],
                [{
                    path: 'b.dart', absolutePath: '/p/b.dart', reason: 'user-modified',
                    message: 'есть ручные правки', diff: '@@ строка 1 @@\n- ещё моя строка\n+ ещё строка генератора',
                }],
                '/p/.codegen/backup/20260728-120000-000',
            );
            assert.ok(report.includes('моя строка'), `diff обязан печататься: ${report}`);
            assert.ok(report.includes('/p/.codegen/backup/20260728-120000-000'), `путь backup обязан печататься: ${report}`);
            assert.ok(report.includes('b.dart'), `сохранённые файлы обязаны быть перечислены: ${report}`);
        });

        test('collectOverwritePaths: список через запятую и повтор флага', () => {
            // Голый флаг сюда не приходит — commander оставляет `true` (проверено
            // на commander 14.0.3), поэтому обратная совместимость не зависит от
            // этой функции.
            assert.deepStrictEqual(collectOverwritePaths('a.dart', false), ['a.dart']);
            assert.deepStrictEqual(collectOverwritePaths('a.dart, b.dart', false), ['a.dart', 'b.dart']);
            assert.deepStrictEqual(collectOverwritePaths('b.dart', ['a.dart']), ['a.dart', 'b.dart']);
            assert.deepStrictEqual(collectOverwritePaths('', false), []);
        });

        test('sanitizeBackupRelativePath не даёт копии сбежать за пределы каталога backup', () => {
            assert.strictEqual(sanitizeBackupRelativePath('a/b.dart'), 'a/b.dart');
            assert.strictEqual(sanitizeBackupRelativePath('../../etc/passwd'), '__/__/etc/passwd');
            assert.strictEqual(sanitizeBackupRelativePath('/abs/path.dart'), 'abs/path.dart');
            assert.strictEqual(sanitizeBackupRelativePath('C:\\win\\path.dart'), 'C/win/path.dart');
        });
    });
});

/**
 * TASK-043 раунд 2 (R2-1 / R2-2) — «preserve обязан быть настоящим».
 *
 * Фаза apply — не единственный писатель за прогон: `RelationPatcher`,
 * `OrchestratorPatcher` и `AppDatabaseGenerator` пишут в обход plan/apply и о
 * выборе пользователя ничего не знают. Пока это так, файл, который просили
 * СОХРАНИТЬ, всё равно переписывается — молча и без backup'а (backup снимается
 * только для подтверждённых конфликтов), при том что генератор печатает «эти
 * файлы не тронуты».
 *
 * Ловушка, на которой держится осмысленность этих тестов: `RelationAnalyzer`
 * отфильтровывает поле `customerId`, поэтому модель, у которой единственная
 * связь — `customerId`, вообще не поднимает патчер (он выходит на первой
 * строке). Здесь FK намеренно ведёт на ДРУГУЮ сущность (`folderId → folder`),
 * и предусловие «патчер реально отработал» проверяется явным assert'ом.
 */
suite('TASK-043 R2: preserve × писатели в обход plan/apply', () => {

    /** Целевая сущность НЕ совпадает с шаблонной — иначе подстановки no-op'ятся и маскируют ошибки путей. */
    const REL_DAO_TEMPLATE_PATH = `${FEATURE_TEMPLATE_DIR}/data/datasources/local/daos/category/category_dao.dart`;
    /** Шаблон «главной» сущности t115 (`task`) — единственный носитель региона `:oneToManyMethods`. */
    const REL_MAIN_TEMPLATE_PATH = `${FEATURE_TEMPLATE_DIR}/data/datasources/local/daos/task/task_dao.dart`;
    const REL_ENTITY_TEMPLATE_PATH = `${FEATURE_TEMPLATE_DIR}/domain/entities/category_entity.dart`;

    const REL_DAO_TARGET_PATH = `${FEATURE_TARGET_DIR}/data/datasources/local/daos/note/note_dao.dart`;
    const REL_DAO_REL = `${FEATURE_REL}/data/datasources/local/daos/note/note_dao.dart`;
    const REL_ENTITY_TARGET_PATH = `${FEATURE_TARGET_DIR}/domain/entities/note_entity.dart`;
    const REL_ENTITY_REL = `${FEATURE_REL}/domain/entities/note_entity.dart`;

    const REL_DAO_TEMPLATE_V1 = [
        '// manifest: entity',
        'class CategoryDao {',
        '// === generated_start:base ===',
        '  int version() => 1;',
        '// === generated_end:base ===',
        '}',
        '',
    ].join('\n');
    const REL_DAO_TEMPLATE_V2 = REL_DAO_TEMPLATE_V1.replace('version() => 1', 'version() => 2');

    const REL_MAIN_TEMPLATE = [
        '// manifest: entity',
        'class TaskDao {',
        '  // === generated_start:oneToManyMethods ===',
        '  Future<List<Task>> getTasksByCategoryId(String categoryId) => byId(categoryId);',
        '  // === generated_end:oneToManyMethods ===',
        '}',
    ].join('\n');

    const REL_ENTITY_TEMPLATE_V1 = '// manifest: entity\nclass CategoryEntity {\n  final String title;\n}\n';
    const REL_ENTITY_TEMPLATE_V2 = '// manifest: entity\nclass CategoryEntity {\n  final String title;\n  final bool pinned;\n}\n';
    const REL_ENTITY_USER_EDIT = REL_ENTITY_TEMPLATE_V1 + '\n// мусорное legacy-расхождение\n';

    const CUSTOM_IN_PATCH_REGION = '// ЦЕННЫЙ РУЧНОЙ КОД ВНУТРИ oneToManyMethods';
    const OTM_END_MARKER = '// === generated_end:oneToManyMethods ===';

    let fs: MockFileSystem;
    let service: GenerationService;

    function setupRelTemplates(v2 = false): void {
        fs.setFile(REL_DAO_TEMPLATE_PATH, v2 ? REL_DAO_TEMPLATE_V2 : REL_DAO_TEMPLATE_V1);
        fs.setFile(REL_MAIN_TEMPLATE_PATH, REL_MAIN_TEMPLATE);
        fs.setFile(REL_ENTITY_TEMPLATE_PATH, v2 ? REL_ENTITY_TEMPLATE_V2 : REL_ENTITY_TEMPLATE_V1);
    }

    function relConfig(): GenerationConfig {
        return new GenerationConfig({
            templProject: TEMPL_PROJECT,
            templEntity: 'category',
            targetEntity: 'note',
            templatesPath: TEMPLATES_ROOT,
            projectsPath: PROJECTS_ROOT,
            targetProject: TARGET_PROJECT,
            templFeatureName: 'tasks',
            targetFeaturePath: FEATURE_TARGET_DIR,
            workspacesPath: PROJECT_ROOT,
            manifest: ['entity'],
        });
    }

    /** FK ведёт на ДРУГУЮ сущность — `customerId` был бы отфильтрован `RelationAnalyzer`. */
    function relModel(): ServerpodModel {
        return {
            className: 'Note',
            tableName: 'note',
            fields: [
                { name: 'id', type: 'UuidValue?', nullable: true },
                { name: 'title', type: 'String', nullable: false },
                {
                    name: 'folderId', type: 'UuidValue', nullable: false,
                    isRelation: true, relationType: 'manyToOne', relatedModel: 'folder',
                },
            ],
            isRelation: false,
        };
    }

    /** Та же модель без связей — патчер на ней не запускается (контрольная группа). */
    function relModelWithoutFk(): ServerpodModel {
        const model = relModel();
        return { ...model, fields: model.fields.filter(f => f.name !== 'folderId') };
    }

    setup(() => {
        fs = new MockFileSystem();
        setupRelTemplates();
        service = new GenerationService(fs);
    });

    /** Первый прогон + проверка предусловия: патчер действительно отработал. */
    async function firstRun(): Promise<string> {
        await service.generate(relConfig(), relModel());
        const dao = fs.getFilesSnapshot().get(REL_DAO_TARGET_PATH);
        assert.ok(dao,
            `DAO обязан быть сгенерирован. Есть: ${[...fs.getFilesSnapshot().keys()].join(', ')}`);
        assert.ok(dao!.includes('generated_start:oneToManyMethods'),
            'ПРЕДУСЛОВИЕ ТЕСТА: RelationPatcher обязан был дописать регион — иначе тест ничего не проверяет');
        return dao!;
    }

    /**
     * Доводит проект до двух конфликтов: DAO (цель патчера, его сохраняем) и
     * entity-файл (его пользователь разрешает перезаписать — без единого
     * подтверждённого файла прогон остался бы fail-closed и до патчеров не дошёл).
     */
    async function twoConflictsWithPatchTarget(): Promise<string> {
        const daoAfterFirst = await firstRun();
        const edited = daoAfterFirst
            // (1) правка внутри machine-owned региона `:base` → conflict region-modified
            .replace('int version() => 1;', 'int version() => 1;\n  int myHelper() => 42;')
            // (2) правка внутри региона, которым распоряжается патчер
            .replace(OTM_END_MARKER, `${CUSTOM_IN_PATCH_REGION}\n  ${OTM_END_MARKER}`);
        assert.notStrictEqual(edited, daoAfterFirst, 'правки обязаны примениться — иначе тест вырожден');

        await fs.createFile(REL_DAO_TARGET_PATH, edited);
        await fs.createFile(REL_ENTITY_TARGET_PATH, REL_ENTITY_USER_EDIT);
        setupRelTemplates(true);
        return edited;
    }

    test('БЛОКЕР R2-1: preserved-файл — цель relation_patcher\'а — обязан остаться нетронутым', async () => {
        const edited = await twoConflictsWithPatchTarget();

        const result = await service.generate(relConfig(), relModel(), {
            overwriteExisting: [REL_ENTITY_REL],
        });

        assert.deepStrictEqual(result.preserved.map(c => c.path), [REL_DAO_REL],
            'DAO обязан попасть в preserved');

        const onDisk = fs.getFilesSnapshot().get(REL_DAO_TARGET_PATH)!;
        assert.ok(onDisk.includes(CUSTOM_IN_PATCH_REGION),
            'патчер затёр код ВНУТРИ :oneToManyMethods в файле, который просили сохранить — ' +
            'молча и без backup\'а (backup снимается только для подтверждённых конфликтов)');
        assert.strictEqual(onDisk, edited,
            'preserved-файл обязан остаться байт-в-байт прежним: «не тронут» значит не тронут');
    });

    test('R2-1: backup не подменяет guard — копии preserved-файла нет, значит терять его нельзя', async () => {
        await twoConflictsWithPatchTarget();

        const result = await service.generate(relConfig(), relModel(), {
            overwriteExisting: [REL_ENTITY_REL],
        });

        const backupRoot = result.backupDir!.replace(/\\/g, '/');
        assert.strictEqual(fs.getFilesSnapshot().get(`${backupRoot}/${REL_DAO_REL}`), undefined,
            'копии preserved-файла в backup нет — это правильно ТОЛЬКО если файл не переписывали');
    });

    test('R2-1: baseline preserved-файла не сеется, следующий regen снова его показывает', async () => {
        await twoConflictsWithPatchTarget();
        const baselineBefore = JSON.stringify(readLedger(fs)!.files[REL_DAO_REL]);

        await service.generate(relConfig(), relModel(), { overwriteExisting: [REL_ENTITY_REL] });

        assert.strictEqual(JSON.stringify(readLedger(fs)!.files[REL_DAO_REL]), baselineBefore,
            'baseline сохранённого файла обязан остаться прежним');

        const error = await expectConflict(() => service.generate(relConfig(), relModel()));
        assert.deepStrictEqual(error.conflicts.map(c => c.path), [REL_DAO_REL]);
    });

    test('R2-2: preserve merge-файла с :base (самый частый случай на живом проекте)', async () => {
        // Без FK: патчер не запускается вовсе — проверяется чистый merge-контур,
        // ownership `merge`, причина конфликта `region-modified`.
        await service.generate(relConfig(), relModelWithoutFk());
        const created = fs.getFilesSnapshot().get(REL_DAO_TARGET_PATH)!;
        assert.ok(!created.includes('oneToManyMethods'),
            'контрольная группа: без FK патчер не должен был отработать');

        const edited = created
            .replace('int version() => 1;', 'int version() => 1;\n  int myHelper() => 42;')
            + '\n// custom-зона вне регионов\n';
        await fs.createFile(REL_DAO_TARGET_PATH, edited);
        await fs.createFile(REL_ENTITY_TARGET_PATH, REL_ENTITY_USER_EDIT);
        setupRelTemplates(true);

        const result = await service.generate(relConfig(), relModelWithoutFk(), {
            overwriteExisting: [REL_ENTITY_REL],
        });

        assert.deepStrictEqual(result.preserved.map(c => c.path), [REL_DAO_REL]);
        assert.strictEqual(result.preserved[0].reason, 'region-modified',
            'ожидается именно merge-причина, а не generated-причина');
        assert.strictEqual(fs.getFilesSnapshot().get(REL_DAO_TARGET_PATH), edited,
            'merge-файл, оставленный пользователю, обязан остаться байт-в-байт прежним');
    });

    test('R2-1: не-preserved цель патчера по-прежнему патчится (guard не выключил патчер целиком)', async () => {
        await twoConflictsWithPatchTarget();

        await service.generate(relConfig(), relModel(), {
            overwriteExisting: [REL_ENTITY_REL, REL_DAO_REL],
        });

        const onDisk = fs.getFilesSnapshot().get(REL_DAO_TARGET_PATH)!;
        assert.ok(onDisk.includes('generated_start:oneToManyMethods'),
            'подтверждённый к перезаписи файл обязан получить свежий регион патчера');
        assert.ok(onDisk.includes('version() => 2'),
            'подтверждённый файл обязан получить и обновление шаблона');
    });

    test('R2-1/R2-6: отказ патчера не молчаливый — путь попадает в отчёт', async () => {
        await twoConflictsWithPatchTarget();

        const result = await service.generate(relConfig(), relModel(), {
            overwriteExisting: [REL_ENTITY_REL],
        });

        assert.deepStrictEqual(result.preservedFiles.skipped, [REL_DAO_REL],
            'пропуск обязан быть записан: молчаливый отказ писать — такой же обман, ' +
            'как молчаливая запись, только в другую сторону');

        const report = formatPatchSkipReport(result.preservedFiles.skipped);
        assert.ok(report.includes(REL_DAO_REL), `отчёт обязан называть файл: ${report}`);
        assert.ok(/устаревш/i.test(report),
            `отчёт обязан честно называть последствие — регион остался от прошлой генерации: ${report}`);
    });

    test('R2-1: без preserved-файлов патчеры работают как раньше (нет пропусков)', async () => {
        const result = await service.generate(relConfig(), relModel());

        assert.deepStrictEqual(result.preservedFiles.skipped, []);
        assert.ok(fs.getFilesSnapshot().get(REL_DAO_TARGET_PATH)!.includes('generated_start:oneToManyMethods'));
    });
});

/**
 * TASK-043 R2: гард `PreservedFiles` и разбор форм флага — чистые единицы,
 * проверяются без файловой системы там, где это возможно.
 */
suite('TASK-043 R2: PreservedFiles и формы --overwrite-existing', () => {

    suite('PreservedFiles (R2-1)', () => {

        test('блокирует только перечисленные пути и записывает отказ', () => {
            const guard = PreservedFiles.from('/p/app1', ['a/b.dart']);

            assert.strictEqual(guard.blocks('/p/app1/a/b.dart'), true);
            assert.strictEqual(guard.blocks('/p/app1/a/other.dart'), false);
            assert.deepStrictEqual(guard.skipped, ['a/b.dart']);
        });

        test('windows-разделители в абсолютном пути приводятся к ключу ledger\'а', () => {
            const guard = PreservedFiles.from('C:/p/app1', ['a/b.dart']);
            assert.strictEqual(guard.blocks('C:\\p\\app1\\a\\b.dart'), true);
        });

        test('пустой гард не блокирует ничего (все писатели работают как раньше)', () => {
            const guard = PreservedFiles.none();
            assert.strictEqual(guard.isEmpty, true);
            assert.strictEqual(guard.blocks('/p/app1/a/b.dart'), false);
            assert.deepStrictEqual(guard.skipped, []);
        });

        test('formatPatchSkipReport молчит, когда пропусков не было', () => {
            assert.strictEqual(formatPatchSkipReport([]), '');
        });
    });

    suite('AppDatabaseGenerator под гардом (R2-1)', () => {

        const DB_PATH = `${PROJECT_ROOT}/${TARGET_PROJECT}_flutter/lib/core/data/datasources/local/database.dart`;
        const DB_REL = `${TARGET_PROJECT}_flutter/lib/core/data/datasources/local/database.dart`;
        const DB_EXISTING = [
            '@DriftDatabase(tables: [',
            '// === GENERATED_TABLES_START ===',
            '// === GENERATED_TABLES_END ===',
            '])',
            "class AppDatabase { name: 'tpl_flutter' }",
            'int get schemaVersion => 1;',
        ].join('\n');

        function dbConfig(): GenerationConfig {
            return new GenerationConfig({
                templProject: TEMPL_PROJECT,
                templEntity: 'category',
                targetEntity: 'note',
                templatesPath: TEMPLATES_ROOT,
                projectsPath: PROJECTS_ROOT,
                targetProject: TARGET_PROJECT,
                workspacesPath: PROJECT_ROOT,
                manifest: ['entity'],
            });
        }

        test('preserved database.dart не переписывается, отказ записан', async () => {
            const fs = new MockFileSystem();
            fs.setFile(DB_PATH, DB_EXISTING);
            const guard = PreservedFiles.from(PROJECT_ROOT, [DB_REL]);

            await new AppDatabaseGenerator(fs, dbConfig()).generate(guard);

            assert.strictEqual(fs.getFilesSnapshot().get(DB_PATH), DB_EXISTING,
                'файл, оставленный пользователю, обязан остаться байт-в-байт прежним');
            assert.deepStrictEqual(guard.skipped, [DB_REL]);
        });

        test('контрольная группа: без гарда тот же вызов файл меняет', async () => {
            const fs = new MockFileSystem();
            fs.setFile(DB_PATH, DB_EXISTING);

            await new AppDatabaseGenerator(fs, dbConfig()).generate();

            assert.notStrictEqual(fs.getFilesSnapshot().get(DB_PATH), DB_EXISTING,
                'предусловие: без гарда генератор действительно пишет — иначе тест выше вырожден');
        });
    });

    suite('resolveOverwriteFlag (R2-3)', () => {

        test('флага не было → подтверждения нет', () => {
            assert.strictEqual(resolveOverwriteFlag([]), undefined);
        });

        test('голый флаг → «все конфликты» (обратная совместимость)', () => {
            assert.strictEqual(resolveOverwriteFlag([null]), true);
        });

        test('список и повтор флага аккумулируются', () => {
            assert.deepStrictEqual(resolveOverwriteFlag(['a.dart,b.dart']), ['a.dart', 'b.dart']);
            assert.deepStrictEqual(resolveOverwriteFlag(['a.dart', 'b.dart']), ['a.dart', 'b.dart']);
        });

        test('СПИСОК + голый флаг → отказ, а не тихая эскалация до «перезаписать всё»', () => {
            // Проверено пробником на commander 14.0.3: `--overwrite-existing a.dart
            // --overwrite-existing` схлопывается в `true`. Реалистично для
            // скрипта-обёртки, дописывающего флаг в конец команды.
            assert.throws(
                () => resolveOverwriteFlag(['a.dart', null]),
                (error: unknown) => {
                    assert.ok(error instanceof ConflictingOverwriteFormsError);
                    assert.ok(error.message.includes('a.dart'),
                        `сообщение обязано показать, какой выбор был бы потерян: ${error.message}`);
                    return true;
                },
            );
        });

        test('обратный порядок (голый флаг → список) тоже отказ', () => {
            // Здесь commander схлопывает в список, молча выбрасывая голый флаг:
            // де-эскалация безопаснее, но это то же угадывание намерения.
            assert.throws(
                () => resolveOverwriteFlag([null, 'a.dart']),
                (error: unknown) => error instanceof ConflictingOverwriteFormsError,
            );
        });

        test('пустое значение флага остаётся пустым списком → fail-closed', () => {
            // `--overwrite-existing "$FILES"` с незаполненной переменной: подтверждено
            // ноль файлов, значит подтверждения нет (см. resolveOverwriteSelection).
            assert.deepStrictEqual(resolveOverwriteFlag(['']), []);
        });
    });
});
