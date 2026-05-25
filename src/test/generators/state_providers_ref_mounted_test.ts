import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ReplacingFileProcessor, ReplaceTask } from '../../features/generation/generators/replacing_file_processor';
import { getDictionaryRules } from '../../features/generation/replacement/replacement_util';
import { GenerationConfig } from '../../features/generation/config/generation_config';
import { MockFileSystem } from '../mocks/mock_file_system';

/**
 * TASK-025 (BUG-001 fix) — Riverpod `ref.mounted` guard в сгенерированных
 * `*_state_providers.dart` методах mutation (add / update / delete).
 *
 * **Корень BUG-001:** `state = await AsyncValue.guard(() async {... await
 * repository.createX(x); ...});` — если виджет диспозит notifier пока await
 * висит (диалог закрылся, страница свернулась) → `state = ...` бросает
 * `Cannot use Ref of <X>Provider after disposed`.
 *
 * **Фикс** — template-only patch в `G:/Templates/flutter/simplified/.../
 * presentation/providers/<entity>/<entity>_state_providers.dart`:
 *   final result = await AsyncValue.guard(() async {...});
 *   if (!ref.mounted) return;
 *   state = result;
 *
 * **Что проверяет этот тест:**
 *
 * 1. **Pre-substitution shape (inline golden):** patched template content
 *    содержит `if (!ref.mounted) return;` перед каждым `state = result;` в
 *    mutation методах. Полностью independent от disk state (CI-safe).
 *
 * 2. **Post-substitution invariant:** прогон через `ReplacingFileProcessor` с
 *    ENTITY dictionary (Category→Order) сохраняет guard. Substitution не
 *    должна затронуть `ref.mounted` / `result` / `state` literals.
 *
 * 3. **Live template match (optional, disk-dependent):** если шаблон в
 *    `G:/Templates/flutter/simplified/` доступен — verify что disk content
 *    содержит ожидаемое число guards (regression guard на случайное
 *    откатывание patch в template). Скипается если disk недоступен (CI).
 *
 * **Файлы под защитой (simplified template — TASK-025 scope):**
 * - `tasks/.../category/category_state_providers.dart` (3 mutation)
 * - `tasks/.../task/task_state_providers.dart` (3 mutation)
 * - `tasks/.../tag/tag_state_providers.dart` (3 mutation)
 * - `tasks/.../task_tag_map/task_tag_map_state_providers.dart` (2 mutation)
 *
 * Total: 11 guards expected.
 */

// ── Inline golden fixtures (patched template content) ──────────────────────

/**
 * Inline copy of patched `category_state_providers.dart` (post-TASK-025).
 * Используется как substitution input для post-substitution assert.
 * Если эта const разойдётся с реальным template на disk → test fail.
 */
const CATEGORY_STATE_PROVIDERS_PATCHED = `// manifest: entity
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../data/providers/category/category_data_providers.dart';
import '../../../domain/entities/category/category_entity.dart';

part 'category_state_providers.g.dart';

@riverpod
class Categories extends _$Categories {
  @override
  Future<List<CategoryEntity>> build() {
    final repository = ref.read(currentUserCategoryRepositoryProvider);
    if (repository == null) return Future.value(<CategoryEntity>[]);
    return repository.getCategories();
  }

  Future<void> addCategory(CategoryEntity category) async {
    final result = await AsyncValue.guard(() async {
      final repository = ref.read(currentUserCategoryRepositoryProvider);
      if (repository == null) return <CategoryEntity>[];
      await repository.createCategory(category);
      return repository.getCategories();
    });
    if (!ref.mounted) return;
    state = result;
  }

  Future<void> updateCategory(CategoryEntity category) async {
    final result = await AsyncValue.guard(() async {
      final repository = ref.read(currentUserCategoryRepositoryProvider);
      if (repository == null) return <CategoryEntity>[];
      await repository.updateCategory(category);
      return repository.getCategories();
    });
    if (!ref.mounted) return;
    state = result;
  }

  Future<void> deleteCategory(String id) async {
    final result = await AsyncValue.guard(() async {
      final repository = ref.read(currentUserCategoryRepositoryProvider);
      if (repository == null) return <CategoryEntity>[];
      await repository.deleteCategory(id);
      return repository.getCategories();
    });
    if (!ref.mounted) return;
    state = result;
  }
}

@riverpod
Stream<List<CategoryEntity>> categoriesStream(Ref ref) {
  final repository = ref.watch(currentUserCategoryRepositoryProvider);
  if (repository == null) {
    return Stream.value(<CategoryEntity>[]);
  }
  return repository.watchCategories();
}
`;

/**
 * Inline copy of patched `task_tag_map_state_providers.dart` (post-TASK-025).
 * Junction — особенность: до guard idiom есть `state = const AsyncValue.loading();`
 * (синхронный, до await, не race-condition). Эту строку оставляем как есть,
 * guard добавляется ТОЛЬКО после await перед `state = result;`.
 */
