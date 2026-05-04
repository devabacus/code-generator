# Review — Test (TASK-022 / Phase B1)

**Reviewer:** Test Reviewer (read-only, freshly-spawned session)
**Branch:** `feature/TASK-022-b1-codegen-core-multi-template-infrastructure`
**Scope:** test coverage adequacy для injection pattern, regression coverage 11 universal cases в `app_database_generator`, fixture quality, runtime reliability, lint cleanliness, TDD-first claim verification.
**Verdict:** APPROVE с MEDIUM caveats (no DEAL-BREAKERS).

---

## Verified numbers (real, not from executor's claim)

### Mocha test runs (cited)

```
Run 1: 172 passing (44ms)
Run 2: 172 passing (45ms)
Run 3: 172 passing (46ms)
```

Stable across 3 consecutive runs — **0 race conditions / order-dependence detected.** 45ms runtime для 172 unit tests реалистично т.к. вся suite использует `MockFileSystem` (in-memory) — нет I/O.

### Master baseline verification (independent re-run)

```
$ git checkout master && npm run compile && mocha ...
163 passing (41ms)
```

Delta: **172 - 163 = +9 cases**. Matches executor's claim exactly (163 baseline + 9 new = 172 total).

### Per-generator test counts (verified via `grep -c "test("` against master vs branch)

| Generator | Master | Branch | Delta |
|---|---|---|---|
| `relation_patcher.test.ts` | 12 | 15 | +3 |
| `orchestrator_patcher.test.ts` | 16 | 19 | +3 |
| `app_database_generator.test.ts` | 11 | 14 | +3 |

Confirmed: **+3 cases per generator** as required by acceptance criterion.

### Regression coverage 11 universal cases (app_database_generator)

```
$ mocha out/test/generators/app_database_generator.test.js
14 passing (16ms)
```

All 11 baseline cases (cold start, drops imports, idempotent, migration, scans core, BUG-008, D7 regression, G1 defensive strip, идемпотентность, etc.) + 3 new TASK-022 cases = **14/14 passing**. Open Q #3 hard acceptance (preserve directory layout → universal cases continue passing) — **MET**.

### Lint verification

```
$ npm run lint
✖ 18 problems (0 errors, 18 warnings)
```

Master baseline (independent verify on `git checkout master`):

```
✖ 18 problems (0 errors, 18 warnings)
```

**Identical.** Executor's claim "0 errors, 18 pre-existing warnings" — confirmed accurate.

### Compile

```
$ npm run compile
> tsc -p ./
(clean exit)
```

Clean.

### Skipped/pending/it.only checks

Grep на `\.skip\(|\.only\(|pending\(|xtest\(|xit\(` в `src/test/generators/` — **no matches.** Все 9 новых cases полностью реализованы, не stubs.

---

## CRITICAL findings

(none)

## HIGH findings

(none)

## MEDIUM findings

### M1. Alt-config test для `relation_patcher` слабее чем для остальных двух — proof-of-extensibility частичный

Test `'TASK-022 / TemplateConfig: alternate config (mock simplified-shaped) produces alt literals'` (`relation_patcher.test.ts:585-651`) использует **только negative assertions** — `altMainEntity = 'taskAlt'` не matches template files, поэтому patcher early-returns. Тест проверяет:

- ✓ no `generated_start:altRelations` marker block в output (template missing)
- ✓ no `generated_start:oneToManyMethods` leak (config-driven, not hardcoded)
- ✓ dest file unchanged (early return)

**Чего НЕ проверяет:** что alt `markerName` действительно **используется** generator'ом если template files matched. Если бы был bug что generator hardcoded'ит `'oneToManyMethods'` в одном из вспомогательных мест (например, в RegExp construction для search), он не пойман. Сравни с alt-config test для `orchestrator_patcher` (positive assertion: `'register<ExpenseEntity>'` в alt path) и `app_database_generator` (positive: alt template path consumed → output contains `@DriftDatabase` + `CategoryTable`). Те два — strong proof-of-extensibility, relation_patcher — weak.

Тест регенерируется через **regression equivalence** в третьем case (`existing relation patching behavior unchanged под explicit t115 config`) — достаточно для DoD acceptance, но ослабляет TASK-B2 readiness claim. Можно усилить через создание minimal alt template fixture с alt entity name + verify alt marker output. Не блокирует TASK-B1 merge, но flag для TASK-B2.

### M2. Alt-config тесты НЕ exercise `scanDirectories` field

В alt-config test для `relation_patcher` (line 620) — `scanDirectories: ['feature/', 'server/']` идентично t115. Это значит, что field `scanDirectories: string[]` в `TemplateConfig.relationPatcher` **не проверен на substitution**. Если generator hardcoded'ит `['feature/', 'server/']` в scan loop где-то ещё (или ignored config field) — bug не пойман.

Code review (line 39 `relation_patcher.ts`): `const directories = config.templateConfig.relationPatcher.scanDirectories;` — выглядит правильно, но без runtime test нет proof. Не CRITICAL потому что (а) the generator clearly reads field, (б) zero-diff smoke (t166 vs t167) проходит, что косвенно подтверждает single scan-dir пути корректность. Flag для TASK-B2 (когда simplified config landed — сделает alt scan dirs).

### M3. TDD-first claim — невозможно audit'ить из git history

