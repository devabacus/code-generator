import * as assert from 'assert';
import * as path from 'path';
import { MarkerAnalyzer } from '../../features/generation/generators/marker_analyzer';
import { GenerationService } from '../../features/generation/generators/generation_service';
import { GenerationConfig } from '../../features/generation/config/generation_config';
import { ServerpodModel, ServerpodField } from '../../features/generation/parsers/formatters/types';
import { MockFileSystem } from '../mocks/mock_file_system';

/**
 * BUG-023 fix: `generate-entity --ceremony minimal` уважает урезанный ceremony
 * layout (паттерн weight). Design 1 (User decision 2026-06-05):
 *   - `minimal` вырезает **usecases + usecase-провайдеры** (CRUD usecases =
 *     "architectural noise" per Discussion #7) и переключает presentation на
 *     прямой вызов repository через `.minc`-варианты state_providers /
 *     get_by_id_provider.
 *   - datasource-интерфейсы + repository_impl + data_providers остаются как в
 *     `full` (Discussion #7 НЕ относит ds-интерфейсы к "noise"; дублировать
 *     sync-критичный local_data_source нельзя — risk drift).
 *   - `full` (default) — исторический t115 output без изменений.
 *
 * Механизм — `flags: fullCeremony` / `flags: minimalCeremony` маркеры +
 * `MarkerAnalyzer.matchesCeremonyFlag` (унифицировано с `--with-interfaces`).
 * Эталон фильтра — TASK-029 `--with-server` (with_server_filter.test.ts).
 */

const TEMPLATES_ROOT = '/test/templates';
const PROJECTS_ROOT = '/test/projects';
const TARGET_PROJECT = 'app1';
const TEMPL_PROJECT = 't115';

const FLUTTER_TPL = path.posix.join(
    TEMPLATES_ROOT, 'flutter', TEMPL_PROJECT, `${TEMPL_PROJECT}_flutter`,
    'lib', 'features', 'tasks',
);

/** Путь назначения в target feature (tasks) для сущности category. */
function targetFlutter(...segments: string[]): string {
    return path.posix.join(
        PROJECTS_ROOT, TARGET_PROJECT, `${TARGET_PROJECT}_flutter`,
        'lib', 'features', 'tasks', ...segments,
    );
}

/**
 * Mock template с категориями файлов manifest: entity:
 *   1. dao                       — обычный слой (positive control, всегда).
 *   2. usecases / usecase_providers — ceremony-слои (`flags: fullCeremony`),
 *      которые minimal вырезает.
 *   3. local datasource interface — Design 1 СОХРАНЯЕТ (без ceremony-флага).
 *   4. state_providers (full = `fullCeremony`) + state_providers.minc
 *      (`minimalCeremony`) — взаимоисключающие варианты одного destination.
 */
function setupMockTemplate(mockFs: MockFileSystem): void {
    const files: [string[], string][] = [
        [['data', 'datasources', 'local', 'daos', 'category', 'category_dao.dart'],
            '// manifest: entity\n// dummy dao category\n'],
        [['domain', 'usecases', 'category_usecases.dart'],
            '// manifest: entity\n// flags: fullCeremony\n// dummy usecases category\n'],
        [['domain', 'providers', 'category', 'category_usecase_providers.dart'],
            '// manifest: entity\n// flags: fullCeremony\n// dummy usecase providers category\n'],
        [['data', 'datasources', 'local', 'interfaces', 'category_local_datasource_service.dart'],
            '// manifest: entity\n// dummy local datasource interface category\n'],
        [['presentation', 'providers', 'category', 'category_state_providers.dart'],
            '// manifest: entity\n// flags: fullCeremony\n// VARIANT=usecase\n'],
        [['presentation', 'providers', 'category', 'category_state_providers.minc.dart'],
            '// manifest: entity\n// flags: minimalCeremony\n// VARIANT=repository\n'],
    ];
    for (const [segments, content] of files) {
        mockFs.setFile(path.posix.join(FLUTTER_TPL, ...segments), content);
    }
}

