# TASK-014: Junction adapter file path generation для non-Map entities

**Cross-repo context:** **closing gate** перед weight TASK-018 (13 entities production migration). См. [`ai/docs/roadmap.md`](../../docs/roadmap.md) Phase 1.5 — после TASK-013 detection-side closure статус "Production migration weight TASK-018 BLOCKED by TASK-014".

**Origin:** TASK-013 round 1 reviewers (standard + adversarial) обнаружили **broken file path generation** для junction entities без `Map` суффикса:

- RolePermission generate-entity → файлы создаются в `permission/data/adapters/task_tag_map/` (template path) вместо `permission/data/adapters/role_permission/` (entity path)
- File names: `task_tag_map_remote_adapter.dart` вместо `role_permission_remote_adapter.dart`
- Content references: `RolePermissionMap` class вместо `RolePermission` (template entity name leaked в substituted code)
- Result: `flutter analyze` 356 errors на t155 после E2E generate-entity, серверpod unable to resolve

См. [TASK-013 adversarial-review-report.md](../../done/TASK-013-junction-detection-robust-yaml-field-analysis/adversarial-review-report.md) Bomb #2 — full evidence + root cause.

## Ветка

`feature/TASK-014-junction-adapter-file-path-generation-non-map-entities` (через `python ai/scripts/task.py start`)

## Цель

Fix file path generation для junction adapters так чтобы non-Map junctions (типа RolePermission, CustomerUser) генерировались в правильную feature directory с правильными file names и content references.

После TASK-014:
- `generate-entity --yaml role_permission.spy.yaml --feature-path .../features/permission --workspace t<N>` → создаёт `t<N>_flutter/lib/features/permission/data/adapters/role_permission/role_permission_*.dart` с **`RolePermission`** class references (не `RolePermissionMap`)
- `verify --name t<N>` → PASS errors=0 после E2E generate-entity (TASK-013 incomplete DoD acceptance — closure)
- TaskTagMap (existing template `*Map` junction) — backward compat, продолжает генерироваться correctly
- Hard gate weight TASK-018 closes — production migration unblocked после TASK-X2 (todo smoke) acceptance

## Не-цели

- НЕ менять detection logic (TASK-013 stable, 110 tests verified)
- НЕ менять sync_core/weight repos
- НЕ refactor adapter pattern templates (junction routing logic stable per t115/TASK-001 — только file path generation)
- НЕ touch `code_formatter.ts:81` field-name silent data loss (BUG-010 separate scope)

## Scope

**Разрешено:**

- `src/features/generation/replacement/replacement_util.ts` — fix `MANY_TO_MANY` словарь parametrization (currently hardcoded `templEntity1='task'`, `templEntity2='tag'` lines 54-55)
- `src/features/generation/generators/generation_service.ts` — fix `_getDestinationPath` для M2M two-entity rename (currently single `config.templEntity` rewrite на ~lines 213-221)
- `src/features/generation/generators/orchestrator_patcher.ts` — fix `_JUNCTION_REGISTER_TEMPLATE` hardcoded `task+tag` literals (lines 386, 389) — substitute FK names properly
- `src/test/replacement/replacement_util.test.ts` — extend с TASK-014 regression tests
- `src/test/generators/generation_service.test.ts` (если existует) — extend
- `ai/bug-reports/` — close TASK-013 deferred items + reference этого TASK
- `ai/docs/roadmap.md` Phase 1.5 — обновить hard gate status после TASK-014 closure

**Запрещено:**

- Любые правки sync_core/weight repos
- Изменения generator core которые ломают existing 110 tests (TASK-013 baseline)
- Удаление `manifest: manyToMany` type / junction adapter template patterns
- Touch detection logic в `junction_detector.ts`

## Критерии приёмки

> **Note про test entity name (added 2026-05-02 post-implementation):** Initial task.md acceptance Test 2/3 ссылается на RolePermission/CustomerUser. Phase 4 E2E test использует **ProjectMember** вместо RolePermission — t115 template имеет pre-existing `role.spy.yaml` + `permission.spy.yaml` + `role_permission.spy.yaml` в admin auth schema (`manifest: startProject`), что создавало namespace collision при `generate-entity` (verified через `find G:/Templates/flutter/t115/t115_server/lib/src/models -iname "role*"`). ProjectMember сохраняет structural test rigor (3 entities, 2 FK junction, identical pattern). RolePermission/CustomerUser cases покрыты unit tests (replacement_util / generation_service / orchestrator_patcher) без E2E generate. Verified не workaround — pre-existing template constraint, не TASK-014 баг.

