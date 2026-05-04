# Generator-Core Review — TASK-022 Phase B1

**Reviewer:** Generator-Core (read-only)
**Date:** 2026-05-03
**Scope:** refactor correctness в 3 generators (`relation_patcher.ts` / `orchestrator_patcher.ts` / `app_database_generator.ts`) + `template_config.ts` factory + fixture migration + scope creep detection
**Branch:** `feature/TASK-022-b1-codegen-core-multi-template-infrastructure`
**Diff:** 11 files / +816 / -11 lines (`git diff master..HEAD --stat`)

---

## Метод верификации

- Side-by-side: `git show master:<file>` vs current для каждого touched generator
- Search для оставшихся hardcoded literals via Grep
- Compile + mocha runs (172 passing, 0 failing)
- `git diff master..HEAD --stat` для scope creep
- Test logic verification (positive + negative assertions для alt-config tests)

---

## CRITICAL

(нет)

---

## HIGH

### H1. Бонус-fix в `relation_patcher.ts:136` подтверждён, но в task.md план его не отмечал — overstated в plan/report

Pre-refactor master line 136:
```typescript
const destinationPath = path.join(destinationBasePath, this._getDestinationPath(new GenerationConfig({ ...config, templEntity: 'category' }), relativePath));
```

Post-refactor (current line 136):
```typescript
const destinationPath = path.join(destinationBasePath, this._getDestinationPath(new GenerationConfig({ ...config, templEntity: templateRelatedEntity }), relativePath));
```

