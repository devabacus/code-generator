# TASK-013 Standard Review Report

**Reviewer:** standard correctness review (read-only audit)
**Date:** 2026-05-02
**Verdict:** **CHANGES REQUESTED** (block для merge)

Detection logic + tests + audit + docs — все в high quality state и matches Discussion #2 unanimous decision (Q1=C / Q2=A / Q3=A). НО три блокера:

1. **DoD verify FAIL** на t155 (regression criteria not met).
2. **E2E false-negative fix produces broken file paths** — Issue #1 действительно affects acceptance scope (это не отдельный design gap, это часть acceptance "verify junction routing applied").
3. **Acceptance checkboxes пустые (0/24), `report.md` — pristine template, status.md содержит typo (TASK-011 duplicate вместо TASK-013).**

Сам fix в `lib/` — solid и можно merge'ить после устранения блокеров. Issue #1 для file-path resolution рекомендуется выделить в отдельный TASK-014 (см. ниже).

---

## Discussion #2 Decision compliance

| Item | Status | Evidence |
|---|---|---|
| Q1=C strict default + `junction:true` override (no negative override) | ✅ | `junction_detector.ts:96-148` — analyze() implements ровно правило. `boundary: explicitFlag=false → ignored` test (junction_detector.test.ts:220-231) verifies negative override НЕ supported. |
| Q1: Validator throws `JunctionValidationError` если `junction:true` но FK<2 | ✅ | `junction_detector.ts:120-125` throws с message "junction requires 2+ relations" + className. Test case 6 (junction_detector.test.ts:128-142) verifies. |
| Q1: Nullable FK = FK для detection (CustomerUser case) | ✅ | `analyze()` фильтрует через `f.isRelation === true` без проверки nullable (line 113). Test case 2 (junction_detector.test.ts:64-81) verifies CustomerUser с nullable defaultTerminalSetId classified as junction. |
| Q2=A drop `*Map` suffix entirely (grep gate) | ✅ (with one finding — see below) | Grep production decision paths: matches только в comments documenting legacy drop. ОДИН production reference остался: `parsers/formatters/code_formatter.ts:81` `!field.name.includes('Map')` — но это **field-name filter** (Drift Value wrapper), НЕ junction detection. Acknowledged as out-of-scope, но flagged for future cleanup. |
| Q3=A `JunctionDetector` shared utility + 3 call-sites | ✅ | `junction_detector.ts` создан. Call sites updated: (1) `server_yaml_parser.ts:32` — `model.isRelation = JunctionDetector.isJunctionEntity(model, explicitJunction)`; (2) `entity_yaml_validator.ts:22, 41` — `JunctionDetector.isJunctionEntity(model)` skip in both validate + validateSyncEvent; (3) `orchestrator_patcher.ts:58` — replace `endsWith('Map')`. Bonus 4th call-site `relation_patcher.ts:32` (extra credit). |
| Q3: Internal debug shape `{ isJunction, reason, fkFields, extraFields }` | ✅ | `JunctionAnalysis` interface (junction_detector.ts:55-71) exact match. `analyze()` returns full shape. |
| 6 structural test cases (Chatgpt_1 minimum set) | ✅ | junction_detector.test.ts cases 1-6 (lines 50-142) cover все 6: 2 FK + base (RolePermission), 2 FK с nullable (CustomerUser), 3+ FK + base, 2 FK + extra без override → regular, 2 FK + extra + override → junction, 1 FK + override → throws. |
| 3 negative tests (RoadMap/SiteMap/BitMap с domain fields → regular) | ✅ | junction_detector.test.ts lines 146-183 — RoadMap (description/coordinates), SiteMap (siteName/layoutJson), BitMap (bits/width/height) все assert `false`. Не synthetic — содержат realistic domain fields. |
| Dynamic regression test scan ВСЕХ `*.spy.yaml` под t115 | ✅ | junction_detector.test.ts:246-299 — recursive walk t115_server/lib/src/models/, parse каждый, assert `isJunction === true` для всех ending на 'Map'. Реально файлы загружает (не synthetic models). Includes graceful skip если t115 dir отсутствует (CI scenario). Plus 2 integration tests reading реальные weight RolePermission/CustomerUser YAMLs (lines 368-388). |
| Re-audit fixed methodology (37 weight YAMLs, не только sync set) | ✅ | `junction-detection-audit.md` lines 164-221 — section "Re-audit 2026-05-02" документирует programmatic scan через JunctionDetector, 37 files cited, 2 false-negatives confirmed correctly classified, 0 new junctions discovered, 0 false-positives. |
| `roadmap.md` Phase 1.5 status `Failed` → `Resolved via TASK-013` | ✅ | `roadmap.md` line 40 — heading изменён на "Resolved via TASK-013 (2026-05-02)" + "✅ closed" status + детально описана reasoning. |
| docs-code-generator/sync-core-integration.md junction section rewritten | ✅ | Полная rewrite: "Junction entities (FK field analysis)" section с detection rules + structural/explicit/validation rules + 2 YAML examples + ссылки на Discussion #2. Limitations section: removed "endsWith('Map') heuristic" subsection (legacy reference cleaned up). |

