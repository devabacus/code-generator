import * as assert from 'assert';
import { patchPubspecPackagePaths } from '../../core/services/project_bootstrapper';
import { GenerationConfig } from '../../features/generation/config/generation_config';
import { MockFileSystem } from '../mocks/mock_file_system';

const TARGET_PROJECT = 'weight';
// TASK-024 (Session E2 round 2): paths теперь воспроизводят real-world depth
// difference. Default shape: template = `<templatesPath>/flutter/t115/t115_flutter`
// (5 segments после root), target = `<projectsPath>/<name>/<name>_flutter` где
// projectsPath включает `serverpod/` уровень → target depth = 6 segments. Delta = 1.
//
// Раньше тесты использовали `/test/projects/<name>/<name>_flutter` (4 segs) и
// `/test/templates/flutter/t115/t115_flutter` (5 segs) — delta = -1, что не
// соответствовало реальной семантике. Patcher тогда hardcoded +1 deepening,
// игнорируя любые depth differences. После TASK-024 fix patcher вычисляет delta
// динамически — и тесты должны использовать realistic shapes.
const TEMPLATES_PATH = '/test/Templates';
const PROJECTS_PATH = '/test/Projects/Flutter/serverpod';
const TARGET_FLUTTER_PUBSPEC = `${PROJECTS_PATH}/${TARGET_PROJECT}/${TARGET_PROJECT}_flutter/pubspec.yaml`;

function makeConfig(): GenerationConfig {
    return new GenerationConfig({
        templProject: 't115',
        targetProject: TARGET_PROJECT,
        templatesPath: TEMPLATES_PATH,
        projectsPath: PROJECTS_PATH,
        workspacesPath: `${PROJECTS_PATH}/${TARGET_PROJECT}`,
    });
}

suite('patchPubspecPackagePaths — Phase D (sync_core path-dep)', () => {
    let mockFs: MockFileSystem;

    setup(() => {
        mockFs = new MockFileSystem();
    });

    test('in-monorepo Packages/ path: ../../Packages/X → ../../../Packages/X', async () => {
        const before = `dependencies:
  ble_feature:
    path: ../../Packages/ble_feature
`;
        mockFs.setFile(TARGET_FLUTTER_PUBSPEC, before);

        await patchPubspecPackagePaths(mockFs, makeConfig());

        const after = await mockFs.readFile(TARGET_FLUTTER_PUBSPEC);
        assert.ok(
            after.includes('path: ../../../Packages/ble_feature'),
            'in-monorepo path должен углубиться на 1 уровень'
        );
    });

    test('out-of-monorepo sync_core: ../../../../Projects/Flutter/Packages/sync_core → ../../../../../Projects/Flutter/Packages/sync_core', async () => {
        const before = `dependencies:
  sync_core:
    path: ../../../../Projects/Flutter/Packages/sync_core
`;
        mockFs.setFile(TARGET_FLUTTER_PUBSPEC, before);

        await patchPubspecPackagePaths(mockFs, makeConfig());

        const after = await mockFs.readFile(TARGET_FLUTTER_PUBSPEC);
        assert.ok(
            after.includes('path: ../../../../../Projects/Flutter/Packages/sync_core'),
            'out-of-monorepo sync_core path должен углубиться на 1 уровень'
        );
    });

    test('combined: in-monorepo + out-of-monorepo paths оба патчатся', async () => {
        const before = `dependencies:
  ble_feature:
    path: ../../Packages/ble_feature
  sync_core:
    path: ../../../../Projects/Flutter/Packages/sync_core
`;
        mockFs.setFile(TARGET_FLUTTER_PUBSPEC, before);

        await patchPubspecPackagePaths(mockFs, makeConfig());

        const after = await mockFs.readFile(TARGET_FLUTTER_PUBSPEC);
        assert.ok(after.includes('path: ../../../Packages/ble_feature'));
        assert.ok(after.includes('path: ../../../../../Projects/Flutter/Packages/sync_core'));
    });

    test('idempotent re-run: повторный call не меняет уже-патченый файл (D8 fix)', async () => {
        const original = `dependencies:
  ble_feature:
    path: ../../Packages/ble_feature
  sync_core:
    path: ../../../../Projects/Flutter/Packages/sync_core
`;
        mockFs.setFile(TARGET_FLUTTER_PUBSPEC, original);

        await patchPubspecPackagePaths(mockFs, makeConfig());
        const after1 = await mockFs.readFile(TARGET_FLUTTER_PUBSPEC);

        await patchPubspecPackagePaths(mockFs, makeConfig());
        const after2 = await mockFs.readFile(TARGET_FLUTTER_PUBSPEC);

        // D8 fix (2026-05-02): patcher теперь fully idempotent для both patterns.
        // - In-monorepo (`../../Packages/X`): не matches после 1-го run (4 leading dots).
        // - Out-of-monorepo (`../../../../Projects/X`): regex поменян `{4,}` → `{4}`,
        //   exact match. После 1-го run = 5 levels, regex `{4}` НЕ matches → no-op.
        assert.strictEqual(after1, after2, 'patcher должен быть полностью idempotent (D8 fix)');

        // Sanity checks: пути на правильной depth.
        const inMonorepoCount = (after2.match(/\.\.\/\.\.\/\.\.\/Packages\/ble_feature/g) || []).length;
        const outOfMonorepoCount = (after2.match(/\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/Projects\/Flutter\/Packages\/sync_core/g) || []).length;
        assert.strictEqual(inMonorepoCount, 1, 'in-monorepo path: 3 levels (post-patch state)');
        assert.strictEqual(outOfMonorepoCount, 1, 'out-of-monorepo path: 5 levels (post-patch state)');

        // NEGATIVE: НЕ должно быть 6+ levels (что было бы при non-idempotent regex `{4,}`).
        assert.ok(
            !after2.includes('../../../../../../Projects/'),
            'D8 fix: depth НЕ углубляется до 6 levels на повторном run'
        );
    });

    test('absolute path не модифицируется (e.g. /home/user/Packages/X)', async () => {
        const before = `dependencies:
  custom:
    path: /home/user/Packages/custom_pkg
`;
        mockFs.setFile(TARGET_FLUTTER_PUBSPEC, before);

        await patchPubspecPackagePaths(mockFs, makeConfig());

        const after = await mockFs.readFile(TARGET_FLUTTER_PUBSPEC);
        assert.strictEqual(after, before, 'absolute path должен остаться без изменений');
    });

    test('non-Packages relative path не трогается (e.g. ../<feature>_client)', async () => {
        const before = `dependencies:
  weight_client:
    path: ../weight_client
`;
        mockFs.setFile(TARGET_FLUTTER_PUBSPEC, before);

        await patchPubspecPackagePaths(mockFs, makeConfig());

        const after = await mockFs.readFile(TARGET_FLUTTER_PUBSPEC);
        assert.strictEqual(after, before, 'sibling client path должен остаться без изменений');
    });
});

