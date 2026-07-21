# Adversarial / Red Team Review Report — TASK-011 — **Round 2**

**Reviewer:** adversarial / paranoid skeptic (round 2 paranoid pass)
**Date:** 2026-05-02
**Verdict:** **DO NOT SHIP AS-IS** (Bomb #2 заявлен closed но **на real disk evidence — НЕ closed**; D7 fix живёт **только в uncommitted t115 working tree** и НЕ воспроизводим вне executor's machine)

---

## Прогноз

Через две недели, когда другой developer / CI агент запускает `create-project` на свежем clone'е — **template t115 будет broken** (D7 cleanup uncommitted), и cascade будет **Drift duplicate database.dart на каждом fresh project**. Это не теоретический risk, это **observed на disk** в **t152** + **t153** — обоих "evidence" проектах, которые executor сам сгенерировал и report.md цитирует как "PASS errors=0".

**Real blast radius:** через месяц weight TASK-018 production migration **на свежей VM / CI / новом developer machine** = duplicate Configuration + SyncMetadata в Drift schema. `flutter analyze` молчит (Drift code generator dedupes). `dart run build_runner build` тоже молчит. **Но при первой migration с `ALTER TABLE configuration_table` Drift hits ambiguity** — undefined behaviour. Production user data ставится на implementation detail Drift third-party library.

---

## Round 1 → Round 2 transitions

| Bomb | Round 1 | Round 2 actual | Notes |
|---|---|---|---|
| #1 BUG-009 (orchestrator hardcodes `tasks/`) | DO NOT SHIP | **CLOSED** ✅ | D6 fix реальный: `_substitutePlaceholders` step 1 substitutes `features/<tpl>/` → `features/<target>/` (orchestrator_patcher.ts:294-302). Tests assert full path + negative `!result.includes('features/tasks/...')`. t153 evidence: `sync_orchestrator_provider.dart:24-30` имеет `features/expense/...` correctly. |
| #2 Drift duplicate database.dart | DO NOT SHIP | **NOT CLOSED** ❌ — claimed but **disk evidence proves opposite** | Template cleanup живёт **только в t115 working tree (`git diff` shows 31 lines uncommitted)**. **t153 evidence file (D12 evidence!) ВСЕ ЕЩЁ имеет duplicate** SyncMetadataTable + ConfigurationTable. Reviewer reproduced. См. Bomb #1 ниже. |
| #3 Junction `endsWith('Map')` | DEFERRED | **STILL DEFERRED** — bumped to "Medium" но без actual audit | TASK-013 в backlog.md priority Medium + scope expansion для weight 13 entities. **Audit не сделан** — only described as "30-60 minutes offline". Никакого hard gate против weight TASK-018. |
| #4 Pubspec non-idempotent | HIGH | **CLOSED** ✅ | Regex `{4,}` → `{4}` в `project_bootstrapper.ts:59`. Test `idempotent re-run` проверяет `assert.strictEqual(after1, after2)` + negative `!includes('../../../../../../Projects/')`. Real string equality. |
| #5 F0 evidence theatre | MEDIUM | **PARTIALLY CLOSED** — caveat есть в report.md, но в task.md acceptance criteria всё ещё `[x] Phase F0` без caveat (line 211) | report.md имеет explicit `Caveat: Phase F0 validation strength` секцию (line 150). Phase tracking row 34 `done with caveat`. Но task.md acceptance строка 211 **`[x]` без caveat** — внутренняя inconsistency между task.md и report.md. |
| #6 t115 template inconsistency | LOW | **NOT TOUCHED** — punt подтверждён | tasks adapter files (20 файлов) всё ещё на disk. UI закомментирован. Pre-existing duplicate `// import 'package:ble_feature/...';` (lines 3-4 в `home_page.dart`) **остался**. Punt acknowledged без TASK created. |
| Standard #3 (commutative test) | MINOR | **HONESTLY REFRAMED** ✅ | D10 переименован "eventual consistency apply", set-equality assertion. Caveat что patcher НЕ bytewise commutative — `Architectural note: True bytewise commutativity потребовала бы sort entries`. Honest. |
| Standard (.tmp file) | MINOR | **CLOSED** ✅ | `find G:/Templates/flutter/t115 -name '*.tmp*'` returns пусто. |
| Standard (SectionReplacer noise) | MINOR | **CLOSED** ✅ | `SECTION_REPLACER_SKIP_MARKERS` whitelist в `section_config.ts:15-19`. `npm test 2>&1 \| grep "Generator function not found"` returns пусто. |

**Net:** 5 of 9 fully closed, 1 partially closed, 1 deferred without action, **1 NOT closed but claimed closed (Bomb #2)**, 1 not touched.

---

## Top production bombs (Round 2 paranoid pass)

### Bomb #1 (Round 2): D7 fix существует ТОЛЬКО в uncommitted t115 working tree → НЕ воспроизводим на любом другом machine / CI / clone

- **Probability** через 2 недели: **very high** (100% если кто-нибудь ещё запустит `create-project`)
- **Blast radius:** На любом fresh clone t115 (другой developer, CI, новая VM), template `database.dart` будет **с fixed-line imports** (origin/master HEAD ≠ working tree). `create-project --templ-project t115` → AppDatabaseGenerator копирует **dirty** template → result имеет duplicate `SyncMetadataTable` + `ConfigurationTable`. Drift schema duplicate.
- **Trigger:**
  ```bash
  cd /tmp && git clone https://github.com/devabacus/t115.git
  cd /path/to/code-generator && npm run start
  codegen create-project --name some_project
  # → some_project_flutter/lib/core/data/datasources/local/database.dart с дублями
  ```
- **Evidence:**
  - `cd G:/Templates/flutter/t115 && git status` — `modified: t115_flutter/lib/core/data/datasources/local/database.dart` + 50 других файлов **uncommitted**.
  - `git diff t115_flutter/lib/core/data/datasources/local/database.dart` показывает D7 cleanup (31 lines diff): удалены 3 fixed-line imports + 3 строки `@DriftDatabase(tables: [...])` (`SyncMetadataTable, SyncQueueTable, ConfigurationTable`).
  - `git log` last commit `9f3b47b` (2026-05-02 08:09:01) — **до** D7 working tree edit (17:18:57).
  - Github master HEAD = pre-D7 state.
- **Why current code/tests don't catch it:**
  - Test `D7 regression: template без fixed-line core imports` ([app_database_generator.test.ts:300-348](src/test/generators/app_database_generator.test.ts:300)) использует **fake clean template** строка 305-320 — `mockFs.setFile(TEMPLATE_DB_PATH, newTemplateContent)`. Это **mock fakery** — тест не trace'ит к **реальному** t115 template на disk.
  - **Test passes** даже если real t115 template на disk **не очищен**.
  - report.md заявляет "Variant A — template fix ... Удалены fixed-line imports `sync_metadata_table.dart`, `sync_queue_table.dart`, `configuration_table.dart`" — но в feature branch a299f52 нет diff на t115 (потому что t115 — другой repo). Неизвестно, был ли cleanup ever pushed.
  - **t153 (D12 evidence!) на disk ВСЕ ЕЩЁ имеет duplicate** ([t153_flutter/lib/core/data/datasources/local/database.dart:7-13](G:/Projects/Flutter/serverpod/t153/t153_flutter/lib/core/data/datasources/local/database.dart)):
    ```dart
    import 'tables/sync_metadata_table.dart';                              // line 7  — fixed-line outside marker
    import '../../../../features/configuration/...';                       // line 8  — fixed-line outside marker
    // === GENERATED_IMPORTS_START ===
    import '../../../../features/configuration/...';                       // line 10 — DUPLICATE inside marker
    import 'tables/sync_metadata_table.dart';                              // line 12 — DUPLICATE inside marker
    ```
  - И **t152 имеет тот же pattern** — оба "evidence" проекта executor'а **подтверждают** что D7 fix **не работает на реальном flow**.
- **Mitigation:** **BLOCK release**:
  1. **Commit D7 cleanup в t115 repo** + push origin/master. Без этого fix не существует в repository sense.
  2. **Re-run create-project ПОСЛЕ commit'а** (новый t154) — verify что real template используется + result clean (1× SyncMetadataTable, 1× ConfigurationTable в `@DriftDatabase`).
  3. **Update test** — instead of mock template content, **read real t115 database.dart from disk** (или via path passed through config). Real template state must be invariant of test, не mock fixture.
  4. Update report.md: D12 t153 evidence — **invalidated**, потому что database.dart всё ещё имеет duplicate.

### Bomb #2 (Round 2): D6 substitution **silently leaks** legacy `features/tasks/` content в existing inner

- **Probability** через 2 недели: **medium-high** (если consumer повторно генерирует на orchestrator у которого уже legacy state)
- **Blast radius:** Если orchestrator имеет existing `features/tasks/`-based imports (legacy state до D6 fix), patcher НЕ очистит их. `_patchMarkerBlock` collects `combinedInner = matches.map(mm => mm.inner).join('\n')` — то есть берёт **уже-existing inner content as-is**, без feature substitution. Substitution применяется **только к новому snippet** (`_substitutePlaceholders` (line 290)), не к существующему inner.
- **Trigger:**
  - Developer install'нул codegen pre-D6 → запустил `generate-entity` → orchestrator имеет `features/tasks/expense*` (broken paths)
  - Developer обновил codegen post-D6 → запустил `generate-entity` ещё раз → patcher добавляет **new** correct path `features/expense/expense*`, но legacy broken `features/tasks/expense*` **СОХРАНЕН** в combinedInner → cascade `uri_does_not_exist`.
- **Why current code/tests don't catch it:**
  - Test `single entity add` использует ORCHESTRATOR_BASELINE с **clean** `features/configuration/...` content. Не testит что legacy `features/tasks/...` content остался в inner и **не очистился**.
  - `assert.ok(!result.includes('features/tasks/'))` (test line 215) — passes только потому что initial baseline не имел `features/tasks/`. Это lower-bound assertion.
  - Round 1 report rant'нул о substring antipattern — D6 заменил substring на full-path positive + 1 negative, но negative test **зависит от clean baseline state**.
- **Mitigation:** **DOCUMENT as known limitation** + add test:
  - Test `single entity add (post-broken-state)`: pre-populate orchestrator с `features/tasks/expense_remote_adapter.dart` в combinedInner → re-run patcher для Expense feature `features/expense/` → assert `!result.includes('features/tasks/expense_remote_adapter.dart')`.
  - Если test passes → recovery from legacy. Если fails → есть real bug.

### Bomb #3 (Round 2): D8 `{4}` exact-match silently no-op'ит для template paths с !=4 levels (regression risk)

- **Probability** через 2 недели: **low-medium** (требует template layout change)
- **Blast radius:** Если в будущем template layout изменится (например moves Templates/flutter/t115/ на Templates/t115/) → relative paths имеют 3 leading `../` или 5 → regex `(?:\.\.\/){4}Projects/` **не matches** → silent skip → broken pubspec в new project.
- **Trigger:** Template repo refactor / moves layout / sync_core 1.0 publishes к pub.dev (path-dep removed) — все эти sembl изменения могут изменить depth.
- **Why current code/tests don't catch it:**
  - Test проверяет only basic `../../../../Projects/...` (4 levels). Не testит 3 levels, 5 levels, или absent path.
  - Hard-coded magic number `{4}` без alias / config / explanation.
- **Mitigation:** **DOCUMENT loudly + add comment** в `project_bootstrapper.ts:53-60` что `{4}` ≡ "current template layout depth". Если template layout changes — этот regex needs update. Add unit test для templates depth=3 + depth=5 expecting **no-op** (silent skip) с warning log.

### Bomb #4 (Round 2): D7 template scan создаёт coupling — любой `*_table.dart` в `lib/core/**` automatically becomes Drift table

- **Probability** через 2 недели: **medium** (если разработчик создаёт non-Drift table file)
- **Blast radius:** `scanCoreTableFiles` ([app_database_generator.ts:127-143](src/features/generation/generators/app_database_generator.ts:127)) recursive scan'ит `lib/core/**/*_table.dart`. Любой файл с suffix `_table.dart` в `core/` — попадает в `@DriftDatabase(tables: [...])`. Если developer создаёт:
  - `lib/core/auth/permissions_table.dart` — non-Drift class (например, just a constants file with permissions table) → попадает в `@DriftDatabase` → `dart run build_runner build` errors про Drift class signature.
  - `lib/core/sync/log_metadata_table.dart` — sync logging metadata (non-Drift) → попадает.
- **Trigger:** Developer добавил helper class с suffix `_table.dart` в `lib/core/`. Случается естественно при naming convention "что-то для table" (mapping, schema config, etc.).
- **Why current code/tests don't catch it:**
  - D7 test `D7 regression` использует `// stub` content — не verifies что real generated database.dart compiles c этим mock import.
  - Нет test'а для "non-Drift `_table.dart` файла" — generator не проверяет AST класса.
- **Mitigation:** **DOCUMENT loudly + add filter** — scan filter должна check что файл содержит `extends Table` или `class X extends Table` regex. Без этого — silent inclusion.

### Bomb #5 (Round 2): TASK-013 priority bumped Medium **на бумаге**, но audit weight 13 entities **не сделан** + нет hard gate

- **Probability** через 2 недели: **medium** (зависит от того, делается ли weight TASK-018 в скором времени)
- **Blast radius:** report.md / backlog.md документируют что audit "может занять 30-60 минут offline". Никто **не делал** audit. weight TASK-018 не имеет блокера ссылающегося на TASK-013 audit completion. Если weight TASK-018 starts → 13 entities mapping без known list false-negatives → silent corruption на entity которая `endsWith('Map')` или должна быть junction но не названа `Map`.
- **Trigger:** weight teamlead запускает TASK-018 без проверки backlog audit. False-negative entity = junction routes через regular template = `update()` not call `createX`-routing = data divergence on update flow.
- **Why current code/tests don't catch it:** Это **process** failure, не code failure. Audit "promise" recorded but never executed.
- **Mitigation:** **BLOCK weight TASK-018 start** до actual audit (list 13 entities в текстовом файле + verdict per entity: junction/regular/uncertain). Текущий "30-60 минут offline" promise — **vapor mitigation**.

### Bomb #6 (Round 2): "85 tests passing" overstates effective coverage — **mock template fakery** в D7 test invalidates regression claim

- **Probability** через 2 недели: **certain** (architectural debt)
- **Blast radius:** report.md заявляет "85 passing (62 baseline + ... +1 D7 regression)". D7 regression test проходит на mock template. Real t115 template на disk uncommitted. **Tests не trace'ят к reality** — это classic "mocks ≠ real backend" gap. Любой future developer reading report.md будет thinking что D7 fix verified, не realizing test fakes.
- **Trigger:** Developer reads report.md / standard-review-report.md → sees "82 / 85 tests passing" → trust ships → real bug hits production.
- **Why current code/tests don't catch it:** Self-referential — test писан **под** mock. Никакого integration teste который reads real `G:/Templates/flutter/t115/database.dart` и validates что fixed-line imports absent.
- **Mitigation:** **Document loudly + add real-template integration test** which fail-loud если template state regresses.

---

## Architectural smells (новые после D6-D12)

1. **Fix lives in two repos but commit chain only covers one** — D7 cleanup в `G:/Templates/flutter/t115/` (separate repo) **uncommitted**. a299f52 в code-generator repo claims "D7 done" but doesn't include the actual fix file. Reviewer cannot verify D7 from `git show a299f52`. This breaks reproducibility.

2. **Mock-first test design hides real-state regressions** — `D7 regression` test уверен что mock template clean. Real template на disk dirty. Nothing connects the two. Result: 100% GREEN tests + broken disk evidence.

3. **t153 was generated BEFORE D7 cleanup applied OR D7 fix doesn't actually fix the flow** — нельзя точно определить из current evidence. Either way: D12 "Fresh t153 verify PASS errors=0" — **NOT a verification of D7 fix**. It's verification of "Drift code generator is tolerant to duplicates". Different invariant.

4. **`combinedInner` collects existing content без normalization** ([orchestrator_patcher.ts:126](src/features/generation/generators/orchestrator_patcher.ts:126)) — if existing content has legacy `features/tasks/expense*` (from pre-D6 broken patch), substitution не применится к нему. Tests не cover this scenario.

5. **D8 `{4}` magic number** — exact match assumption. `{4,}` → `{4}` is locally idempotent fix, но global brittleness. Если template layout changes (e.g. sync_core publishes to pub.dev → path-dep removed → other Packages may shift depth), regex silently no-ops. No alarm.

6. **`scanCoreTableFiles` recursive on `lib/core/**`** — wide net, no AST validation. Any file with `_table.dart` suffix becomes Drift table. Convention-coupled. Если developer disrupts naming convention — silent inclusion + cryptic build_runner errors.

7. **TASK-013 priority bump is text-only** — no actual list of 13 weight entities, no verdict per entity, no hard gate. Promise of "30-60 minutes offline" audit unmet.

8. **task.md acceptance criteria diverged from report.md** — task.md line 211 still `[x] Phase F0` без caveat. report.md line 34 — `done with caveat`. Authoritative source unclear.

9. **D11 silent skip for `syncImports`/`syncEntityTypes`/`syncRegistrations`** — if developer accidentally names new marker exactly one of three names, SectionReplacer silently skips → invisible bug. No assertion / error path. Cosmetic but principle ("silent skip is worse than warning") violated.

10. **t115 working tree has 50+ uncommitted modifications** — not just database.dart. Includes adapter files, sync infra, home_page.dart. Any of these may be load-bearing for "fresh t153 PASS" claim. Without commit — fragile.

---

## Что spec'и врут / умалчивают (round 2)

### 1. Report.md заявляет "Both verify runs (fresh project + post-generate-entity) PASS errors=0. **BUG-009 fully closed.**" (line 309)

- Verify pass true. Но claim "BUG-009 fully closed" — **только** для feature segment substitution part. **Другие patcher behaviors** (legacy combinedInner) не покрыты тестами и могут regress'нуть.

### 2. Report.md заявляет "D7 решение (Variant A — template fix): удалены fixed-line imports ... Теперь scan-based AppDatabaseGenerator — единственный источник истины." (line 191)

- **Реальность:** template fix живёт only в working tree t115. **Не committed**, **не pushed**. Любой fresh checkout t115 → broken. **t153 сам evidence — disk показывает duplicate**.

### 3. Report.md "85 passing (post-D6/D7/D10)" — claim that tests cover real generator behavior

- D7 test mocks the template. Не verifies real disk template. **Test passes — но does nothing to validate D7 fix on real flow.**

### 4. Report.md "fresh t153 verify PASS errors=0" presented as D7 fix evidence

- **t153 database.dart на disk имеет duplicate.** Verify passes потому что Drift проглатывает duplicate at code generation level. **Это не evidence что D7 fixed duplicate — это evidence that Drift is tolerant.**

### 5. Backlog.md TASK-013 priority Medium "proactive: weight TASK-018 hard gate, audit ДО старта"

- Hard gate written **только текстом**. Нет actual file/script/checkpoint preventing TASK-018 from starting. Vapor mitigation.

### 6. Standard-review-report.md "Cosmetic concerns (database.dart duplicates) ⚠ acceptable but flagged"

- Standard reviewer correctly flagged duplicates на t152 BEFORE D7. Round 2 evidence shows **D7 fix didn't change real disk state**. Standard reviewer's "acceptable" rests on Drift implementation detail tolerance, not architectural correctness.

### 7. Task.md acceptance criteria Phase F0 marked `[x]` (line 211); phase tracking marked `done with caveat`

- **Inconsistency**. Acceptance criteria authority should match phase tracking. F0 is `[~]` partial in row 335 of task.md, but acceptance check on row 211 says `[x]`. Pick one truth.

---

## Recommendation per bomb

| Bomb | Decision | Rationale |
|---|---|---|
| Round-2 #1 (D7 uncommitted t115) | **BLOCK release** | Fix не существует в repo sense. fresh clone → broken. **Critical**: commit + push t115 working tree changes. Re-generate t154 после commit'а — verify clean output. **Update D7 test** to read real template, не mock. |
| Round-2 #2 (substitution не trustworthy для legacy state) | **DOCUMENT as known limitation** + add test | Add test для post-broken-state recovery. Если test fails — это real bug.  |
| Round-2 #3 (D8 magic `{4}`) | **DOCUMENT loudly** + comment в code | Add explanatory comment. Add unit tests для depth=3 / depth=5 (no-op). |
| Round-2 #4 (scan coupling) | **DOCUMENT loudly** + add filter idea to backlog | Не блокер сейчас (нет cases). Add to TASK-013 (которая уже in backlog). |
| Round-2 #5 (TASK-013 audit vapor) | **BLOCK weight TASK-018 start** | Hard gate: actual audit list (13 entities, verdict each) ДО TASK-018 spawn. Сейчас vapor mitigation — нельзя trust process. |
| Round-2 #6 (test fakery) | **Punt + document loudly** | Refactor test design — после round-2 #1 fix. |

### Минимальный set перед merge (round 2):

1. **Commit + push D7 cleanup в t115 repo.** Без этого fix не существует. ~10 минут.
2. **Re-generate t154 на ПОСЛЕ commit'а** + verify database.dart **clean** (1× SyncMetadataTable, 1× ConfigurationTable). Это invalidates current "D12 t153 evidence" но enforces correctness.
3. **Refactor D7 regression test** — read real t115 template via fixture, не mock. Test breaks → fix template.
4. **Resolve task.md / report.md F0 inconsistency** — pick `[x]` or `[~]` consistently.
5. **TASK-013 actual audit** — ставить в actual TASK-013 file, не в backlog.md text. Hard gate ссылка на этот task в weight TASK-018 prerequisites.

Без п.1 + п.2 — **запитчены два проекта (t152 + t153) которые "verify PASS" но имеют broken Drift schema**. Это **misleading evidence** в report.md.

---

## Финальная оценка confidence (round 2)

- **Code quality:** 7/10 (D6 substitution real, D8 idempotent fix real, D11 noise suppression real)
- **D7 fix execution:** **2/10** (template edit uncommitted in t115 repo + commit chain in code-generator не охватывает fix file)
- **Test coverage on new surface:** 5/10 (D6 tests good, D7 mock fakery, D10 honest reframe, D11 + D8 OK)
- **Acceptance criteria honesty:** 5/10 (F0 caveat в report.md, но task.md inconsistency; D12 evidence misleading на duplicate t153)
- **Reproducibility:** **3/10** (D7 fix не воспроизводим на любом другом machine)
- **Architectural debt visibility:** 6/10 (most concerns documented in lessons / caveats / backlog, but TASK-013 audit vapor)

**Overall:** Round 2 fixes для Bomb #1 (D6) + #4 (D8) + standard findings (.tmp / SectionReplacer) **closed правильно**. Bomb #2 (D7) **claimed closed but disk evidence proves opposite** — fix lives только в uncommitted t115 working tree, и оба evidence projects (t152 + t153) демонстрируют unchanged duplicate behaviour. Это categorically NOT closed.

**Перед merge:** commit/push t115 changes + regenerate t154 + invalidate stale t152/t153 evidence + update D7 test. Без этих шагов claim "Bomb #2 closed" misleads downstream consumer agents (в первую очередь — weight TASK-018 teamlead который будет читать roadmap "TASK-011 done" и start'нет migration не зная о hidden Drift duplicate latent issue).