function makeModel(): ServerpodModel {
    const fields: ServerpodField[] = [
        { name: 'id', type: 'UuidValue?', nullable: true },
        { name: 'title', type: 'String', nullable: false },
    ];
    return { className: 'Category', tableName: 'category', fields, isRelation: false };
}

function makeConfig(ceremony: 'full' | 'minimal'): GenerationConfig {
    return new GenerationConfig({
        templProject: TEMPL_PROJECT,
        templEntity: 'category',
        targetEntity: 'category',
        templatesPath: TEMPLATES_ROOT,
        projectsPath: PROJECTS_ROOT,
        targetProject: TARGET_PROJECT,
        templFeatureName: 'tasks',
        targetFeaturePath: targetFlutter(),
        workspacesPath: `${PROJECTS_ROOT}/${TARGET_PROJECT}`,
        manifest: ['entity'],
        withServer: false,
        ceremony,
    });
}

/** Прогоняет generate и возвращает массив записанных (новых) путей в forward-slash. */
async function generateAndDiff(
    mockFs: MockFileSystem,
    service: GenerationService,
    ceremony: 'full' | 'minimal',
): Promise<string[]> {
    const before = new Set(mockFs.getFilesSnapshot().keys());
    await service.generate(makeConfig(ceremony), makeModel());
    return Array.from(mockFs.getFilesSnapshot().keys())
        .filter(p => !before.has(p))
        .map(p => p.replace(/\\/g, '/'));
}