---

## Verify re-run (cite actual JSON)

```text
[verify --name t155 --human]

[1/4] dart pub get (server)...
[1/4] flutter pub get (flutter)...
[2/4] serverpod generate --experimental-features=all...

FAIL: verify t155
  project: G:\Projects\Flutter\serverpod\t155
  ✗ flutterAnalyze — 0ms
  ✓ pubGet — 8523ms
  ✗ serverpodGenerate — 9048ms
    error: ...
      ERROR: Found 1 issue.
      Endpoint analysis skipped due to invalid Dart syntax. Please review and correct the syntax errors.
      File: G:\Projects\Flutter\serverpod\t155\t155_server\lib\src\endpoints\task_tag_map_endpoint.dart
      ✗ Generating code (6.6s)
Errors:
  ! serverpod generate failed
Total: 17573ms
```

**Дополнительно run с `--skip-serverpod --skip-build-runner`:**

```text
FAIL: verify t155
  ✗ flutterAnalyze — 4287ms (errors=356, warnings=31, infos=67)
  ✓ pubGet — 4544ms
Errors:
  ! flutter analyze: 356 errors
```

**Verdict для DoD verify:** ❌ **FAIL** — acceptance criterion `codegen verify --name t<N+1> PASS errors=0` не выполнен. 356 flutter analyze errors + serverpod generate failure on `task_tag_map_endpoint.dart` (file без foundation YAML — orphan). Это direct consequence Issue #1 (file path mismatch, см. ниже).

---

## E2E false-negative fix evidence

**Setup:** `t155_server/lib/src/models/user/role_permission.spy.yaml` создан (verified) + `role_permission_sync_event.spy.yaml` создан + `permission/` Flutter feature scaffold в place.

**Orchestrator state** (`t155_flutter/lib/core/sync/sync_orchestrator_provider.dart`):

- ✅ **Imports block содержит RolePermission imports** (lines 24-30) с правильным **target feature segment** `features/permission/data/...`:
  ```dart
  import '../../features/permission/data/adapters/role_permission/role_permission_event_adapter.dart';
  ...
  import '../../features/permission/domain/entities/role_permission/role_permission_entity.dart';
  ```
- ✅ **syncEntityTypes contains** `'role_permission',` (line 43)
- ✅ **Junction register block** с docstring (lines 102-118) — `register<RolePermissionEntity>`, calls на `RolePermissionRemoteAdapter`, `RolePermissionPayloadCodec`, `RolePermissionLocalApply(RolePermissionDao(dbService))`, `RolePermissionPullAdapter`, `RolePermissionEventAdapter`. **Substitution PascalCase + camelCase + snake_case работает корректно.**

Это доказывает: **junction detection works end-to-end** — `RolePermission` без `Map` суффикса correctly routed через `_JUNCTION_*` template (включая docstring "Junction-specific routing").

