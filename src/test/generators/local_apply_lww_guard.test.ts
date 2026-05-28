import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ReplacingFileProcessor, ReplaceTask } from '../../features/generation/generators/replacing_file_processor';
import { getDictionaryRules } from '../../features/generation/replacement/replacement_util';
import { GenerationConfig } from '../../features/generation/config/generation_config';
import { JunctionDetector } from '../../features/generation/parsers/junction_detector';
import { ServerpodModel, ServerpodField } from '../../features/generation/parsers/formatters/types';
import { MockFileSystem } from '../mocks/mock_file_system';

/**
 * TASK-028 (Bug 3 fix) — LWW skip-stale guard в сгенерированных
 * `*_local_apply.dart` для всех non-junction (reference + operational) сущностей.
 *
 * **Корень Bug 3:** sync_core orchestrator pull применяет server-changes
 * безусловным UPSERT (`sync_orchestrator.dart:803-817`); LWW делегирован
 * `LocalApplyAdapter` через `SyncPullApplyContext`. Vanilla simplified-шаблон
 * делал безусловный UPSERT в `applyServerEcho` → silent data corruption на
 * cross-device pull: устаревший server-event перезаписывал свежий local
 * unsynced edit (например, double-weighing в weight TASK-019 C1).
 *
 * **Фикс** — template-only patch в 4 файлах:
 *   - `tasks/.../category/category_local_apply.dart` (entity emission source)
 *   - `tasks/.../task/task_local_apply.dart`         (fixture consistency)
 *   - `tasks/.../tag/tag_local_apply.dart`           (fixture consistency)
 *   - `configuration/.../configuration_local_apply.dart` (singleton baseline)
 *
 * Junction template (`task_tag_map_local_apply.dart`, manifest: manyToMany) —
 * НЕ патчится, остаётся pure UPSERT (PK-pair UPSERT/DELETE, LWW неприменим).
 *
 * **Что проверяет этот тест:**
 *
 * 1. **Pre-substitution shape (inline golden):** patched template content
 *    содержит guard pattern `if (ctx is SyncPullApplyContext) {...
 *    local.lastModified.isAfter(serverEntity.lastModified) ... return;}` для
 *    non-junction; absent для junction. Полностью independent от disk state.
 *
 * 2. **Post-substitution invariant:** прогон через `ReplacingFileProcessor` с
 *    ENTITY dictionary (Category→Order) сохраняет guard literals. Substitution
 *    не должна затронуть `SyncPullApplyContext` / `serverEntity.lastModified` /
 *    `SyncStatus.local` / `return;`.
 *
 * 3. **JunctionDetector consistency:** structural junction (`isRelation` per
 *    JunctionDetector) ↔ manifest split (`manyToMany`). Защита от ситуации
 *    когда JunctionDetector classify'ит сущность как junction, но guard всё
 *    равно генерируется (или наоборот).
 *
 * 4. **Live template regression (disk-dependent, optional):** если шаблон в
 *    `G:/Templates/flutter/simplified/` доступен — verify что disk content
 *    содержит guard для non-junction (4 файла) + absent для junction (1 файл).
 *    Скипается если disk недоступен (CI).
 */

// ── Inline golden fixtures (patched template content) ──────────────────────

/**
 * Inline copy of patched `category_local_apply.dart` (post-TASK-028).
 * Single source emission для generate-entity flow — substitution Category→Order
 * проверяется в post-substitution suite.
 */
