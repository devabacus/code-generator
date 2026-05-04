# BUG-020: Junction substitution coupled с hardcoded `templEntity1`/`templEntity2` defaults — Session 2 landmine

**Статус:** Open (Session 2 scope of TASK-023 / Phase B2)
**Обнаружено:** 2026-05-04 (TASK-023 Session 1 / Adversarial review HIGH H-3)
**Источник:** Multi-agent code review TASK-023 Session 1 (Adversarial)
**Критичность:** Medium (Session 2 landmine — не блокирует Session 1 codegen-TS chunk; блокирует simplified junction generate-entity flow когда Session 2 + Phase C synthetic ландят concrete junction fixture)
**Связан с:** [BUG-019](019-orchestrator-snippet-hardcoded-literals.md) (closes orchestrator-side, Session 1 ✅; junction-substitution-side остаётся открытым)

## Симптом

`replacement_util.ts:60-61` (`MANY_TO_MANY` substitution rules) consume `config.templEntity1` / `config.templEntity2` для построения `tplJunctionSnake = 'task_tag_map'` + Pascal/camel variants. Эти fields имеют hardcoded defaults `'task'` / `'tag'` в `generation_config.ts:94-95`:

```typescript
this.templEntity1 = config.templEntity1 || 'task';
this.templEntity2 = config.templEntity2 || 'tag';
```

Defaults независимы от `templateConfig.name` (т.е. simplified config будет still hardcoded `task`/`tag` substitution rule если caller не override'ит).

Когда Session 2 / Phase C synthetic добавит concrete junction fixture в simplified template (e.g. `configuration_map_*.dart` либо новая `parent_child_map_*.dart` shape), substitution rule `task_tag_map → role_permission` НЕ будет match'ить on-disk literal `configuration_map` (либо whatever Phase C решит) → file content un-substituted → output broken silently.

## Verified evidence

`src/features/generation/replacement/replacement_util.ts`:

```typescript
// Lines 60-61 (consume templEntity1/templEntity2 для junction substitution)
const tplJunctionSnake = toSnakeCase(`${config.templEntity1}_${config.templEntity2}_map`);
// → для simplified будет 'task_tag_map' default; не matches on-disk simplified junction literal.
```

`src/features/generation/config/generation_config.ts:94-95` — hardcoded defaults независимо от templateConfig.

`src/features/generation/generators/generation_service.ts:240-242` + `relation_patcher.ts:103` — secondary call sites consume `templEntity1`/`templEntity2` через `_getDestinationPath` two-entity rename для junction file paths.

## Корневая причина

TASK-014 (junction adapter file path generation для non-Map entities) inflated MANY_TO_MANY substitution rule с `templEntity1`/`templEntity2` parametrization, но parametrization не tied к templateConfig — defaults hardcoded в GenerationConfig constructor для backwards compat. Session 1 BUG-019 fix abstracted **только** orchestrator-snippet literals (orchestrator_patcher boundary). Junction substitution rule в `replacement_util` + `_getDestinationPath` остались coupled с file-system-level template fixture defaults.

## Production impact

- **Currently zero** — Session 1 не emit'ит simplified junction (Configuration baseline = singleton, no junction). t115 default flow intact.
- **Future risk (Session 2 scope):** когда simplified template bootstrap ландит concrete junction fixture (либо Phase C synthetic создаст её) — `replacement_util` MANY_TO_MANY substitution не сработает для simplified-shaped junction literals.

## Fix proposal (Session 2)

Extend `TemplateConfig` shape с `templEntity1` / `templEntity2` defaults (либо alternate naming, e.g. `relationPatcher.templEntity1` / `relationPatcher.templEntity2`):

```typescript
templateConfig: {
  // ...existing fields
  relationPatcher: {
    // ...existing
    templEntity1: string;  // 'task' для t115, 'parentA' (либо whatever Session 2 fixture) для simplified
    templEntity2: string;  // 'tag' для t115, 'parentB' для simplified
  },
}
```

Refactor:
1. `generation_config.ts:94-95` — read from `config.templateConfig.relationPatcher.templEntity1` / `templEntity2` через CLI flag fallback (caller override → config field → hardcoded `'task'`/`'tag'` для legacy backward compat).
2. `replacement_util.ts:60-61` — consume через templateConfig path same как `orchestrator_patcher.ts` H-1 fix pattern (`config.templEntity1 ?? config.templateConfig.relationPatcher.templEntity1`).
3. `generation_service.ts:240-242` — same pattern.
4. `relation_patcher.ts:103` — same pattern.

## Acceptance criteria для fix

- [ ] Extend `TemplateConfig.relationPatcher` interface с `templEntity1` / `templEntity2` fields (либо аналогичные)
- [ ] `t115TemplateConfig()` factory preserves `'task'` / `'tag'` defaults (zero-diff invariant)
- [ ] `simplifiedTemplateConfig()` factory provides Session-2-decided literals (e.g. `'parentA'` / `'parentB'` либо concrete Phase C synthetic literals)
- [ ] Refactor 4 call-sites (`generation_config.ts:94-95`, `replacement_util.ts:60-61`, `generation_service.ts:240-242`, `relation_patcher.ts:103`) для consume через templateConfig path с CLI flag primary
- [ ] Add unit tests: alt config с alt junction literals → alt MANY_TO_MANY substitution output
- [ ] Verify все existing tests preserved (no regression на t115 default flow)
- [ ] E2E smoke: simplified template bootstrap + junction generate-entity → правильный directory + filenames + class refs

## Estimate

~3-5 hours (config shape extension + 4 call-sites refactor + new tests). Может быть folded в Session 2 если concrete junction fixture добавляется в simplified bootstrap, либо в отдельный Phase C synthetic TASK.

## Связанные

- **BUG-019** (Session 1 ✅) — closes orchestrator-snippet-side; junction-substitution-side остаётся
- **TASK-014** — introduced `templEntity1`/`templEntity2` parametrization для junction adapter file path generation, не привязав к templateConfig
- **TASK-023 Session 1** — abstracted orchestrator snippet literals; junction substitution рамки не трогали (separate axis)
- **TASK-023 Session 2** — должен либо resolve этот bug, либо explicitly defer к отдельному follow-up TASK с concrete acceptance criterion

## Priority

**Medium** — Session 2 acceptance gate. Без этого fix simplified template junction emission не будет работать корректно когда Phase C synthetic / Session 2 ландят concrete junction fixture. Schedule: Session 2 of TASK-023 либо отдельный follow-up TASK после Session 2 closure.