**НО** имеются два **secondary issues** в register block docstring (lines 102, 105):

```dart
// ── Adapter bundle: RolePermission (junction FK→task+tag) ───────────────────  ← ОШИБКА: должно быть FK→role+permission
// Junction-specific: server has no `updateRolePermission` RPC, only
// `createRolePermission` (idempotent create + resurrect) and
// `deleteRolePermissionByTaskAndTag` (soft-delete via business key).            ← ОШИБКА: должно быть ByRoleAndPermission
```

`task+tag` и `ByTaskAndTag` — hardcoded literals в `_JUNCTION_REGISTER_TEMPLATE` (orchestrator_patcher.ts:386-402), не parametrized substitution placeholders. Это **separate template hardcoding bug** — не блокирует junction detection (которая работает), но docstring incorrect для new junction entities. **Recommended:** TASK-014 backlog (parametrize FK names в junction template).

---

## Issue #1 (file path under task_tag_map/) — verdict

**Confirmed reproduction:**

```bash
$ ls G:/Projects/Flutter/serverpod/t155/t155_flutter/lib/features/permission/data/adapters/
task_tag_map/                  ← директория named как template entity, НЕ target

$ ls .../permission/data/adapters/task_tag_map/
task_tag_map_event_adapter.dart
task_tag_map_local_apply.dart
task_tag_map_payload_codec.dart
task_tag_map_pull_adapter.dart
task_tag_map_remote_adapter.dart
                              ← файлы named как template entity, НЕ target

$ find .../permission/ -name "role_permission*"
(empty)                       ← ZERO target-named files
```

**Mismatch:** orchestrator imports references `permission/data/adapters/role_permission/role_permission_*.dart` (correctly substituted), но **физические файлы lying под `task_tag_map/` directory с template-named filenames**. Imports broken → flutter analyze 356 errors → serverpod generate fails.

**Verdict: TASK-014 backlog (NOT block для TASK-013).**

**Rationale:**