const CATEGORY_LOCAL_APPLY_PATCHED = `// manifest: entity
import 'package:drift/drift.dart';
import 'package:sync_core/sync_core.dart';

import '../../../../../core/data/datasources/local/database_types.dart';
import '../../../domain/entities/category/category_entity.dart';
import '../../../domain/entities/extensions/category_entity_extension.dart';
import '../../datasources/local/daos/category/category_dao.dart';
import '../../models/extensions/category_model_extension.dart';

/// docstring stub (содержание не проверяется тестом).
class CategoryLocalApply implements LocalApplyAdapter<CategoryEntity> {
  final CategoryDao _dao;

  CategoryLocalApply(this._dao);

  @override
  Future<void> applyServerEcho(
    CategoryEntity serverEntity,
    SyncApplyContext ctx,
  ) async {
    if (ctx is SyncPullApplyContext) {
      final local = await _dao.getCategoryById(
        serverEntity.id,
        userId: serverEntity.userId,
        customerId: serverEntity.customerId,
      );
      if (local != null &&
          local.syncStatus == SyncStatus.local &&
          local.lastModified.isAfter(serverEntity.lastModified)) {
        return;
      }
    }

    final companion = serverEntity
        .toModel()
        .toCompanion()
        .copyWith(syncStatus: const Value(SyncStatus.synced));

    await _dao
        .into(_dao.categoryTable)
        .insert(companion, mode: InsertMode.insertOrReplace);
  }
}
`;

/**
 * Inline copy of unpatched `task_tag_map_local_apply.dart` (junction, manifest:
 * manyToMany — НЕ должен содержать guard).
 */
const TASK_TAG_MAP_LOCAL_APPLY_UNPATCHED = `// manifest: manyToMany
import 'package:drift/drift.dart';
import 'package:sync_core/sync_core.dart';

import '../../../../../core/data/datasources/local/database_types.dart';
import '../../../domain/entities/task_tag_map/task_tag_map_entity.dart';
import '../../../domain/entities/extensions/task_tag_map_entity_extension.dart';
import '../../datasources/local/daos/task_tag_map/task_tag_map_dao.dart';
import '../../models/extensions/task_tag_map_model_extension.dart';

class TaskTagMapLocalApply implements LocalApplyAdapter<TaskTagMapEntity> {
  final TaskTagMapDao _dao;

  TaskTagMapLocalApply(this._dao);

  @override
  Future<void> applyServerEcho(
    TaskTagMapEntity serverEntity,
    SyncApplyContext ctx,
  ) async {
    final companion = serverEntity
        .toModel()
        .toCompanion()
        .copyWith(syncStatus: const Value(SyncStatus.synced));

    await _dao
        .into(_dao.taskTagMapTable)
        .insert(companion, mode: InsertMode.insertOrReplace);
  }
}
`;

// ── Disk paths (для optional live regression check) ────────────────────────

const SIMPLIFIED_TEMPLATE_ROOT =
    'G:/Templates/flutter/simplified/simplified_flutter/lib/features';

const LIVE_NON_JUNCTION_PATHS: Record<string, string> = {
    category: `${SIMPLIFIED_TEMPLATE_ROOT}/tasks/data/adapters/category/category_local_apply.dart`,
    task: `${SIMPLIFIED_TEMPLATE_ROOT}/tasks/data/adapters/task/task_local_apply.dart`,
    tag: `${SIMPLIFIED_TEMPLATE_ROOT}/tasks/data/adapters/tag/tag_local_apply.dart`,
    configuration: `${SIMPLIFIED_TEMPLATE_ROOT}/configuration/data/adapters/configuration/configuration_local_apply.dart`,
};

const LIVE_JUNCTION_PATH =
    `${SIMPLIFIED_TEMPLATE_ROOT}/tasks/data/adapters/task_tag_map/task_tag_map_local_apply.dart`;

// TASK-031 (Bug 3 t115 LWW guard parity): t115 template получает identical
// LWW guard pattern за исключением junction (task_tag_map, manifest: manyToMany).
// Эти paths parallel SIMPLIFIED_* выше — same 4 non-junction + 1 junction.

const T115_TEMPLATE_ROOT =
    'G:/Templates/flutter/t115/t115_flutter/lib/features';

const LIVE_T115_NON_JUNCTION_PATHS: Record<string, string> = {
    category: `${T115_TEMPLATE_ROOT}/tasks/data/adapters/category/category_local_apply.dart`,
    task: `${T115_TEMPLATE_ROOT}/tasks/data/adapters/task/task_local_apply.dart`,
    tag: `${T115_TEMPLATE_ROOT}/tasks/data/adapters/tag/tag_local_apply.dart`,
    configuration: `${T115_TEMPLATE_ROOT}/configuration/data/adapters/configuration/configuration_local_apply.dart`,
};

