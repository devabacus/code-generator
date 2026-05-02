# Бэклог задач

Неприоритезированные идеи и будущая работа.

## TASK-013 — Robust junction detection (deferred от TASK-011 Discussion #1)

**Priority:** ~~Low~~ → **Medium** (bumped 2026-05-02 per [TASK-011 adversarial review](active/TASK-011-sync-core-0-3-0-templates-integration/adversarial-review-report.md) Bomb #3 — proactive audit weight 13 entities ПЕРЕД TASK-018 start)

**Source:** [TASK-011 Discussion #1](../discussions/archive/1-task-011-sync-core-templates-hardcoded-r/) — concern №2 (Claude_1 decision).

**Problem:** Текущий `OrchestratorPatcher` использует `model.className.endsWith('Map')` heuristic для определения junction entities (M2M). Это:

- **False-positive:** Regular entity с `Map` suffix (`Roadmap`, `Sitemap`, `BitMap`, `Heatmap`) ошибочно detected как junction → routing через `_JUNCTION_REGISTER_TEMPLATE` с docstring "server has no `updateX` RPC". На real entity `update()` adapter routes через `createX` → silent corruption на soft-delete flow.
- **False-negative:** Junction без `Map` suffix (`UserPermission`, `RolePermission`, `ContractorTariff`, `UserRoleAssignment`) не detected → routing через regular template, но server endpoints могут не иметь полного CRUD set.

**Proposed solution (when triggered):** одно из:

1. **YAML field analysis** — entity с только foreign-key fields (без user-defined data fields) treated как junction
2. **Explicit flag** — `junction: true` в YAML model, override heuristic

**Scope expansion (2026-05-02 adversarial review):**
- **Audit weight 13 entities** в `G:/Projects/Flutter/serverpod/weight/weight_server/lib/src/models/` на junction-style без `Map` суффикса (UserPermission, RolePermission, ContractorTariff и подобные).
- **Если найдены false-negatives** → priority bump на **High** перед TASK-018 start. Без audit production migration TASK-018 risks silent sync corruption на junction entities routed через wrong RPC pattern.
- Audit может занять 30-60 минут offline (вручную проверить YAML модели на 2-FK pattern).

**Trigger для priority bump:** ~~weight TASK-018 production migration discoverит false-negatives на 13 entities~~ — proactive: weight TASK-018 hard gate, audit ДО старта.

**Until then:** keep `endsWith('Map')` heuristic + workaround naming convention.

**Files affected:** `src/features/generation/generators/orchestrator_patcher.ts` + `src/features/generation/parsers/entity_yaml_validator.ts` (validation hook).