### Must-have

- [ ] **`MANY_TO_MANY` словарь parametrization fix:**
  - `replacement_util.ts:54-55` — `templEntity1`/`templEntity2` extracted из YAML model FK fields (RolePermission → `role` + `permission`), не hardcoded `task`+`tag`
  - Backward compat: TaskTagMap (`task` + `tag`) продолжает генерироваться correctly
- [ ] **`_getDestinationPath` M2M two-entity rename fix:**
  - `generation_service.ts:213-221` — детектит M2M context (через `model.isRelation === true` from JunctionDetector) и применяет two-entity path rewrite (`task_tag_map/` → `<targetEntityName>/`)
  - Single-entity rewrite (`config.templEntity → config.targetEntity`) сохраняется для не-junction
- [ ] **`_JUNCTION_REGISTER_TEMPLATE` parametrization fix:**
  - `orchestrator_patcher.ts:386,389` — hardcoded `task+tag` literals и `ByTaskAndTag` substring заменены на template substitution из FK field names
  - Junction docstring в generated `<entity>_remote_adapter.dart` корректный для RolePermission ("update routes through createX, junction FK→role+permission")
- [ ] **6 regression tests:**
  - Test 1: TaskTagMap generate-entity → `task_tag_map/` directory + `task_tag_map_*.dart` files + `TaskTagMap` class references (backward compat baseline)
  - Test 2: RolePermission generate-entity → `role_permission/` directory + `role_permission_*.dart` files + `RolePermission` class references (NOT `RolePermissionMap`)
  - Test 3: CustomerUser (3-FK + nullable FK) → правильная directory + filenames + class refs
  - Test 4: M2M словарь parametrization unit test — `MANY_TO_MANY('role', 'permission')` returns правильные substitutions
  - Test 5: `_getDestinationPath` unit test — junction model → two-entity path rename
  - Test 6: `_JUNCTION_REGISTER_TEMPLATE` substitution unit test — RolePermission docstring "junction FK→role+permission" (не `task+tag`)
