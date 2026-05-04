# BUG-019: Orchestrator patcher snippet templates содержат hardcoded entity literals

**Статус:** Closed (validated end-to-end через default flow + legacy flow smokes 2026-05-04)
**Обнаружено:** 2026-05-04 (TASK-022 / Phase B1 — Generator-core review HIGH H2 + Adversarial review HIGH H-3)
**Закрыто:** 2026-05-04 (TASK-024 Session E3d2 — default flow t176 PASS errors=0 + legacy flow t177 PASS errors=0)
**Источник:** Multi-agent code review TASK-022 round 1
**Критичность:** Medium (TASK-B2 landmine — не блокирует TASK-B1 closure; блокирует simplified template emission в TASK-B2)

## Симптом

`src/features/generation/generators/orchestrator_patcher.ts` рефактор'ил **path** компоненты в TASK-022 (`templateConfig.orchestrator.relativePath`) — primary B1 scope acceptance закрыт. Однако сами snippet template strings + entity-type fallback literals внутри `orchestrator_patcher.ts` содержат hardcoded entity references, которые при emission генерируют target target output с literal `category` / `taskTagMap` / `task` / `tag` / `features/tasks/` substring references — т.е. simplified template не сможет emit'нуть corrected orchestrator content без second-pass refactor этих snippets.

## Verified evidence (Grep на feature branch)

`src/features/generation/generators/orchestrator_patcher.ts`:

- **Line ~208** (`_buildImportsSnippet`): `const tplEntity = isJunction ? 'taskTagMap' : 'category';`
- **Line ~250** (`_buildRegisterSnippet`): same pattern с hardcoded `'taskTagMap'` / `'category'`
- **Lines ~261-262** (FK extraction): hardcoded `'task'` / `'tag'` fallback strings
- **Lines ~410-474** (template strings): `_ENTITY_IMPORTS_TEMPLATE`, `_JUNCTION_IMPORTS_TEMPLATE`, `_ENTITY_REGISTER_TEMPLATE`, `_JUNCTION_REGISTER_TEMPLATE` — full snippet strings содержат `category`, `Category`, `taskTagMap`, `TaskTagMap`, `task_tag_map`, `features/tasks/` substring literals (template fixture entity references)

Confirmed Generator-core reviewer + Adversarial reviewer 2026-05-04.

## Корневая причина

TASK-022 acceptance scope (per task.md acceptance criterion line 49): *"OrchestratorPatcher строит orchestrator path из `config.templateConfig.orchestrator.relativePath` (path больше не hardcoded)"*. Это **path-only** scope — snippet content templating НЕ был частью B1.

`OrchestratorPatcher` сейчас выполняет string substitution через `model.className` / feature segment для конкретного entity при emission, но сами template constants (`_ENTITY_*` / `_JUNCTION_*`) внутри файла содержат t115 fixture entity names (`category` для regular entity / `task_tag_map` для junction). Substitution работает только если target entity-type literal соответствует одному из twoе hardcoded literals (`category` / `taskTagMap`) — для simplified template с другими fixture entities нужен extended config shape.

## Production impact

- **Currently zero** для t115 (consumers TASK-022 closes paths-only — target rendering для t115 unaffected, zero-diff smoke t166 vs t167 confirmed identical).
- **Future risk (TASK-B2 scope):** simplified template emission будет требовать другие entity literals в snippet content → static `'category'` / `'taskTagMap'` fallbacks не будут matched → генерация с wrong import paths / wrong feature segment / wrong adapter class refs.

## Why this is TASK-B2 scope, не B1

TASK-022 acceptance scope (per task.md): "extract hardcoded `'lib', 'core', 'sync', 'sync_orchestrator_provider.dart'` path → template config". Это **path templating** acceptance, что closed (verified 173 mocha tests passing, zero-diff smoke confirmed). **Snippet content templating** = separate axis (что генерируется внутри target sync_orchestrator_provider.dart), относится к simplified template content (TASK-B2 scope).

## Fix proposal (TASK-B2)

Extend `TemplateConfig.orchestrator` shape:

```typescript
orchestrator: {
    relativePath: string[];
    // NEW в TASK-B2:
    entityTemplate: string;        // _ENTITY_*_TEMPLATE content abstracted
    junctionTemplate: string;      // _JUNCTION_*_TEMPLATE content abstracted
    regularEntityFallback: string; // 'category' literal fallback line ~208/~250
    junctionEntityFallback: string; // 'taskTagMap' literal fallback
    junctionFkFallbacks: { fk1: string; fk2: string }; // 'task' / 'tag' fallbacks
}
```

Refactor `_buildImportsSnippet` / `_buildEntityTypeSnippet` / `_buildRegisterSnippet` в `orchestrator_patcher.ts` для consume snippet strings из config вместо file-local constants.

## Acceptance criteria для fix

- [ ] Extend `TemplateConfig.orchestrator` interface fields (entityTemplate / junctionTemplate / fallbacks)
- [ ] Migrate hardcoded literals lines 208/250/261/262 → config field reads
- [ ] Migrate `_ENTITY_*_TEMPLATE` / `_JUNCTION_*_TEMPLATE` constants → config-driven strings (or template files в `assets/`)
- [ ] Add unit tests `orchestrator_patcher.test.ts`: alt config с alt entity literals → alt output snippet content
- [ ] Verify 173 baseline tests preserved (no regression на t115 default factory)
- [ ] E2E smoke на simplified config (TASK-B2 fixture project) — orchestrator emits корректные simplified-shaped imports + register calls

## Estimate

~3-5 hours (config shape extension + 4 call-sites refactor + new tests + integration verify).

## Связанные

- **TASK-022 / Phase B1** (closure 2026-05-04) — primary B1 scope path-only refactor done; snippet content deferred здесь
- **review-generator-core.md** (HIGH H2 finding) — recommended explicit backlog disclosure
- **review-adversarial.md** (HIGH H-3 finding) — recommended explicit acknowledgment
- **ADR-0005 Section 3.1** — sync_core adapters generation invariant ("orchestrator wiring must inherit from template config") — relevant constraint
- **Discussion #11 Q3=a** — refactor scope tight для B1, expanded в B2 (12-point Decision)
- **TASK-B2** — будет primary consumer этого fix

## Priority

**Medium** — TASK-B2 acceptance gate. Без этого fix simplified template emission не будет работать корректно. Schedule: TASK-B2 scope.

## Closure note (2026-05-04, TASK-024 Session E3d2)

Closed end-to-end через TASK-023 (config-shape extension) + TASK-024 Sessions A-E3d2 (simplified template directory bootstrap + Phase D CLI flag + Session E3d2 default-switch fix).

**Verification evidence:**
- `t176` default flow (`create-project --name t176`) → `verify --name t176` PASS errors=0, warnings=0, infos=30. Simplified ceremony reduction confirmed (0 usecases в `t176_flutter/`, 0 abstract repository interfaces).
- `t177` legacy flow (`create-project --name t177 --template t115`) → `verify --name t177` PASS errors=0, warnings=1, infos=44. Regression preserved.
- Mocha 181/181 passing post-fix (зерo regressions в orchestrator_patcher.test.ts включая `simplifiedTemplateConfig() factory exposes snippet content fields`, `simplified config produces simplified snippet output (positive proof)`, `junction with <2 FKs falls back to junctionFkFallbacks config (Round 2 H-2 restructured)`).
- BUG-019 marker сoverage: orchestrator_patcher consumes config-driven snippets через `templateConfig.orchestrator.{entityImportsTemplate, entityRegisterTemplate, junctionImportsTemplate, junctionRegisterTemplate, regularEntityFallback, junctionEntityFallback, junctionFkFallbacks, templateFeatureSegment}` — нет hardcoded constants.

**Session E3d2 scope:** unified simplified template substitution literals с t115 (Configuration baseline = startProject baseline копируется как-есть, не template fixture; substitution-источник = `features/tasks/` Category fixture в обоих templates). Resolution: previous E3d default switch errantly set `templFeatureName='configuration'` для simplified flow — E3d2 corrected к 'tasks' (matching t115). Также subsystem fix simplified template's `sync_orchestrator_provider.dart` (had Tasks fixture registrations baked in pre-E3d2 — Configuration baseline должен только содержать Configuration registration, additional entities добавляются через `generate-entity` pipeline).