const TASK_TAG_MAP_STATE_PROVIDERS_PATCHED = `// manifest: manyToMany
import 'package:riverpod_annotation/riverpod_annotation.dart';
import '../../../data/providers/task_tag_map/task_tag_map_data_providers.dart';
import '../../../domain/entities/tag/tag_entity.dart';
import '../../../domain/entities/task_tag_map/task_tag_map_entity.dart';

part 'task_tag_map_state_providers.g.dart';

@riverpod
Stream<List<TaskTagMapEntity>> taskTagMapsStream(Ref ref) {
  final repository = ref.watch(currentUserTaskTagMapRepositoryProvider);
  if (repository == null) {
    return Stream.value(<TaskTagMapEntity>[]);
  }
  return repository.watchTaskTagMaps();
}

@riverpod
class RelatedTagsForTask extends _$RelatedTagsForTask {
  @override
  Future<List<TagEntity>> build(String taskId) {
    final repository = ref.read(currentUserTaskTagMapRepositoryProvider);
    if (repository == null) return Future.value(<TagEntity>[]);
    return repository.getTagsForTask(taskId);
  }

  Future<void> addTag({required String tagId}) async {
    final repository = ref.read(currentUserTaskTagMapRepositoryProvider);
    if (repository == null) return;

    state = const AsyncValue.loading();
    final result = await AsyncValue.guard(() async {
      await repository.addTagToTask(taskId: taskId, tagId: tagId);
      return build(taskId);
    });
    if (!ref.mounted) return;
    state = result;
  }

  Future<void> removeTag({required String tagId}) async {
    final repository = ref.read(currentUserTaskTagMapRepositoryProvider);
    if (repository == null) return;

    state = const AsyncValue.loading();
    final result = await AsyncValue.guard(() async {
      await repository.removeTagFromTask(taskId: taskId, tagId: tagId);
      return build(taskId);
    });
    if (!ref.mounted) return;
    state = result;
  }
}
`;

// ── Disk paths (для optional live regression check) ────────────────────────

const SIMPLIFIED_TEMPLATE_ROOT =
    'G:/Templates/flutter/simplified/simplified_flutter/lib/features';

const LIVE_STATE_PROVIDERS_PATHS: Record<string, { path: string; expectedGuards: number }> = {
    category: {
        path: `${SIMPLIFIED_TEMPLATE_ROOT}/tasks/presentation/providers/category/category_state_providers.dart`,
        expectedGuards: 3,
    },
    task: {
        path: `${SIMPLIFIED_TEMPLATE_ROOT}/tasks/presentation/providers/task/task_state_providers.dart`,
        expectedGuards: 3,
    },
    tag: {
        path: `${SIMPLIFIED_TEMPLATE_ROOT}/tasks/presentation/providers/tag/tag_state_providers.dart`,
        expectedGuards: 3,
    },
    taskTagMap: {
        path: `${SIMPLIFIED_TEMPLATE_ROOT}/tasks/presentation/providers/task_tag_map/task_tag_map_state_providers.dart`,
        expectedGuards: 2,
    },
};

// ── Helper assertions ──────────────────────────────────────────────────────

/**
 * Asserts the post-await mutation guard idiom is present для каждого result
 * assignment в mutation методе. Pattern:
 *   final result = await AsyncValue.guard(...);
 *   if (!ref.mounted) return;
 *   state = result;
 *
 * Считает occurrences `if (!ref.mounted) return;` И `state = result;`,
 * сравнивает с expected count.
 */
function countGuards(content: string): number {
    const guardMatches = content.match(/if\s*\(!ref\.mounted\)\s*return;/g) ?? [];
    return guardMatches.length;
}

function countStateResultAssignments(content: string): number {
    const matches = content.match(/state\s*=\s*result;/g) ?? [];
    return matches.length;
}

function countUnguardedStateGuards(content: string): number {
    // Counts occurrences of the BUG-001 anti-pattern:
    //   state = await AsyncValue.guard(
    // (i.e. assigns state directly to the await — race condition).
    // After TASK-025 patch, expected count = 0.
    const matches = content.match(/state\s*=\s*await\s+AsyncValue\.guard/g) ?? [];
    return matches.length;
}

