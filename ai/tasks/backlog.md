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

## TASK-015 — Robust junction FK extraction для non-FK pseudo-keys

**Priority:** Low-Medium (deferred from TASK-014 round 1 adversarial review 2026-05-02)
**Trigger:** weight TASK-018 если developer migrate'ит CustomerUser-style junction (3+ FK + non-FK pseudo-key field типа `userId: int`)

**Source:** [TASK-014 adversarial-review-report.md](active/TASK-014-junction-adapter-file-path-generation-non-map-entities/adversarial-review-report.md) Bomb #1 + Architectural smell #1 (двойное FK extraction в `server_yaml_parser.ts:51-52` + `orchestrator_patcher.ts:260-262` — identical algorithm в двух местах, drift risk).

**Problem:** Generator extracts junction `entity1`/`entity2` через `relationFields[0]/[1]` (первые 2 FK fields в YAML declaration order). Это правильно для clean junctions (`RolePermission(roleId, permissionId)`), но silently wrong для junctions с non-FK pseudo-keys.

Real example из weight repo (`weight_server/lib/src/models/user/customer_user.spy.yaml`):

```yaml
class: CustomerUser
fields:
  customerId: UuidValue, relation(parent=customer)        # FK
  userId: int                                              # NOT a relation declaration (pseudo-FK)
  roleId: UuidValue, relation(parent=role)                 # FK
  defaultTerminalSetId: UuidValue?, relation(parent=terminal_set)  # FK nullable
```

Generated будет `deleteCustomerUserByCustomerAndRole` (берёт `customerId`+`roleId`) instead of `deleteCustomerUserByCustomerAndUser` если business key fact'ically `customer+user`. `serverpod generate` PASS, `flutter analyze` PASS, `verify` PASS — сломается на runtime когда orchestrator вызовет soft-delete by-key path → 404 или resurrect неправильную row → silent data corruption.

**Scope:**

1. **Detect junction с suspect pattern** — 3+ FK + non-FK field с `Id` suffix (potential pseudo-FK) → emit parser warning при `generate-entity` и `create-project`.
2. **Extract shared `extractEntity1Entity2` utility** — устранить drift между `server_yaml_parser.ts` (entity1/entity2 для MANY_TO_MANY словаря) и `orchestrator_patcher._extractEntityNameFromField` (FK substitution в docstring). Single source of truth → consistent behavior.
3. **Optional explicit YAML override** — `junctionKeyFields: [customerId, userId]` для случаев где business key не совпадает с первыми 2 FK declarations. Backward compat: если override отсутствует, current Option A (declaration order первых 2 FK) preserved.
4. **Cross-component integration test** — create-project + generate-entity для junction entities verifying что parser entity1/entity2 == orchestrator FK extraction (не drift).

**Reference:** TASK-014 adversarial-review-report.md Bomb #1 + Bomb #5 (architectural smell — двойное FK extraction) + Bomb #6 (test fixture semantic assertion — already added в orchestrator_patcher.test.ts CustomerUser case fixing current behavior).

**Documented limitation:** [docs-code-generator/sync-core-integration.md](../../docs-code-generator/sync-core-integration.md) "Junction FK extraction — known limitation" section (added 2026-05-02 TASK-014 cleanup).

**Files affected:**
- `src/features/generation/parsers/server_yaml_parser.ts:44-66` — extract `extractEntity1Entity2` utility
- `src/features/generation/generators/orchestrator_patcher.ts:260-323` — use shared utility (remove `_extractEntityNameFromField` duplicate)
- `src/features/generation/parsers/junction_detector.ts` или новый `junction_fk_extractor.ts` — host shared utility
- `src/test/generators/cross_component_integration.test.ts` (new) — verifies parser ↔ patcher alignment
