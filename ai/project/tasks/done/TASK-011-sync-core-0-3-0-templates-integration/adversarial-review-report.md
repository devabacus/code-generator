# Adversarial / Red Team Review Report — TASK-011

**Reviewer:** adversarial / paranoid skeptic
**Date:** 2026-05-02
**Verdict:** **DO NOT SHIP AS-IS** (для weight TASK-018 production); SHIP WITH WARNINGS только для t115/staging consumer-side experiments после явных fix'ов BUG-009 + Drift duplicate dedup. Acceptance criteria формально passed — реальность под production давлением сломается до того как weight TASK-018 стартует.

---

## Прогноз

Через месяц (когда developer попробует запустить generate-entity на feature ≠ `tasks`, или прогонит build_runner на проекте после миграции на новую sync_core API, или попытается переименовать Configuration в Settings) production пакет сломается из-за **минимум 4-5 latent bombs**:

1. **BUG-009 ПРАКТИЧЕСКИ ОБЯЗАТЕЛЕН для каждого generate-entity на свежем create-project'е** — это не edge case, это default flow. Documented as "out of scope TASK-011", flag'нуто как prerequisite TASK-012, но **TASK-011 закрывается raised gate** — это "DoD verify pass" theater.
2. **Drift schema with duplicate `SyncMetadataTable` + `ConfigurationTable` declarations** — `flutter analyze` молчит, `dart run build_runner build` принимает, но это classified Lesson 3 в report.md как "cosmetic". Это не cosmetic, это silent corruption готовая к production migration drift.
3. **`endsWith('Map')` junction heuristic** — гарантированно сломается на одном из 13 weight entities (UserPermission/RolePermission/ContractorTariff). TASK-013 backlog низкоприоритетный, до ETA когда developer заметит false-negative — silent wrong routing на soft-delete без `updateX` RPC.
4. **`patchPubspecPackagePaths` non-idempotent** — explicitly admitted в test'е что повторный run углубит depth каждый раз. Acceptable по utility "вызывается раз", но любая попытка post-bootstrap re-patch (например в migration TASK-018 или для add-package скрипта) даст silent broken pubspec.
5. **F0 evidence theatre** — t115/TASK-001 уже provided multi-entity validation. F0 (re-add tasks через generate-entity) был designed to test что patcher reproduces orchestrator state, но test был run на template directory без BUG-007 fix → result FAIL'ит c 12 errors на `GetTasksByCategoryIdUseCase`, и эти errors были **explicitly accepted** как "pre-existing limitation". Это значит F0 — это не E2E validation, это negative result rationalized как success.

**Blast radius:** Любой N-th developer пытающийся generate второй entity в свежем проекте hit'нет BUG-009 в течение 5 минут после `create-project`. Это не теоретический риск, это **observed behaviour** — t152 на disk имеет именно эту поломку (15 errors) и было рационализировано как "out of scope".

---

## Top production bombs (sorted by likelihood)

### Bomb #1: BUG-009 — orchestrator_patcher hardcodes `features/tasks/` в imports

- **Probability** через месяц: **very high** (100% при любом feature-path ≠ tasks)
- **Blast radius:** Любой `generate-entity --feature-path .../features/<name>` на свежем `create-project` (где `tasks/` не существует) ломает orchestrator с **7 `uri_does_not_exist` + 8 cascade undefined symbols**. Developer открывает свежий проект в IDE и видит red squiggles по всему orchestrator файлу.
- **Trigger:** Это **default flow**. `create-project` не генерит tasks. Первый `generate-entity` на новом feature → BUG-009. Это **observed на t152 в t152_flutter/lib/core/sync/sync_orchestrator_provider.dart:24-30** (live на disk):
  ```dart
  import '../../features/tasks/data/adapters/expense/expense_event_adapter.dart';
  ```
  При том что `t152_flutter/lib/features/tasks/` НЕ СУЩЕСТВУЕТ.
