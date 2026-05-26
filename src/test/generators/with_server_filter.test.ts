import * as assert from 'assert';
import * as path from 'path';
import { shouldScanDir, computeScanDirs } from '../../features/generation/generators/generation_service';
import { GenerationService } from '../../features/generation/generators/generation_service';
import { GenerationConfig } from '../../features/generation/config/generation_config';
import { ServerpodModel, ServerpodField } from '../../features/generation/parsers/formatters/types';
import { MockFileSystem } from '../mocks/mock_file_system';

/**
 * TASK-029 Bug 5: `generate-entity` opt-in `--with-server`, default OFF
 * (least-surprise после TASK-019 B2 incident — vanilla generate-entity молча
 * scope creep'ил в `weight_server/`, создавал snake-дубли endpoints).
 *
 * Filter: для `entity` / `manyToMany` manifests `server/` scan_dir исключается
 * из `directoriesToScan` если `withServer === false`. `startProject` exempt
 * (create-project всегда должен генерить server baseline — иначе пустой
 * <project>_server/). Microservice manifests (`pythonStart` / `goStart` /
 * `nodeStart`) и `deploy` тоже exempt — они независимы от CRUD entity flow.
 *
 * **Что проверяет этот тест:**
 *
 * 1. `shouldScanDir` pure helper — filter logic correctness по всем
 *    manifest × dir × withServer комбинациям.
 * 2. `computeScanDirs` aggregate — final Set<string> после применения
 *    filter ко всем manifests batch'ом.
 * 3. Integration — `GenerationService.generate()` end-to-end с MockFileSystem:
 *    Test 5 (no --with-server) → no writes в `<project>_server/`.
 *    Test 6 (--with-server) → writes в `<project>_server/` происходят.
 */

// ── Mock setup helpers ────────────────────────────────────────────────────

const TEMPLATES_ROOT = '/test/templates';
const PROJECTS_ROOT = '/test/projects';
const TARGET_PROJECT = 'app1';
const TEMPL_PROJECT = 't115';

/**
 * Создаёт минимальную mock template structure для integration tests.
 * Включает `feature/` (client) + `server/` files с manifest: entity для
 * проверки filter behaviour.
 */
function setupMockTemplate(mockFs: MockFileSystem): void {
    // Client-side template file (feature/)
    const clientTemplatePath = path.posix.join(
        TEMPLATES_ROOT, 'flutter', TEMPL_PROJECT, `${TEMPL_PROJECT}_flutter`,
        'lib', 'features', 'tasks', 'data', 'datasources', 'local', 'daos',
        'category', 'category_dao.dart',
    );
    mockFs.setFile(
        clientTemplatePath,
        '// manifest: entity\n// dummy client template content category\n',
    );

    // Server-side template file (server/) — должен быть пропущен при !withServer
    const serverTemplatePath = path.posix.join(
        TEMPLATES_ROOT, 'flutter', TEMPL_PROJECT, `${TEMPL_PROJECT}_server`,
        'lib', 'src', 'endpoints', 'category_endpoint.dart',
    );
    mockFs.setFile(
        serverTemplatePath,
        '// manifest: entity\n// dummy server template content category\n',
    );
}

function makeModel(): ServerpodModel {
    const fields: ServerpodField[] = [
        { name: 'id', type: 'UuidValue?', nullable: true },
        { name: 'title', type: 'String', nullable: false },
    ];
    return {
        className: 'Category',
        tableName: 'category',
        fields,
        isRelation: false,
    };
}

function makeIntegrationConfig(withServer: boolean): GenerationConfig {
    return new GenerationConfig({
        templProject: TEMPL_PROJECT,
        templEntity: 'category',
        targetEntity: 'category',
        templatesPath: TEMPLATES_ROOT,
        projectsPath: PROJECTS_ROOT,
        targetProject: TARGET_PROJECT,
        templFeatureName: 'tasks',
        targetFeaturePath: `${PROJECTS_ROOT}/${TARGET_PROJECT}/${TARGET_PROJECT}_flutter/lib/features/tasks`,
        workspacesPath: `${PROJECTS_ROOT}/${TARGET_PROJECT}`,
        manifest: ['entity'],
        withServer,
    });
}