1. **Detection scope:** TASK-013 explicitly scoped to **detection logic** (Discussion #2 Q1/Q2/Q3 — all about detection). Acceptance items 60-99 в task.md касаются **detection correctness** + tests + audit + docs. File path resolution для junction adapter generation НЕ в scope.

2. **Detection works correctly:** orchestrator получает junction routing (✅ verified), substitution PascalCase/camelCase/snake_case в orchestrator template работает (✅ imports correct paths). Bug — в **separate code path** (вероятно `replacement_util.ts` ENTITY/M2M словарь selection или `getDictionaryRules` для file generation), который TASK-013 acceptance phrased "verify junction routing applied" не требовал deeply test.

3. **Pre-existing condition:** Этот bug, скорее всего, существует в codegen для всех `*Map` junction entities (например TaskTagMap в t115 тоже бы создал файлы под `task_tag_map/` directory — что верно, потому что в t115 entity NAME = TaskTagMap, и template entity = TaskTagMap → no rename mismatch). Для **non-Map junction entities (RolePermission, etc)** template entity name (`taskTagMap`) ≠ target entity name (`rolePermission`) → file path remains template-named.

4. **Effort scope:** Fix требует audit `replacement_util.ts` M2M словарь rules + verify подмена template entity strings в file paths (`task_tag_map/`) на target entity (`role_permission/`) с case variants. Это medium-effort generator fix, scope беспорядка перед merge TASK-013.

**Recommended:** spawn TASK-014 — "Junction file path generation: replace template entity name in M2M file paths". Hard gate update: weight TASK-018 unblocked partially (detection ready), но blocked by TASK-014 для production migration RolePermission/CustomerUser (без TASK-014 fix миграция produces broken Flutter code).

---

## Issue #2 (VS Code test runner blocked, mocha workaround) — verdict

**Reproduction:**

```text
$ npm test
[main] Error: Code is currently being updated. Please wait for the update to complete before launching.
Exit code: 1
```

VS Code test runner blocked (Inno Setup mutex per executor's claim — confirmed: `vscode-win32-x64-archive-1.118.1` стрижёт self-update).

**Workaround verified:**

```bash
$ node_modules/.bin/mocha --ui tdd --reporter spec --timeout 20000 --recursive \
    out/test/parsers out/test/generators out/test/replacement \
    out/test/services out/test/verify out/test/mocks
...
110 passing (40ms)
```

**Verdict: ✅ ACCEPT workaround.**

- Mocha запущен с `--ui tdd` flag (right setting для `suite/test` BDD interface used by codebase) → все тесты загрузились без `suite is not defined` errors.
- `--recursive` over всех test dirs кроме `out/test/extension.test.js` (требует `vscode` module) → no cherry-picking.
- **Test count = 110, exact match с expected (88 baseline + 22 new = 110).** No skipped suites.
- Tests включают junction_detector.test.ts (полный suite — 6 structural + 3 negative + 4 boundary + 1 dynamic regression + 5 integration) и orchestrator_patcher.test.ts (existing 9 + 4 TASK-013 regression = 13).

**Recommendation:** добавить mocha скрипт `npm run test:mocha` в `package.json` для случаев VS Code lock — без него каждый dev пересоздаёт command line. Не block.

---

## Findings

### Finding #1 (BLOCKER): Acceptance checkboxes пустые + report.md pristine template

**Evidence:**
- `task.md`: 24 `[ ]` checkbox'а, ноль `[x]` (verified через grep). Phase 1-5 plan checkboxes тоже unchecked.
- `report.md`: literally template "Что было реализовано." + "Список ключевых файлов и причины." + "(количество или список)" placeholder text. **Никакая DoD evidence не зафиксирована.**

**Required:** task.md acceptance items должны быть marked `[x]` (либо `[~]` если deferred + reference на TASK-014). report.md должен содержать executor's summary с DoD evidence, file references, test counts, deferred items rationale.

### Finding #2 (BLOCKER): status.md typo — duplicate TASK-011 entry

```diff
+| TASK-011 | junction detection robust YAML field analysis | 🟡 In Progress | 2026-05-02 |
```

Должно быть `TASK-013`. Сейчас в файле два TASK-011 entries.

### Finding #3 (NIT): code_formatter.ts:81 `field.name.includes('Map')` — production decision

```typescript
// src/features/generation/parsers/formatters/code_formatter.ts:81
return fields.filter(field =>
    !exactExcludes.includes(field.name) &&
    !field.name.includes('Map') && !field.scope?.includes('serverOnly'));
```

Это **field-name filter** для Drift Value wrapper formatting (filter поля с `Map` в имени, например типа `Map<X,Y>` Dart fields). НЕ junction detection — different concern.

**Не блокер для TASK-013** (out-of-scope для Q2=A grep gate, который specifically targets className-level production decisions). Но stricter reading task.md "Hard technical gate" мог бы flag этот case. **Acknowledged как out-of-scope acceptable, но recommend cleanup в follow-up: parametrize через explicit `junction-related field skip list` или удалить (Drift Value wrapper для `Map<X,Y>` field types может handled через type detection вместо name pattern).**

### Finding #4 (BACKLOG): Junction register template hardcoded `task+tag` references

`orchestrator_patcher.ts:386, 389` — `_JUNCTION_REGISTER_TEMPLATE` содержит hardcoded `(junction FK→task+tag)` и `deleteRolePermissionByTaskAndTag` literals (substitution только PascalCase/camelCase/snake_case entity name, не FK names). После substitution для RolePermission получается **incorrect docstring**: "junction FK→task+tag" + "deleteRolePermissionByTaskAndTag".

**Не блокер для TASK-013 acceptance** (docstring — informational; routing logic correct). **Recommendation:** TASK-014 либо отдельный issue — extract FK names из `model.fields` (уже есть в `extractManyToManyEntities`) + parametrize template `(junction FK→{fk1}+{fk2})` + `deleteX{Fk1Cap}And{Fk2Cap}`.

### Finding #5 (NIT): Dynamic regression test path resolution

`junction_detector.test.ts:247` — `path.resolve(__dirname, '../../../../../../../Templates/flutter/t115/t115_server/lib/src/models')` имеет 7 уровней `../`. Hard-coded relative path к target machine. Test gracefully skips если directory не existing (line 251-254), but **does so silently** — на CI test fails как "not run" вместо честного fail. Could be более robust через env var override `TEST_T115_PATH` или search through known prefixes.

**Не блокер.** Существующие integration tests (lines 368-388) для weight YAMLs следуют той же pattern. Test passes сейчас (110 passing).

### Finding #6 (NIT): orchestrator_patcher tests use substring assertions

E.g. `result.includes('Junction-specific')`. Это weakly-coupled assertion (если template docstring rewrites без слова "Junction-specific", test passes incorrectly). **Acknowledged as project pattern** для existing tests; new TASK-013 regression tests follow consistent style. Не block.

### Finding #7 (NIT): t155 endpoint orphan — task_tag_map_endpoint.dart

`t155_server/lib/src/endpoints/task_tag_map_endpoint.dart` exists без paired YAML — это leftover from earlier generate-entity attempt в t155 (probably когда task_tag_map был entity). Causes serverpod generate failure (invalid Dart). **Not TASK-013 issue** (pre-existing test fixture state). User either сам должен убрать orphan или regenerate t155 from clean baseline для clean DoD verify. Recommend run на clean t156.

---

## Final verdict

**CHANGES REQUESTED (block для merge until):**

1. **Block #1 (BLOCKER):** Заполнить acceptance checkboxes в `task.md` (24 items → `[x]` либо `[~]` deferred с justification). Исправить `report.md` — заменить template placeholders реальной summary с DoD evidence (file refs, test counts, deferred items, references на findings ниже).

2. **Block #2 (BLOCKER):** Исправить `status.md` typo — duplicate `TASK-011` → `TASK-013`.

3. **Block #3 (BLOCKER либо escalate):** DoD verify FAIL на t155 — необходимо либо (a) regenerate test project с clean baseline (t156) с правильным role_permission scaffolding (без orphan task_tag_map_endpoint.dart) и run verify до errors=0, либо (b) явно declare deferred с reference на TASK-014 (file path resolution) + acknowledge что Issue #1 не fix'ится в TASK-013 scope. **Recommendation:** route (b) + spawn TASK-014.

**APPROVAL conditions on `lib/` changes:**

`junction_detector.ts`, `server_yaml_parser.ts`, `entity_yaml_validator.ts`, `orchestrator_patcher.ts:58`, `relation_patcher.ts:32` — production code changes **excellent quality**:

- Single source of truth pattern (Q3=A) properly applied — no logic duplication.
- Strict default + explicit override (Q1=C) implemented exactly per spec.
- `JunctionValidationError` fail-fast в parser (line 32 server_yaml_parser.ts → line 120 junction_detector.ts).
- Dependency ordering (parseFields ДО isRelation) correctly implemented (server_yaml_parser.ts:20-32).
- Bonus 4th call-site (relation_patcher.ts:32) — extra credit for consistency.
- 22 new tests + 88 baseline = 110 passing. Test quality good (real YAMLs in dynamic regression, integration tests с реальными weight files).
- Re-audit (37 files scanned) thorough.
- Documentation updates well-formed.

**После closure всех 3 BLOCKER items + spawn TASK-014 для file path resolution → APPROVE.**

Junction detection itself ready for production. RolePermission и CustomerUser в weight repo получат correct routing на момент migration **detection-side**. File path generation (TASK-014) independent issue, не блокирует weight TASK-018 detection-correctness gate, но блокирует weight TASK-018 production migration end-to-end (broken Flutter code generation для junction-with-non-Map-suffix entities).

**Hard gate для weight TASK-018 (post-TASK-013):** partial — detection ✅ resolved, but production migration требует TASK-014 (file path) closure. Update roadmap.md hard gate language accordingly.