const LIVE_T115_JUNCTION_PATH =
    `${T115_TEMPLATE_ROOT}/tasks/data/adapters/task_tag_map/task_tag_map_local_apply.dart`;

// ── Helper assertions ──────────────────────────────────────────────────────

/**
 * Asserts the LWW skip-stale guard pattern is present. Checks for ALL 4
 * critical literals в одном тесте — отсутствие любого = broken guard:
 *   1. `if (ctx is SyncPullApplyContext)` — context switch
 *   2. `local.syncStatus == SyncStatus.local` — only protect unsynced edits
 *   3. `local.lastModified.isAfter(serverEntity.lastModified)` — LWW comparison
 *   4. `return;` inside guard block — skip stale apply
 */
function hasLwwGuard(content: string): boolean {
    const hasContextCheck = /if\s*\(\s*ctx\s+is\s+SyncPullApplyContext\s*\)/.test(content);
    const hasSyncStatusCheck = /\.syncStatus\s*==\s*SyncStatus\.local/.test(content);
    const hasLwwComparison = /\.lastModified\.isAfter\(\s*serverEntity\.lastModified\s*\)/.test(content);
    // `return;` должен быть внутри `if` блока guard'а; простой grep на `return;`
    // достаточен поскольку other return statements в applyServerEcho не бывает
    // (Future<void> method без early return по умолчанию).
    const hasReturn = /return;/.test(content);
    return hasContextCheck && hasSyncStatusCheck && hasLwwComparison && hasReturn;
}

/**
 * Counts guard pattern occurrences. Должен быть 1 на entity (один guard в
 * `applyServerEcho`). > 1 = potential duplicate (regression в template); 0 =
 * guard отсутствует или сломан.
 */
function countGuards(content: string): number {
    const matches = content.match(/if\s*\(\s*ctx\s+is\s+SyncPullApplyContext\s*\)/g) ?? [];
    return matches.length;
}

// ── Model factories для JunctionDetector consistency check ─────────────────

function makeField(name: string, type: string, opts: Partial<ServerpodField> = {}): ServerpodField {
    return {
        name,
        type,
        modifiers: { isNullable: false, hasDefault: false },
        fullDefinition: `${name}: ${type}`,
        isRelation: false,
        relatedModel: null,
        ...opts,
    } as ServerpodField;
}

function makeModel(className: string, fields: ServerpodField[]): ServerpodModel {
    return {
        className,
        tableName: className.toLowerCase(),
        fields,
    } as ServerpodModel;
}

