# Generator-Core Review — TASK-023 Session 1 (BUG-019 fix subset)

**Reviewer role:** Generator-core internals — refactor correctness, hidden literals, public API stability, idempotency, junction detection, scope creep.
**Branch:** `feature/TASK-023-b2-simplified-template-content` @ HEAD `71e3a67`
**Review scope:** Session 1 codegen-only refactor (BUG-019 fix). Bootstrap of `G:/Templates/flutter/simplified/` directory deferred к Session 2.
**Independent verification:** mocha re-run по сводке executor'а — **178 passing (44ms)** ✓ (cited number confirmed).

---

## Methodology

1. Read TASK-023 task.md scope + STOP-gates
2. Read BUG-019 evidence file (lines 208/250/261-262 + `_ENTITY_*` / `_JUNCTION_*` constants 410-474)
3. Read post-refactor `template_config.ts` (490 lines) + `orchestrator_patcher.ts` (442 lines)
4. Side-by-side diff vs master via `git show master:...` extraction
5. Hidden literal Grep на `'category'` / `'taskTagMap'` / `'task'` / `'tag'` / `_ENTITY_` / `_JUNCTION_` / `features/tasks/`
6. Public API signature comparison (constructor + `patch()` + private methods)
7. Mocha re-run independent verification (178 passing)
8. `git diff master..HEAD --name-only` для scope creep detection

---

## Critical findings

**Нет critical findings.** Refactor correctness OK на всех проверенных axes.

---

## High findings

**Нет high findings.**

---

## Medium findings

### M1 — `templateRelativePath` для simplified config = identical к t115 (по design, но scope check)

`simplifiedTemplateConfig()` returns identical `database.templateRelativePath` (`['core', 'data', 'datasources', 'local', 'database.dart']`) и identical `orchestrator.relativePath` (`['lib', 'core', 'sync', 'sync_orchestrator_provider.dart']`) к t115. Это правильно per ADR-0005 §7.3 stack lock invariant (Clean directory layout preserved). Подтверждение в комментариях:

```ts
// Same path as t115 (Clean directory layout preserved per ADR-0005 §7.3).
relativePath: ['lib', 'core', 'sync', 'sync_orchestrator_provider.dart'],
```

Это не дефект — observation что Session 1 не вводит divergence в paths. Когда Session 2 bootstrap'ит реальные simplified template файлы, path'ы должны совпадать, иначе patcher не найдёт целевые orchestrator/database файлы. Recorded для Session 2 reviewer'а.

### M2 — `simplifiedTemplateConfig().relationPatcher.templateRelatedEntity = 'configuration'` (а не concrete related entity)

В simplified factory:
```ts
templateMainEntity: 'configuration',
templateRelatedEntity: 'configuration',
```

`templateMainEntity == templateRelatedEntity` — обе `'configuration'`. Это корректно для simplified bootstrap (Configuration baseline = singleton без relation), но `RelationPatcher` activates только когда target entity has FK relation — как описано в комментарии `(template "main" = configuration ... ⚠ Когда Phase C synthetic добавляет concrete FK fixture (e.g. Project + Task), эти literals потребуется обновить)`.

