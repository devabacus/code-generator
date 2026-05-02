import * as assert from 'assert';
import { patchPubspecPackagePaths } from '../../core/services/project_bootstrapper';
import { GenerationConfig } from '../../features/generation/config/generation_config';
import { MockFileSystem } from '../mocks/mock_file_system';

const TARGET_PROJECT = 'weight';
const PROJECTS_PATH = '/test/projects';
const TARGET_FLUTTER_PUBSPEC = `${PROJECTS_PATH}/${TARGET_PROJECT}/${TARGET_PROJECT}_flutter/pubspec.yaml`;

function makeConfig(): GenerationConfig {
    return new GenerationConfig({
        templProject: 't115',
        targetProject: TARGET_PROJECT,
        templatesPath: '/test/templates',
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
