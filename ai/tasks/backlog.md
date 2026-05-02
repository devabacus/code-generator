# Бэклог задач

Неприоритезированные идеи и будущая работа.

## TASK-013 — Robust junction detection (deferred от TASK-011 Discussion #1)

**Priority:** ~~Low~~ → ~~Medium~~ → **High** (bumped 2026-05-02 round 3 per [TASK-011 adversarial review round 3](active/TASK-011-sync-core-0-3-0-templates-integration/adversarial-review-report-round3.md) Bomb #2 — confirmed 2 false-negative cases в weight repo).

**Owner / next-action:** TBD. **Blocking weight TASK-018** (production migration) — hard gate, без closure TASK-013 запуск TASK-018 risks silent corruption на junction entities.

**Source:** [TASK-011 Discussion #1](../discussions/archive/1-task-011-sync-core-templates-hardcoded-r/) — concern №2 (Claude_1 decision). Round 3 adversarial review surfaced concrete false-negatives.

**Problem:** Текущий `OrchestratorPatcher` использует `model.className.endsWith('Map')` heuristic для определения junction entities (M2M). Это:

- **False-positive:** Regular entity с `Map` suffix (`Roadmap`, `Sitemap`, `BitMap`, `Heatmap`) ошибочно detected как junction → routing через `_JUNCTION_REGISTER_TEMPLATE` с docstring "server has no `updateX` RPC". На real entity `update()` adapter routes через `createX` → silent corruption на soft-delete flow.
- **False-negative (CONFIRMED 2026-05-02 на real disk):** Junction без `Map` suffix не detected → routing через regular template. Real cases в weight repo:
  - `RolePermission` (`weight_server/lib/src/models/user/role_permission.spy.yaml`) — pure 2-FK (`roleId` + `permissionId`).
  - `CustomerUser` (`weight_server/lib/src/models/user/customer_user.spy.yaml`) — 3-FK + 1 nullable FK (customerId/userId/roleId/defaultTerminalSetId), 0 domain поля.
  - См. [`junction-detection-audit.md`](../bug-reports/junction-detection-audit.md) секция "False-negative discovered post-audit".

**Proposed solution (REQUIRED before TASK-018):**

1. **YAML field analysis** (preferred) — robust detection через анализ полей YAML модели. Junction signature: 2+ FK relations (`relation(parent=...)` syntax) + ≤1 non-FK domain поле (excluded: `id` auto-PK + системные `createdAt/lastModified/isDeleted`). Реализуется в `entity_yaml_validator.ts` или `serverpod_model.ts` parser.
2. **Explicit flag** (fallback) — `junction: true` в YAML model header, override heuristic. Менее robust (требует author awareness), но не ломает existing entities.
3. **Hybrid:** field analysis по default + explicit flag override option для edge cases.

**Methodology requirement (per round 3 lesson):** audit для validation должен scan ALL `*.spy.yaml` в `<server>/lib/src/models/`, не только entities имеющие `*_sync_event.spy.yaml`. Junction entities могут быть added в sync set позже → routing должен быть correct prospectively.

**Hard gate против weight TASK-018:** TASK-013 closure обязательна перед TASK-018 start. Initial audit "trivially passed" verdict отозван per round 3 findings.

**Files affected:**
- `src/features/generation/generators/orchestrator_patcher.ts` (junction routing decision point)
- `src/features/generation/parsers/entity_yaml_validator.ts` (validation hook)
- `src/features/generation/parsers/serverpod_model.ts` (если нужно field count parsing)
- `src/test/generators/orchestrator_patcher.test.ts` (regression на RolePermission / CustomerUser cases)