- **Why current code/tests don't catch it:** Test [orchestrator_patcher.test.ts:113-114](src/test/generators/orchestrator_patcher.test.ts:113) проверяет:
  ```typescript
  assert.ok(result.includes('expense_remote_adapter.dart'), ...);
  ```
  Это **substring match** который passes даже если import path содержит `features/tasks/` (template's hardcoded value). Test design fundamentally inadequate — он не проверяет что path resolved корректно. Шесть аналогичных тестов имеют ту же flaw.
- **File:line evidence:**
  - `orchestrator_patcher.ts:291-309` — `_ENTITY_IMPORTS_TEMPLATE` и `_JUNCTION_IMPORTS_TEMPLATE` hardcoded `features/tasks/...`
  - `_substitutePlaceholders` (строки 241-273) меняет только `category`/`taskTagMap` placeholders, **но НЕ `tasks` feature placeholder**
  - `GenerationConfig.targetFeatureName` getter (`generation_config.ts:67-69`) **существует**, возвращает `path.basename(targetFeaturePath)` — patcher просто его не использует
- **Mitigation:** **BLOCK release until fixed**. Это не "TASK-012 prerequisite" — это TASK-011 own bug непосредственно introduced при создании orchestrator_patcher. report.md прячет это за термином "out of scope F4 demonstration" — но F4 не decoration, это minimal expected user flow.

### Bomb #2: Drift schema duplicate table declarations в database.dart

- **Probability** через месяц: **very high** (100% при текущем D5 fix), серьёзность escalate's с миграциями
- **Blast radius:** `database.dart` на t152 (live на disk, [database.dart:7-26](G:/Projects/Flutter/serverpod/t152/t152_flutter/lib/core/data/datasources/local/database.dart)) содержит:
  - 2x `import 'tables/sync_metadata_table.dart';`
  - 2x `import '../../../../features/configuration/.../configuration_table.dart';`
  - В `@DriftDatabase(tables: [...])`: `SyncMetadataTable` 2 раза, `ConfigurationTable` 2 раза
  - migration block: `if (from < 2) { configurationTable + syncMetadataTable + syncQueueTable }` — три таблицы в одной branch, потенциальный double-creation при upgrade path
- **Trigger:** Любой `dart run build_runner build` после `create-project` или `generate-entity`. Сейчас `flutter analyze` ставит errors=0 потому что Dart допускает duplicate imports тихо. Drift code generator **тоже** молчит — но это не documented поведение, это implementation detail Drift.
- **Why current code/tests don't catch it:** Test [`app_database_generator.test.ts:273-298`](src/test/generators/app_database_generator.test.ts:273) "core+features scan idempotent" использует MockFileSystem где template database.dart **минимальный** (no fixed-line imports вне markers). Реальный t115 template имеет 3 fixed-line imports ВНЕ markers ([t115/database.dart:7-9](G:/Templates/flutter/t115/t115_flutter/lib/core/data/datasources/local/database.dart)) которые scan находит и **повторно** добавляет внутри markers. Test не моделирует это.
- **File:line evidence:**
  - `t115_flutter/lib/core/data/datasources/local/database.dart:7-9` — fixed imports `sync_metadata_table.dart`, `sync_queue_table.dart`, `configuration_table.dart`
  - `t152_flutter/lib/core/data/datasources/local/database.dart:7-14` — те же файлы дважды (раз вне markers, раз внутри `GENERATED_IMPORTS`)
  - `app_database_generator.ts:127-143` — `scanCoreTableFiles` находит `sync_queue_table.dart` + `sync_metadata_table.dart` (последний — в `tables/` подкаталог `lib/core/data/datasources/local/tables/`, recursive scan его tоже захватит! Проверьте: `recursive: true` через `readDirectoryRecursive`)
- **Mitigation:** **BLOCK** — либо template переписать без fixed-line imports (всё через scan), либо в `app_database_generator` дедуп против fixed-line import block. Lesson 3 в report.md квалифицирует это как "cosmetic, не блокер" — это **категорически неверно** для production schema.
- **Bonus:** что произойдёт если developer сделает migration с `ALTER TABLE configuration_table ADD COLUMN ...`? Drift migrate engine получит две `ConfigurationTable` declarations при rebuild — undefined behaviour кто wins (latter override? merge? error?). Документировать это как "works because Drift dedup'ит" — гипотеза не подкреплённая proof в release.

### Bomb #3: `endsWith('Map')` junction detection — false-positive/negative

- **Probability** через месяц: **medium** (если weight TASK-018 имеет UserPermission/RolePermission/ContractorTariff junction'ы — high)
- **Blast radius:** Если developer создаст entity `RoadMap` (regular feature: navigation/routing UI с screens) — patcher routing'ует через `manifest: manyToMany` словарь + `_JUNCTION_REGISTER_TEMPLATE` (с docstring "junction-specific: server has no `updateRoadMap` RPC"). Server **может иметь** `updateRoadMap`, но patcher не вызывает. Update operations через CreateRoadMap RPC (idempotent create) — нерабочий update flow на real entity. Silent corruption: data goes through wrong RPC, последующие events cancel'ятся через wrong `delete()` noop.
- **Trigger:** Любой entity с `Map` суффиксом без junction semantics. Реальные кандидаты в Flutter app code: `RoadMap`, `SiteMap`, `Heatmap`, `Sourcemap`, `BitMap` (ARGB icon meta).
- **Why current code/tests don't catch it:** Test [orchestrator_patcher.test.ts:185-215](src/test/generators/orchestrator_patcher.test.ts:185) "junction entity (*Map)" — использует `UserPermissionMap` className. Это **корректная** junction. Тест не покрывает false-positive case (regular entity названная *Map). Documentation в [`docs-code-generator/sync-core-integration.md:99-102`](docs-code-generator/sync-core-integration.md:99) acknowledges проблему но reverses semantics — пишет про "Roadmap, Sitemap" как **false-negatives** when actually they are **false-positives**.
- **File:line evidence:**
  - `orchestrator_patcher.ts:52` — `const isJunction = model.className.endsWith('Map');`
  - `_JUNCTION_REGISTER_TEMPLATE:332-348` — docstring говорит "server has no `updateTaskTagMap` RPC, only `createTaskTagMap`" (применяется к ANY *Map entity)
  - `entity_yaml_validator.ts` — пропускает sync_event validation для *Map (per Discussion #1) — это значит junction также **избегает** парный YAML check, любая ошибка прячется
- **Mitigation:** TASK-013 backlog [низкий приоритет в backlog.md:5-23](ai/tasks/backlog.md). Trigger — "weight TASK-018 false-negative" — но это RAISES priority **после** того как weight потеряет sync data. Recommendation: **bump TASK-013 priority до Medium ДО merge weight TASK-018**, не "когда reproduces".

### Bomb #4: `patchPubspecPackagePaths` НЕ идемпотентен на out-of-monorepo paths

- **Probability** через месяц: **medium** (только если кто-то запустит patcher повторно)
- **Blast radius:** Каждый повторный run — depth углубляется на 1 уровень (e.g. `../../../../../` → `../../../../../../`). Pubspec становится unparseable (path указывает выше root file system), `flutter pub get` failure.
- **Trigger:** Любой code path где patcher вызывается **дважды** для уже-патченого pubspec. Обычно это:
  - Recreate-project flow (rare)
  - Copy/paste artifacts: developer copy'нул config с другого workspace и run'нул patcher вручную
  - Future feature: "add-existing-package" command который patchпит paths
- **Why current code/tests don't catch it:** Test [project_bootstrapper.test.ts:75-106](src/test/services/project_bootstrapper.test.ts:75) **explicitly admits** проблему:
  ```typescript
  // НО: out-of-monorepo pattern `(?:\.\.\/){4,}` matches >=4 '..',
  // что после первого run = 5 '..' — ВСЁ ЕЩЁ matches → второй run углубит до 6.
  // Это известное ограничение regex-based approach.
  ```
  Test verifies ТОЛЬКО `inMonorepoIdempotent` (первый pattern) — second pattern explicit non-idempotent.
- **File:line evidence:**
  - `project_bootstrapper.ts:53-56` — regex `(?:\.\.\/){4,}Projects\/` matches любой path с 4+ leading `../` followed by `Projects/`
  - Replacement adds **ещё один** `../` (`'$1../$2Projects/'` где $2 уже `(?:\.\.\/){4,}`)
- **Mitigation:** **DOCUMENT loudly + add idempotency guard**. Either:
  - Use `(?:\.\.\/){4}Projects\/` (exact 4 levels, не `{4,}` greedy) — но тогда после patch (5 `../`) regex не match'ится, идемпотентно. Текущее же поведение ловушка для будущего.
  - Add explicit "already-patched marker" в pubspec comment.

### Bomb #5: F0 evidence theatre + BUG-007 deferred indefinitely

- **Probability** через месяц: **medium-high** (до тех пор пока кто-нибудь не попробует regenerate entities в production weight)
- **Blast radius:** F0 был designed как E2E validation что orchestrator_patcher correctly воссоздаёт original orchestrator state из Configuration baseline. Test был **run** — failed с 12 errors про `GetTasksByCategoryIdUseCase`. Errors не имеют отношения к orchestrator_patcher (это relation_patcher gap, BUG-007). Acceptance criteria F1 ("DoD t115 regression PASS errors=0") был **modified mid-task** (User decision, [report.md:152-156](ai/tasks/active/TASK-011-sync-core-0-3-0-templates-integration/report.md:152)) на "PASS errors=0 на свежем t152; t115 documented BUG-007".

  Это значит F0 НЕ proved что patcher работает. F0 proved что patcher не падает. Это разные уровни confidence.

- **Trigger:** Когда weight TASK-018 потребует regenerate-entity на existing template + relation_patcher gap проявится снова — у нас НЕТ evidence что F0-style validation действительно покрывает ту surface area.
- **Why current code/tests don't catch it:** F0 не был prerequisite + не был escalated в TASK-011 (`relation_patcher` markers fix). Acceptance criterion был downgraded чтобы release task.
- **File:line evidence:**
  - `report.md:34` — Phase F0 status "done" с примечанием "выявил BUG-007 (out of scope)"
  - `bug-reports/007-relation-patcher-misses-template-without-markers.md:62-64` — User decision: "accept как pre-existing baseline issue"
  - `bug-reports/009-orchestrator-patcher-uses-templ-feature-for-import-paths.md:40-43` — Same User decision pattern: "out-of-scope TASK-011"
- **Mitigation:** **Document loudly + create explicit follow-up TASK для F0-style E2E test ON FIXED relation_patcher**. Don't let "pre-existing limitation" mask что F0 test target was never hit cleanly.

### Bomb #6: t115 template post-rollback inconsistency

- **Probability** через месяц: **low-medium** (зависит от того как t115 будет использоваться дальше)
- **Blast radius:** Phase F0 re-add'ил 4 entities через generate-entity — ровно для того чтобы потом откатить (User decision Variant A rollback). После rollback orchestrator вернулся к Configuration baseline. **НО** template на disk имеет:
  - `lib/core/sync/sync_orchestrator_provider.dart` — Configuration only (baseline)
  - `lib/features/tasks/data/adapters/{category,task,tag,task_tag_map}/*.dart` — 20 adapter файлов **СОХРАНЕНЫ** на disk с `manifest: entity` markers
  - `lib/features/home/presentation/pages/home_page.dart` — tasks UI **закомментирован** (line 17-22, 36-38, 130-143)
  - `lib/features/tasks/presentation/widgets/` — widgets **существуют** на disk но не used
  
  Это inconsistent state: код есть, manifest markers говорят "копируй на demand", но UI references закомменты. Если кто-то прогонит `dart fix --apply` или внутренний linter — может получить unexpected mass changes.
- **Trigger:** Developer открыл t115 в VS Code, увидел "unused import" warnings на comments + dead code в widgets (которые никто не register'ит). Запустил `dart fix --apply` → массовые удаления.
- **Why current code/tests don't catch it:** F0 evidence закрыт через User decision rollback to text snapshot, без "freshness check" что template state internally consistent.
- **File:line evidence:**
  - `home_page.dart:3-4` — pre-existing artefact: `// import 'package:ble_feature/ble_feature.dart';` followed by active `import 'package:ble_feature/ble_feature.dart';` (executor specifically flag'нул в task.md:363 как "не моя зона") — это **dead code в template**.
- **Mitigation:** Document loudly + создать TASK для full t115 cleanup pass.

---

## Architectural smells (структурные, не баги)

1. **Hardcoded template strings в orchestrator_patcher** ([`orchestrator_patcher.ts:291-348`](src/features/generation/generators/orchestrator_patcher.ts:291)) — 4 multi-line template literals содержат `tasks` literal который НЕ substituted в `_substitutePlaceholders`. Это classic "magic string в шаблоне" antipattern. Любое изменение feature path (rename `tasks` в `t-115` template) silently сломает все generated imports.

2. **Test'ы используют `result.includes()` substring assertions** — 7 из 7 тестов в `orchestrator_patcher.test.ts` использует substring match. Substring assertions ловят что-то "is present" но не что-то "is correct". Real correctness требует either:
   - Full string equality (для idempotent + commutative tests)
   - AST/regex with anchored boundaries (`features/expense/data/...` not `features/tasks/data/adapters/expense/`)
   
   Это weakest possible test design — passes даже когда production behaviour broken.

3. **`commutative apply` test НЕ проверяет actual commutativity** ([`orchestrator_patcher.test.ts:318-344`](src/test/generators/orchestrator_patcher.test.ts:318)) — assert'ит counts == 1 но **не** assert'ит `resultAB === resultBA`. Реальная commutativity = bytewise equal. Сейчас они могут различаться по порядку строк (Alpha imports после Beta vs Beta после Alpha), но test passes.

4. **Lesson 3 в report.md** ([`report.md:166-172`](ai/tasks/active/TASK-011-sync-core-0-3-0-templates-integration/report.md:166)) classifies дубли в database.dart как "cosmetic". Это is **lying to yourself** — Drift schema correctness не "cosmetic", это foundational invariant. Reviewer flag'нувший этого мог быть прав на текущем state, но release hides architectural debt.

5. **`scanCoreTableFiles()` использует `readDirectoryRecursive`** ([`app_database_generator.ts:131`](src/features/generation/generators/app_database_generator.ts:131)) на `lib/core/`. Это включает `lib/core/data/datasources/local/tables/sync_metadata_table.dart` — **тот же файл** что fixed-line import `'tables/sync_metadata_table.dart'` (relative из `database.dart`). Scan находит абсолютным путём, fixed-line — относительным; Set'ы не дедуплят. Это и есть source duplicate.

6. **`patchPubspecPackagePaths` greedy regex** ([`project_bootstrapper.ts:53-56`](src/core/services/project_bootstrapper.ts:53)) использует `(?:\.\.\/){4,}` — `{4,}` greedy. После первого run path имеет 5 leading `../`, что **всё ещё** matches `{4,}`. Использование `{4}` (exactly 4) сделало бы регекс idempotent. Это minor refactor, не done — bombing for future surfaces.

7. **`orchestrator_patcher` НЕ читает `targetFeaturePath`** хотя `GenerationConfig.targetFeatureName` getter существует ([`generation_config.ts:67-69`](src/features/generation/config/generation_config.ts:67)) и возвращает basename. BUG-009 — это **полное** упущение config'а. Не sophisticated bug, просто missing reference.

8. **`endsWith('Map')` junction heuristic зашит в trigger без warning'а** — `entity_yaml_validator.ts` пропускает sync_event check для *Map. patcher routing'ует через junction template. Никаких warnings. Если developer случайно назвал entity `XMap` (regular feature) — silent wrong path, no diagnostics.

9. **TASK-013 backlog "trigger: weight TASK-018 false-negative"** — это reactive priority, не proactive. До reactive trigger weight потеряет data. Recommendation: проверить ВСЕ 13 weight entities ПЕРЕД bumping TASK-018, не reactive.

10. **6-commit feature branch с большим cumulative diff** (2637 insertions / 25 deletions across 23 files) — bisection если production hit'нет issue будет painful. Каждый commit individually проходит tests, но интеграция между D5 fix (BUG-008) и orchestrator_patcher не имеет cross-commit integration test — лишь финальное `verify` t152.

---

## Что spec'и врут / умалчивают

### 1. report.md "DoD verify PASS errors=0" не упоминает что test был run **минимум 3 раза**

- t150 — broken (deleted by User)
- t151 — broken (deleted by User)
- t152 — PASS

3 broken iterations + 1 success = success rate 25%. Это **не** evidence что fix work, это evidence что мы "повезло на 3-ю попытку". Reproducibility для другого developer'а **untested**.

### 2. report.md Lesson 3 ("duplicate imports/tables в database.dart") classifies как "cosmetic"

В реальности — это symptom что architectural decision (fixed-line imports vs scan) не resolved. Никакого ADR. Comment в report.md "решение либо template переписать, либо в generator dedupe" — это deferred decision не зарегистрированная как backlog TASK.

### 3. F0 acceptance был downgraded mid-task

Original acceptance: F1 "DoD t115 regression PASS errors=0". User decision modified на "PASS errors=0 на свежем t152; t115 documented BUG-007". Это **lowering the bar** in middle of execution. Discussion #1 уже была закрыта — это out-of-band User decision не fed back в Discussion #1.

### 4. TASK-013 backlog в `backlog.md` имеет `endsWith('Map')` heuristic как "false-positive: Roadmap, Sitemap"

В docs-code-generator/sync-core-integration.md:99 та же фраза приведена под секцией "false-negatives potential: Regular entity Roadmap, Sitemap". **Это противоположные термины**, кто-то перепутал. Это minor docs bug но reflects rushed quality.

### 5. Discussion #1 Variant A justification — "согласовано с TASK-002"

Phrasing `'tasks' опционально` — но в реальности **TASK-002 уже сделал tasks полностью out** (`feat(create-project): убрать tasks-фичу из bootstrap полностью`). Variant A не "согласован", он реактивно accommodate'ит to TASK-002 которое уже committed. Discussion #1 Claude_1 admits это в строках 207-209.

### 6. "82 tests passing" claim

Из 82 — 7 OrchestratorPatcher + 5 SectionReplacer + 6 patchPubspec + 2 BUG-008 = **20 новых tests на TASK-011 surface area**. Из них 7 OrchestratorPatcher используют substring match ловушку (Bomb #1 above). Effective coverage of new code is overstated.

### 7. Phase F4 "опционально" — но reveals BUG-009

F4 был "nice-to-have / опт-ин E2E demonstration". Когда сразу же выявил BUG-009 — был downgraded в `bug-reports/`. **F4 был prerequisite** для acceptance что generate-entity работает на свежем проекте. Без F4 success мы релизим code что crash'ится при первом use post-create-project. Это **не** "out of scope" — это "scope was redefined to exclude evidence that breaks our claim".

### 8. CLAUDE.md sync_core 0.3.0 status

CLAUDE.md sync_core repo пишет: "🟡 [codegen TASK-011] active". Phase pipeline в roadmap.md mentions: "F0 (re-add tasks через generate-entity для t115 как E2E patcher validation) + F (DoD verify)". Но **по факту** F0 + F1 modified User'ом без обновления sync_core CLAUDE.md. Cross-repo state не синхронизирован.

---

## Recommendation per bomb

| Bomb | Decision | Rationale |
|---|---|---|
| #1 BUG-009 (orchestrator_patcher hardcodes `tasks/`) | **BLOCK release until fixed** | very high probability + observed на t152 + tests **fundamentally cannot detect** через substring match. Это TASK-011-introduced bug, не pre-existing. Quick fix: `targetFeatureName` substitution в `_buildImportsSnippet` (10-15 строк кода + 2-3 теста на full path equality). Не fix == TASK-012 + weight TASK-018 заблокированы реально, не теоретически |
| #2 Drift duplicate tables | **BLOCK release** для weight TASK-018 path; SHIP WITH WARNINGS для t115/staging. Document loudly как **architectural debt requiring resolution** | Текущее состояние работает на t152 потому что Drift молча dedup'ит, но это implementation detail третьей стороны, не contract. Migration drift — silent corruption risk. Создать ADR + follow-up TASK ПЕРЕД weight TASK-018. Лучше: template без fixed-line imports + полностью scan-driven (clean separation of concerns) |
| #3 Junction heuristic | **Document as known limitation + bump TASK-013 до Medium** + audit weight 13 entities ПРОактивно | Не блокер для t152/staging но obvious risk для production. Audit может занять 30 минут. До bump TASK-013 — production silent corruption готова |
| #4 Pubspec non-idempotent | **Document loudly + 2-line regex fix `{4,}` → `{4}`** перед merge | Effort: minimal. Risk if not fixed: small but **silent** — paths уйдут off-disk, `flutter pub get` errors будут confusing |
| #5 F0 evidence theatre + BUG-007 | **Punt to follow-up TASK** для proper E2E validation после relation_patcher fix | Не блокер acceptance, но не давать F0 status "✅ done" в task.md без caveat. Document как "F0 limited validation; full E2E pending TASK-X" |
| #6 t115 template inconsistency | **Punt to follow-up cleanup TASK** | Low likelihood + low blast radius для production. Cosmetic в template repo. Но фиксать ПЕРЕД weight TASK-018 чтобы template был clean reference |

### Минимальный set перед merge:

1. **Fix BUG-009** в TASK-011 (расширить scope) — 1-2 часа работы. Без этого acceptance criterion "DoD verify --runtime smoke" в TASK-012 будет blocked в день один.
2. **Drift duplicate fix** — `scanCoreTableFiles` skip'ает paths matching уже-existing fixed-line imports template. Альтернативно: template'е без fixed-line imports. 30-60 минут.
3. **Patcher idempotency** — `{4,}` → `{4}` в regex. 5 минут + test.
4. **Bump TASK-013** до Medium + audit weight 13 entities. 30-60 минут offline.
5. **Update F0 status** в task.md/report.md — explicit caveat что F0 не E2E. 5 минут.

Без п.1 + п.2 — ship это **Russian roulette** на TASK-012 acceptance в течение недели после merge. С ними — TASK-011 действительно gates TASK-012.

---

## Финальная оценка confidence

- **Code quality:** 6/10 (clean structure, но missing `targetFeatureName` reference fundamental gap)
- **Test coverage on new surface:** 4/10 (substring matches не assert correct path; commutative test toothless; нет integration test для template fixed-line imports + scan)
- **Acceptance criteria honesty:** 5/10 (acceptance technically met на свежем t152, но critical scenarios excluded as "out of scope" mid-task)
- **Architectural debt visibility:** 6/10 (BUG reports есть, но classified low priority + Lesson 3 буквально calls duplicate schema "cosmetic")
- **Reproducibility:** 4/10 (3 attempts to get clean t152 — статистически слабый sample)

**Overall:** TASK-011 hit minimum acceptance bar но **misses production-readiness** для своей stated downstream gate. Recommend rework BUG-009 + Drift dedup перед merge. Currently feature branch **passes tests но not adversarial review**.