suite('TASK-029: --with-server filter (Bug 5 fix)', () => {

    suite('shouldScanDir helper — pure filter logic', () => {

        test('entity manifest + server/ + withServer=false → SKIP', () => {
            assert.strictEqual(shouldScanDir('entity', 'server/', false), false);
        });

        test('entity manifest + server/ + withServer=true → SCAN', () => {
            assert.strictEqual(shouldScanDir('entity', 'server/', true), true);
        });

        test('entity manifest + feature/ + withServer=false → SCAN (feature/ always)', () => {
            assert.strictEqual(shouldScanDir('entity', 'feature/', false), true);
        });

        test('manyToMany manifest + server/ + withServer=false → SKIP', () => {
            assert.strictEqual(shouldScanDir('manyToMany', 'server/', false), false);
        });

        test('manyToMany manifest + server/ + withServer=true → SCAN', () => {
            assert.strictEqual(shouldScanDir('manyToMany', 'server/', true), true);
        });

        test('startProject manifest + server/ + withServer=false → SCAN (EXEMPT)', () => {
            // Критическое regression-protection: create-project должен продолжать
            // генерить server baseline независимо от withServer flag.
            assert.strictEqual(shouldScanDir('startProject', 'server/', false), true);
        });

        test('deploy manifest + server/ + withServer=false → SCAN (EXEMPT)', () => {
            assert.strictEqual(shouldScanDir('deploy', 'server/', false), true);
        });

        test('pythonStart manifest + server/ + withServer=false → SCAN (EXEMPT microservice)', () => {
            assert.strictEqual(shouldScanDir('pythonStart', 'server/', false), true);
        });
    });

    suite('computeScanDirs aggregate', () => {

        test('entity + withServer=false → {feature/} (server/ excluded)', () => {
            const dirs = computeScanDirs(['entity'], false);
            assert.ok(dirs.has('feature/'), 'feature/ должен присутствовать');
            assert.ok(!dirs.has('server/'), 'server/ должен быть исключён');
            assert.strictEqual(dirs.size, 1);
        });

        test('entity + withServer=true → {feature/, server/}', () => {
            const dirs = computeScanDirs(['entity'], true);
            assert.ok(dirs.has('feature/'));
            assert.ok(dirs.has('server/'));
        });

        test('manyToMany + withServer=false → {feature/} (server/ excluded)', () => {
            const dirs = computeScanDirs(['manyToMany'], false);
            assert.ok(dirs.has('feature/'));
            assert.ok(!dirs.has('server/'));
        });

        test('startProject + withServer=false → contains server/ (EXEMPT)', () => {
            const dirs = computeScanDirs(['startProject'], false);
            assert.ok(dirs.has('server/'),
                'startProject manifest должен сохранить server/ (create-project bootstrap)');
            // startProject also contains: flutter/, admin/, feature/
            assert.ok(dirs.has('flutter/'));
            assert.ok(dirs.has('admin/'));
            assert.ok(dirs.has('feature/'));
        });

        test('combined [entity, startProject] + withServer=false → server/ из startProject', () => {
            // Если оба manifest активны, server/ должен присутствовать (т.к.
            // startProject его включает). Это hypothetical case — обычно один
            // manifest активен — но Set union semantics корректны.
            const dirs = computeScanDirs(['entity', 'startProject'], false);
            assert.ok(dirs.has('server/'), 'server/ из startProject должен присутствовать в union');
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

        test('Test 5: generate-entity без --with-server → no writes в *_server/', async () => {
            const config = makeIntegrationConfig(false);
            // Snapshot files перед generate, чтобы diff показал только новые writes.
            const beforeFiles = new Set(mockFs.getFilesSnapshot().keys());
            await service.generate(config, makeModel());

            const afterFiles = Array.from(mockFs.getFilesSnapshot().keys());
            const newFiles = afterFiles.filter(p => !beforeFiles.has(p));
            const serverWrites = newFiles.filter(p => p.includes(`${TARGET_PROJECT}_server`));
            assert.strictEqual(
                serverWrites.length,
                0,
                `Без --with-server не должно быть записей в *_server/. Found: ${serverWrites.join(', ')}`,
            );
        });

        test('Test 6: generate-entity с --with-server=true → server/ template обрабатывается', async () => {
            const config = makeIntegrationConfig(true);
            const beforeFiles = new Set(mockFs.getFilesSnapshot().keys());
            await service.generate(config, makeModel());

            // С withServer=true, server/ scan_dir включается → должна произойти
            // обработка server template. Tighten assertion (R3 H1, R2 C-2):
            // assert specific expected destination path, не loose "≥1".
            const afterFiles = Array.from(mockFs.getFilesSnapshot().keys());
            const newFiles = afterFiles.filter(p => !beforeFiles.has(p));
            const expectedServerPath =
                `${PROJECTS_ROOT}/${TARGET_PROJECT}/${TARGET_PROJECT}_server/lib/src/endpoints/category_endpoint.dart`;
            const hasExpectedServerWrite = newFiles.some(p =>
                p.replace(/\\/g, '/') === expectedServerPath,
            );
            assert.ok(
                hasExpectedServerWrite,
                `С --with-server ожидаем write по конкретному пути ${expectedServerPath}. ` +
                `New files: ${newFiles.join(', ')}`,
            );
        });

        test('Test 5 positive control: generate-entity без --with-server → feature/ writes happen', async () => {
            // Adversarial R2 C-2: doc Test 5 assertion (no server writes) могла бы
            // vacuously pass если mock setup был incomplete и generate() early-exit.
            // Этот positive control проверяет что generate() actually reached writes —
            // feature/ template обработан (category_dao.dart создан в target).
            const config = makeIntegrationConfig(false);
            const beforeFiles = new Set(mockFs.getFilesSnapshot().keys());
            await service.generate(config, makeModel());

            const afterFiles = Array.from(mockFs.getFilesSnapshot().keys());
            const newFiles = afterFiles.filter(p => !beforeFiles.has(p));
            const expectedFeaturePath =
                `${PROJECTS_ROOT}/${TARGET_PROJECT}/${TARGET_PROJECT}_flutter/lib/features/tasks/data/datasources/local/daos/category/category_dao.dart`;
            const hasExpectedFeatureWrite = newFiles.some(p =>
                p.replace(/\\/g, '/') === expectedFeaturePath,
            );
            assert.ok(
                hasExpectedFeatureWrite,
                `Test 5 sanity: без --with-server feature/ writes должны произойти ` +
                `(positive control что generate() не early-exit'нул). New files: ${newFiles.join(', ')}`,
            );
        });
    });

    suite('Defensive: undefined / missing withServer field', () => {

        test('GenerationConfig без withServer field → default false', () => {
            // Adversarial R3 H2: legacy caller который не передаёт withServer → default
            // OFF (safer). Защищает от silent leak если caller code path не обновлён.
            const config = new GenerationConfig({
                templProject: TEMPL_PROJECT,
                workspacesPath: '/test',
                manifest: ['entity'],
                // withServer intentionally omitted
            });
            assert.strictEqual(config.withServer, false,
                'undefined withServer should default to false (safer behaviour)');
        });

        test('GenerationConfig с withServer=undefined → false', () => {
            const config = new GenerationConfig({
                templProject: TEMPL_PROJECT,
                workspacesPath: '/test',
                manifest: ['entity'],
                withServer: undefined,
            });
            assert.strictEqual(config.withServer, false);
        });

        test('GenerationConfig с withServer=true → true (explicit opt-in preserved)', () => {
            const config = new GenerationConfig({
                templProject: TEMPL_PROJECT,
                workspacesPath: '/test',
                manifest: ['entity'],
                withServer: true,
            });
            assert.strictEqual(config.withServer, true);
        });

        test('GenerationConfig с withServer=false explicitly → false', () => {
            const config = new GenerationConfig({
                templProject: TEMPL_PROJECT,
                workspacesPath: '/test',
                manifest: ['entity'],
                withServer: false,
            });
            assert.strictEqual(config.withServer, false);
        });
    });
});