suite('BUG-023: ceremony-profile filter (Design 1 fix)', () => {

    suite('matchesCeremonyFlag — pure filter logic', () => {
        const fullFile = { types: ['entity'], dictionaries: [], isTemplated: false, flags: ['fullCeremony'] } as any;
        const minFile = { types: ['entity'], dictionaries: [], isTemplated: false, flags: ['minimalCeremony'] } as any;
        const plainFile = { types: ['entity'], dictionaries: [], isTemplated: false, flags: [] } as any;

        test('fullCeremony + full → INCLUDE', () => {
            assert.strictEqual(MarkerAnalyzer.matchesCeremonyFlag(fullFile, 'full'), true);
        });
        test('fullCeremony + minimal → EXCLUDE', () => {
            assert.strictEqual(MarkerAnalyzer.matchesCeremonyFlag(fullFile, 'minimal'), false);
        });
        test('minimalCeremony + minimal → INCLUDE', () => {
            assert.strictEqual(MarkerAnalyzer.matchesCeremonyFlag(minFile, 'minimal'), true);
        });
        test('minimalCeremony + full → EXCLUDE', () => {
            assert.strictEqual(MarkerAnalyzer.matchesCeremonyFlag(minFile, 'full'), false);
        });
        test('no ceremony flag → INCLUDE в обоих режимах (backward compat)', () => {
            assert.strictEqual(MarkerAnalyzer.matchesCeremonyFlag(plainFile, 'full'), true);
            assert.strictEqual(MarkerAnalyzer.matchesCeremonyFlag(plainFile, 'minimal'), true);
        });
    });

    suite('GenerationConfig.ceremony default', () => {
        test('ceremony omitted → default "full" (backward compat)', () => {
            const config = new GenerationConfig({
                templProject: TEMPL_PROJECT, workspacesPath: '/test', manifest: ['entity'],
            });
            assert.strictEqual(config.ceremony, 'full');
        });
        test('ceremony="minimal" preserved', () => {
            const config = new GenerationConfig({
                templProject: TEMPL_PROJECT, workspacesPath: '/test', manifest: ['entity'], ceremony: 'minimal',
            });
            assert.strictEqual(config.ceremony, 'minimal');
        });
    });

    suite('Integration via GenerationService + MockFileSystem', () => {
        let mockFs: MockFileSystem;
        let service: GenerationService;

        setup(() => {
            mockFs = new MockFileSystem();
            setupMockTemplate(mockFs);
            service = new GenerationService(mockFs);
        });

        const daoPath = targetFlutter('data', 'datasources', 'local', 'daos', 'category', 'category_dao.dart');
        const usecasesDir = '/domain/usecases/';
        const usecaseProvidersDir = '/domain/providers/';
        const dsInterfacePath = targetFlutter('data', 'datasources', 'local', 'interfaces', 'category_local_datasource_service.dart');
        const stateProvidersPath = targetFlutter('presentation', 'providers', 'category', 'category_state_providers.dart');

        test('positive control: dao эмитится в minimal (generate не early-exit)', async () => {
            const written = await generateAndDiff(mockFs, service, 'minimal');
            assert.ok(written.some(p => p === daoPath),
                `dao должен записаться. Written: ${written.join(', ')}`);
        });

        test('full: usecases + usecase_providers эмитятся (исторический t115)', async () => {
            const written = await generateAndDiff(mockFs, service, 'full');
            assert.ok(written.some(p => p.includes(usecasesDir)),
                `full: usecases ожидаются. Written: ${written.join(', ')}`);
            assert.ok(written.some(p => p.includes(usecaseProvidersDir)),
                `full: usecase_providers ожидаются. Written: ${written.join(', ')}`);
        });

        test('minimal: usecases НЕ эмитятся (BUG-023 fix)', async () => {
            const written = await generateAndDiff(mockFs, service, 'minimal');
            const usecaseWrites = written.filter(p => p.includes(usecasesDir));
            assert.strictEqual(usecaseWrites.length, 0,
                `minimal: usecases НЕ должны эмититься. Found: ${usecaseWrites.join(', ')}`);
        });

        test('minimal: usecase_providers НЕ эмитятся (BUG-023 fix)', async () => {
            const written = await generateAndDiff(mockFs, service, 'minimal');
            const upWrites = written.filter(p => p.includes(usecaseProvidersDir));
            assert.strictEqual(upWrites.length, 0,
                `minimal: usecase_providers НЕ должны эмититься. Found: ${upWrites.join(', ')}`);
        });

        test('minimal: ds-интерфейс СОХРАНЯЕТСЯ (Design 1 — не "noise")', async () => {
            const written = await generateAndDiff(mockFs, service, 'minimal');
            assert.ok(written.some(p => p === dsInterfacePath),
                `Design 1: ds-интерфейс должен остаться в minimal. Written: ${written.join(', ')}`);
        });

        test('minimal: state_providers берётся из .minc-варианта (repository-direct)', async () => {
            const before = new Set(mockFs.getFilesSnapshot().keys());
            await service.generate(makeConfig('minimal'), makeModel());
            const snap = mockFs.getFilesSnapshot();
            const content = snap.get(stateProvidersPath);
            assert.ok(content, `state_providers должен записаться по ${stateProvidersPath}`);
            assert.ok(content!.includes('VARIANT=repository'),
                `minimal: ожидаем minc-вариант (repository). Got: ${content}`);
            // `.minc` sentinel срезан — среди ЗАПИСАННЫХ (новых) файлов нет *.minc.*
            // (исходный template .minc.dart живёт под TEMPLATES_ROOT и в baseline).
            const newWrites = Array.from(snap.keys()).filter(k => !before.has(k));
            assert.ok(!newWrites.some(k => k.replace(/\\/g, '/').includes('.minc.')),
                `.minc sentinel должен быть срезан из destination. New: ${newWrites.join(', ')}`);
        });

        test('full: state_providers берётся из full-варианта (usecase)', async () => {
            await service.generate(makeConfig('full'), makeModel());
            const content = mockFs.getFilesSnapshot().get(stateProvidersPath);
            assert.ok(content, `state_providers должен записаться по ${stateProvidersPath}`);
            assert.ok(content!.includes('VARIANT=usecase'),
                `full: ожидаем full-вариант (usecase). Got: ${content}`);
        });
    });
});