**Verdict:**
- `'category'` literal **существовал** в pre-refactor master (verified via `git show master:src/features/generation/generators/relation_patcher.ts`).
- Substitution corrects пропущенный literal — `templateRelatedEntity` уже извлечён из `config.templateConfig.relationPatcher.templateRelatedEntity` на line 22, поэтому замена на `templateRelatedEntity` производит **identical поведение для t115** (t115 templateRelatedEntity = 'category').
- Это **закрывает hidden literal** который иначе остался бы hardcoded и нарушал acceptance criterion: "RelationPatcher читает … literals больше не hardcoded" (task.md line 48).
- **NOT regression** — для t115 поведение идентичное (zero-diff invariant preserved per executor's т166/т167 evidence).

**Concern:** task.md "План работы" Step 6 упоминает bonus fix как inline work, но "Не-цели" / "Запрещено" не explicitly разрешает это. Reading scope strictly это можно интерпретировать либо как (a) правильное completion того же refactor, либо (b) scope expansion. Я считаю (a) — но executor должен был flag bonus в **report.md** перед commit'ом для теmleader awareness. Sub-finding: report.md (line 1-23) — placeholder template, не заполнен реальными числами/discoveries. Это **HIGH gap** vs acceptance criterion: "report.md написан с цитированными CLI выводами" (task.md line 58).

**Recommendation:** обязать executor заполнить report.md перед merge. Bonus fix явно зафиксировать в "Изменения" секции с формулировкой: "Inline cleanup: missed literal в `_getDestinationPath` call (line 136 pre-refactor) — closes incomplete refactor, без поведенческих изменений для t115".

---

### H2. Скрытые hardcoded literals в `orchestrator_patcher.ts` остались — task.md scope этого не покрывал, но риск unclear для future TASK-B2

После grep по `'category'` / `'task'` / `'taskTagMap'` literals:

- `orchestrator_patcher.ts:208` — `const tplEntity = isJunction ? 'taskTagMap' : 'category';` (в `_buildImportsSnippet`)
- `orchestrator_patcher.ts:250` — `const tplEntity = isJunction ? 'taskTagMap' : 'category';` (в `_buildRegisterSnippet`)
- `orchestrator_patcher.ts:261` — `'task'` / `'tag'` fallback strings в FK extraction
- Inline templates `_ENTITY_IMPORTS_TEMPLATE` / `_ENTITY_REGISTER_TEMPLATE` / `_JUNCTION_*` (lines 410-474) — содержат hardcoded `category`, `Category`, `taskTagMap`, `TaskTagMap`, `task_tag_map`, `features/tasks/`

**Verdict per task.md scope:**
- task.md line 29 explicitly scope: "extract hardcoded `'lib', 'core', 'sync', 'sync_orchestrator_provider.dart'` path → template config" — **только path**, не snippet templates.
- Scope was tight (per ClaudeAdv DEAL-BREAKER #3 mitigation). Executor стик в scope.

**Concern:** report.md / task.md "Журнал" не flag'ает что эти literals остались. Acceptance criterion line 48: "RelationPatcher читает `templateMainEntity` / `templateRelatedEntity` / `markerName` / `scanDirectories` из config (literals больше не hardcoded)" — **Relational** patcher fully covered. Но **OrchestratorPatcher** acceptance line 49 более узкий: "строит orchestrator path из `config.templateConfig.orchestrator.relativePath` (path больше не hardcoded)" — здесь scope действительно только path.

Это formal compliance, но **future TASK-B2 (simplified template content) может столкнуться с landmine**: simplified template имеет другие entity literals в snippet templates → snippet builder pass templates через `category`/`taskTagMap` literals будет ломать simplified emission. Это **известное deferred work**, но nigde не зафиксировано в backlog/report.

**Recommendation:** в report.md добавить sub-section "Deferred (TASK-B2 scope)" с явным списком:
- `orchestrator_patcher.ts` snippet templates (`_ENTITY_*` / `_JUNCTION_*` lines 410-474) содержат hardcoded `category`/`taskTagMap` placeholders
- `orchestrator_patcher.ts` lines 208, 250, 261 — `'category'` / `'taskTagMap'` / `'task'` / `'tag'` fallback literals в `_buildImportsSnippet`/`_buildRegisterSnippet`/FK extraction
- Эти literals **не нарушают TASK-B1 scope**, но TASK-B2 simplified config будет требовать second pass refactor

Без этой записи TASK-B2 executor может surprise'нуться "ах, ещё literals остались".

---

## MEDIUM

### M1. Alt-config tests для `relation_patcher` — assertion слабый (no-op tautology)

[`relation_patcher.test.ts:593-649`](../../../src/test/generators/relation_patcher.test.ts#L593) — alt config test использует `altMainEntity = 'taskAlt'` который **не матчится** existing fixtures (`task_dao.dart`). Patcher early-return'ает (no template files match → no-op). Test asserts:
- `!result.includes('generated_start:altMarkerName')` ✓
- `!result.includes('generated_start:oneToManyMethods')` ✓
- `result === dest` (file unchanged) ✓

Это работает как proof-of-config-read, но логика тривиальна: **любая** замена `templateMainEntity` на non-existent value → early return. Test не доказывает что patcher **использует** altMarkerName при actual matching scenario. Strongest test был бы: создать fixture с altMainEntity matching files (e.g. `taskAlt_dao.dart` template) + alt markerName в content, verify alt marker block produced.

**Verdict:** существующего достаточно для basic TDD-injection criterion (≥3 cases per generator). Но это **минимально strong** test — следующий refactor может rеgress с тестами всё ещё passing. Для TASK-B1 acceptable; для TASK-B2 (real simplified config) рекомендую stronger tests.

**Recommendation:** не блокер для merge; можно записать в backlog как "TASK-B2 prerequisite: stronger alt-config matching test для RelationPatcher" — тест добавит alt fixture с matching template + assert marker name из config используется.

---

### M2. Database alt-path test использует freshMock workaround — комментарий честный, но архитектура mockFs limit'ует strength

[`app_database_generator.test.ts:484-519`](../../../src/test/generators/app_database_generator.test.ts#L484): тест comment'ом признаёт ограничение MockFileSystem ("Cannot delete from mock easily; instead use fresh mock"). Тест работает: alt config + only alt template path file → generator successfully reads alt template. Но workaround не идеален — лучшее решение было бы добавить `MockFileSystem.removeFile()` (через existing `deleteFile`?) или явный `clear()` partial. Functionally OK.

**Verdict:** не блокер. MockFileSystem уже имеет `deleteFile()` (line 74-76) который мог бы быть использован для удаления default template + использовать существующий `mockFs`. Cleaner, но not material для acceptance.

**Recommendation:** в follow-up (не TASK-B1) — заменить freshMock на `mockFs.deleteFile(TEMPLATE_DB_PATH)` в setup для cleaner intent.

---

### M3. `relativePath = []` edge case — defensive поведение работает, но не tested

`orchestrator_patcher.ts:45-48` использует `path.join(config.targetFlutterProjectPath, ...config.templateConfig.orchestrator.relativePath)`. Если `relativePath = []` → `path.join(targetFlutterProjectPath)` возвращает только project path который **не файл** → `exists()` false → patcher returns silently. Безопасно, но silent failure.

**Verdict:** не блокер для TASK-B1. Но при future TASK-B2 misconfiguration легко не заметить. Minimum хорошо было бы explicit guard:
```typescript
if (config.templateConfig.orchestrator.relativePath.length === 0) {
    throw new Error('TemplateConfig.orchestrator.relativePath cannot be empty');
}
```
**Recommendation:** add to TASK-B1/B2 follow-up: defensive validation в `t115TemplateConfig()` factory или GenerationConfig constructor для invalid empty arrays.

---

## LOW

### L1. Тесты используют raw `templateConfig: { name: 't115', ... }` literal вместо spread'ования `t115TemplateConfig()`

[`relation_patcher.test.ts:614-625`](../../../src/test/generators/relation_patcher.test.ts#L614), [`orchestrator_patcher.test.ts:798-805`](../../../src/test/generators/orchestrator_patcher.test.ts#L798), [`app_database_generator.test.ts:498-509`](../../../src/test/generators/app_database_generator.test.ts#L498) — alt-config tests строят TemplateConfig literally + копируют поля из `t115TemplateConfig()`:
```typescript
templateConfig: {
    name: 't115',
    relationPatcher: { ... alt overrides ... },
    orchestrator: t115TemplateConfig().orchestrator,
    database: t115TemplateConfig().database,
}
```

Чище был бы spread:
```typescript
templateConfig: {
    ...t115TemplateConfig(),
    relationPatcher: { ... alt overrides ... },
}
```

**Verdict:** косметика. Текущий код readable, no functional issue.

---

### L2. Comment в `template_config.ts:33` `name: 't115';` — тесты passing `name: 't115'` для alt configs

В [`relation_patcher.test.ts:615`](../../../src/test/generators/relation_patcher.test.ts#L615): alt config имеет `name: 't115'` хотя сам конфиг alt-shaped. Логически inconsistent (alt config с alt entity literals — но `name='t115'`). Не блокер, потому что `name` field per template_config.ts:32 documented как "Используется только для diagnostic / logging". Но всё равно misleading reader'у теста.

**Recommendation:** заменить в alt configs `name: 't115'` на нечто типа `name: 't115' as const` плюс комментарий "alt shape using t115 schema as marker; real simplified will have name='simplified'", или использовать `as TemplateConfig` assertion.

---

### L3. Report.md placeholder состояние — контентные заполнения отсутствуют

[`report.md`](../../../ai/tasks/active/TASK-022-b1-codegen-core-multi-template-infrastructure/report.md) состоит из template placeholders ("Что было реализовано" / "(количество или список)" etc.). Per task.md line 58 acceptance criterion: "report.md написан с цитированными CLI выводами (real numbers: mocha passing count + verify errors/warnings + zero-diff evidence)" — это **не выполнено**. Это flagged под H1, повторяется здесь как явный criterion для acceptance.

---

## Strengths (что сделано хорошо)

1. **Tight scope discipline.** Diff stat shows 11 files / +816 / -11. Только 3 generators + config + tests + status.md + task/report. **Zero scope creep** в areas вроде `parsers/`, `replacement/`, `dictionary_presets/`, `generation_service/`. Per ClaudeAdv DEAL-BREAKER #3 mitigation — tight scope held.

2. **Backwards-compat default factory.** `GenerationConfig` constructor [line 100](../../../src/features/generation/config/generation_config.ts#L100): `this.templateConfig = config.templateConfig || t115TemplateConfig();` — все existing callers (create_project / generate_entity / 7 предшествующих TASK tests) работают без модификации. Per task.md "План работы" Step 9: "NO changes required" call-sites — verified. Это elegantly preserves backwards-compat invariant.

3. **Refactor correctness — literals match pre-refactor exactly.** Side-by-side check:
   - `relation_patcher.ts` master:18-19: `'task'` / `'category'` → post:21-22 reads `config.templateConfig.relationPatcher.templateMainEntity` / `templateRelatedEntity` → factory line 113-114 supplies `'task'`/`'category'`. ✓
   - `relation_patcher.ts` master:20: `'oneToManyMethods'` → post:23 → factory:115. ✓
   - `relation_patcher.ts` master:36: `['feature/', 'server/']` → post:39 → factory:116. ✓
   - `orchestrator_patcher.ts` master:42-48 hardcoded path → post:45-48 reads `config.templateConfig.orchestrator.relativePath` → factory:119. ✓
   - `app_database_generator.ts` master:21 hardcoded path → post:25-28 reads `config.templateConfig.database.templateRelativePath` → factory:122. ✓

4. **Bonus fix line 136 — correct cleanup.** Verified existed in master pre-refactor. Substitution с `templateRelatedEntity` (now sourced from config) preserves identical behavior для t115 (config supplies `'category'`). Это **closes incomplete refactor** который иначе оставил бы hidden hardcoded literal в same generator. Catch.

5. **TDD discipline.** Per task.md line 142: "**Baseline:** 170 passing / 2 failing (TDD-first invariant met)". Executor write tests first (alt-path tests FAILING до refactor), затем refactor зеленит → 172 passing. Это правильный порядок.

6. **Test isolation для alt-path scenarios.** `app_database_generator` alt-path test creates `freshMock` (line 491) чтобы prove default template path действительно НЕ нужен. Если бы patcher был hardcoded — generator упал бы reading default path в freshMock. Test correctly proves config-driven behavior.

7. **JSDoc richness в template_config.ts.** Каждое field имеет: (a) описание, (b) reference к pre-TASK-022 line numbers, (c) example для t115, (d) usage description. Future maintainability solid.

8. **Compile + lint clean.** `tsc -p ./` нет errors. `npm run lint` 0 errors / 18 pre-existing warnings (unrelated к TASK-022).

9. **Mocha 172 passing / 0 failing** verified independently (run 2026-05-03 review session).

---

## Verdict

**APPROVE WITH REQUIRED FIX before merge:** заполнить **report.md** реальным содержимым (H1 / L3) включая:
- Mocha numbers (`172 passing`, baseline `163` per task.md line 51)
- Verify CLI output (errors=0, warnings=1, infos=44 per task.md line 149)
- Zero-diff evidence (t166/t167 lib/ comparison per task.md line 150)
- Bonus fix disclosure (line 136 → templateRelatedEntity)
- Deferred orchestrator literals (per H2) в Backlog section

**Подсказки teamlead'у к декомпозиции:**
- Без report.md заполнения acceptance criterion "report.md написан с цитированными CLI выводами" не closed → нельзя merge per task.md line 58
- H1 / L3 — должны решаться вместе (один update reportа)
- H2 — backlog запись (1 строка); MEDIUM/LOW не блокируют

**Refactor correctness:** ✓ (5 strengths cover это)
**Scope creep detection:** ✓ (zero creep, tight 3-generator scope)
**Bonus fix verification:** ✓ (existed in master, correct substitution)
**Hidden literals scan:** ✓ (orchestrator snippet templates flagged per H2; in scope literals все extracted)
**Edge cases:** ✓ (default factory + empty array path defensive — M3 nice-to-have)
**Fixture migration:** ✓ (existing 'task'/'category' fixtures pass через t115 default config; no breaking changes к pre-existing tests)

---

## Catch count

- CRITICAL: 0
- HIGH: 2 (H1 report заполнение / H2 deferred literals disclosure)
- MEDIUM: 3 (M1 weak alt-config test / M2 freshMock workaround / M3 empty-array edge case validation)
- LOW: 3 (L1 test literal cleanup / L2 alt config name diagnostic / L3 report.md placeholder — duplicates H1)
- Strengths: 9

**Total findings:** 8 actionable + 9 strengths

**Block merge?** YES — на H1 (report.md заполнение). Остальные — backlog или follow-up. После H1 fix + brief backlog запись для H2 → можно merge.
