# TASK-028 — Bug 3: LWW skip-stale guard default ON в simplified template

## Резюме

Закрывает [Bug 3](../../../bug-reports/) из 5-task пакета (TASK-019 weight handoff). Template-only patch в 4 `*_local_apply.dart` файлах simplified template — добавляет **LWW skip-stale guard** на pull-apply pipeline, защищающий от silent data corruption на cross-device pull (server stale event перезаписывал local unsynced fresher edit). Junction template (`task_tag_map_local_apply.dart`, manifest: manyToMany) — opt-out, без guard (PK-pair UPSERT/DELETE, LWW неприменим).

**Подход A (manifest split) выбран** вместо section-marker (Подход B) — templates физически разделены по manifest tag (`entity` vs `manyToMany`), generator уже фильтрует по manifest → `0 src/ changes`, чисто template patch.

**3 adversarial reviewers** (Q5 User decision — повышенный bar для data-integrity) выявили 1 CRITICAL + 7 HIGH findings; решения по каждому в секции "Findings table" ниже.

## Изменения

### Template patch (4 файла, outside repo: `G:/Templates/flutter/simplified/`)

1. `simplified_flutter/lib/features/tasks/data/adapters/category/category_local_apply.dart` — **single source** emission для `generate-entity --template simplified` flow
2. `simplified_flutter/lib/features/tasks/data/adapters/task/task_local_apply.dart` — fixture consistency
3. `simplified_flutter/lib/features/tasks/data/adapters/tag/tag_local_apply.dart` — fixture consistency
4. `simplified_flutter/lib/features/configuration/data/adapters/configuration/configuration_local_apply.dart` — singleton baseline (manifest: startProject); docstring documents **partial protection** (см. known limitation 1 ниже)

### Junction (intentionally NOT patched)

5. `simplified_flutter/lib/features/tasks/data/adapters/task_tag_map/task_tag_map_local_apply.dart` — manifest: manyToMany, opt-out

### Repo changes

- **NEW:** [src/test/generators/local_apply_lww_guard.test.ts](../../../../src/test/generators/local_apply_lww_guard.test.ts) — 15 unit tests, 4 suites
- **0 src/ generator logic changes**

## Guard pattern (final)

```dart
if (ctx is SyncPullApplyContext) {
  final local = await _dao.getCategoryById(
    serverEntity.id,
    userId: serverEntity.userId,
    customerId: serverEntity.customerId,
  );
  if (local != null &&
      local.syncStatus == SyncStatus.local &&
      local.lastModified.isAfter(serverEntity.lastModified)) {
    return; // локальная несинхронизированная версия новее — skip
  }
}
```

## ⚠ Deviation от task.md acceptance — обосновано

Task.md строки 27, 73, 90 говорят использовать **`ctx.sourceTimestamp`** в LWW comparison. Patch использует **`serverEntity.lastModified`**. Обоснование:

1. **Contract correctness:** [sync_apply_context.dart:73](../../../../../../Flutter/Packages/sync_core/lib/src/contracts/sync_apply_context.dart#L73) — `SyncPullApplyContext.sourceTimestamp: DateTime?` (**nullable**, "NULL если backend не возвращает per-entity timestamp"). Guard со `ctx.sourceTimestamp` стал бы **no-op в null cases** → silent data corruption всё равно происходит.
2. **Batch watermark, не per-entity:** Adversarial Reviewer 1 (MEDIUM-2) проверил `sync_orchestrator.dart:814` — `sourceTimestamp: watermark` это **checkpoint advance time**, общий для всего batch'а pull entities. Per-entity LWW comparison требует per-entity timestamp.
3. **Hard-required field:** `serverEntity.lastModified` — всегда non-null (6-field invariant), server-stamped per ADR-0005 §4.3 best practice.
4. **Weight precedent:** [weighing_local_apply.dart:55](../../../../../../Flutter/serverpod/weight/weight_flutter/lib/features/weighing/data/adapters/weighing/weighing_local_apply.dart#L55) — production-equivalent reference impl использует **identical pattern** (`serverEntity.lastModified`).

Task.md acceptance text spec был неточен — patch следует actual contract.

## Тесты

| Слой | Status | Details |
|---|---|---|
| `tsc -p ./` | ✅ clean | 0 errors |
| mocha workaround | ✅ **233 passing** | baseline 218 + **15 TASK-028** новых (was: + 0 failing) |
| `npm run lint` | ✅ | 0 errors, 18 warnings (все pre-existing) |
| `verify --name t193 --human` (post create-project) | ✅ PASS | `flutterAnalyze errors=0 warnings=0 infos=30` (78s) |
| `verify --name t193 --human` (post generate-entity Project) | ✅ PASS | `flutterAnalyze errors=0 warnings=0 infos=30` (33s) |
| `verify --name t193 --human` (post Configuration docstring fix) | ✅ PASS | `flutterAnalyze errors=0 warnings=0 infos=30` (26s) |

### Unit test suites (15 cases в `local_apply_lww_guard.test.ts`)

- **Pre-substitution shape (inline golden):** 5 tests — guard literal presence, `serverEntity.lastModified` vs `ctx.sourceTimestamp` contract check, ordering, junction absent, manifest split
- **Post-substitution invariant (ReplacingFileProcessor):** 2 tests — Category→Order сохраняет guard, defensive sync_core literal survival
- **JunctionDetector consistency:** 3 tests — structural junction → manifest: manyToMany, regular → entity, 2-FK с business field → не junction
- **Live template regression (disk-dependent):** 5 tests — 4 non-junction + 1 junction, skips на CI если template недоступен

### Live grep evidence на t193

- `t193/.../configuration/.../configuration_local_apply.dart:38,45,46` — guard literally present (Configuration baseline copy)
- `t193/.../projects/.../project_local_apply.dart:45-54` — substitution Category→Project preserved guard intact (proves generate-entity flow)
- `t193/.../task_tag_map/...` — N/A (simplified create-project не emit'ит tasks fixture по умолчанию; junction coverage через unit tests)

### Runtime smoke — Option B chosen (cite weight precedent)

Per task.md шаг 17 STOP-gate User decision: skip Dart-level runtime integration test, document logical reasoning + weight precedent:

1. **Identity pattern** с weight reference impl ([weighing_local_apply.dart:47-58](../../../../../../Flutter/serverpod/weight/weight_flutter/lib/features/weighing/data/adapters/weighing/weighing_local_apply.dart#L47-L58)) — production-equivalent
2. **Compile-time gate** verify PASS — all types resolve, sealed class pattern matching standard
3. **Trivial Dart semantics:** `if (A && B && C) return;` — no novel runtime logic
4. **Coverage уже достигнут** unit tests' literal pattern + substitution preservation + junction opt-out + JunctionDetector consistency

## 3 adversarial reviewers — findings table

Q5 User decision: 3 adversarial reviewers (vs standard 2) для повышенного bar data-integrity changes.

### Applied / addressed pre-commit

| Severity | Source | Finding | Action |
|---|---|---|---|
| HIGH-2 (Rev 1) | Reviewer 1 | Configuration "singleton" claim misleading — composite group+key lookup | **APPLIED** — docstring rewrite в `configuration_local_apply.dart` documents partial protection |

### Validated as false alarms / defensive coverage already in place

| Source | Finding | Validation |
|---|---|---|
| MEDIUM-2 (Rev 1) | Deviation `serverEntity.lastModified` vs `ctx.sourceTimestamp` рассмотрен | Reviewer 1 **REINFORCED** наш выбор — `sourceTimestamp` = batch watermark в `sync_orchestrator.dart:814`, не per-entity. Deviation обоснована. |
| H-3 (Rev 2) | Substitution edge case targetEntity=`LocalLog`/`Apply`/`Status` затрагивает guard literals | **FALSE ALARM.** ENTITY rules заменяют только `category` (template entity), НЕ generic substrings `local`/`apply`/`status`. Unit test "ENTITY substitution не задевает sync_core literals" (Category→Widget) — PASS, доказывает invariant. |
| L4 (Rev 3) | Filename convention `.test.ts` (dot prefix) check | ✅ PASS — `local_apply_lww_guard.test.ts`, compiled `out/test/generators/local_apply_lww_guard.test.js`, matches mocha glob. |

### Deferred — known limitations / out-of-scope (require follow-up TASKs)

| Severity | Source | Finding | Rationale for deferral |
|---|---|---|---|
| **C-1 (Rev 2)** | Reviewer 2 | Configuration `configuration_local_data_source.dart:92-113` — `handleSyncEvent` + `insertOrUpdateFromServer` legacy methods делают unguarded UPSERT bypass LocalApply | **OUT-OF-SCOPE TASK-028** per task.md "Запрещено: Любой другой template-файл вне `*_local_apply.dart`". Recommend separate TASK для Configuration legacy paths consolidation (sync_core 0.3.0 уже uses LocalApply path; legacy paths должны быть либо удалены, либо guarded аналогично). |
| **H-1 (Rev 2)** | Reviewer 2 | t115 template НЕ patched — same Bug 3 silent data corruption риск для t115 consumers (weight TASK-018 inherited) | **DEFERRED per User decision (Option B):** отдельный TASK после merge TASK-028. Contradiction между ADR-0005 amendment 2026-05-04 "bug-fix-as-needed" и TASK-028 task.md "НЕ trogать t115 шаблон (frozen)" разрешена в пользу scope-discipline. Recommend TASK-031 для t115 LWW guard parity (identical 4-file pattern). |
| HIGH-1 (Rev 1) | Reviewer 1 | Conflict-status entities (`syncStatus == SyncStatus.conflict`) silent overwrite на pull stale | LWW scope decision: focus = unsynced local edits (`syncStatus == SyncStatus.local`). Conflict resolution = separate concern (interactive UI / manual merge), не TASK-028 scope. Weight precedent has same boundary. |
| HIGH-3 (Rev 1) | Reviewer 1 | Equal-timestamp race (`isAfter` strict `>`) — server wins ties → потенциальный drop local edit | LWW inherent на millisecond precision. Weight precedent identical. Mitigation = tie-breaker по deviceId — future enhancement, не Bug 3 scope. |
| HIGH-4 (Rev 1) | Reviewer 1 | Clock skew → permanent local lock (если local clock убежал в будущее) | LWW inherent. Weight precedent identical. Telemetry / clock-skew detection = future cross-cutting concern. |
| MEDIUM-1 (Rev 1) | Reviewer 1 | UTC vs local TZ mismatch potential на DateTime serialization | Pre-existing sync_core/Drift concern, не TASK-028 introduces. Drift `MillisecondEpochConverter` стандартно использует UTC; further audit = separate TASK. |
| H-2 (Rev 2) | Reviewer 2 | Manifest-split implicit invariant — нет structural enforcement | Compile-time gate (verify PASS) catches misclassification как compile errors (missing DAO method). Defensive coverage через unit test "manifest split" регрессионный guard. Acceptable. |
| H-1 (Rev 3) | Reviewer 3 | `countGuards == 1` assertion strict — может regress на future legitimate второй `is SyncPullApplyContext` block | Strict assertion intentional. Failure message explicit и visible (`expected exactly 1 guard, got N`). Если future need требует второй guard — explicit re-eval test required. Acceptable strictness for current TASK-028 scope. |
| H-2 (Rev 3) | Reviewer 3 | Live regression tests silent skip on CI | Inline golden tests cover same invariants on CI. Live regression = additional safety net для local executor runs (template rot detection). `Mocha skip()` показывает pending — visible в test report. Acceptable. |
| H-3 (Rev 3) | Reviewer 3 | Inline golden может drift от live template | Live regression tests (when run locally) cross-check via `hasLwwGuard` invariants. Future drift detected on next local executor run. Acceptable. |
| M-1 (Rev 3) | Reviewer 3 | Composite-PK entity (configuration с group+key PK) DAO method dependency | Configuration уже uses `id` PK для primary lookup; secondary `getConfigurationByGroupAndKey` exists. Guard works на primary PK path. Documented в Configuration docstring. |
| M-2 (Rev 3) | Reviewer 3 | JunctionDetector explicit override case (`junction: true` + business fields) не покрыт | Edge case acceptable defer — existing 3 tests cover structural detection + reverse cases. Add explicit override test = LOW priority enhancement. |
| L-1..L-3 (all reviewers) | various | Line number citation rot, comment language mix, docstring style inconsistency | Cosmetic, не block merge. |

## Follow-up TASKs recommended (post-merge TASK-028)

1. **TASK-031** (suggested name): t115 LWW guard parity — apply identical 4-file pattern в t115 template `category/task/tag/configuration_local_apply.dart`. Reasoning: ADR-0005 amendment 2026-05-04 классифицирует t115 как "supported template with bug-fix-as-needed"; Bug 3 = bug fix. Закрывает weight TASK-018 migration risk.
2. **TASK-032** (suggested name): Configuration legacy paths consolidation — `configuration_local_data_source.dart` `handleSyncEvent` + `insertOrUpdateFromServer` либо удалить (если sync_core 0.3.0 заменил), либо добавить identical LWW guard. Scope = simplified template `configuration_local_data_source.dart`. Reasoning: defense-in-depth для Configuration cross-device race coverage.

## Стэк-lock compliance (Discussion #11)

✅ Marker scheme preserved (13 markers unchanged, `manifest: entity` / `manifest: manyToMany` / `manifest: startProject` invariant)
✅ Clean directory layout preserved
✅ sync_core 0.3.0 contract preserved (`SyncApplyContext` sealed hierarchy used per documented API)
✅ Drift conventions preserved
✅ 0 package versions changed
✅ 0 generator logic changes (template-only patch)

## Pre-existing warnings (для baseline сравнения, не новые)

- `[SectionReplacer] Generator function not found for name: base` — pre-existing warning в `generate-entity` output, не regression от TASK-028
- `flutterAnalyze infos=30` — pre-existing, не regression

## Риски / Заметки

- Configuration partial protection — documented в template docstring + follow-up TASK-032 recommended
- t115 не patched — known limitation, follow-up TASK-031 recommended (per User decision Option B)
- LWW inherent limitations (conflict status, equal timestamp, clock skew) — same as weight precedent, scope-correct для Bug 3
- Adversarial review value: 3 reviewers поймали 1 CRITICAL (Configuration legacy paths) + 7 HIGH that 0 baseline reviewers caught — pattern validated, User decision Q5 повышенного bar для data-integrity justified.

## Статус

Ready for review.
