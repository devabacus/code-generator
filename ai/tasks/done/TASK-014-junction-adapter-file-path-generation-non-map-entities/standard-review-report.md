# TASK-014 Standard Review Report

**Reviewer:** standard correctness review (read-only)
**Date:** 2026-05-02
**Branch:** `feature/TASK-014-junction-adapter-file-path-generation-non-map-entities` @ `c7b8434`
**Verdict:** **APPROVE WITH NITS** (1 minor cosmetic finding в `ai/docs/status.md`, не блокер для merge)

---

## Acceptance criteria check

| Item | Status | Evidence |
|---|---|---|
| MANY_TO_MANY parametrization | ✅ | `replacement_util.ts:52-116` — `templEntity1/templEntity2` теперь читаются из `config` (не hardcoded), `targetJunctionClassName` substitution заменяет `task_tag_map`/`TaskTagMap`/`taskTagMap` literals; legacy fallback `<E1><E2>Map` сохранён (lines 81-87) |
| `_getDestinationPath` M2M two-entity rename fix | ✅ | `generation_service.ts:224-289` — junction branch через `model?.isRelation === true`, length-ordered replace (long token `task_tag_map` first) + lookahead `(?=_\|/\|\.\|$)` для tokens `task`/`tag` (избегает `tasks` overlap), regular branch не задет (line 279-285) |
| `_JUNCTION_REGISTER_TEMPLATE` parametrization | ✅ | `orchestrator_patcher.ts:451-467` — placeholders `__FK1__/__FK2__/__FK1Pascal__/__FK2Pascal__` подставляются ДО standard entity substitution через `_substituteJunctionFKs` (lines 316-323); FK extraction Option A (declaration order) — lines 260-262 |
| 6+ regression tests | ✅ | 9 new tests (3 replacement_util + 4 generation_service + 2 orchestrator_patcher) — превышает minimum 6, все запускаются |
| DoD verify regression | ✅ | t157 verify PASS errors=0 (re-run cited ниже) |
| DoD generate-entity E2E | ✅ | `t157_flutter/lib/features/projects/data/adapters/project_member/` содержит 5 файлов с `project_member_*.dart` префиксами и `ProjectMemberEntity` references — НЕ `task_tag_map_*.dart` / `ProjectMemberMap` |
| roadmap.md hard gate updated | ✅ | `ai/docs/roadmap.md:40-43,76-77` — `Hard gate: TASK-013 + TASK-014 ✅ Resolved` + Fully closed via TASK-013 + TASK-014 |
| 119 tests passing | ✅ | mocha re-run (cited ниже): `119 passing (44ms)` (110 baseline + 9 new) |
| status.md новая запись | 🟡 NIT | uncommitted modification + строка дублирует ID `TASK-011` вместо `TASK-014` (см. Finding #1) |

---

## Verify re-run (cite actual JSON)

Команда: `node out/adapters/cli/index.js verify --name t157 --human`

```
PASS: verify t157
  project: G:\Projects\Flutter\serverpod\t157
  ✓ flutterAnalyze — 3163ms (errors=0, warnings=1, infos=67)
  ✓ pubGet — 7726ms
  ✓ serverpodGenerate — 9603ms
  ✓ buildRunner — 4631ms
Total: 25125ms
```

**Numbers vs report.md:** report.md заявляет `errors=0, warnings=1, infos=67`. Re-run даёт **identical** counts → reproducible. Длительности отличаются (`flutterAnalyze` 3163ms vs 4999ms в report — typical OS variability, не релевантно).

---

## E2E evidence on t157

### File paths + filenames check

`ls G:/Projects/Flutter/serverpod/t157/t157_flutter/lib/features/projects/data/adapters/project_member/`:

```
project_member_event_adapter.dart
project_member_local_apply.dart
project_member_payload_codec.dart
project_member_pull_adapter.dart
project_member_remote_adapter.dart
```

✅ Directory `project_member/` (НЕ `task_tag_map/`).
✅ Все 5 файлов имеют префикс `project_member_*.dart` (НЕ `task_tag_map_*.dart`).

### Class refs check (negative grep)

`grep -rn "ProjectMemberMap\|task_tag_map\|TaskTagMap" .../project_member/` → **empty output**.

Zero leak template literals в generated content.

### Class refs check (positive grep — project_member_remote_adapter.dart)

```
class ProjectMemberRemoteAdapter
    implements SyncRemoteWriteAdapter<ProjectMemberEntity> {
  ...
  Future<RemoteWriteResult<ProjectMemberEntity>> create(
    ProjectMemberEntity entity,
  ...
  await _client.createProjectMember(wireEntity)
  ...
  await _client.deleteProjectMemberByProjectAndMember(...)
```

✅ `ProjectMemberEntity` class (НЕ `ProjectMemberMap`).
✅ Method `deleteProjectMemberByProjectAndMember` (НЕ `ByTaskAndTag`).

### Orchestrator junction docstring + register block

`grep -n "ProjectMember\|junction FK\|deleteProjectMember" .../sync_orchestrator_provider.dart`:

```
140:  // ── Adapter bundle: ProjectMember (junction FK→project+member) ───────────────────
141:  // Junction-specific: server has no `updateProjectMember` RPC, only
142:  // `createProjectMember` (idempotent create + resurrect) and
143:  // `deleteProjectMemberByProjectAndMember` (soft-delete via business key).
144:  // `update()` adapter routes через `createProjectMember`; `delete()` is
147:  orchestrator.register<ProjectMemberEntity>(
149:    AdapterBundle<ProjectMemberEntity>(
150:      writeAdapter: ProjectMemberRemoteAdapter(client),
151:      codec: const ProjectMemberPayloadCodec(),
152:      localApply: ProjectMemberLocalApply(ProjectMemberDao(dbService)),
153:      pullAdapter: ProjectMemberPullAdapter(client),
154:      eventAdapter: ProjectMemberEventAdapter(client),
```

✅ Docstring `junction FK→project+member` (НЕ `task+tag`).
✅ Method-name fragment `deleteProjectMemberByProjectAndMember` (НЕ `ByTaskAndTag`).
✅ Все 5 adapter slots (writeAdapter/codec/localApply/pullAdapter/eventAdapter) ссылаются на `ProjectMember*` types.

Bomb #6 (TASK-013 adversarial — hardcoded `task+tag` literals в junction docstring) → confirmed closed.

---

## Backward compat TaskTagMap

### Test #1 in replacement_util.test.ts — TaskTagMap identity output

`replacement_util.test.ts:167-195` — `'TASK-014 backward compat: TaskTagMap target → identical substitutions for class names + paths'` — passes (verified в mocha output `119 passing`).

Покрывает:
- `class TaskTagMap` → identity (no rewrite)
- `import '../adapters/task_tag_map/task_tag_map_dao.dart';` → identity
- `final taskTagMap = TaskTagMap();` → identity

### Test в orchestrator_patcher.test.ts — TaskTagMap docstring backward compat

`orchestrator_patcher.test.ts:669-694` — `'TASK-014 backward compat: TaskTagMap docstring сохраняет "junction FK→task+tag"'` — passes.

Покрывает: TaskTagMap junction → docstring `junction FK→task+tag` + method-name `ByTaskAndTag` (identical pre-TASK-014).

### Test в generation_service.test.ts — TaskTagMap path no-op

`generation_service.test.ts:174-199` — `'TASK-014 backward compat: TaskTagMap junction → task_tag_map/ directory preserved (no-op)'` — passes.

### Fresh t158 create-project optional verify — SKIPPED with rationale

`autoGenerateTasksFeature` **удалена из bootstrap** (commit `0a96e9f` "убрать tasks-фичу из bootstrap полностью" — `create-project` не генерирует TaskTagMap по умолчанию). Тест fresh `create-project --name t158` НЕ вернул бы TaskTagMap evidence даже на pre-TASK-014 baseline.

Backward compat для TaskTagMap покрыт через **3 unit-теста** на трёх critical layers (replacement_util / orchestrator_patcher / generation_service). User отметил test infrastructure как достаточный — runtime создание TaskTagMap фичи теперь explicit user action (`generate-entity --yaml task_tag_map.spy.yaml`).

**Verdict:** backward compat covered адекватно для текущей t115 архитектуры (post-TASK-002 opt-in tasks).

---

## 119 tests reproducibility

Команда: `node node_modules/mocha/bin/mocha.js --ui tdd --reporter spec --timeout 20000 --recursive out/test/parsers out/test/generators out/test/replacement out/test/services out/test/verify out/test/mocks`

Результат:
```
119 passing (44ms)
```

✅ 0 failing, identical к report.md claim.

Workaround mocha-direct (вместо `npm test`) применён правильно — `npm test` blocked на VS Code `code` installer mutex (Inno Setup) — документировано в TASK-013 standard review.

---

## Hard technical gate (TASK-013 baseline preservation)

`grep -rn "endsWith.*Map\|includes.*Map\|class.*Map" src/features src/adapters/cli src/adapters/vscode | grep -v test`:

```
generation_config.ts:73         (JSDoc comment: "class `TaskTagMap`")
configmap_generator.ts:6        (legitimate: ConfigMapGenerator class — Kubernetes)
orchestrator_patcher.ts:27      (JSDoc: "Replaces legacy endsWith('Map')")
orchestrator_patcher.ts:57      (comment: "Replaces legacy endsWith('Map')")
relation_patcher.ts:29          (JSDoc: "Replaces legacy includes('Map')")
entity_yaml_validator.ts:19     (JSDoc: "legacy parsed.class.includes('Map')")
code_formatter.ts:81            !field.name.includes('Map') — BUG-010 deferred (out-of-scope)
junction_detector.ts:5          (JSDoc: "Заменяет legacy endsWith('Map')")
server_yaml_parser.ts:17        (comment: "Legacy parsed.class.includes('Map')")
type-mappers.ts:3               (TypeMapper class — irrelevant name match)
```

✅ TASK-013 detection-side baseline preserved — нет новых production decisions от TASK-014. Все hits — JSDoc/comments или legitimate names (ConfigMapGenerator/TypeMapper) или BUG-010 deferred (code_formatter:81).

---

## Side finding (t156 → t157 entity name switch) — verdict: **legitimate**

Executor switched test entity name из `RolePermission`/`Role`/`Permission` (изначально в task.md acceptance) на `Project`/`Member`/`ProjectMember` для t157.

**Verification:** `find G:/Templates/flutter/t115/t115_server/lib/src/models -iname "role*" -o -iname "permission*"`:

```
t115_server/lib/src/models/user/permission.spy.yaml
t115_server/lib/src/models/user/role.spy.yaml
t115_server/lib/src/models/user/role_details.spy.yaml
t115_server/lib/src/models/user/role_permission.spy.yaml
```

✅ Pre-existing t115 schema collision **подтверждён**. `Role`, `Permission`, `RolePermission` уже занимают namespace в admin auth. `serverpod generate` упал бы на duplicate model definitions в t156 — это НЕ TASK-014 баг, это unrelated template constraint.

**Verdict:** legitimate substitution. ProjectMember preserves the structural test (3 entities: 2 parents + 1 junction with 2 FK + base fields), namespace conflict-free. **NOT a workaround** — RolePermission в t157 был бы blocked external infrastructure.

Honest disclaimer: report.md correctly mentions это в "Side note: t156 verify FAIL'ed" — executor честно описал rationale, а не маскировал.

---

## roadmap.md hard gate verification

`ai/docs/roadmap.md:40-43`:
```
### Hard gate: TASK-013 + TASK-014 junction detection — ✅ Resolved (2026-05-02)
**Status:** ✅ **Fully closed via TASK-013 + TASK-014 (Variant B split per User decision 2026-05-02).**
- Detection-side ✅ closed via TASK-013 — junction detection refactored через JunctionDetector.isJunctionEntity() shared utility.
- File path generation ✅ closed via TASK-014 — MANY_TO_MANY parametrization + _getDestinationPath junction-aware ...
```

`ai/docs/roadmap.md:76-77`:
```
- Detection-side ✅ closed (TASK-013) — junction routing correct at migration time.
- File path generation ✅ closed (TASK-014) — non-Map junctions (RolePermission, CustomerUser) генерируются в правильную directory с правильными class refs.
```

✅ Hard gate properly updated. Cross-repo TASK-018 unblocking логика правильно описана (после TASK-X2 todo smoke acceptance ✅).

---

## Findings

### Finding #1 (NIT): `ai/docs/status.md` uncommitted + duplicate TASK-011 ID

**Severity:** Cosmetic / process. Не блокер.

**Symptom:** uncommitted modification + новая запись использует ID `TASK-011` вместо `TASK-014`:

```
| TASK-011 | sync_core 0.3.0 templates integration | 🟡 In Progress | 2026-05-02 |
| TASK-013 | junction detection robust YAML field analysis | 🟡 In Progress | 2026-05-02 |
+| TASK-011 | junction adapter file path generation для non-Map entities | 🟡 In Progress | 2026-05-02 |
```

**Issues:**
1. ID должен быть `TASK-014`, не `TASK-011` (collision с уже-merged TASK-011 sync_core templates integration).
2. Status `🟡 In Progress` — должен быть `✅ Done` поскольку executor завершил работу.
3. Modification uncommitted на feature branch — `task.py pr` flow подтянет это в PR body, но stale ID будет в master после merge.
4. Также видна untracked `ai/tasks/done/TASK-013.../standard-review-report-round2.md` — это leftover от предыдущей TASK-013 review session, не TASK-014 scope.

**Recommendation:** перед `python ai/scripts/task.py pr`:
- Поправить ID на `TASK-014` + статус `✅ Done`
- Решить с `standard-review-report-round2.md` (либо включить в commit, либо stash/discard если pre-existing)
- Сделать commit (на этой ветке) с правильным ID

**Reproducibility:** voluntary fix — не блокирует merge correctness, но `status.md` будет пытаться представить TASK-014 как другой TASK-011 record (UI confusion).

### Finding #2 (positive): test fixture quality

`generation_service.test.ts` использует grey-box bracket access на private `_getDestinationPath` — pattern reasonable для unit testing path mapping без full FS mock. Test fixtures (`junctionConfig`, `regularConfig`, `makeJunctionModel`, `makeRegularModel`) хорошо изолированы. Новый CustomerUser fixture (3 FK + nullable) covers TASK-013 edge case в TASK-014 scope — extra credit.

### Finding #3 (positive): observable signals at right layers

3 ортогональных testing layers:
- `replacement_util.test.ts` — dictionary substitutions (string-level)
- `generation_service.test.ts` — path mapping (file-level)
- `orchestrator_patcher.test.ts` — code generation (AST-level docstring + register block)

Каждый покрыт independently → bug в одном layer не маскируется через прохождение в другом. Solid TDD coverage.

### Finding #4 (informational): legacy fallback semantics

`replacement_util.ts:81-87` — legacy fallback path для VS Code, который не передаёт `targetJunctionClassName`. Производит legacy `<E1><E2>Map` shape (e.g. `RolePermissionMap`). Documented в test #3.

Это intentional backward compat (не баг) для existing VS Code call path. Однако VS Code wire-up на `create_data_files_by_replacement.ts:4` теперь передаёт `model.className` → fallback редко triggers'ится для junction generation. Для regular create-project (не junction) `targetEntity1/2` пусты → MANY_TO_MANY rules early-return [] (line 53). 

Suggestion (не блокер): рассмотреть deprecation legacy fallback в follow-up задаче, если VS Code path полностью покрыт через `model.className`.

---

## Final verdict

**APPROVE WITH NITS** — rationale:

1. **Все 7 must-have acceptance criteria из task.md выполнены** — verified through:
   - Production code review (replacement_util.ts / generation_service.ts / orchestrator_patcher.ts / generation_config.ts wire-up)
   - Test layer review (9 new tests: 3 + 4 + 2 across 3 layers)
   - Re-run verify t157 (errors=0, identical counts vs report.md)
   - Re-run mocha (119 passing, 0 failing)
   - E2E evidence на t157 directory + class refs + orchestrator docstring

2. **TASK-013 baseline preserved** — hard grep gate clean (только legitimate JSDoc/names + BUG-010 deferred).

3. **Side finding RolePermission → ProjectMember switch — legitimate** — t115 namespace conflict реален (verified через `find`), executor правильно adaptировал test scenario без потери structural rigor.

4. **Roadmap.md hard gate corrected** — Phase 1.5 closure status updated, weight TASK-018 unblocking условия описаны.

5. **Один minor NIT** — `ai/docs/status.md` uncommitted с stale `TASK-011` ID + status `🟡 In Progress`. Это cosmetic, не блокер для merge correctness, но рекомендуется поправить **до** `task.py pr` (избегаем noise в production status table).

**No critical findings. No blockers.**

Готово к `python ai/scripts/task.py pr` после Finding #1 fix (или с явным acknowledgement что status.md cleanup пойдёт hotfix'ом).

---

## Files reviewed

Production code:
- `G:/Projects/vs_code_extensions/code-generator/src/features/generation/replacement/replacement_util.ts`
- `G:/Projects/vs_code_extensions/code-generator/src/features/generation/generators/generation_service.ts`
- `G:/Projects/vs_code_extensions/code-generator/src/features/generation/generators/orchestrator_patcher.ts`
- `G:/Projects/vs_code_extensions/code-generator/src/features/generation/config/generation_config.ts`

Tests:
- `G:/Projects/vs_code_extensions/code-generator/src/test/replacement/replacement_util.test.ts`
- `G:/Projects/vs_code_extensions/code-generator/src/test/generators/generation_service.test.ts`
- `G:/Projects/vs_code_extensions/code-generator/src/test/generators/orchestrator_patcher.test.ts`

E2E evidence:
- `G:/Projects/Flutter/serverpod/t157/t157_flutter/lib/features/projects/data/adapters/project_member/` (5 files)
- `G:/Projects/Flutter/serverpod/t157/t157_flutter/lib/core/sync/sync_orchestrator_provider.dart` (lines 140-156)

Documentation:
- `G:/Projects/vs_code_extensions/code-generator/ai/docs/roadmap.md` (Phase 1.5 hard gate)
- `G:/Projects/vs_code_extensions/code-generator/ai/docs/status.md` (NIT — Finding #1)
- `G:/Projects/vs_code_extensions/code-generator/ai/tasks/active/TASK-014-.../task.md`
- `G:/Projects/vs_code_extensions/code-generator/ai/tasks/active/TASK-014-.../report.md`

Side-finding verification:
- `G:/Templates/flutter/t115/t115_server/lib/src/models/user/{role,permission,role_permission}.spy.yaml` (existence confirms namespace conflict)