Risk: если developer вызовет `generate-entity` с FK relation на simplified template до Phase C synthetic update — `RelationPatcher` будет искать `configuration_dao.dart` template с `:oneToManyMethods` marker block, который по факту singleton baseline не имеет. Ничего не сломает (patcher gracefully skip'ает если marker отсутствует), но non-functional. Soft-flag для Session 2 + Phase C.

---

## Low findings

### L1 — Comment line 81 unchanged ссылается на removed `templFeatureName` field

В `orchestrator_patcher.ts:81`:

```ts
// через config.templFeatureName side-effect (templFeatureName всегда 'tasks' implicitly).
```

Это исторический комментарий о pre-refactor поведении — корректно, информативно, не вводит читателя в заблуждение. Можно оставить как есть (документирует transition); опционально можно перефразировать на `pre-TASK-023 derived from config.templFeatureName`.

### L2 — `T115_ENTITY_REGISTER_TEMPLATE` имеет 1 дополнительный trailing newline по сравнению с master в исходнике

В master `_ENTITY_REGISTER_TEMPLATE` следует прямо за полем `_JUNCTION_REGISTER_TEMPLATE` через свойство класса; в feature branch `T115_ENTITY_REGISTER_TEMPLATE` — module-level constant с blank line после. Это **whitespace вокруг declaration**, **не внутри template literal**. Template content byte-identical (verified через `diff /tmp/m1.txt /tmp/f1.txt`).

Расхождение только: `<     private readonly _ENTITY_REGISTER_TEMPLATE = ` vs `> const T115_ENTITY_REGISTER_TEMPLATE = ` — то есть decl line (expected as part of refactor). Cosmetic.

### L3 — `simplifiedTemplateConfig()` junction snippets используют placeholder `configuration_map` без concrete fixture

Per executor's own honesty note в comment lines 376-383:
```ts
// **Honest limitation note:** Symmetric с t115 в shape (substitution flow
// mechanical), но конкретные literal values (`configuration_map`) — это
// placeholder; t115 has `task_tag_map` от concrete TaskTagMap fixture.
```

Когда Phase C synthetic добавляет concrete junction fixture в simplified template (e.g. ProjectMember на Project + User), `configuration_map` placeholder + `parentA`/`parentB` FK fallbacks потребуют update'а. Documented honestly — ожидаемое следствие decoupling Session 1 (codegen) от Session 2 (template content).

---

## Strengths

1. **Snippet content byte-identical с master.** Все четыре extracted snippets (`T115_ENTITY_IMPORTS_TEMPLATE` / `T115_JUNCTION_IMPORTS_TEMPLATE` / `T115_ENTITY_REGISTER_TEMPLATE` / `T115_JUNCTION_REGISTER_TEMPLATE`) — verified literally identical к master `_ENTITY_*` / `_JUNCTION_*` constants (через `git show` + `diff`). Только location moved (file-local readonly fields → module-level const).

2. **All hardcoded literals удалены из orchestrator_patcher.ts runtime code.** Grep `'category'` / `'taskTagMap'` / `'task'` / `'tag'` / `_ENTITY_` / `_JUNCTION_` / `features/tasks/` показывает только matches **в комментариях** (5 lines: 38-40 docstring, 227 / 288 / 379 inline comments). Никаких runtime literal references — все substitutions через `config.templateConfig.orchestrator.*`.

3. **Public API signature unchanged.** `constructor(private fileSystem: IFileSystem)` + `patch(config, model)` — identical к master. Только private methods (`_buildImportsSnippet` / `_buildRegisterSnippet`) получили `config: GenerationConfig` first parameter — internal change без breakage downstream callers.

4. **Substitution semantics preserved.** Order matters в `_substitutePlaceholders` (feature path → snake → Pascal → camel) — unchanged. `_substituteJunctionFKs` для `__FK1__`/`__FK2__`/`__FK1Pascal__`/`__FK2Pascal__` — unchanged. Pascal/camel/snake helpers (`cap`/`unCap`/`toSnakeCase`) — unchanged imports.

5. **Idempotency invariants preserved.** `_patchMarkerBlock` logic byte-identical с master (recovery from legacy duplicates, idempotent skip when snippet already present, `\n{3,}` collapse). Verified mocha `idempotent re-run` test passing.

6. **Junction detection routing intact.** `JunctionDetector.isJunctionEntity(model)` (TASK-013 utility) routes к `junctionImportsTemplate` / `junctionRegisterTemplate` через config — verified via mocha tests `TASK-013: RolePermission (no Map suffix...)` + `TASK-013: CustomerUser (3 FK + nullable FK...)` + `TASK-013 backward compat: TaskTagMap` все passing.

7. **Zero scope creep.** `git diff master..HEAD --name-only`:
   - `ai/docs/status.md` (TASK-023 active marker)
   - `ai/tasks/active/TASK-023-.../report.md` + `task.md` (task tracking)
   - `src/features/generation/config/template_config.ts` (refactor + simplified factory)
   - `src/features/generation/generators/orchestrator_patcher.ts` (refactor)
   - `src/test/generators/orchestrator_patcher.test.ts` (+5 new tests)
   - **Zero edits в `parsers/` / `replacement/` / `dictionary_presets/` / иной generator** — clean scope.

8. **Test coverage adequate для Session 1 deliverable.**
   - `simplifiedTemplateConfig() factory exposes snippet content fields` — factory shape proof
   - `t115TemplateConfig() factory snippet content matches pre-TASK-023 hardcoded constants` — regression proof t115 literals preserved
   - `simplified config produces simplified snippet output (positive proof)` — end-to-end positive path
   - `alt config с custom snippets produces alt content` — sentinel proof patcher reads from config (CUSTOM_ALT_*_SENTINEL doesn't leak from t115 default)
   - `alt junction config с custom FK fallbacks` — junction routing positive
   - **5 BUG-019 specific tests** + existing 173 baseline = 178 total. Verified mocha re-run.

9. **Substitution sentinels documented.** Each `*Template` field в `TemplateConfig.orchestrator` имеет docstring перечисляющий expected substitution placeholders (`category`/`Category` для regular, `task_tag_map`/`taskTagMap`/`TaskTagMap`/`__FK1__`/`__FK2__` для junction). Future maintainer'у понятно как substitution flow работает.

10. **Pre-refactor reference points в comments.** `T115_*_TEMPLATE` constants reference `Pre-TASK-023 location: orchestrator_patcher.ts:410-416` etc — позволяет git archaeology быстро найти origin.

---

## Verdict

**APPROVE для Session 1 deliverable.**

BUG-019 fix landed correctly. Refactor preserves t115 zero-diff invariant (mocha 173 baseline tests passing identically pre- and post-refactor). `simplifiedTemplateConfig()` factory готов к consumption Session 2 bootstrap'ом. Public API stable, idempotency / junction detection / commutativity invariants preserved. Hardcoded literals / `_ENTITY_*` / `_JUNCTION_*` constants полностью elimin'ированы из runtime code (только в комментариях для исторической справки).

**Catch count: 0 Critical / 0 High / 2 Medium / 3 Low** — все Medium/Low либо follow-up Session 2 observations (M1, M2 для Phase C), либо cosmetic (L1, L2, L3).

**Session 2 follow-up (не блокирует Session 1 commits):**
- M2 — обновить simplified `relationPatcher` literals когда Phase C synthetic добавит concrete FK fixture
- L3 — обновить `configuration_map` placeholder + `parentA`/`parentB` FK fallbacks когда concrete junction появится в simplified template

**Independent fact-check:**
- Executor claim **178 passing** ✓ verified (mocha re-run).
- Executor claim **0 lint errors** не verified этим reviewer'ом (out-of-scope для generator-core review; architecture/test reviewers покрывают).
- Executor claim "snippet content byte-identical" ✓ verified (git show + diff).
- Executor claim "no hardcoded literals в runtime code" ✓ verified (Grep — only comment matches).