- [ ] **DoD verify regression:** `codegen verify --name t<N+1>` PASS errors=0 (Configuration baseline regression — fix не должен ломать typical flow)
- [ ] **DoD generate-entity E2E (TASK-013 incomplete DoD closure):**
  - Создать тестовый `role_permission.spy.yaml` (без Map suffix, 2 FK + base fields) в test проекте
  - `generate-entity --yaml role_permission.spy.yaml --feature-path .../features/permission --workspace t<N+1>`
  - Verify: orchestrator имеет junction-style register block + adapter files в `permission/data/adapters/role_permission/` directory с `role_permission_*.dart` filenames + content references `RolePermission` class
  - `verify --name t<N+1>` PASS errors=0 (включая E2E generate-entity flow — закрывает adversarial round 1 Bomb #2)
- [ ] **roadmap.md hard gate:** Phase 1.5 status `Detection-side closed, file paths blocked by TASK-014` → `Resolved via TASK-013 + TASK-014`. Production migration weight TASK-018 unblocking возможно после TASK-X2 (todo smoke) acceptance.
- [ ] **report.md** написан с DoD evidence (cited JSON output для verify + E2E)
- [ ] **110+ tests** passing (TASK-013 baseline + 6 new TASK-014 regression)

### Should-have

- [ ] CLI `--junction-feature-path` override (если default extraction логика не покрывает edge cases)
- [ ] Document parametrization rules в `docs-code-generator/sync-core-integration.md` junction section update

## STOP-gates

1. **Изменение `MANY_TO_MANY` словаря signature** — STOP-gate если требует public API change. Document перед commit.
2. **`generate-entity` flow change** — STOP-gate если задевает single-entity routing (regression risk).
3. **t115 template adapter file rename** — STOP-gate если решение требует rename existing template files (cross-repo coordination).

## Заметки по реализации

### Reference

- [TASK-013 adversarial-review-report.md](../../done/TASK-013-junction-detection-robust-yaml-field-analysis/adversarial-review-report.md) Bomb #2 — full root cause analysis
- [TASK-013 done state] (`ai/tasks/done/TASK-013-junction-detection-robust-yaml-field-analysis/`) — detection-side baseline что уже работает
- `src/features/generation/replacement/replacement_util.ts:54-55` — MANY_TO_MANY hardcoded
- `src/features/generation/generators/generation_service.ts:213-221` — `_getDestinationPath` (TBD verify line numbers через grep)
- `src/features/generation/generators/orchestrator_patcher.ts:386,389` — `_JUNCTION_REGISTER_TEMPLATE` hardcoded
- `G:/Templates/flutter/t115/t115_flutter/lib/features/tasks/data/adapters/task_tag_map/` — template baseline для junction file structure

### Junction entity1/entity2 extraction algorithm

Junction может иметь 2+ FK fields. Algorithm для extracting entity1/entity2 names:

**Option A:** Берём первые 2 FK fields в порядке declaration в YAML (`relation(parent=role)` → role, `relation(parent=permission)` → permission). Если 3+ FK (CustomerUser case) — берём первые 2.

**Option B:** Алфавитный sort FK names для consistent ordering (`permission` < `role` → permission_role) — но это меняет existing TaskTagMap (`task` < `tag` → tag_task — breaking).

**Option C:** Explicit YAML field `junctionEntities: [role, permission]` для override.

**Recommend Option A** — preserves YAML declaration order, backward compat (`taskTagMap` template имеет `taskId` first → `task`+`tag`).

### Path generation logic

Currently `_getDestinationPath` does single-entity rewrite. Junction case:

**Template path:** `feature/tasks/data/adapters/task_tag_map/task_tag_map_remote_adapter.dart`
**For RolePermission target:** `features/permission/data/adapters/role_permission/role_permission_remote_adapter.dart`

Logic:
1. Detect junction context via `model.isRelation === true` (TASK-013 detection)
2. Extract junction entity name из target model (`role_permission`, не `task_tag_map`)
3. Replace template directory `task_tag_map/` → `<targetSnakeCase>/`
4. Replace file prefix `task_tag_map_` → `<targetSnakeCase>_`

Backward compat for TaskTagMap: target snake case = `task_tag_map` → no-op rewrite.

## План работы

### Phase 1 — Investigation

- [ ] 1.1: Read replacement_util.ts:54-55 + generation_service.ts (find `_getDestinationPath`) + orchestrator_patcher.ts:386,389 — понять текущую logic
- [ ] 1.2: Read t115 template adapter file structure для junction (TaskTagMap pattern)
- [ ] 1.3: Confirm Option A extraction algorithm (declaration order)

### Phase 2 — Implementation

- [ ] 2.1: Update `replacement_util.ts MANY_TO_MANY` — extract entity1/entity2 из model FK fields (Option A — declaration order)
- [ ] 2.2: Update `generation_service.ts _getDestinationPath` — junction-aware path rewrite (detect via `model.isRelation`)
- [ ] 2.3: Update `orchestrator_patcher.ts _JUNCTION_REGISTER_TEMPLATE` — parametrize hardcoded `task+tag` literals
- [ ] 2.4: `npm test` — TASK-013 baseline (110 passing) сохранён

### Phase 3 — Tests

- [ ] 3.1: Unit tests (4 cases) для replacement_util / generation_service / orchestrator_patcher
- [ ] 3.2: Regression tests TaskTagMap backward compat
- [ ] 3.3: New TASK-014 regression tests (RolePermission + CustomerUser file paths)

### Phase 4 — DoD verify

- [ ] 4.1: Re-compile `npm run compile`
- [ ] 4.2: Busy port check (per agent_memory.md)
- [ ] 4.3: `codegen create-project --name t<N+1>` + `codegen verify --name t<N+1>` PASS regression
- [ ] 4.4: E2E test scenario: RolePermission generate-entity на t<N+1> → правильный output + verify PASS errors=0
- [ ] 4.5: report.md написан с cited JSON output

### Phase 5 — Documentation + close

- [ ] 5.1: roadmap.md Phase 1.5 — hard gate status update (Resolved via TASK-013 + TASK-014)
- [ ] 5.2: Final commit + return control teamlead'у для review spawn

## Журнал исполнения

(Executor заполняет по ходу)
