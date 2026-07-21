# TASK-032 — Bug 4 t115 ref.mounted guard parity

## Резюме

Применяет `ref.mounted` guard pattern (закрытый TASK-025 для simplified) к **t115 template** в 4 `*_state_providers.dart` (category/task/tag/task_tag_map). Закрывает [BUG-001](../../../bug-reports/001-state-provider-ref-disposed.md) (Riverpod `Ref` disposed after async gap → "Cannot use Ref after disposed" crash) для **t115 consumers** (weight TASK-018 migration / weight regen backlog). Это главный остаточный gap для weight readiness (выявлен TASK-031 closure 2026-05-28).

**Template-only patch + test extension, 0 generator src/ changes.** 11 guards (3+3+3+2). Inner usecase calls intact (t115 использует usecase providers, не repository как simplified).

**Result:** verify t198 PASS errors=0 (create-project baseline + generate-entity --with-server). mocha **264 passing** (+6 vs 258 post-TASK-031). Standard APPROVE + Adversarial REQUEST CHANGES → F1 (CI coverage) + F2 (report) fixed inline.

> **NB про ID:** auto-ID `new_task.py` присвоил **032** (next available). В handoff nominally "TASK-035". Actual = TASK-032. Ранее-suggested "TASK-032 Configuration legacy" / "TASK-034 pubspec comments" — nominal labels, получат реальные ID при создании.

## Изменения

### Template patch (4 файла, outside repo `G:/Templates/flutter/t115/t115_flutter/lib/features/tasks/presentation/providers/`)

| Файл | Mutations | Guards |
|---|---|---|
| `category/category_state_providers.dart` | add/update/delete | 3 |
| `task/task_state_providers.dart` | add/update/delete | 3 |
| `tag/tag_state_providers.dart` | add/update/delete | 3 |
| `task_tag_map/task_tag_map_state_providers.dart` | addTag/removeTag (junction) | 2 |

**Total 11 guards.** Junction: `state = const AsyncValue.loading();` pre-await сохранён (синхронный, не race).

### Transformation (identical TASK-025)

```dart
// BEFORE (BUG-001 anti-pattern):
Future<void> addCategory(CategoryEntity category) async {
  state = await AsyncValue.guard(() async {
    await ref.read(createCategoryUseCaseProvider)!(category);
    return ref.read(getCategoriesUseCaseProvider)!();
  });
}

// AFTER (TASK-032):
Future<void> addCategory(CategoryEntity category) async {
  final result = await AsyncValue.guard(() async {
    await ref.read(createCategoryUseCaseProvider)!(category);
    return ref.read(getCategoriesUseCaseProvider)!();
  });
  if (!ref.mounted) return;
  state = result;
}
```

⚠ **t115 inner differs from simplified:** usecase providers (`getCategoriesUseCaseProvider`) vs repository. Inner body НЕ изменён — только outer wrap.

### Repo changes (git tracked)

- **MODIFIED:** [src/test/generators/state_providers_ref_mounted.test.ts](../../../../src/test/generators/state_providers_ref_mounted.test.ts) — +6 tests:
  - Live regression t115 suite (4 disk-dependent: 3/3/3/2 guards)
  - **+ inline golden t115 (`CATEGORY_STATE_PROVIDERS_T115_PATCHED`, usecase variant) — pre-substitution shape test (CI-safe)** ← adversarial F1 fix
  - **+ post-substitution invariant t115 (Category→Order, проверяет usecase provider rename + guard survival)** ← adversarial F1 fix
- **0 src/ generator logic changes**

## Тесты

| Слой | Status | Details |
|---|---|---|
| `tsc -p ./` | ✅ clean | 0 errors |
| mocha workaround | ✅ **264 passing** | baseline 258 (post-TASK-031) + 6 TASK-032 (4 live t115 + 1 inline golden t115 + 1 post-substitution t115) |
| `npm run lint` | ✅ | 0 errors, 18 pre-existing warnings |
| grep guards (4 t115 files) | ✅ | 3/3/3/2 = 11; `state = result;` = 11; anti-pattern = 0; `loading()` junction = 2 |
| `verify --name t198 --human` (create-project baseline) | ✅ PASS | errors=0 warnings=1 infos=44 (27558ms) |
| `verify --name t198 --human` (post generate-entity Project --with-server) | ✅ PASS | errors=0 warnings=1 infos=44 (32965ms) |

### End-to-end evidence (t198)

```bash
node out/adapters/cli/index.js create-project --name t198 --template t115
# → errors=[], 217880ms

node out/adapters/cli/index.js verify --name t198 --human
# → PASS errors=0 warnings=1 infos=44

# generate-entity Project (FULL --feature-path per TASK-031 lesson) + --with-server
node out/adapters/cli/index.js generate-entity \
  --yaml .../t198_server/lib/src/models/projects/project.spy.yaml \
  --feature-path "G:/.../t198_flutter/lib/features/projects" \
  --workspace G:/.../t198 --template t115 --with-server
# → errors=[]

grep -c "if (!ref.mounted) return;" .../projects/presentation/providers/project/project_state_providers.dart
# → 3 (addProject/updateProject/deleteProject — guard preserved через Category→Project substitution)
grep -c "state = await AsyncValue.guard" .../project_state_providers.dart
# → 0

node out/adapters/cli/index.js verify --name t198 --human
# → PASS errors=0 warnings=1 infos=44
```

