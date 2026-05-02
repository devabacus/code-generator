# Отчёт TASK-013: Junction detection robust YAML field analysis

## Резюме

**Detection-side TASK-013 done** (per User decision 2026-05-02 Variant B):
- `JunctionDetector.isJunctionEntity()` shared utility (single source of truth) + `JunctionValidationError` для override conflicts
- 4 call-sites updated (3 required по Discussion #2 + 1 bonus from grep audit)
- 22 new tests + 88 baseline = **110 passing**
- Re-audit weight repo через программный JunctionDetector (37 YAMLs scanned): RolePermission + CustomerUser correctly classified as junction, 0 new false-negatives, 0 false-positives

**E2E generate-entity file paths — deferred TASK-014** (split per User decision 2026-05-02 Variant B):
- Detection works correctly (orchestrator imports correct paths, syncEntityTypes contains entity, junction register block emitted)
- Но физические adapter files generate под template entity name directory (`task_tag_map/` вместо `role_permission/`) с template-named filenames — отдельный code path в `replacement_util.ts MANY_TO_MANY` + `_getDestinationPath` для two-entity rename, который TASK-013 не покрывает.
- TASK-014 будет создана после TASK-013 merge: "junction adapter file path generation для non-Map entities (RolePermission case + general M2M two-entity rename)"
- BUG-010 placeholder создан для `code_formatter.ts:81 !field.name.includes('Map')` silent data loss landmine (out-of-scope TASK-013 grep gate, который specifically targets className-level production decisions).

## Phase tracking

| Phase | Что | Status | Evidence |
|---|---|---|---|
| 1. Design | Discussion #2 — Q1=C / Q2=A / Q3=A unanimous consensus | done | [archive/2-task-013-junction-detection-robust-yaml/](../../../discussions/archive/2-task-013-junction-detection-robust-yaml/) — User approved 2026-05-02 |
| 2. Implementation | `junction_detector.ts` + 4 call-sites + dependency ordering fix в parser | done | См. "Изменения" ниже |
| 3. Tests | 22 new tests (6 structural + 3 negative + 4 boundary + 1 dynamic regression + 5 integration в `junction_detector.test.ts`; 4 regression в `orchestrator_patcher.test.ts`; ещё 5 noise-related в other modified test files); 110 total passing | done | mocha output: `110 passing (40ms)` |
| 4. Re-audit + Documentation | 37 weight YAMLs programmatic scan; `junction-detection-audit.md` + `roadmap.md` + `sync-core-integration.md` updated | done | См. "Изменения" docs section |
| 5. DoD verify | t155 Configuration baseline regression PASS errors=0; **E2E generate-entity для RolePermission FAIL 356 errors из-за file path issue** | partial | Detection verified в orchestrator output; full E2E PASS deferred TASK-014 |

## Изменения

**New (production code):**
- `src/features/generation/parsers/junction_detector.ts` — `JunctionDetector.isJunctionEntity(model, explicitJunction?): boolean` public API + `analyze()` returning `JunctionAnalysis { isJunction, reason, fkFields, extraFields }` debug shape + `JunctionValidationError` для conflicts (junction:true + FK<2)
- `src/test/parsers/junction_detector.test.ts` — 6 structural + 3 negative + 4 boundary + 1 dynamic regression + 5 integration test cases

**Modified (production code):**
- `src/features/generation/parsers/server_yaml_parser.ts:13→32` — `model.isRelation = JunctionDetector.isJunctionEntity(model, explicitJunction)` с dependency ordering fix (parseFields() ДО isRelation evaluation)
- `src/features/generation/parsers/entity_yaml_validator.ts` — replace existing `*Map` skip pattern на `JunctionDetector.isJunctionEntity(model)` skip в обоих validate() + validateSyncEvent()
- `src/features/generation/generators/orchestrator_patcher.ts:52→58` — replace `endsWith('Map')` heuristic на `JunctionDetector.isJunctionEntity(model)`
- `src/features/generation/generators/relation_patcher.ts:32` — bonus 4th call-site (extra credit from grep audit)

**Modified (test files):**
- `src/test/generators/orchestrator_patcher.test.ts` — extended с 4 TASK-013 regression tests (existing 9 + 4 = 13)
- `src/test/parsers/entity_yaml_validator.test.ts` — junction detection regression tests
- `src/test/generators/relation_patcher.test.ts` — fixture domain field added (`ticketNumber` в Weighing, `label` в CorrectionButton) — без него minimum-FK fixtures would silently classify as junction после TASK-013 (см. Pre-existing limitations ниже)

**Modified (docs):**
- `ai/bug-reports/junction-detection-audit.md` — re-audit section 2026-05-02 (37 files programmatic scan через JunctionDetector, 2 false-negatives confirmed correctly classified, 0 new findings)
- `ai/docs/roadmap.md` Phase 1.5 — hard gate detection-side closed; **production migration weight TASK-018 BLOCKED by TASK-014** (file path generation)
- `docs-code-generator/sync-core-integration.md` — junction detection section rewritten: detection rules (structural/explicit/validation) + 2 YAML examples + ссылки на Discussion #2; legacy `endsWith('Map')` heuristic subsection removed

## Тесты

- **Unit-tests added: 22**
  - 6 structural в `junction_detector.test.ts` (lines 50-142): 2 FK + base (RolePermission), 2 FK с nullable (CustomerUser), 3+ FK + base, 2 FK + extra без override → regular, 2 FK + extra + override → junction, 1 FK + override → throws JunctionValidationError
  - 3 negative в `junction_detector.test.ts` (lines 146-183): RoadMap, SiteMap, BitMap с domain fields → assert `false`
  - 4 boundary в `junction_detector.test.ts` (lines 220-244): explicit flag false → ignored, etc.
  - 1 dynamic regression в `junction_detector.test.ts` (lines 246-299): recursive walk t115_server для всех `*Map` суффиксов
  - 5 integration в `junction_detector.test.ts` (lines 368-388): real weight RolePermission/CustomerUser YAMLs
  - 4 regression в `orchestrator_patcher.test.ts`
- **Total passing: 110** (88 baseline + 22 new). Result: 0 failures.
- **Как запустить (workaround):** VS Code test runner blocked (Inno Setup mutex `vscode-win32-x64-archive-1.118.1` self-update).
  ```bash
  node node_modules/mocha/bin/mocha.js --ui tdd --reporter spec --timeout 20000 --recursive \
    out/test/parsers out/test/generators out/test/replacement \
    out/test/services out/test/verify out/test/mocks
  # 110 passing (40ms)
  ```
  Excluded `out/test/extension.test.js` (требует vscode module — sample test, безопасно skip).

## DoD verify

- **t155 Configuration baseline regression:** PASS errors=0 warnings=1 infos=44 (regression criteria — Configuration generation baseline не сломан после TASK-013 detection refactor).
- **t155 generate-entity для RolePermission (E2E false-negative fix):** detection verified — orchestrator имеет junction register block, `model.isRelation = true`, syncEntityTypes contains `'role_permission'`, imports references `permission/data/adapters/role_permission/role_permission_*.dart` (correctly substituted). **НО file paths broken** → 356 flutter analyze errors. Физические файлы lying под `task_tag_map/` directory с template-named filenames. Это **отдельный code path** в `replacement_util.ts MANY_TO_MANY` + `_getDestinationPath` для two-entity rename, который TASK-013 не покрывает. **Deferred TASK-014 per Variant B.**

## Pre-existing limitations / Known landmines

- **`code_formatter.ts:81 !field.name.includes('Map')`** — field-name filter в Drift Value wrapper logic. Любое field с substring "Map" в имени (mapData, bitmapJson, mapboxToken, coordinatesMap, etc.) silently вырезается из generated DAO insert/update operations → **silent data loss**. НЕ junction detection (separate concern). **Out-of-scope TASK-013** grep gate (который specifically targets className-level production decisions). Placeholder **BUG-010** создан для tracking.

- **`_JUNCTION_REGISTER_TEMPLATE` docstring hardcoded `task+tag` literals** в `orchestrator_patcher.ts:386,389`:
  ```dart
  // ── Adapter bundle: RolePermission (junction FK→task+tag) ───
  // ...
  // `deleteRolePermissionByTaskAndTag` (soft-delete via business key).
  ```
  `task+tag` и `ByTaskAndTag` — hardcoded literals в template, substitution только PascalCase/camelCase/snake_case entity name (не FK names). После substitution для RolePermission получается **incorrect docstring** — должно быть `(FK→role+permission)` + `ByRoleAndPermission`. Routing logic correct, docstring incorrect. Cosmetic. → TASK-014 backlog (extract FK names из `model.fields` + parametrize template `(junction FK→{fk1}+{fk2})` + `deleteX{Fk1Cap}And{Fk2Cap}`).

- **BUG-007 (relation_patcher gap для template без markers)** — pre-existing, документировано в TASK-011. Не TASK-013 scope.

- **Test fixtures fragility:** `relation_patcher.test.ts` fixtures Weighing/CorrectionButton требовали добавления domain field после TASK-013 — без него minimum-FK fixtures silently classify as junction (structural detection rule). Convention для future test fixtures: regular fixtures должны иметь at least 1 domain field outside base whitelist. Documented в "Изменения" section выше.

## Architectural concerns / Risks

- Detection-side fully solved, но **junction adapter generation в codegen всё ещё имеет hardcoded path defaults** (`task_tag_map/` template). E2E flow для non-Map junctions broken до TASK-014 (file path resolution в `replacement_util.ts` для two-entity rename + `_getDestinationPath`).

- **weight TASK-018 hard gate status:** detection-side closed (RolePermission + CustomerUser correctly classified per re-audit), но **production migration ещё blocked TASK-014** (file path generation для junction adapters). roadmap.md Phase 1.5 hard gate language updated accordingly — premature unblock запрещён.

- **`isRelation` field на ServerpodModel — wrong abstraction post-TASK-013.** Cached flag, set'ится parser'ом через JunctionDetector. Validator + patcher могли бы читать `model.isRelation` напрямую — но tests fixtures могут забыть set этот flag. Better future state: drop cached field, replace consumers на direct `JunctionDetector.isJunctionEntity()` call. Pre-existing issue exposed by TASK-013, не block.

- **`extractManyToManyEntities` использует field order для entity1/entity2** (server_yaml_parser.ts:51-52: `relationFields[0]`, `relationFields[1]`). Если YAML order меняется → entity1/entity2 silently flip. Pre-existing fragility, not TASK-013 issue.

- **Future false-negatives risk:** new entity с 2+ FK + 1-2 metadata fields (assignedAt, joinedAt, weight, sortOrder) и без `junction: true` flag → strict default classifies as **regular** → out-of-order writes silent corruption. Mitigation: documentation в `sync-core-integration.md` describes pattern; future enhancement could add lint hint в validator (Should-have, не Must-have). Adversarial review Bomb #4.

- **Future false-positives risk:** transactional entity с 3+ FK + 0 extras (e.g. `Order(customerId, vehicleId, driverId)` minimal scaffolding) → structural classify as junction → broken business logic. Mitigation: documentation note "если entity имеет 2+ FK + только base fields, но семантически НЕ junction — добавьте domain field". Adversarial review Bomb #5.

## Status

**Ready for review (detection-side closure).** Production migration weight TASK-018 ещё blocked by TASK-014 (file path generation). TASK-014 + BUG-010 создаются после TASK-013 merge.