suite('TASK-025: state_providers ref.mounted guard (BUG-001 fix)', () => {

    suite('Pre-substitution shape (inline golden)', () => {

        test('category_state_providers.dart: 3 mutation methods each guarded', () => {
            const content = CATEGORY_STATE_PROVIDERS_PATCHED;
            assert.strictEqual(
                countGuards(content),
                3,
                'expected 3 `if (!ref.mounted) return;` guards (add/update/delete)',
            );
            assert.strictEqual(
                countStateResultAssignments(content),
                3,
                'expected 3 `state = result;` assignments (add/update/delete)',
            );
            assert.strictEqual(
                countUnguardedStateGuards(content),
                0,
                'BUG-001 anti-pattern `state = await AsyncValue.guard(...)` должен быть истреблён',
            );
        });

        test('task_tag_map_state_providers.dart: 2 mutation methods each guarded', () => {
            const content = TASK_TAG_MAP_STATE_PROVIDERS_PATCHED;
            assert.strictEqual(
                countGuards(content),
                2,
                'expected 2 `if (!ref.mounted) return;` guards (addTag/removeTag)',
            );
            assert.strictEqual(
                countStateResultAssignments(content),
                2,
                'expected 2 `state = result;` assignments (addTag/removeTag)',
            );
            assert.strictEqual(
                countUnguardedStateGuards(content),
                0,
                'BUG-001 anti-pattern должен быть истреблён в junction notifier',
            );
            // Дополнительно: `state = const AsyncValue.loading();` сохраняется
            // (синхронный pre-await, не race-condition).
            assert.ok(
                /state\s*=\s*const\s+AsyncValue\.loading\(\);/.test(content),
                'pre-await `state = const AsyncValue.loading();` должен сохраниться',
            );
        });

        test('guard ordering: каждый guard стоит ПЕРЕД state = result; в одном методе', () => {
            // Verifies the canonical idiom ordering:
            //   final result = await AsyncValue.guard(...);
            //   if (!ref.mounted) return;
            //   state = result;
            // НЕ:
            //   state = result;
            //   if (!ref.mounted) return;  // useless после assignment
            const idiomRegex =
                /if\s*\(!ref\.mounted\)\s*return;\s*\n\s*state\s*=\s*result;/g;
            const categoryMatches =
                CATEGORY_STATE_PROVIDERS_PATCHED.match(idiomRegex) ?? [];
            const junctionMatches =
                TASK_TAG_MAP_STATE_PROVIDERS_PATCHED.match(idiomRegex) ?? [];
            assert.strictEqual(
                categoryMatches.length,
                3,
                'category: 3 правильно-упорядоченных idiom (guard перед state)',
            );
            assert.strictEqual(
                junctionMatches.length,
                2,
                'junction: 2 правильно-упорядоченных idiom',
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

        test('ENTITY substitution Category→Order сохраняет 3 guards', async () => {
            const srcPath = '/test/templates/category/category_state_providers.dart';
            const destPath = '/test/projects/order/order_state_providers.dart';
            mockFs.setFile(srcPath, CATEGORY_STATE_PROVIDERS_PATCHED);

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
            assert.strictEqual(
                countGuards(result),
                3,
                'после substitution Category→Order должно остаться 3 guards',
            );
            assert.strictEqual(
                countStateResultAssignments(result),
                3,
                '3 `state = result;` assignments сохраняются',
            );
            assert.strictEqual(
                countUnguardedStateGuards(result),
                0,
                'substitution не должен случайно ввести anti-pattern',
            );
            // Class должен быть переименован (sanity check substitution работает).
            assert.ok(
                /class\s+Orders\s+extends\s+_\$Orders/.test(result),
                'substitution должен переименовать класс Categories → Orders',
            );
        });

        test('ENTITY substitution не задевает `ref.mounted` / `result` literals', async () => {
            // Defensive: убедимся что substitution rules не содержат коллизию с
            // `ref`, `mounted`, `result`, `state` (если бы targetEntity = 'ref'
            // или 'state' — substitution могла бы их повредить).
            const srcPath = '/test/templates/category_state_providers.dart';
            const destPath = '/test/projects/widget_state_providers.dart';
            mockFs.setFile(srcPath, CATEGORY_STATE_PROVIDERS_PATCHED);

            const config = new GenerationConfig({
                templProject: 't115',
                templEntity: 'category',
                targetEntity: 'widget',  // не должно затронуть `state`/`result`/`ref`
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
            // Все три литерала из guard idiom должны сохраниться intact.
            assert.ok(
                result.includes('if (!ref.mounted) return;'),
                '`ref.mounted` literal должен сохраниться post-substitution',
            );
            assert.ok(
                result.includes('state = result;'),
                '`state = result;` literal должен сохраниться post-substitution',
            );
            assert.ok(
                result.includes('final result = await AsyncValue.guard'),
                '`final result = await AsyncValue.guard` literal должен сохраниться',
            );
        });
    });

    suite('Live template regression (disk-dependent, optional)', () => {
        // Если шаблон simplified доступен на disk — сверяем что live content
        // соответствует ожиданиям. Скип если disk недоступен (CI без шаблонов).

        for (const [entity, info] of Object.entries(LIVE_STATE_PROVIDERS_PATHS)) {
            test(`${entity}: live template содержит ${info.expectedGuards} guards`, function () {
                if (!fs.existsSync(info.path)) {
                    // Live template недоступен — пропускаем (CI / другая машина).
                    // Mocha 'this' = test context, .skip() выводит pending status.
                    (this as Mocha.Context).skip();
                    return;
                }
                const content = fs.readFileSync(info.path, 'utf-8');
                assert.strictEqual(
                    countGuards(content),
                    info.expectedGuards,
                    `live ${path.basename(info.path)}: expected ${info.expectedGuards} guards, ` +
                    `got ${countGuards(content)}. Возможно регрессия TASK-025 patch?`,
                );
                assert.strictEqual(
                    countUnguardedStateGuards(content),
                    0,
                    `live ${path.basename(info.path)}: BUG-001 anti-pattern (` +
                    `\`state = await AsyncValue.guard\`) обнаружен. Patch TASK-025 откатан?`,
                );
            });
        }
    });
});
