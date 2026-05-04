# Architecture Review — TASK-023 Session 1 (BUG-019 fix subset)

**Reviewer:** Architecture (Subagent)
**Date:** 2026-05-04
**Branch:** feature/TASK-023-b2-simplified-template-content (4 commits, Session 1 subset — BUG-019 fix only; template directory bootstrap = Session 2 separate review lifecycle)
**Recommendation:** **Approve**

---

## Methodology

- Read task.md (full) + BUG-019 evidence + ADR-0005 §1, §3.5, §7
- Diff `git show master:` vs HEAD для `template_config.ts` + `orchestrator_patcher.ts` (byte-level snippet comparison)
- Grep по `src/features/generation/` для residual hardcoded literals (`'category'` / `'taskTagMap'` / `'task'` / `'tag'` / `_ENTITY_` / `_JUNCTION_` / `features/tasks`)
- Trace substitution flow для simplified config + target=Expense через `_substitutePlaceholders` (steps 1-4)
- Trace для junction case с `tplEntity = 'configurationMap'` (camelCase fallback)
- Verified executor's claim: `npm run compile` clean, `mocha` returns **178 passing** (173 baseline + 5 new BUG-019 cases)
- Cross-check t115 zero-diff: byte-level identical `T115_*_TEMPLATE` constants vs pre-TASK-023 file-local `_*_TEMPLATE` constants

## Findings

### CRITICAL (deal-breakers)

_None._

### HIGH

_None._

### MEDIUM

1. **Stale doc reference в `junction_detector.ts:12`** — Evidence: `src/features/generation/parsers/junction_detector.ts:12` содержит:
   ```
   3. `generators/orchestrator_patcher.ts:52` — выбор `_JUNCTION_*` vs `_ENTITY_*`
      template для register/imports snippet'ов.
   ```
   Issue: post-TASK-023 эти constants удалены из `orchestrator_patcher.ts` (moved в `template_config.ts` как `T115_*_TEMPLATE`). Doc references стали dead links после refactor. Низкий impact (только реferences в комментариях, не runtime), но указывает на incomplete cleanup.
   Fix: update comment к `выбор templateConfig.orchestrator.junctionImportsTemplate vs entityImportsTemplate` (или аналогичная formulation). Опционально — can be done в Session 2 cleanup batch.

2. **Behavior change для `generate-entity --templ-feature <foo>`** — Evidence:
   - Pre-TASK-023: `orchestrator_patcher.ts:67` (master) — `tplFeatureSnake = toSnakeCase(config.templFeatureName)`. Если user запускает `generate-entity --templ-feature foo`, `tplFeatureSnake = 'foo'`. Substitution step 1 ищет `'features/foo/'` в snippet, не находит (snippet содержит `'features/tasks/'`) → no-op → output retains literal `'features/tasks/'` (silent break).
   - Post-TASK-023: `orchestrator_patcher.ts:82` — `tplFeatureSnake = toSnakeCase(config.templateConfig.orchestrator.templateFeatureSegment)`. Default = `'tasks'` для t115 → substitution всегда matches snippet → output получает correct `'features/<target>/'`.
   - Comment line 81 заявляет: «Pre-TASK-023 — hardcoded через config.templFeatureName side-effect (templFeatureName всегда 'tasks' implicitly)». **Это неточно.** Call-site `src/adapters/cli/commands/generate_entity.ts:94` пропускает user-provided `templFeatureName: opts.templFeature` (CLI flag). Не «implicitly tasks».

   Issue: behavior change — это **fix** silent breakage (pre-TASK-023 был тихо broken для `--templ-feature foo`). Но docstring inaccuracy скрывает что произошёл behavioral change. Должен быть documented как improvement.
   Fix: update docstring lines 79-82 to acknowledge: «pre-TASK-023 substitution silently no-op'ила для user-overridden `templFeatureName` (snippet всегда содержал hardcoded `features/tasks/`); post-TASK-023 substitution всегда работает потому что snippet's anchor приходит из той же config field». Низкий impact (correctness improvement) но точность важна для future agents.

### LOW

1. **Mismatch в executor claim "7 new fields" vs actual count = 8** — Evidence: журнал task.md line 378 ("Extended `TemplateConfig.orchestrator` shape с 7 new fields") + commit message claim. Actual count в `template_config.ts:96-190`: `entityImportsTemplate` + `entityRegisterTemplate` + `junctionImportsTemplate` + `junctionRegisterTemplate` + `regularEntityFallback` + `junctionEntityFallback` + `junctionFkFallbacks` + `templateFeatureSegment` = **8 fields** (исключая existing `relativePath`). Bug в executor's report message. Все 8 justified evidence (BUG-019 listed 5; splitting `entityTemplate` → imports+register для double-marker insertion + adding `templateFeatureSegment` для BUG-009 anchor — оба justified).