/**
 * TASK-024 / Session E2 round 2: dynamic depth-delta tests.
 *
 * Раньше patcher hardcoded "+1 уровень deepening" (template depth N, target depth
 * N+1). Это рушилось когда `--projects-path` направлен внутрь `Templates/flutter/`
 * и target оказывался на той же depth что template — patcher всё-равно углублял
 * paths и `flutter pub get` падал на non-existent `Templates/Packages/`.
 *
 * Тесты ниже проверяют:
 *   1. **Default depth delta = 1** — preserved behaviour (regression guard для
 *      `Projects/Flutter/serverpod/` based paths). Покрытие уже есть в Phase D
 *      suite выше; здесь короткая sanity copy для bookkeeping.
 *   2. **Same-depth target (delta = 0)** — patcher no-op, paths не модифицируются.
 *      Это новая поддержка multi-template bootstrap для `Templates/flutter/<name>/`.
 */
suite('patchPubspecPackagePaths — TASK-024 dynamic depth delta', () => {
    let mockFs: MockFileSystem;

    setup(() => {
        mockFs = new MockFileSystem();
    });

    test('regression: default `Projects/Flutter/serverpod/` target deepens на 1 уровень', async () => {
        const config = new GenerationConfig({
            templProject: 't115',
            targetProject: 'myapp',
            templatesPath: '/test/Templates',
            // target shape: /test/Projects/Flutter/serverpod/myapp/myapp_flutter
            // template shape: /test/Templates/flutter/t115/t115_flutter
            // delta = 6 - 5 = 1 segment → in-monorepo deepening +1, sync_core deepening +1
            projectsPath: '/test/Projects/Flutter/serverpod',
        });
        const pubspecPath = `${config.targetFlutterProjectPath}/pubspec.yaml`;
        const before = `dependencies:
  ble_feature:
    path: ../../Packages/ble_feature
  sync_core:
    path: ../../../../Projects/Flutter/Packages/sync_core
`;
        mockFs.setFile(pubspecPath, before);

        await patchPubspecPackagePaths(mockFs, config);

        const after = await mockFs.readFile(pubspecPath);
        assert.ok(
            after.includes('path: ../../../Packages/ble_feature'),
            'default target: in-monorepo path должен углубиться +1'
        );
        assert.ok(
            after.includes('path: ../../../../../Projects/Flutter/Packages/sync_core'),
            'default target: out-of-monorepo path должен углубиться +1'
        );
    });

    test('same-depth target (--projects-path Templates/flutter/): patcher no-op', async () => {
        // BUG case TASK-024: target живёт в `Templates/flutter/<name>/<name>_flutter`,
        // на той же глубине что template `Templates/flutter/t115/t115_flutter`.
        // delta = 0 → paths не модифицируются.
        const config = new GenerationConfig({
            templProject: 't115',
            targetProject: 'simplified',
            templatesPath: '/test/Templates',
            projectsPath: '/test/Templates/flutter',
        });
        const pubspecPath = `${config.targetFlutterProjectPath}/pubspec.yaml`;
        const before = `dependencies:
  ble_feature:
    path: ../../Packages/ble_feature
  sync_core:
    path: ../../../../Projects/Flutter/Packages/sync_core
`;
        mockFs.setFile(pubspecPath, before);

        await patchPubspecPackagePaths(mockFs, config);

        const after = await mockFs.readFile(pubspecPath);
        assert.strictEqual(
            after,
            before,
            'same-depth target: patcher должен быть no-op (delta = 0, paths корректны как в шаблоне)'
        );
    });
});
