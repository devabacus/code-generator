# TASK-025 Report — Bug 4: Riverpod `ref.mounted` guard в state_providers

**Status:** Ready for multi-agent review + commit. NOT committed, NOT pushed.

**Branch:** `feature/TASK-025-bug-4-riverpod-ref-mounted` (rebased onto master `bffe07a` post-TASK-030 merge).

**Closes:** [BUG-001](../../../bug-reports/001-state-provider-ref-disposed.md) (Open → Resolved).

**Verify result on t186 (post-TASK-030 master):** ✅ **PASS errors=0, warnings=0, infos=30** (Total 39887ms).

---

## Summary

Template-only patch + unit test suite, закрывающий BUG-001 (production-blocker UI). В каждом сгенерированном `*_state_providers.dart` (simplified template, 4 файла) для каждого `add<Entity>` / `update<Entity>` / `delete<Entity>` метода:

```dart
// BEFORE (BUG-001 anti-pattern):
state = await AsyncValue.guard(() async { ... });

// AFTER (TASK-025 fix):
final result = await AsyncValue.guard(() async { ... });
if (!ref.mounted) return;
state = result;
```

Stack-lock invariant (Discussion #11) preserved — Riverpod через `@riverpod` annotations, никаких изменений в архитектуре, только idiom patch внутри методов notifier'а. t115 шаблон НЕ trog'ался (frozen / deprecated path).

## Implementation diff

### Template (outside repo, не tracked git'ом) — 4 файла, 11 mutation методов

`G:/Templates/flutter/simplified/simplified_flutter/lib/features/tasks/presentation/providers/<entity>/<entity>_state_providers.dart`:

- `category/category_state_providers.dart` — 3 mutation (addCategory / updateCategory / deleteCategory)
- `task/task_state_providers.dart` — 3 mutation (addTask / updateTask / deleteTask)
- `tag/tag_state_providers.dart` — 3 mutation (addTag / updateTag / deleteTag)
- `task_tag_map/task_tag_map_state_providers.dart` — 2 mutation (addTag / removeTag); `state = const AsyncValue.loading();` pre-await **сохранён** (синхронный, не race-condition)
- `configuration/configuration_state_providers.dart` — **skip** (verified: только stream `configurationsStream(Ref ref)`, 18 строк, 0 mutation методов)

**Sibling scope verification** (M3 / F4 evidence trail post multi-agent review):
- `simplified_flutter/lib/features/auth/.../auth_state_providers.dart` — verified stream-only, skip per scope (out-of-tasks-feature)
- `simplified_admin/lib/features/auth/.../auth_state_providers.dart` — verified stream-only, skip per scope
- Глобальный grep `state = await AsyncValue.guard` по всему `G:/Templates/flutter/simplified/` → **0 matches** (anti-pattern fully eliminated в simplified template).

**Total 11 guards** добавлено в шаблон (3+3+3+2).

### Repo (git tracked)

```
git status post-rebase + pop:
 modified:   ai/tasks/active/TASK-025-bug-4---.../task.md        (журнал + статусы)
 modified:   ai/docs/status.md                                    (TASK-025 row → ready, TASK-026..029 → blocked на TASK-025 merge)
 modified:   ai/bug-reports/001-state-provider-ref-disposed.md   (Open → Resolved + closure section)
 Untracked:  src/test/generators/state_providers_ref_mounted_test.ts  (новый, 432 строк, 9 тестов)
 Untracked:  ai/tasks/active/TASK-025-bug-4---.../report.md      (этот файл)
 Untracked:  tmp/cargo_type_yaml/                                 (yamls для e2e verify, exclude from PR)
```

### Test suite (9 новых тестов в 3 suite'ах)

`src/test/generators/state_providers_ref_mounted_test.ts` (432 строк):

| Suite | Tests | Что проверяет |
|---|---|---|
| Pre-substitution shape (inline golden) | 3 | guards count + state=result count + 0 anti-pattern + canonical ordering (guard перед state=result) на inline копиях patched templates |
| Post-substitution invariant (ReplacingFileProcessor) | 2 | прогон через `getDictionaryRules(['common','entity'])` с Category→Order и Category→Widget — guards survive substitution; `ref.mounted` / `result` / `state` literals не повреждаются substitution rules |
| Live template regression (disk-dependent) | 4 | читают `G:/Templates/flutter/simplified/.../<entity>_state_providers.dart`, assert guard count == expected; skip через `this.skip()` если disk недоступен (CI без шаблонов) |

Helpers: `countGuards()`, `countStateResultAssignments()`, `countUnguardedStateGuards()` — regex-based counters.

## Regression baseline (pre-verify)

```
[tsc -p ./] /g/SDKs/nodejs/node.exe node_modules/typescript/bin/tsc -p ./
→ EXIT=0 (silent)

[mocha workaround] /g/SDKs/nodejs/node.exe node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"
→ 190 passing (45ms)
  Baseline 181 (post-TASK-024) + 9 new TASK-025 tests = 190 total, 0 regressions, 0 failures

[eslint] /g/SDKs/nodejs/node.exe node_modules/eslint/bin/eslint.js src --ext ts
→ EXIT=0 — 18 problems (0 errors, 18 warnings)
  Все warnings pre-existing (curly rule on existing files); state_providers_ref_mounted_test.ts чист
```

## E2E DoD verify (t186, post-TASK-030 master `bffe07a`)

### Step 1 — create-project (~3.4 min)

```
[create-project] /g/SDKs/nodejs/node.exe out/adapters/cli/index.js create-project --name t186 --template simplified --human
→ Duration: 201403ms
→ EXIT=0
→ pubspec carries: custom_lint: ^0.8.0  (TASK-030 caret fix landed correctly)
→ Completeness check: t186_admin/ ✓, t186_flutter/lib/core/sync/ ✓, t186_flutter/lib/features/configuration/ ✓, t186_server/ ✓
```

Simplified default scaffolding минимальный (Configuration baseline only, no auto Task/Tag/Category — intentional per Discussion #12 default-revert).

### Step 2 — generate-entity (cargo_type, multi-word entity)

YAML:

```yaml
class: CargoType
table: cargo_type
fields:
  id: UuidValue?, defaultPersist=random_v7
  userId: int
  customerId: UuidValue, relation(parent=customer, onDelete=Cascade)
  createdAt: DateTime
  lastModified: DateTime
  isDeleted: bool, default=false
  name: String
```

Copy `tmp/cargo_type_yaml/*.spy.yaml` → `t186_server/lib/src/models/cargo_type/`.

```
[generate-entity] /g/SDKs/nodejs/node.exe out/adapters/cli/index.js generate-entity \
  --yaml .../t186_server/lib/src/models/cargo_type/cargo_type.spy.yaml \
  --feature-path .../t186_flutter/lib/features/cargo_type \
  --workspace .../t186 \
  --template simplified --human
→ Duration: 86ms
→ EXIT=0
→ SUCCESS: 19 created + 2 modified (sync_orchestrator_provider.dart + database.dart)
→ Stderr noise: 2× [SectionReplacer] Generator function not found for name: base
   (known diagnostic per CLAUDE.md, не блокер)
```

### Step 3 — grep evidence (functional correctness)

```
$ grep -c "if (!ref.mounted) return;" .../t186_flutter/lib/features/cargo_type/presentation/providers/cargo_type/cargo_type_state_providers.dart
3
$ grep -c "state = result;" .../cargo_type_state_providers.dart
3
$ grep -c "state = await AsyncValue.guard" .../cargo_type_state_providers.dart
0
```

**3 guards == 3 mutations** (addCargoType / updateCargoType / deleteCargoType). 0 anti-pattern occurrences.

Visual confirm (`cargo_type_state_providers.dart`):

```dart
@riverpod
class CargoTypes extends _$CargoTypes {     // ← substitution Category→CargoType (sanity)
  ...
  Future<void> addCargoType(CargoTypeEntity cargoType) async {
    final result = await AsyncValue.guard(() async {
      final repository = ref.read(currentUserCargoTypeRepositoryProvider);
      if (repository == null) return <CargoTypeEntity>[];
      await repository.createCargoType(cargoType);
      return repository.getCargoTypes();
    });
    if (!ref.mounted) return;
    state = result;
  }
  // updateCargoType / deleteCargoType — identical pattern
}
```

**Multi-word ENTITY substitution Category→CargoType сохранила guards intact на всех 3 mutation точках.** End-to-end functional correctness фикса доказан на реальном generated файле (independent от inline goldens unit test'а).

### Step 4 — verify (DoD gate)

```
[verify] /g/SDKs/nodejs/node.exe out/adapters/cli/index.js verify --name t186 --human
[1/4] dart pub get (server)...
[1/4] flutter pub get (flutter)...
[2/4] serverpod generate --experimental-features=all...
[3/4] dart run build_runner build --delete-conflicting-outputs...
[4/4] flutter analyze...

PASS: verify t186
  project: G:\Projects\Flutter\serverpod\t186
  ✓ flutterAnalyze — 9802ms (errors=0, warnings=0, infos=30)
  ✓ pubGet — 6078ms
  ✓ serverpodGenerate — 13945ms
  ✓ buildRunner — 10060ms
Total: 39887ms
→ EXIT=0
```

**DoD gate ✅ PASS.** `errors=0, warnings=0, infos=30` (infos — известные pre-existing Dart hint'ы, не TASK-025 introduced).

## Acceptance criteria checklist

- [x] В каждом `*_state_providers.dart` (4 файла в simplified) для каждого `addX` / `updateX` / `deleteX`: `if (!ref.mounted) return;` перед `state = ...`. Порядок: `final result = await AsyncValue.guard(...); if (!ref.mounted) return; state = result;`. **11 guards total.**
- [x] Junction (task_tag_map) — patched (2 mutation), `state = const AsyncValue.loading();` pre-await сохранён.
- [x] `npm run compile` clean, `npm run lint` clean (0 errors, 18 pre-existing warnings).
- [x] Golden test `src/test/generators/state_providers_ref_mounted_test.ts` — 9 тестов, все passing.
- [x] mocha workaround → **190 passing** (baseline 181 + 9 новых).
- [x] `codegen verify --name t186 --human` → **PASS errors=0, warnings=0, infos=30**. На t186 после `generate-entity` для cargo_type: grep "if (!ref.mounted) return;" → 3 occurrences = 3 mutation методов.
- [x] BUG-001 → header сменён на `## Status: Resolved (TASK-025, 2026-05-25)`, добавлена `## Resolution` section + ссылка на этот фикс.
- [x] `report.md` с реальным CLI-выводом всех шагов (этот файл).

## Stack-lock compliance (Discussion #11)

- ✅ **Riverpod через `@riverpod` annotations** — преserved, никаких изменений в hierarchy.
- ✅ **Drift conventions** — не trog'ались.
- ✅ **Clean directory layout** — преserved, patch in-place в existing файлах.
- ✅ **sync_core 0.3.0 contract** — не trog'ался.
- ✅ **13 manifest markers** — не trog'ались.
- ✅ **t115 шаблон** — НЕ trog'ался (frozen / deprecated path).

`ref.mounted` guard pattern — стандартный Riverpod 2.x idiom, документирован в Riverpod docs. Не stack change, не новый pattern — корректное use API.

## Test projects (sandbox-protected, остаются на disk)

- `G:/Projects/Flutter/serverpod/t186/` — ✅ canonical post-TASK-030 baseline (PASS errors=0, warnings=0, infos=30)
- `G:/Projects/Flutter/serverpod/t181/` — pre-TASK-030 partial evidence (verify FAIL'd на pubGet drift до TASK-030 fix)
- `G:/Projects/Flutter/serverpod/t180/` — partial bootstrap evidence (kill-mid-op gotcha first attempt)
- `G:/Projects/Flutter/serverpod/t185/` — TASK-030 canonical baseline (PASS, не TASK-025 specific)

## Multi-agent review (STOP-gate шаг 12 — pending)

⏳ **Pending** — teamlead запускает Standard + Adversarial reviewers до commit'а. Focus targets:

- **Standard:** correctness фикса pattern, completeness coverage (все 4 файла + junction edge case), unit test quality (3 suite balance + skip behavior для live disk), regression-baseline integrity.
- **Adversarial:** hidden regressions (substitution rules с collision на `state` / `result` / `ref`), scope creep (touched ли что-то помимо state_providers), missed mutation patterns (есть ли upsert/replace/bulkAdd которые тоже async + state assign), template integrity (другие сущности не сломались), BUG-001 scope (закрывает только simplified — t115 deprecated, не покрывается).

После review results — applied findings inline в этом отчёте + commit.

## Re-verify после merge (post-merge teamlead obligation)

- [ ] `git checkout master && git pull` после merge
- [ ] `codegen create-project --name t187` + `codegen verify --name t187` — подтвердить master зелёный (любой свежий create-project должен PASS errors=0).
- [ ] Grep guards в свежем `t187` state_providers — должны быть.

## Files (absolute paths)

**Outside repo (template, blast radius на все будущие `--template simplified`):**

- `G:/Templates/flutter/simplified/simplified_flutter/lib/features/tasks/presentation/providers/category/category_state_providers.dart` (3 mutation patched)
- `G:/Templates/flutter/simplified/simplified_flutter/lib/features/tasks/presentation/providers/task/task_state_providers.dart` (3 mutation patched)
- `G:/Templates/flutter/simplified/simplified_flutter/lib/features/tasks/presentation/providers/tag/tag_state_providers.dart` (3 mutation patched)
- `G:/Templates/flutter/simplified/simplified_flutter/lib/features/tasks/presentation/providers/task_tag_map/task_tag_map_state_providers.dart` (2 mutation patched, junction edge case)

**Inside repo (git tracked / staged):**

- `g:/Projects/vs_code_extensions/code-generator/src/test/generators/state_providers_ref_mounted_test.ts` (new, 432 lines, 9 tests)
- `g:/Projects/vs_code_extensions/code-generator/ai/bug-reports/001-state-provider-ref-disposed.md` (Open → Resolved + closure section)
- `g:/Projects/vs_code_extensions/code-generator/ai/docs/status.md` (TASK-025 row → ready for commit, TASK-026..029 → blocked на TASK-025)
- `g:/Projects/vs_code_extensions/code-generator/ai/tasks/active/TASK-025-.../task.md` (журнал + статусы + resume section 2026-05-25)
- `g:/Projects/vs_code_extensions/code-generator/ai/tasks/active/TASK-025-.../report.md` (этот файл)

**Excluded from commit (debug staging area):**

- `tmp/cargo_type_yaml/` — yamls для verify, можно оставить untracked (gitignore'd via `tmp/` если configured).

## Decision required from teamlead

1. После multi-agent review (Standard + Adversarial) — apply findings inline или escalate.
2. После reviewers approve — commit + PR + ждать User merge approval ("мержить").
3. Post-merge: re-verify create-project + verify на свежем t187 (per AGENTS.md mandatory post-merge check для template-touching PR).