Task.md журнал Step 5 утверждает: *"Initial run: 170 passing / 2 failing (TDD-first invariant met)"*. Однако `git log --reverse master..HEAD` показывает что каждый refactor commit (`1f7263a`, `45c4a79`, `44322ea`) включает **БОТ** generator changes AND test additions в том же commit:

```
1f7263a refactor(relation_patcher): ...
 src/features/generation/generators/relation_patcher.ts | 13 ++--
 src/test/generators/relation_patcher.test.ts          | 136 ++++++
```

Tests НЕ committed отдельно перед generator refactor'ом — squashed в один commit. Это означает **TDD-first claim не auditable из git history alone** — только из executor's local journal. Не нарушает acceptance criteria (DoD не требует strict TDD commit-order), но снижает evidence для review. Если бы reviewer хотел проверить что tests были red перед refactor'ом, он бы не смог через `git checkout 1f7263a^ && mocha`.

Не блокер, но MEDIUM transparency concern.

## LOW findings

### L1. `name: 't115'` literal type (не union) на текущий момент

`template_config.ts:33` — `name: 't115';` (literal, не union `'t115' | 'simplified'` как обещано в task.md "Заметки по реализации"). Это OK потому что task.md явно говорит *"expanded в TASK-B2 (union extension)"* — расширение отложено. Но в alt-config test'ах (e.g. `app_database_generator.test.ts:498`) уже стоит `name: 't115'` — когда TASK-B2 добавит `'simplified'`, эти test'ы получат опцию. Не блокер, просто consistency note.

### L2. Alt-config test для `app_database_generator` использует **fresh** MockFileSystem чтобы избежать default-path fallback — правильное решение, но fixture quality

`app_database_generator.test.ts:498-513` — `freshMock` создан specifically чтобы default template path **не имел файла**, иначе generator бы fallback'нул на default. Это **explicit и правильное** решение (см. comment в test'е), но fixture coupling немного сложнее остальных. Не issue, отметка на будущее когда добавится simplified config — паттерн придётся переиспользовать.

### L3. `report.md` пустой stub

`ai/tasks/active/TASK-022-.../report.md` — template-stub (Резюме / Изменения / Тесты / Риски / Статус — пустые placeholders). Acceptance criterion "Все CLI выводы цитированы" не выполнен на момент review. Per task.md plan step 17 — `report.md` пишется при closure, после reviewer findings. Не блокер для TASK review, но обязателен перед PR merge.

---

## Strengths

1. **Numbers честные.** 172 passing / 0 failing / 45ms — verified independently через 3 consecutive mocha runs. Никакой fabrication.
2. **Lint clean.** 0 errors, 18 warnings — все pre-existing на master baseline (verified независимо). Никаких новых lint'овых нарушений от TASK-022.
3. **+9 test cases полностью реализованы** (3 на generator, без `.skip`/`.only`/`pending`). Acceptance criterion `≥9 new cases` — met.
4. **Regression coverage 11 universal cases preserved** — все 11 baseline cases в `app_database_generator.test.ts` продолжают passing под t115 config. Open Q #3 hard requirement met.
5. **Alt-config tests для `orchestrator_patcher` и `app_database_generator` имеют strong positive + negative assertions** — alt path written, default path not created (orchestrator); alt template consumed, expected output structure (database). Сильный proof-of-extensibility для тех двух generators.
6. **Equivalence tests (regression invariant)** в каждом из 3 generator test файлах — `explicit t115TemplateConfig()` output identical to default config output. Гарантирует zero-diff между pre-TASK-022 hardcoded behavior и post-TASK-022 config-driven behavior.
7. **Все 4 CLI call-sites** (`create_project.ts`, `generate_entity.ts`, `create_data_files_by_replacement.ts`, `create_new_project.ts`) **БЕЗ изменений** — backwards compat через `GenerationConfig` constructor default. Architecture decision корректная (не ломает существующие consumers).
8. **Zero-diff smoke evidence on disk** — t165/t166/t167 projects присутствуют в `G:/Projects/Flutter/serverpod/` (verified `ls`), task.md журнал документирует diff PASS в `lib/` directories для всех трёх (`_flutter/lib`, `_server/lib`, `_admin/lib`).
9. **Bonus fix line 136 `relation_patcher.ts`** — `templEntity: 'category'` literal → `templEntity: templateRelatedEntity` variable. Это additional consistency improvement не упомянутое в acceptance criteria — quality-of-implementation хорошо.
10. **`templateConfig` constructor default подход** — backwards compat preserved для всех existing call-sites (4 CLI/VS Code commands). Чисто декларативный wire-up без mutation existing code paths.

---

## Verdict

**APPROVE.**

Нет CRITICAL или HIGH findings. 3 MEDIUM finding'а (M1/M2/M3) flagged как improvement opportunities для TASK-B2 readiness — не блокеры:

- M1 (relation_patcher alt-config weak) — proof-of-extensibility частичный, но regression equivalence test compensates
- M2 (`scanDirectories` not exercised) — config field читается generator'ом (code review), но runtime test пропускает substitution case
- M3 (TDD-first not auditable from git) — squashed commits скрывают red→green ordering, но не блокирует acceptance

3 LOW findings — cosmetic / forward-looking. **Executor's numbers (172/45ms/+9/0-errors/18-warnings) — все verified, none fabricated.**

Catch count: **CRITICAL=0, HIGH=0, MEDIUM=3, LOW=3.**

Готовность к merge с условием L3 fix (`report.md` filled с цитированными CLI выводами + zero-diff evidence) — что и так в task.md plan step 17 запланировано.
