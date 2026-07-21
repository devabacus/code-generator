# TASK-013: Junction detection robust YAML field analysis

**Cross-repo context:** blocking gate перед weight TASK-018 (13 entities production migration). См. [`ai/docs/roadmap.md`](../../docs/roadmap.md) Phase 1.5 — hard gate "weight TASK-018 НЕ стартует пока TASK-013 не closed".

**Discussion #2 ✅ closed (2026-05-02):** [archive/2-task-013-junction-detection-robust-yaml/](../../../discussions/archive/2-task-013-junction-detection-robust-yaml/) — User approved unanimous consensus двух agents (Claude_1 + Chatgpt_1) на **Q1=C / Q2=A / Q3=A** + critical scope expansion (3 call-sites, не 2). Финализированные acceptance items ниже.

**Origin:** TASK-011 round 3 adversarial review (2026-05-02) обнаружил **2 confirmed false-negative junction entities** в weight repo:
- `RolePermission` (`weight_server/lib/src/models/user/role_permission.spy.yaml`) — pure 2-FK junction (roleId + permissionId)
- `CustomerUser` (`weight_server/lib/src/models/user/customer_user.spy.yaml`) — 3-FK + 1 nullable FK junction-style

См. [`ai/bug-reports/junction-detection-audit.md`](../../bug-reports/junction-detection-audit.md) — full audit с methodology gap explanation.

## Ветка

`feature/TASK-013-junction-detection-robust-yaml-field-analysis` (через `python ai/scripts/task.py start`)

## Цель

Заменить heuristic `model.className.endsWith('Map')` в `OrchestratorPatcher` (и других местах где детектится junction) на **robust YAML field analysis** — junction = entity у которой:
- 2+ relations (`relation(parent=X)`)
- НЕ имеет own business fields кроме базовых 6 (id / userId / customerId / createdAt / lastModified / isDeleted)

OR explicit `junction: true` flag в `*.spy.yaml` для cases где field analysis ambiguous.

После TASK-013:
- `RolePermission(roleId, permissionId)` без `Map` суффикса детектится как junction → routing через `manifest: manyToMany` template + soft-delete via update pattern
- Existing `*Map` entities (CategoryTaskMap, TaskTagMap, etc.) — продолжают детектиться корректно
- TASK-011 hard gate против weight TASK-018 снимается

> **TASK-013 scope split (User decision 2026-05-02, Variant B):** detection-side closes в этой задаче. File path generation для non-Map junction adapters (RolePermission case + general M2M two-entity rename, broken `_getDestinationPath` resolution в `replacement_util.ts`) → отдельная **TASK-014** (создаётся после TASK-013 merge). `code_formatter.ts:81 !field.name.includes('Map')` silent data loss landmine → отдельный **BUG-010**. Эта задача узкая cleanup detection-side только.

## Не-цели

- НЕ менять sync_core/weight repos (только READ для audit verification)
- НЕ refactor existing `*Map` patterns в codegen-generated проектах — backward compat
- НЕ создавать новый manifest type — переиспользуем `manyToMany`
- НЕ добавлять новые adapter patterns — junction routing logic stable per t115/TASK-001

## Scope

**Разрешено:**
- `src/features/generation/parsers/server_yaml_parser.ts` — extract relations + base field detection
- `src/features/generation/parsers/entity_yaml_validator.ts` — может потребовать junction-aware validation
- `src/features/generation/generators/orchestrator_patcher.ts` — заменить `endsWith('Map')` на field analysis
- `src/features/generation/parsers/relation-analyzer.ts` — relation detection logic
- `src/features/generation/replacement/replacement_util.ts` — M2M словарь selection logic
- `src/test/generators/orchestrator_patcher.test.ts` — extend с false-negative regression tests
- `src/test/parsers/` — new tests для junction detection
- `ai/bug-reports/junction-detection-audit.md` — re-audit weight 14+ entities после fix
- `ai/docs/roadmap.md` Phase 1.5 — обновить hard gate status после TASK-013 closure

**Запрещено:**
- Любые правки sync_core/weight repos
- Изменения generator core которые ломают existing 87 tests
- Удаление `manifest: manyToMany` type

## Критерии приёмки (финализированы Discussion #2 → Decision блок)

### Must-have

**Detection-side (this task scope — done):**

