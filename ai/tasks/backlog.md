# Бэклог задач

Неприоритезированные идеи и будущая работа.

## TASK-013 — Robust junction detection (deferred от TASK-011 Discussion #1)

**Source:** [TASK-011 Discussion #1](../discussions/archive/1-task-011-sync-core-templates-hardcoded-r/) — concern №2 (Claude_1 decision).

**Problem:** Текущий `OrchestratorPatcher` использует `model.className.endsWith('Map')` heuristic для определения junction entities (M2M). Это:

- **False-positive:** Regular entity с `Map` suffix (`Roadmap`, `Sitemap`) ошибочно detected как junction
- **False-negative:** Junction без `Map` suffix (`UserRoleAssignment`) не detected

**Proposed solution (when triggered):** одно из:

1. **YAML field analysis** — entity с только foreign-key fields (без user-defined data fields) treated как junction
2. **Explicit flag** — `junction: true` в YAML model, override heuristic

**Trigger для priority bump:** weight TASK-018 production migration discoverит false-negatives на 13 entities → robust solution required.

**Until then:** keep `endsWith('Map')` heuristic + workaround naming convention.

**Files affected:** `src/features/generation/generators/orchestrator_patcher.ts` + `src/features/generation/parsers/entity_yaml_validator.ts` (validation hook).