suite('TASK-028: local_apply LWW skip-stale guard (Bug 3 fix)', () => {

    suite('Pre-substitution shape (inline golden)', () => {

        test('category_local_apply.dart: содержит LWW guard со всеми 4 литералами', () => {
            const content = CATEGORY_LOCAL_APPLY_PATCHED;
            assert.ok(
                hasLwwGuard(content),
                'expected guard pattern: `if (ctx is SyncPullApplyContext) { ... ' +
                'local.syncStatus == SyncStatus.local ... ' +
                'local.lastModified.isAfter(serverEntity.lastModified) ... return; }`',
            );
            assert.strictEqual(
                countGuards(content),
                1,
                'expected exactly 1 guard в applyServerEcho (не дубль)',
            );
        });

        test('category_local_apply.dart: использует serverEntity.lastModified, НЕ ctx.sourceTimestamp', () => {
            // Differs от task.md acceptance литерального текста: weight reference
            // impl + sync_core контракт показывают что ctx.sourceTimestamp =
            // nullable (`DateTime?`), NULL если backend не возвращает. Guard стал
            // бы no-op. serverEntity.lastModified = hard-required field (always
            // non-null per 6-field invariant), server-stamped per ADR-0005 §4.3.
            const content = CATEGORY_LOCAL_APPLY_PATCHED;
            assert.ok(
                /serverEntity\.lastModified/.test(content),
                'guard должен сравнивать с serverEntity.lastModified (always non-null)',
            );
            assert.ok(
                !/ctx\.sourceTimestamp/.test(content),
                'guard НЕ должен использовать ctx.sourceTimestamp (nullable — broken contract)',
            );
        });

        test('category_local_apply.dart: guard precedes companion creation (correct ordering)', () => {
            // Verifies guard стоит ПЕРЕД final companion = ...; иначе guard
            // бесполезен (мы уже UPSERT прошли). Pattern: regex для guard block
            // followed by `final companion`.
            const orderingRegex =
                /if\s*\(\s*ctx\s+is\s+SyncPullApplyContext\s*\)\s*\{[\s\S]*?return;[\s\S]*?\}\s*\n\s*final\s+companion/;
            assert.ok(
                orderingRegex.test(CATEGORY_LOCAL_APPLY_PATCHED),
                'guard должен предшествовать `final companion = ...`. После UPSERT guard бесполезен.',
            );
        });

        test('task_tag_map_local_apply.dart: НЕ содержит guard (junction opt-out)', () => {
            const content = TASK_TAG_MAP_LOCAL_APPLY_UNPATCHED;
            assert.ok(
                !hasLwwGuard(content),
                'junction template НЕ должен содержать guard (manifest: manyToMany — ' +
                'PK-pair UPSERT/DELETE, LWW неприменим)',
            );
            assert.strictEqual(
                countGuards(content),
                0,
                'junction template должен иметь 0 guards',
            );
        });

        test('manifest split: non-junction = `manifest: entity`, junction = `manifest: manyToMany`', () => {
            // Manifest tag — это что отделяет non-junction (получает guard) от
            // junction (opt-out). Test защищает от случайного переключения
            // manifest tag в template (regression на manifest split logic).
            assert.ok(
                /^\/\/ manifest: entity\b/m.test(CATEGORY_LOCAL_APPLY_PATCHED),
                'non-junction template должен начинаться с `// manifest: entity`',
            );
            assert.ok(
                /^\/\/ manifest: manyToMany\b/m.test(TASK_TAG_MAP_LOCAL_APPLY_UNPATCHED),
                'junction template должен начинаться с `// manifest: manyToMany`',
            );
        });
    });

    suite('Post-substitution invariant (ReplacingFileProcessor)', () => {
        let mockFs: MockFileSystem;
        let processor: ReplacingFileProcessor;

        setup(() => {
            mockFs = new MockFileSystem();
            processor = new ReplacingFileProcessor(mockFs);
        });

        test('ENTITY substitution Category→Order сохраняет guard literals', async () => {
            const srcPath = '/test/templates/category/category_local_apply.dart';
            const destPath = '/test/projects/order/order_local_apply.dart';
            mockFs.setFile(srcPath, CATEGORY_LOCAL_APPLY_PATCHED);

            const config = new GenerationConfig({
                templProject: 't115',
                templEntity: 'category',
                targetEntity: 'order',
                templatesPath: '/test/templates',
                projectsPath: '/test/projects',
                targetProject: 'app1',
                templFeatureName: 'tasks',
                targetFeaturePath: '/test/projects/app1/lib/features/orders',
                workspacesPath: '/test/projects/app1',
            });

            const rules = getDictionaryRules(['common', 'entity'], config);
            const tasks: ReplaceTask[] = [
                { sourcePath: srcPath, destinationPath: destPath, rules },
            ];
            await processor.process(tasks);

            const result = await mockFs.readFile(destPath);

            // Guard structural literals (sync_core types + generic field accessors)
            // должны survive substitution intact.
            assert.ok(
                /if\s*\(\s*ctx\s+is\s+SyncPullApplyContext\s*\)/.test(result),
                'SyncPullApplyContext должен survive substitution',
            );
            assert.ok(
                /\.syncStatus\s*==\s*SyncStatus\.local/.test(result),
                'SyncStatus.local literal должен survive substitution',
            );
            assert.ok(
                /serverEntity\.lastModified/.test(result),
                'serverEntity.lastModified должен survive substitution',
            );
            assert.ok(
                /\.lastModified\.isAfter\(\s*serverEntity\.lastModified\s*\)/.test(result),
                'LWW comparison должен survive substitution intact',
            );

            // DAO method должен быть переименован (sanity check substitution работает).
            assert.ok(
                /_dao\.getOrderById/.test(result),
                'substitution должен переименовать DAO method category→order',
            );
            assert.ok(
                !/_dao\.getCategoryById/.test(result),
                'old DAO method getCategoryById должен быть переписан',
            );
        });

        test('substitution не задевает sync_core literals (defensive against targetEntity collisions)', async () => {
            // Defensive: даже при targetEntity = что-то странное (например 'sync'
            // hypothetically), guard literals должны быть unaffected.
            const srcPath = '/test/templates/category_local_apply.dart';
            const destPath = '/test/projects/widget_local_apply.dart';
            mockFs.setFile(srcPath, CATEGORY_LOCAL_APPLY_PATCHED);

            const config = new GenerationConfig({
                templProject: 't115',
                templEntity: 'category',
                targetEntity: 'widget',
                templatesPath: '/test/templates',
                projectsPath: '/test/projects',
                targetProject: 'app1',
                templFeatureName: 'tasks',
                targetFeaturePath: '/test/projects/app1/lib/features/widgets',
                workspacesPath: '/test/projects/app1',
            });

            const rules = getDictionaryRules(['common', 'entity'], config);
            const tasks: ReplaceTask[] = [
                { sourcePath: srcPath, destinationPath: destPath, rules },
            ];
            await processor.process(tasks);

            const result = await mockFs.readFile(destPath);
            assert.ok(
                hasLwwGuard(result),
                'guard pattern должен survive substitution Category→Widget полностью',
            );
        });
    });

    suite('JunctionDetector consistency (regression на manifest split)', () => {

        test('structural junction (2+ FK, no extra fields) → isJunction=true → должен получить manifest: manyToMany', () => {
            // Mirror TaskTagMap shape: 2 FK + base fields only → structural junction.
            const taskTagMap = makeModel('TaskTagMap', [
                makeField('id', 'UuidValue?'),
                makeField('userId', 'int'),
                makeField('customerId', 'UuidValue'),
                makeField('isDeleted', 'bool'),
                makeField('createdAt', 'DateTime'),
                makeField('lastModified', 'DateTime'),
                makeField('taskId', 'UuidValue', { isRelation: true, relatedModel: 'task' }),
                makeField('tagId', 'UuidValue', { isRelation: true, relatedModel: 'tag' }),
            ]);
            const analysis = JunctionDetector.analyze(taskTagMap);
            assert.strictEqual(analysis.isJunction, true, 'TaskTagMap shape — structural junction');
            assert.strictEqual(analysis.reason, 'structural');
            // Этот результат → generator uses manifest: manyToMany template →
            // task_tag_map_local_apply.dart (NO guard).
        });

        test('regular entity (1 FK + business fields) → isJunction=false → должен получить manifest: entity', () => {
            // Mirror Task shape: 1 FK + extra business field (title) → regular entity.
            const task = makeModel('Task', [
                makeField('id', 'UuidValue?'),
                makeField('userId', 'int'),
                makeField('customerId', 'UuidValue'),
                makeField('isDeleted', 'bool'),
                makeField('createdAt', 'DateTime'),
                makeField('lastModified', 'DateTime'),
                makeField('title', 'String'),
                makeField('categoryId', 'UuidValue', { isRelation: true, relatedModel: 'category' }),
            ]);
            const analysis = JunctionDetector.analyze(task);
            assert.strictEqual(analysis.isJunction, false, 'Task shape — regular entity (1 FK + business field)');
            // Этот результат → generator uses manifest: entity template →
            // category_local_apply.dart shape (WITH guard).
        });

        test('2-FK entity с business field → isJunction=false → guard present', () => {
            // Edge case: entity с 2 FK НО ALSO business field → не junction (structural
            // detection требует no extra business fields). Защищает от false positive
            // на manifest selection.
            const orderItem = makeModel('OrderItem', [
                makeField('id', 'UuidValue?'),
                makeField('userId', 'int'),
                makeField('customerId', 'UuidValue'),
                makeField('isDeleted', 'bool'),
                makeField('createdAt', 'DateTime'),
                makeField('lastModified', 'DateTime'),
                makeField('quantity', 'int'),  // ← business field
                makeField('orderId', 'UuidValue', { isRelation: true, relatedModel: 'order' }),
                makeField('productId', 'UuidValue', { isRelation: true, relatedModel: 'product' }),
            ]);
            const analysis = JunctionDetector.analyze(orderItem);
            assert.strictEqual(
                analysis.isJunction,
                false,
                'OrderItem с business field (quantity) НЕ должен classify как junction',
            );
            // Этот результат → generator uses manifest: entity → guard present →
            // LWW protection активна для operational entity с FK.
        });
    });

    suite('Live template regression (disk-dependent, optional)', () => {
        // Если шаблон simplified доступен на disk — сверяем что live content
        // соответствует ожиданиям. Скип если disk недоступен (CI без шаблонов).

        for (const [entity, filePath] of Object.entries(LIVE_NON_JUNCTION_PATHS)) {
            test(`${entity}: live template содержит LWW guard (non-junction protected)`, function () {
                if (!fs.existsSync(filePath)) {
                    (this as Mocha.Context).skip();
                    return;
                }
                const content = fs.readFileSync(filePath, 'utf-8');
                assert.ok(
                    hasLwwGuard(content),
                    `live ${path.basename(filePath)}: LWW guard отсутствует или сломан. ` +
                    `Возможно регрессия TASK-028 patch?`,
                );
                assert.strictEqual(
                    countGuards(content),
                    1,
                    `live ${path.basename(filePath)}: expected exactly 1 guard, ` +
                    `got ${countGuards(content)}. Дубль? Удалён?`,
                );
            });
        }

        test('task_tag_map_local_apply.dart: live junction template НЕ содержит guard', function () {
            if (!fs.existsSync(LIVE_JUNCTION_PATH)) {
                (this as Mocha.Context).skip();
                return;
            }
            const content = fs.readFileSync(LIVE_JUNCTION_PATH, 'utf-8');
            assert.ok(
                !hasLwwGuard(content),
                `live ${path.basename(LIVE_JUNCTION_PATH)}: junction template НЕ должен ` +
                `содержать guard (LWW неприменим). Случайный patch на junction?`,
            );
            assert.strictEqual(
                countGuards(content),
                0,
                `live junction template должен иметь 0 guards`,
            );
        });
    });

    suite('Live template regression t115 (TASK-031, disk-dependent, optional)', () => {
        // Если t115 template доступен на disk — сверяем что Bug 3 LWW guard
        // patched идентично simplified (TASK-028 pattern). Скип если disk
        // недоступен (CI без шаблонов). Junction (task_tag_map, manifest:
        // manyToMany) — opt-out, без guard (parallel simplified invariant).

        for (const [entity, filePath] of Object.entries(LIVE_T115_NON_JUNCTION_PATHS)) {
            test(`t115/${entity}: live template содержит LWW guard (TASK-031 parity)`, function () {
                if (!fs.existsSync(filePath)) {
                    (this as Mocha.Context).skip();
                    return;
                }
                const content = fs.readFileSync(filePath, 'utf-8');
                assert.ok(
                    hasLwwGuard(content),
                    `live t115 ${path.basename(filePath)}: LWW guard отсутствует или сломан. ` +
                    `Возможно регрессия TASK-031 patch?`,
                );
                assert.strictEqual(
                    countGuards(content),
                    1,
                    `live t115 ${path.basename(filePath)}: expected exactly 1 guard, ` +
                    `got ${countGuards(content)}. Дубль? Удалён?`,
                );
            });
        }

        test('t115/task_tag_map_local_apply.dart: live junction template НЕ содержит guard', function () {
            if (!fs.existsSync(LIVE_T115_JUNCTION_PATH)) {
                (this as Mocha.Context).skip();
                return;
            }
            const content = fs.readFileSync(LIVE_T115_JUNCTION_PATH, 'utf-8');
            assert.ok(
                !hasLwwGuard(content),
                `live t115 ${path.basename(LIVE_T115_JUNCTION_PATH)}: junction template ` +
                `НЕ должен содержать guard (LWW неприменим). Случайный patch на junction?`,
            );
            assert.strictEqual(
                countGuards(content),
                0,
                `live t115 junction template должен иметь 0 guards`,
            );
        });
    });
});