- [x] **Q1=C: Strict default + explicit override**
  - Default field analysis: 2+ FK + только base fields (id/userId/customerId/createdAt/lastModified/isDeleted) = junction
  - Explicit override: `junction: true` top-level YAML field (Option C-1) overrides field analysis
  - **Negative override `junction: false` НЕ вводится** (Discussion #2 Chatgpt_1 — risk скрыть structural junction)
  - Validator error если `junction: true` но FK<2 — "junction requires 2+ relations" (`JunctionValidationError`)
  - Nullable FK = FK для detection (CustomerUser case)
- [x] **Q2=A: Drop `*Map` suffix entirely**
  - Removed из всех 3 production decision paths
  - **Hard technical gate clean:** grep `endsWith.*Map\|includes.*Map\|class.*Map` под `src/features src/adapters/cli src/adapters/vscode` — production decision paths больше НЕ используют className `*Map` heuristic. ОДИН field-name filter остался (`code_formatter.ts:81 !field.name.includes('Map')`) — это field-name filter в Drift Value wrapper, **НЕ** junction detection (separate concern, deferred → BUG-010).
- [x] **Q3=A: Shared utility + call-sites**
  - Создан `src/features/generation/parsers/junction_detector.ts` — `JunctionDetector.isJunctionEntity(model, explicitJunction?): boolean` public API
  - Internal debug shape для tests: `JunctionAnalysis { isJunction, reason: 'explicitOverride' | 'structural', fkFields, extraFields }`
  - **4 call-sites updated (3 required + 1 bonus from grep audit):**
    1. `parsers/server_yaml_parser.ts:13` (now :32) — `isRelation = JunctionDetector.isJunctionEntity(model, explicitJunction)`. Dependency ordering fix: parseFields() ДО isRelation evaluation.
    2. `parsers/entity_yaml_validator.ts` — replace existing `*Map` skip pattern
    3. `generators/orchestrator_patcher.ts:52` (now :58) — replace `endsWith('Map')`
    4. `generators/relation_patcher.ts:32` — bonus 4th call-site discovered through grep audit
- [x] **6 structural test cases (Chatgpt_1 minimum set):**
  - 2 required FK + base fields → junction
  - 2 FK, один nullable → junction
  - 3+ FK + base fields → junction
  - 2 FK + extra field без `junction: true` → regular
  - 2 FK + extra field + `junction: true` → junction
  - fewer than 2 FK + `junction: true` → validation error
- [x] **Negative tests (Q2=A reinforcement):** `RoadMap` (description/coordinates), `SiteMap` (siteName/layoutJson), `BitMap` (bits/width/height) → assert `false`. Закрывает false-positive risk суффикс-эвристики.
- [x] **4 boundary tests:** `explicitFlag=false` ignored, base-field whitelist coverage edge cases.
- [x] **Dynamic regression test (Claude_1 enhancement):**
  - Recursive walk t115_server/lib/src/models/, для каждого `*Map` суффикса assert `isJunctionEntity(model) === true` (durable contract)
  - Plus 2 integration tests на real weight RolePermission/CustomerUser YAMLs
- [x] **Re-audit fixed methodology (Claude_1):**
  - Programmatic scan 37 `*.spy.yaml` под `weight_server/lib/src/models/` через `JunctionDetector`
  - Both false-negatives (RolePermission + CustomerUser) confirmed correctly classified as junction
  - 0 new junctions discovered, 0 false-positives introduced
- [x] **Updated [`junction-detection-audit.md`](../../bug-reports/junction-detection-audit.md):** previous false-negatives now correctly detected, methodology fixed (re-audit section 2026-05-02 добавлен).
- [x] **roadmap.md hard gate:** detection-side `✅ closed via TASK-013`. **Production migration weight TASK-018 BLOCKED by TASK-014** (file path generation для non-Map junction adapters) — премat unblock запрещён.
- [x] **Updated `docs-code-generator/sync-core-integration.md`:** junction detection section rewritten (FK field analysis rules + structural/explicit/validation + 2 YAML examples).
- [x] **report.md** написан с DoD evidence (filled из template).
- [x] **110 tests passing** (88 baseline + 22 new = 110). Workaround: VS Code test runner blocked (Inno Setup mutex), tests run через `node node_modules/mocha/bin/mocha.js` direct excluding `out/test/extension.test.js`.

**Deferred (TASK-014 / BUG-010 scope, NOT closed in TASK-013):**

- [~] **DoD generate-entity (E2E false-negative fix) → deferred TASK-014:**
  - Generated files в правильной feature directory (`role_permission/` не `task_tag_map/`) — broken
  - Files renamed на entity-specific (`role_permission_*.dart` не `task_tag_map_*.dart`) — broken
  - Content references `RolePermission` class (не `RolePermissionMap`) — broken (M2M dictionary не заменяет `Map` суффикс в class name)
  - **Note:** detection itself unblocks TASK-014 — она получит правильные `model.isRelation` и manifest selection. Bug в **отдельном code path** (`replacement_util.ts MANY_TO_MANY` + `_getDestinationPath` для two-entity rename), не в TASK-013 scope.
- [~] **DoD verify `--name t<N>` PASS errors=0 (regression baseline)** → t155 currently 356 errors из-за file path issue (Issue #1 above). Configuration baseline regression PASS, но full E2E generate-entity до TASK-014 даёт broken Flutter code → 356 analyze errors expected. Полный verify PASS возвратится после TASK-014 closure.
- [~] **`_JUNCTION_REGISTER_TEMPLATE` docstring hardcoded `task+tag` literals** (orchestrator_patcher.ts:386,389) — substitution не parametrizes FK names. После substitution для RolePermission генерируется "junction FK→task+tag" вместо "junction FK→role+permission". Cosmetic, не functional break (docstring), но visible. → TASK-014 backlog или отдельный issue.
- [~] **`code_formatter.ts:81 !field.name.includes('Map')`** silent data loss landmine для fields с "Map" в имени (mapData, bitmapJson, coordinatesMap, etc.) → отдельный **BUG-010** (placeholder создан в этой задаче).

### Should-have (nice-to-have)

- [ ] CLI `--junction-override` flag для force routing без editing YAML (debug)
- [ ] Documentation в `docs-code-generator/sync-core-integration.md` про junction detection (replace `*Map` mention)

## STOP-gates

1. **Изменение detection signature** — orchestrator_patcher.detectJunction() новая функция или модификация existing — STOP-gate (architectural change). User confirmation перед commit.
2. **YAML schema extension** (`junction: true` flag) — STOP-gate (touches user-facing YAML format)
3. **Re-audit weight** — read-only, но findings могут discover новые edge cases требующих scope expansion

## Заметки по реализации

### Reference (TASK-011 context)

- [`ai/bug-reports/junction-detection-audit.md`](../../bug-reports/junction-detection-audit.md) — 2 confirmed false-negatives + methodology gap analysis
- [`src/features/generation/generators/orchestrator_patcher.ts`](../../../src/features/generation/generators/orchestrator_patcher.ts) — currently `endsWith('Map')` heuristic location (TBD line numbers — find through grep)
- [`src/features/generation/parsers/entity_yaml_validator.ts`](../../../src/features/generation/parsers/entity_yaml_validator.ts) — already skip validation для `*Map` entities (BUG-004 pattern), нужно update логика после field analysis introduction

### Design questions для решения в Phase 1

1. **Junction-specific business fields:** некоторые junction'ы имеют **extra fields** помимо FK + base (e.g. `weight`, `sortOrder`, `isPrimary`, `assignedAt`). Considered junction or regular?
   - Option A: strict — 2 FK + только base = junction. Любое extra field → regular.
   - Option B: relaxed — 2+ FK + base + few extras (whitelist) = junction. 
   - Option C: explicit `junction: true` flag overrides field analysis. Default = strict.
   - **Recommend C** — automated detection covers 95%, edge case через explicit flag.

2. **`*Map` legacy entities:** должно ли suffix detection остаться как **fallback** в случае field analysis ambiguous?
   - Option A: drop entirely (clean break)
   - Option B: keep как secondary signal (если field analysis говорит "regular" но suffix `Map` → flag warning, не auto-routing)

3. **Validation hook:** `entity_yaml_validator` должен skip 6-field requirement для junction (как сейчас для `*Map`). New detection logic нужно подключить sync с validator.

### Codegen reference

- `relation_patcher.ts` (BUG-003) — pattern для idempotent + recovery-from-legacy-duplicates
- `entity_yaml_validator.ts` (BUG-004) — junction skip pattern
- `orchestrator_patcher.ts` (TASK-011) — current `endsWith('Map')` location
- `replacement_util.ts` ENTITY/M2M словари — junction routing path

## Релевантный контекст

Файлы обязательного прочтения перед началом (executor):

**Codegen src (zone of work):**
- `src/features/generation/parsers/server_yaml_parser.ts` — extract relations + fields
- `src/features/generation/parsers/entity_yaml_validator.ts` — current `*Map` skip
- `src/features/generation/parsers/relation-analyzer.ts` — relation detection
- `src/features/generation/generators/orchestrator_patcher.ts` — current heuristic location
- `src/features/generation/replacement/replacement_util.ts` — M2M словарь selection

**TASK-011 reference (read-only):**
- `ai/bug-reports/junction-detection-audit.md` — 2 false-negatives details
- `ai/tasks/done/TASK-011-sync-core-0-3-0-templates-integration/adversarial-review-report-round3.md` — adversarial discovery context
- `G:/Projects/Flutter/serverpod/weight/weight_server/lib/src/models/user/role_permission.spy.yaml` — primary false-negative
- `G:/Projects/Flutter/serverpod/weight/weight_server/lib/src/models/user/customer_user.spy.yaml` — secondary false-negative

**T115 template (read-only reference):**
- `G:/Templates/flutter/t115/t115_server/lib/src/models/tasks/task_tag_map.spy.yaml` — current `*Map` junction (regression baseline — must continue working)

## План тестирования

### Unit tests

1. **Field analysis algorithm:** model с 2 FK + base only → junction. Model с 1 FK → regular. Model с 3+ FK → junction.
2. **Base field detection:** id/userId/customerId/createdAt/lastModified/isDeleted ignored. Other → counted as business field.
3. **Backward compat:** TaskTagMap (`*Map` suffix + junction structure) → detected.
4. **False-negatives regression:** RolePermission, CustomerUser → detected without suffix.
5. **False-positives regression:** RoadMap (suffix Map but business fields like description, coordinates) → NOT junction.
6. **Explicit flag override:** `junction: true` overrides field analysis (force junction routing).
7. **Idempotency:** orchestrator_patcher с new junction detection — repeat run identical content.

### Integration

1. `codegen create-project --name t<N+1>` + `codegen verify --name t<N+1>` PASS errors=0 (regression — Configuration baseline не сломан).
2. Создать `role_permission.spy.yaml` в test проекте → `generate-entity` → проверить junction routing applied.
3. Re-audit weight 14+ entities — все junction'ы corrly detected, no false-negatives.

## Результаты (ожидаемые файлы)

**Изменено в codegen src:**
- `src/features/generation/parsers/server_yaml_parser.ts` — relations + fields extraction
- `src/features/generation/parsers/entity_yaml_validator.ts` — junction-aware validation
- `src/features/generation/generators/orchestrator_patcher.ts` — replace `endsWith('Map')` на field analysis
- `src/features/generation/replacement/replacement_util.ts` — M2M словарь selection (если нужно)

**Создано в codegen tests:**
- `src/test/generators/orchestrator_patcher.test.ts` — extended с 4+ regression tests
- `src/test/parsers/junction_detection.test.ts` (или extended existing parser test) — field analysis algorithm

**Изменено в codegen docs:**
- `ai/bug-reports/junction-detection-audit.md` — re-audit results
- `ai/docs/roadmap.md` Phase 1.5 — hard gate status update
- `docs-code-generator/sync-core-integration.md` — junction detection section update

**Создано в codegen ai/:**
- `ai/tasks/active/TASK-013-.../task.md` ← этот файл
- `ai/tasks/active/TASK-013-.../report.md` — заполняется по ходу

## План работы (декомпозиция от teamlead)

### Phase 1 — Design

- [ ] 1.1. Read full context (audit + adversarial round 3 report + RolePermission/CustomerUser YAML files)
- [ ] 1.2. Decide on Design questions (junction-specific extra fields, `*Map` fallback, validation hook)
- [ ] 1.3. Document decision (можно в task.md "Design decisions" section добавить, либо отдельной discussion если controversial)

### Phase 2 — Implementation

- [ ] 2.1. Extract relations + fields в `server_yaml_parser.ts` (если ещё не extracted)
- [ ] 2.2. Implement junction detection function (field analysis + optional explicit flag)
- [ ] 2.3. Replace `endsWith('Map')` в `orchestrator_patcher.ts`
- [ ] 2.4. Update `entity_yaml_validator.ts` если нужно
- [ ] 2.5. Update M2M словарь selection в `replacement_util.ts` если зависит от detection

### Phase 3 — Tests

- [ ] 3.1. Unit tests для junction detection (7 cases минимум, см. План тестирования)
- [ ] 3.2. Regression tests в `orchestrator_patcher.test.ts` (RolePermission + CustomerUser + RoadMap false-positive)
- [ ] 3.3. `npm test` 87+ passing (existing baseline + new)

### Phase 4 — Re-audit + Documentation

- [ ] 4.1. Re-run audit на weight repo (`audit_junction_detection.py` или manual через grep + analyze)
- [ ] 4.2. Update `junction-detection-audit.md` — corrected verdicts, methodology fixed
- [ ] 4.3. Update `roadmap.md` Phase 1.5 — hard gate status `Resolved via TASK-013`
- [ ] 4.4. Update `docs-code-generator/sync-core-integration.md` — junction detection section

### Phase 5 — DoD verify

- [ ] 5.1. `codegen create-project --name t<N+1>` + `codegen verify --name t<N+1>` PASS
- [ ] 5.2. Test scenario: создать `role_permission.spy.yaml` в test project → `generate-entity` → verify junction routing
- [ ] 5.3. report.md написан с cited JSON output
- [ ] 5.4. Final commit + PR (через `task.py pr` + merge after teamlead/User approval)

## Журнал исполнения

(Executor заполняет по ходу — решения, блокеры, findings)
