# TASK-011 Report — sync_core 0.3.0 templates integration

**Status:** Ready for re-review (post-adversarial-fixes D6-D12)
**Branch:** `feature/TASK-011-sync-core-0-3-0-templates-integration`
**Cross-repo:** sync_core teamlead-side `[codegen TASK-X1]` (см. [sync_core/ai/docs/roadmap.md](../../../../../../Projects/Flutter/Packages/sync_core/ai/docs/roadmap.md))

## Резюме

Реализована интеграция sync_core 0.3.0 (multi-entity templates) в codegen:

1. **t115 template приведён к Configuration baseline** (Variant A — Discussion #1) — 5 entities orchestrator state свёрнут к 1 Configuration register, tasks UI закомментирован, manifest markers расставлены на 30 файлов.
2. **Marker блоки в orchestrator** (`:syncImports`, `:syncEntityTypes`, `:syncRegistrations`) — основа для idempotent patching через `orchestrator_patcher.ts`.
3. **`orchestrator_patcher.ts` + 7 unit-tests** — идемпотентный TS generator, recovers from legacy duplicates, commutative apply.
4. **`patchPubspecPackagePaths` extended** на sync_core path-dep pattern + 6 unit-tests.
5. **Docs cleanup** — drop R1 references, новый `docs-code-generator/sync-core-integration.md`, README short bullet.
6. **BUG-008 fix (Phase D5)** — `AppDatabaseGenerator` scan расширен на `lib/core/**/*_table.dart` (раньше игнорировал sync_core's `sync_queue_table.dart` → cascade 170+ analyzer errors). Regression + idempotency tests добавлены.

**DoD:** `verify --name t152` PASS errors=0, warnings=3, infos=44.


## Phase tracking

| Phase | Что | Status | Commit |
|---|---|---|---|
| **A0** | Orchestrator -> Configuration baseline (Variant A) | done 2026-05-02 | 8b4cf84 |
| **A0.6** | Tasks UI закомментирован в `home_page.dart` | done 2026-05-02 | 8b4cf84 |
| **A** | Manifest markers (30 файлов: 5 sync infra + 5 Configuration + 15 Tasks + 5 TaskTagMap) | done 2026-05-02 | 8b4cf84 |
| **B/B5** | 3 marker pairs в orchestrator + manual inspection | done 2026-05-02 | 8b4cf84 |
| **B6/B7** | SectionReplacer marker tests (5 cases) | done 2026-05-02 | be0e805 |
| **C0** | replacement_util audit -- no extension needed | done 2026-05-02 | be0e805 |
| **C/C7** | `orchestrator_patcher.ts` + 7 tests (incl. commutative) | done 2026-05-02 | be0e805 |
| **D** | `patchPubspecPackagePaths` regex для sync_core + 6 tests | done 2026-05-02 | be0e805 |
| **E/E5/E5.1/E6** | Docs cleanup + new sync-core-integration.md + TASK-013 backlog | done 2026-05-02 | 053204d |
| **F0** | E2E patcher validation на t115 — `[x] done with caveat` (BUG-007 cascade — F0 demonstrates patcher idempotency, не runtime correctness; relation_patcher gap pre-existing) | done with caveat 2026-05-02 | 053204d |
| **D5** | BUG-008 fix -- AppDatabaseGenerator scan core/* tables + regression+idempotency tests | done 2026-05-02 | 06bf4e8 |
| **F2** | `create-project --name t152` SUCCESS (191584ms) | done 2026-05-02 | filesystem |
| **F3** | `verify --name t152` PASS errors=0 | done 2026-05-02 | -- |
| **F4** | (опционально) `generate-entity` на t152 -- выявил BUG-009 (orchestrator_patcher import paths используют templ-feature вместо feature-path), out of scope | done 2026-05-02 | -- |
| **F5** | Финальный report.md (initial) | done 2026-05-02 | df65751 |
| **D6** | BUG-009 fix — orchestrator_patcher feature segment substitution + 2 new full-path tests | done 2026-05-02 | (this commit) |
| **D7** | Drift duplicate fix (Variant A) — template без fixed-line core imports + regression test | done 2026-05-02 | (this commit) |
| **D8** | pubspec regex `{4,}` → `{4}` (true idempotency) + updated test | done 2026-05-02 | (this commit) |
| **D9** | Cleanup — .tmp file removed + F0 caveat documented + TASK-013 priority bump | done 2026-05-02 | (this commit) |
| **D10** | Commutative test reformulated (set-equality + honest non-bytewise comment) | done 2026-05-02 | (this commit) |
| **D11** | SectionReplacer noise suppressed (skip whitelist для orchestrator markers) | done 2026-05-02 | (this commit) |
| **D12** | Fresh t153 + verify --name t153 PASS errors=0 + generate-entity expense → verify PASS errors=0 | done 2026-05-02 | (this commit) |

## Изменения

### Создано

**Codegen src:**
- `src/features/generation/generators/orchestrator_patcher.ts` -- идемпотентный patcher 3 marker блоков. Junction detection через `model.className.endsWith('Map')`. Recovery from legacy duplicates. Commutative apply.

**Codegen tests:**
- `src/test/generators/orchestrator_patcher.test.ts` -- 7 tests
- `src/test/generators/section_replacer.test.ts` -- 5 tests
- `src/test/services/project_bootstrapper.test.ts` -- 6 tests для patchPubspecPackagePaths

**Codegen docs:**
- `docs-code-generator/sync-core-integration.md` (~120 строк)
- `ai/bug-reports/007-relation-patcher-misses-template-without-markers.md` -- BUG-007 (out of scope)
- `ai/bug-reports/008-app-database-generator-misses-core-sync-tables.md` -- BUG-008 (fixed в Phase D5)
- `ai/bug-reports/009-orchestrator-patcher-uses-templ-feature-for-import-paths.md` -- BUG-009 (out of scope, surfaced в F4)

### Изменено в codegen src

- `src/features/generation/generators/generation_service.ts` -- подключён `OrchestratorPatcher`
- `src/features/generation/generators/app_database_generator.ts` -- Phase D5: `scanCoreTableFiles()` для `lib/core/**/*_table.dart`
- `src/core/services/project_bootstrapper.ts` -- extended regex `(?:\.\.\/){4,}Projects\/`
- `src/adapters/cli/commands/generate_entity.ts` -- `--projects-path` flag

### Изменено в codegen tests

- `src/test/generators/app_database_generator.test.ts` -- Phase D5: 2 BUG-008 regression tests

### Изменено в t115 template

- `t115_flutter/lib/core/sync/sync_orchestrator_provider.dart` -- Configuration baseline + 3 marker pairs + `manifest: startProject`
- `t115_flutter/lib/features/home/presentation/pages/home_page.dart` -- tasks UI закомментирован
- `t115_flutter/lib/core/data/datasources/local/tables/sync_metadata_table.dart` -- `manifest: startProject` marker
- 30 adapter файлов получили manifest markers (5 startProject sync infra + 5 startProject Config + 15 entity + 5 manyToMany)

### Изменено в codegen docs

- `ai/docs/agent_memory.md` -- sync_core 0.3.0 + Phase D5 lesson
- `ai/docs/architecture.md` -- детальная структура sync 0.3.0
- `CLAUDE.md` (root) -- секции "Что НЕ генерируется", "Создай новый проект", marker блоки
- `README.md` -- short bullet про sync_core 0.3.0
- `ai/tasks/backlog.md` -- TASK-013 placeholder

## Тесты

**Total: 82 passing** (0 failures, 952ms)

Breakdown:
- 62 baseline (pre-TASK-011)
- +7 OrchestratorPatcher
- +5 SectionReplacer
- +6 patchPubspecPackagePaths
- +2 AppDatabaseGenerator BUG-008 regression (Phase D5)

Запуск: `npm test`

## DoD verify (actual JSON output)

### Phase F3 -- fresh project t152

**`create-project --name t152 --human` (2026-05-02):**

```
SUCCESS: create-project
Created: ~260 files
  + t152_flutter/lib/core/sync/{app_lifecycle_provider, device_id_provider, drift_sync_queue_store, sync_orchestrator_provider, sync_queue_table}.dart
  + 5 configuration adapter files
  + 254 other files (skeleton)
Modified (9): pubspec.yaml + main.dart + .gitignore (3 sub-projects)
Duration: 191584ms
```

**`verify --name t152 --human` (2026-05-02) -- PASS:**

```
PASS: verify t152
  project: G:\Projects\Flutter\serverpod\t152
  flutterAnalyze -- 6431ms (errors=0, warnings=3, infos=44)
  pubGet -- 7608ms
  serverpodGenerate -- 8939ms
  buildRunner -- 3806ms
Total: 26787ms
```

**Достигнут целевой DoD: errors=0, warnings=3 (<=5), infos=44.**

### Phase F4 -- generate-entity (опциональная E2E демонстрация)

`generate-entity --yaml expense.spy.yaml --feature-path .../features/expense --workspace t152` создал 24 файла (5 adapters + DAO + entity + repository + endpoint + supporting), patched orchestrator + database. Файловая структура корректная.

**`verify --name t152` после generate-entity:**

```
FAIL: verify t152
  flutterAnalyze -- 4202ms (errors=15, warnings=3, infos=44)
```

**Cause:** orchestrator_patcher вставил imports с template's feature placeholder (`features/tasks/...`) вместо актуального `features/expense/...`. 7 `uri_does_not_exist` errors -> cascade 8 undefined symbols. Документировано как **BUG-009** (out of scope TASK-011).

F4 -- opt-in E2E demonstration, не блокер acceptance. F3 (фундаментальный gate, errors=0 на свежем create-project) PASS.

## Caveat: Phase F0 validation strength (per Adversarial Bomb #5)

**F0 был designed как E2E validation что `OrchestratorPatcher` корректно воссоздаёт original orchestrator state из Configuration baseline.** Test был run, но downstream `flutter analyze` failed на 12 errors про `GetTasksByCategoryIdUseCase` — это BUG-007 (relation_patcher не вставляет `:oneToManyMethods` markers в template без markers, pre-existing limitation).

**Что F0 РЕАЛЬНО доказал:**
- `OrchestratorPatcher` восстанавливает orchestrator state из Configuration baseline (proof patcher не падает + idempotent on real model data).
- 4 entities (Category/Task/Tag/TaskTagMap) корректно re-added в orchestrator marker блоки.

**Что F0 НЕ доказал:**
- F0 НЕ proves runtime correctness — downstream `flutter analyze` failed из-за relation_patcher pre-existing gap.
- Cascading test value reduced — F0 demonstrated patcher-level idempotency, не end-to-end clean compilation.

**Для full E2E validation** (compile-clean t115 после re-add) необходимо сначала закрыть BUG-007. Это deferred TASK-014 backlog.

## Pre-existing limitations (out of scope TASK-011)

- **BUG-007** -- `relation_patcher` не вставляет `:oneToManyMethods` marker блоки в template файлы без markers. F0 поверх template без markers даёт 12 errors про `GetTasksByCategoryIdUseCase`. Pre-existing template gap.
- ~~**BUG-009**~~ — **CLOSED in D6** (2026-05-02) — `orchestrator_patcher` ранее использовал hardcoded `features/tasks/` literal в template imports. Fix: добавлен **feature segment substitution** через `config.targetFeatureName` (через `path.basename(targetFeaturePath)`). Anchored через `features/<X>/` prefix, чтобы избежать ложных matches на entity names. 2 new tests с full-path assertion (positive + negative): `BUG-009: feature segment substitution для non-tasks feature` + `BUG-009: junction entity также получает правильный feature segment`. **D12 E2E validated**: `generate-entity --feature-path .../features/expense` на свежем t153 → `verify` PASS errors=0.

BUG-007 записан в `ai/bug-reports/`. TASK-011 acceptance не зависит от него (acceptance attached к F3 fresh project verify, который проходит чисто).

## Architectural concerns / Risks

### Lesson 1 -- F0 vs F2/F3 conflict (Variant A rollback)

Phase F0 (re-add 4 tasks для E2E patcher proof) приводит template orchestrator в "5 entities state". Phase F2 (`create-project --name <new>`) копирует `manifest: startProject` файлы as-is. Tasks features ПО default не копируются -> orchestrator ссылается на отсутствующие features -> cascade errors.

**Решение (User decision Variant A 2026-05-02):** после F0 evidence (proof patcher работает) откатить orchestrator к Configuration baseline. Запись в Discussion archive -- текстовый снапшот post-F0 как evidence.

### Lesson 2 -- BUG-008 (scan paths hardcoded)

`AppDatabaseGenerator` scan был hardcoded на `features/*/data/datasources/local/tables/`. После sync_core 0.3.0 integration template добавил `lib/core/sync/sync_queue_table.dart` -- путь вне whitelist. Scan игнорировал -> cascade 170+ errors.

**Решение (Variant B):** второй scan glob `lib/core/**/*_table.dart`, generic -- покроет любые будущие core-уровневые tables.

**Lesson:** scan paths == hard contract. Любой `*_table.dart` ВНЕ whitelist невидим. Записано в `agent_memory.md`.

### Lesson 3 — duplicate imports/tables в database.dart — CLOSED in D7 (Variant A)

~~После Phase D5 fix `database.dart` содержит дубликаты~~ — fixed via D7 (2026-05-02 adversarial review).

**D7 решение (Variant A — template fix):** удалены fixed-line imports `sync_metadata_table.dart`, `sync_queue_table.dart`, `configuration_table.dart` из template database.dart. Теперь scan-based AppDatabaseGenerator (`scanCoreTableFiles` + `scanAllFeatureTableFiles`) — единственный источник истины. Это упростило generator logic и устранило source duplicate. Regression test `D7 regression: template без fixed-line core imports → scan единственный источник, нет дублей` в `app_database_generator.test.ts`.

## Acceptance criteria

### Must-have

- [x] **Phase A0**: orchestrator minimal Configuration baseline
- [x] **Phase A0.6**: tasks UI закомментирован
- [x] **Phase A**: 30 файлов с manifest маркерами
- [x] **Phase B**: 3 marker блока в sync_orchestrator_provider.dart
- [x] **Phase B5**: marker integrity (manual inspection PASS)
- [x] **Phase B6/B7**: idempotency + SectionReplacer tests
- [x] **Phase C0**: replacement_util audit
- [x] **Phase C**: orchestrator_patcher.ts + 7 unit-tests
- [x] **Phase C7**: commutative test
- [x] **Phase D**: patchPubspecPackagePaths covers sync_core path-dep
- [x] **Phase D5**: BUG-008 AppDatabaseGenerator scan core/* tables + 2 regression tests
- [x] **Phase E**: docs cleanup
- [x] **Phase E5/E5.1**: README + new sync-core-integration.md
- [x] **Phase E6**: TASK-013 backlog placeholder
- [x] **Phase F0**: E2E patcher validation — `done with caveat` (BUG-007 cascade — F0 demonstrates patcher idempotency, не runtime correctness; relation_patcher gap pre-existing)
- [x] **Phase F2**: create-project --name t152 SUCCESS
- [x] **Phase F3**: verify --name t152 PASS errors=0 (warnings=3, infos=44)
- [x] **Phase F5**: финальный report.md
- [x] 82 tests passing
- [x] report.md с actual JSON output

### Nice-to-have (выполнено сверх)

- [x] **Phase F4** generate-entity E2E demonstration на t152 (выявил BUG-009 -- out of scope)

## D6-D12 — Adversarial review fixes (2026-05-02)

**Trigger:** standard-review-report.md `APPROVE WITH NITS` + adversarial-review-report.md `DO NOT SHIP AS-IS`. User decision (Variant A): расширить scope TASK-011 закрыть adversarial concerns в той же feature branch перед merge.

### D6 — BUG-009 fix (Adversarial Bomb #1)

**Files changed:**
- `src/features/generation/generators/orchestrator_patcher.ts` — `_substitutePlaceholders` принимает `tplFeatureSnake` / `targetFeatureSnake`, anchored substitution `features/<X>/` (через path prefix чтобы избежать ложных matches). `patch()` теперь использует `config.targetFeatureName` (`path.basename(targetFeaturePath)`).
- `src/test/generators/orchestrator_patcher.test.ts` — 2 new tests с full-path assertion (positive + negative): `BUG-009: feature segment substitution для non-tasks feature` + `BUG-009: junction entity также получает правильный feature segment`. Existing `single entity add` test расширен на full-path assertion (включая negative `!result.includes('features/tasks/data/adapters/expense')`).

**Adversarial complaint resolved:** substring tests anti-pattern → tests теперь assertion'ят full import path (`features/expense/data/adapters/expense/expense_remote_adapter.dart`).

### D7 — Drift duplicate fix (Adversarial Bomb #2, Variant A)

**Files changed:**
- `G:/Templates/flutter/t115/t115_flutter/lib/core/data/datasources/local/database.dart` — удалены fixed-line imports `sync_metadata_table.dart`, `sync_queue_table.dart`, `configuration_table.dart` (lines 7-9 + lines 19-22 в @DriftDatabase). Заменено comment block с указанием на D7 fix rationale.
- `src/test/generators/app_database_generator.test.ts` — new test `D7 regression: template без fixed-line core imports → scan единственный источник, нет дублей`.

### D8 — pubspec regex idempotency (Adversarial Bomb #4)

**Files changed:**
- `src/core/services/project_bootstrapper.ts` — regex `(?:\.\.\/){4,}` → `(?:\.\.\/){4}` (exact 4 levels = template state; post-patch 5 levels не matches → no-op idempotent).
- `src/test/services/project_bootstrapper.test.ts` — test "documents the bug" перепрошит на assertion `after1 === after2` + negative `!includes('../../../../../../Projects/')`.

### D9 — Cleanup (Adversarial Bombs #5, #6 + miscellaneous)

- D9.1: Удалён `tag_payload_codec.dart.tmp.37380.1777697814357` из template.
- D9.2: F0 status updated на "done with caveat" — добавлена секция `Caveat: Phase F0 validation strength` с честным признанием что F0 demonstrated patcher idempotency, но не runtime correctness (BUG-007 cascade).
- D9.3: TASK-013 в `backlog.md` priority bumped Low → Medium + scope expansion: "Audit weight 13 entities на junction-style без `Map` суффикса (UserPermission, RolePermission, ContractorTariff и подобные)".

### D10 — Commutative test reformulated (Standard Finding #3)

**Files changed:**
- `src/test/generators/orchestrator_patcher.test.ts` — test renamed "commutative apply" → "eventual consistency apply". Honest claim: patcher НЕ true bytewise commutative (append-only behavior), но обеспечивает **set-equality** final state. Test проверяет:
  - `extractRegistrationNames` set comparison (sorted arrays) — A→B vs B→A
  - `extractImportPaths` set comparison
  - Counts identity для дубликатов
  - Sanity: оба содержат и Alpha и Beta

**Architectural note:** True bytewise commutativity потребовала бы sort entries (по entity name) при insert — это более глубокая refactor работа, deferred (не блокер для TASK-011).

### D11 — SectionReplacer noise suppressed (Standard Finding #4)

**Files changed:**
- `src/features/generation/generators/section_config.ts` — добавлен `SECTION_REPLACER_SKIP_MARKERS` whitelist (`syncImports`, `syncEntityTypes`, `syncRegistrations`). Эти markers patched через `OrchestratorPatcher` отдельно — `SectionReplacer.process()` теперь silently skip без warning.

### D12 — Fresh t153 + verify validation

**Step 2 — `create-project --name t153 --human`:** SUCCESS (189470ms). 9 modified + ~260 created.

**Step 3 — `verify --name t153 --human` (свежий проект):** PASS errors=0
```
PASS: verify t153
  project: G:\Projects\Flutter\serverpod\t153
  ✓ flutterAnalyze — 4557ms (errors=0, warnings=3, infos=44)
  ✓ pubGet — 4613ms
  ✓ serverpodGenerate — 8796ms
  ✓ buildRunner — 3829ms
Total: 21798ms
```

**Step 4 — `generate-entity --yaml expense.spy.yaml --feature-path .../features/expense --workspace t153 --human`:** SUCCESS, 24 created + 2 modified (`sync_orchestrator_provider.dart` + `database.dart`).

**Critical evidence (D6 fix validated):** в `t153_flutter/lib/core/sync/sync_orchestrator_provider.dart:24-30` patcher вставил imports с **правильным** feature segment:
```dart
import '../../features/expense/data/adapters/expense/expense_event_adapter.dart';
import '../../features/expense/data/adapters/expense/expense_local_apply.dart';
import '../../features/expense/data/adapters/expense/expense_payload_codec.dart';
import '../../features/expense/data/adapters/expense/expense_pull_adapter.dart';
import '../../features/expense/data/adapters/expense/expense_remote_adapter.dart';
import '../../features/expense/data/datasources/local/daos/expense/expense_dao.dart';
import '../../features/expense/domain/entities/expense/expense_entity.dart';
```

Сравните: до D6 fix этот же flow на t152 дал имена с **template's** `features/tasks/...` literal, что cascade-сломало 15 errors.

**Step 5 — `verify --name t153 --human` после generate-entity:** PASS errors=0
```
PASS: verify t153
  project: G:\Projects\Flutter\serverpod\t153
  ✓ flutterAnalyze — 4332ms (errors=0, warnings=3, infos=44)
  ✓ pubGet — 12772ms
  ✓ serverpodGenerate — 9021ms
  ✓ buildRunner — 19091ms
Total: 45218ms
```

**BUG-009 fully closed.** Both verify runs (fresh project + post-generate-entity) PASS errors=0.

### Tests final count

**85 passing** (post-D6/D7/D10):
- 62 baseline (pre-TASK-011)
- +7 OrchestratorPatcher (initial)
- +5 SectionReplacer
- +6 patchPubspecPackagePaths (D8 test reformulated, count unchanged)
- +2 AppDatabaseGenerator BUG-008 regression (Phase D5)
- +2 OrchestratorPatcher D6 BUG-009 (full-path assertion)
- +1 AppDatabaseGenerator D7 regression

## Status

**Ready for re-review.** D6-D12 закрывают:
- Adversarial Bomb #1 (BUG-009) — D6 ✅
- Adversarial Bomb #2 (Drift duplicate) — D7 ✅
- Adversarial Bomb #3 (junction heuristic) — TASK-013 priority bumped + scope expansion (audit weight 13 entities перед TASK-018)
- Adversarial Bomb #4 (pubspec regex idempotency) — D8 ✅
- Adversarial Bomb #5 (F0 evidence theatre) — D9.2 caveat documented
- Adversarial Bomb #6 (t115 inconsistency) — обозначено как punt to follow-up
- Standard Finding #3 (commutative test) — D10 honest reformulation ✅
- Standard Finding #4 (SectionReplacer noise) — D11 ✅
- Standard Finding #2 (.tmp file) — D9.1 ✅

**После re-review approval + merge:**
- TASK-012 (codegen -> todo real app generation + smoke) полностью разблокирован (BUG-009 fixed, не prerequisite)
- weight TASK-018 разблокирован после TASK-012 + TASK-013 audit acceptance