2. **`simplifiedTemplateConfig().relationPatcher` проблематичен для future Phase C** — Evidence: `template_config.ts:464-465` устанавливает `templateMainEntity: 'configuration'` + `templateRelatedEntity: 'configuration'`. Comment lines 458-462 признаёт: «эти literals потребуется обновить когда Phase C synthetic добавляет concrete FK fixture». Поскольку simplified bootstrap не содержит multi-entity FK fixture, RelationPatcher просто не активируется (markerName не найдёт соответствующих template files). НО: одинаковые `main` + `related` literal — это semantic anomaly (RelationPatcher будет swap'ить `configuration_dao.dart` ⇄ `configuration_dao.dart` — identity swap). Defensive fallback что не приведёт к runtime error, но запутывающее. Acceptable provisional — Session 2 / Phase C resolves.

3. **`SIMPLIFIED_JUNCTION_*_TEMPLATE` placeholder pattern fragile с substring overlap risk** — Evidence: `template_config.ts:383-389` (imports) + 403-419 (register). Containing literal `configuration_map` (snake) + `ConfigurationMap` (Pascal) + path segments `features/configuration/...`. Substitution flow:
   - Step 1: `features/configuration/` → `features/<target>/` (anchored, safe)
   - Step 2: replaceAll `'configuration_map'` → target_snake. Safe potому что substring `'configuration_map'` не overlap'ит с `'configuration'` (no `'configuration_map'` substring внутри `'configuration'`).
   - Step 3: replaceAll `'ConfigurationMap'` → target Pascal. Safe (Pascal-anchored).
   - Step 4: skipped (junctionEntityFallback `'configurationMap'` ≠ snake `'configuration_map'`).

   Result: для junction case substitution flow correctly handles snake + Pascal. НО — если future entity name ends with literal `'configuration'` (e.g. `myConfiguration`), step 2 `replaceAll('configuration', target)` потенциально collide. Currently Configuration baseline single — so collision impossible. Acceptable provisional, документировать `simplifiedTemplateConfig` docstring (currently mentioned generally в lines 376-381, не explicitly «substring overlap landmine»).

## Strengths

- **`TemplateConfig.orchestrator` extended shape semantically clean.** 8 new fields пакеты в logical groups: 4 snippet templates + 2 entity literal fallbacks + 1 FK fallback object + 1 feature segment anchor. Naming consistent (`*Template` для raw strings, `*Fallback` для substitution sentinels). Field docstrings (`template_config.ts:104-190`) detailed: substitution sentinels documented per-field, ordering relationship с `_substitutePlaceholders` flow noted.

- **t115 zero-diff invariant ✅ verified byte-level.** `T115_ENTITY_IMPORTS_TEMPLATE` (`template_config.ts:214-220`) byte-identical к pre-TASK-023 `_ENTITY_IMPORTS_TEMPLATE` (`master:orchestrator_patcher.ts:410-416`). Same для остальных 3 templates + 4 fallbacks (`'category'` / `'taskTagMap'` / `{fk1: 'task', fk2: 'tag'}` / `'tasks'`). 178 passing tests confirm runtime parity на t115 default config.

- **Stack lock invariants preserved** per ADR-0005 §7. Riverpod / Drift / sync_core / Serverpod package set unchanged (изменений pubspec.yaml в Session 1 нет — Session 2 scope). Marker scheme inherited. Clean directory layout preserved (`relativePath: ['lib', 'core', 'sync', 'sync_orchestrator_provider.dart']` identical для t115 + simplified).

- **YAGNI compliance evidence-driven.** Каждое из 8 new fields traceable к concrete BUG-019 evidence или logical refinement (BUG-019 listed 5; splitting `entityTemplate` → imports+register justified by separate marker block insertion mechanics; `templateFeatureSegment` justified BUG-009 anchor). Не over-abstracted. Strategy pattern (per task.md anti-goal) НЕ introduced — config object pattern достаточен.

- **`simplifiedTemplateConfig()` factory shape forward-extensible.** Configuration baseline literals + generic FK fallbacks (`parentA`/`parentB`) для no-junction-bootstrap case. When Session 2 adds template directory content + Phase C synthetic adds concrete junction fixture — factory updates без re-edit interface. Comment lines 444-462 acknowledges acceptable provisional state.

- **Default factory pattern preserved** (`generation_config.ts:100`) — `t115TemplateConfig()` остаётся default. Backwards compat preserved для всех existing call-sites (generate_entity / create_project / VS Code commands). Existing tests без modifications passing (за исключением single test alt-config alt-merge fix — `t115TemplateConfig().orchestrator` spread merge).

- **Tests provide alt-config positive proof.** `CUSTOM_ALT_*_SENTINEL` test (test #4 lines 968-1064) — sentinel-based proof что patcher reads snippet content из config (не из removed file-local constants). Bomb-proof check: if пusher fall back to hardcoded snippet (regression), sentinels would не leak в output.

- **Hidden coupling residue cleanup на orchestrator_patcher boundary complete.** Grep по `src/features/generation/` revealed only 3 categories of remaining `'task'`/`'category'`/`features/tasks` literals:
  1. `template_config.ts` itself (intended — t115 fallback values)
  2. `generation_config.ts:83,94-95` (`templEntity`/`templEntity1`/`templEntity2` defaults — out of TASK-023 scope, separate landmine, possibly future bug-report)
  3. `generation_service.ts:240-242` + `relation_patcher.ts:103` (out-of-scope refactoring; junction-config two-entity rename via `templEntity1`/`templEntity2`, separate axis)

  TASK-023 / Session 1 closes orchestrator_patcher boundary — clean separation.

## Verdict

Session 1 BUG-019 fix subset = **clean atomic deliverable**. Architectural shape (extended `TemplateConfig.orchestrator` с 8 new fields + 2 factory functions + refactored orchestrator_patcher) — semantically coherent, evidence-driven, stack-lock-preserving, t115-zero-diff-preserving. 178 passing tests confirm runtime parity. 1 MEDIUM doc accuracy issue (behavior change для `--templ-feature <foo>` is improvement masked by inaccurate docstring) + 1 MEDIUM stale doc reference в `junction_detector.ts:12` + 3 LOW (numerical claim mismatch + simplified factory provisional state + substring overlap landmine для future) — все non-blocking, рекомендуется fix в Session 2 cleanup pass либо follow-up cleanup commit.

Approval contingent на acknowledgement these MEDIUM/LOW findings в task.md журнал либо closure-report (decisional record). Не нужно code changes для Session 1 commit chain — atomic value already delivered.

## Catch count: 5 findings (0 CRITICAL / 0 HIGH / 2 MEDIUM / 3 LOW)