**Substitution preserves guard** на t115 usecase variant. End-to-end project компилируется.

### ⚠ Caveat: generate-entity без --with-server даёт 11 errors (TASK-029 interaction, не TASK-032)

Первый verify (generate-entity **без** `--with-server`) → 11 errors `The getter 'project' isn't defined for the type 'Client'` в `project_remote_data_source.dart`. Это **НЕ связано с TASK-032 patch** (state_providers — presentation layer). Причина: client-only mode (TASK-029 default OFF) пишет `project_remote_data_source.dart` который вызывает `client.project.<method>`, но server endpoint не сгенерён → serverpod generate не создаёт `client.project` getter. С `--with-server` → PASS errors=0. Documented gotcha — не bug, TASK-029 design interaction для entities с remote data source.

## Multi-agent review (Standard + Adversarial)

### Standard — APPROVE

Correctness pattern ✅ (11 guards, правильный ordering, inner intact), completeness ✅ (0 anti-pattern в t115 source), junction edge case ✅ (loading preserved), scope ✅ (Configuration/auth untouched), test quality ✅. (Не смог запустить mocha runtime из-за vscode-test mutex — но teamlead подтвердил 264 passing.)

### Adversarial — REQUEST CHANGES → 2 findings applied

| Severity | ID | Finding | Action |
|---|---|---|---|
| **HIGH** | F1 | t115 patch имеет ZERO CI coverage — все t115 assertions в Live regression suite которая `.skip()`'ается на CI (disk недоступен). simplified имеет 3 layers (inline golden + post-substitution + live); t115 имел только 1 (live disk). Регрессия t115 на disk прошла бы CI green. | **APPLIED** — добавлен inline golden `CATEGORY_STATE_PROVIDERS_T115_PATCHED` (usecase variant) + pre-substitution shape test + post-substitution invariant test (Category→Order, проверяет usecase provider rename). t115 теперь CI-protected. 264 passing. |
| **MEDIUM** | F2 | report.md = пустой template skeleton, DoD numbers не заполнены | **APPLIED** — этот report заполнен реальными числами + verify output + grep evidence |

### Validated / deferred

| Severity | ID | Finding | Disposition |
|---|---|---|---|
| LOW | F3 | `core/providers/session_manager_provider.dart` `_fetchUserContext()`: `state = userContext;` после `await ...getMyUserContext()` БЕЗ `ref.mounted` guard — same BUG-001 shape, не покрыт grep `state = await AsyncValue.guard`. **Present identically в simplified тоже** (pre-existing, не TASK-032 regression). | **DEFERRED → backlog.** Не TASK-032 scope (core/providers, не tasks state_providers). Не покрыт TASK-025 тоже. Recommend follow-up TASK для session_manager guard в обоих templates. См. "Follow-up" ниже. |
| NIT | F4 | Junction `state = loading()` sync pre-await: если disposed during await → state stuck loading | **Acceptable** — disposed notifier unobserved (rebuild on re-subscribe). Identical TASK-025 precedent. No action. |

### Adversarial verified clean

Guard transform (п.2), substitution collision (п.4 — rules key только на entity/project/junction, не `result`/`state`/`ref`/`mounted`; `targetEntity:'widget'` test covers), `.g.dart` staleness (п.6 — build_runner regenerates, verify PASS), --with-server understanding (п.7 — consistent TASK-029).

## Stack-lock compliance (Discussion #11)

✅ Riverpod `@riverpod` annotations preserved (in-place patch внутри методов)
✅ `ref.mounted` = стандартный Riverpod 2.x idiom (документирован), не stack change
✅ Clean directory layout / sync_core / Drift / 13 markers — не trognyты
✅ 0 generator src/ logic changes
✅ 0 package version changes

## Follow-up recommended (post-merge)

1. **session_manager guard** (adversarial F3, NEW): `core/providers/session_manager_provider.dart` `_fetchUserContext()` — unguarded `state = userContext` после await. **В обоих templates** (simplified + t115). Pre-existing (не TASK-025/032 introduced). Отдельный TASK для guard в core/providers обоих templates.
2. **TASK-034** (existing suggestion): t115 pubspec rotted comments symmetry sweep с TASK-030.
3. Configuration legacy paths consolidation (existing suggestion).

## Риски / Заметки

- **t198 state:** clean (verify PASS errors=0 с Project entity). Sandbox blocks delete.
- **BUG-001 теперь закрыт для обоих templates** (simplified TASK-025 + t115 TASK-032) — для tasks-feature state_providers. session_manager residual → follow-up.
- **Weight regen readiness:** TASK-032 закрывает главный остаточный gap (Bug 4 для t115). Готовность → HIGH (остаётся `:base` overwrite git-diff procedure + session_manager follow-up).
- **t115 template changes — outside repo** (`devabacus/t115`), commit отдельно как TASK-031.
- **Adversarial review value 12-й precedent:** REQUEST CHANGES поймал HIGH CI-blindspot (t115 zero coverage) — тот же класс gap что TASK-026 meta-bug (.test.ts). Standard alone бы approved. Pattern continues.

## Статус

Ready for review.
