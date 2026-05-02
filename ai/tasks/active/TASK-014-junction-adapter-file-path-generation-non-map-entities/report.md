# Отчёт TASK-014: Junction adapter file path generation для non-Map entities

## Резюме

Closes Bomb #2 из TASK-013 adversarial review (file path generation для non-Map junctions). После TASK-014:

- `MANY_TO_MANY` словарь параметризован — `templEntity1`/`templEntity2` берутся из `config` (default `task`/`tag` для backward compat) + `targetJunctionClassName` substitution заменяет `TaskTagMap`/`taskTagMap`/`task_tag_map` literals на actual class name (`RolePermission`, `ProjectMember`, etc — без `Map` суффикса leak)
- `_getDestinationPath` junction-aware — детектит `model.isRelation === true` (set parser'ом через JunctionDetector) и применяет two-entity rewrite: template `task_tag_map/` directory + `task_tag_map_*` file prefix → `<targetSnakeCase>/` + `<targetSnakeCase>_*`
- `_JUNCTION_REGISTER_TEMPLATE` параметризован через `__FK1__` / `__FK2__` / `__FK1Pascal__` / `__FK2Pascal__` placeholders — RolePermission получает docstring `junction FK→role+permission` + `deleteRolePermissionByRoleAndPermission` (НЕ `task+tag` / `ByTaskAndTag`)

DoD verify PASS errors=0 на t157 (cited JSON ниже) — закрывает adversarial Bomb #1+#2 incomplete DoD.

## Изменения

### Production code (3 файла + 2 wire-up files)

- **`src/features/generation/replacement/replacement_util.ts`** — Dictionaries.MANY_TO_MANY:
  - templEntity1/templEntity2 теперь читаются из `config` (default `task`/`tag` через GenerationConfig defaults) — раньше hardcoded literals
  - Добавлены 3 junction class name substitution rules ПЕРЕД entity1/entity2 substitutions: `task_tag_map` (snake), `TaskTagMap` (Pascal), `taskTagMap` (camel) → target junction names
  - Backward compat: TaskTagMap caller получает identity substitutions (no-op)
  - Legacy fallback: если `targetJunctionClassName` не set → produce legacy `<E1><E2>Map` shape (для VS Code path который не передавал className)

- **`src/features/generation/generators/generation_service.ts`** — `_getDestinationPath`:
  - Signature: добавлен optional `model?: ServerpodModel` параметр (propagated через `generate()` + `_processFile()`)
  - Junction branch: detect через `model?.isRelation === true`; replace `task_tag_map` → `<targetJunctionSnake>` (длинный токен первым) + replace `task` / `tag` tokens с lookahead `(?=_|/|\.|$)` чтобы не задеть `tasks` (template feature directory)
  - Regular branch — unchanged (single-entity rewrite через `config.templEntity → targetEntitySnake`)

- **`src/features/generation/generators/orchestrator_patcher.ts`** — `_JUNCTION_REGISTER_TEMPLATE`:
  - Hardcoded `task+tag` (docstring) и `ByTaskAndTag` (method-name fragment) → `__FK1__`/`__FK2__`/`__FK1Pascal__`/`__FK2Pascal__` placeholders
  - Новый метод `_substituteJunctionFKs(template, fk1, fk2)` — заменяет ДО standard entity substitution
  - Новый helper `_extractEntityNameFromField(field)` — mirrors logic из `server_yaml_parser.ts`
  - `_buildRegisterSnippet` для junction: extract first 2 FK fields из `model.fields` (Option A — declaration order, fallback `task`/`tag`)

- **`src/features/generation/config/generation_config.ts`** — добавлены 3 опциональных поля:
  - `templEntity1: string` (default `'task'`), `templEntity2: string` (default `'tag'`) — параметризация template junction FK names
  - `targetJunctionClassName: string` — PascalCase className целевого junction для substitution

- **`src/adapters/cli/commands/generate_entity.ts`** + **`src/adapters/vscode/commands/create_data_files_by_replacement.ts`** — wire-up: для junction передаём `targetJunctionClassName: model.className`

### Tests (3 файла, 9 новых tests, total 119 passing)

- **`src/test/replacement/replacement_util.test.ts`** — добавлен suite "MANY_TO_MANY rules (TASK-014)" с 3 тестами (backward compat TaskTagMap / RolePermission без Map leak / legacy fallback `<E1><E2>Map`)
- **`src/test/generators/generation_service.test.ts`** — новый файл, 4 теста для `_getDestinationPath` (RolePermission junction directory / TaskTagMap backward compat / regular entity preserved / CustomerUser 3 FK)
- **`src/test/generators/orchestrator_patcher.test.ts`** — добавлены 2 теста (RolePermission docstring `junction FK→role+permission` / TaskTagMap backward compat)

## Тесты

- Добавлено тестов: 9 (3 replacement_util + 4 generation_service + 2 orchestrator_patcher)
- TASK-013 baseline: 110 → TASK-014: **119 passing, 0 failing**
- Как запустить: `node node_modules/mocha/bin/mocha.js --ui tdd --reporter spec --timeout 20000 --recursive out/test/parsers out/test/generators out/test/replacement out/test/services out/test/verify out/test/mocks`

```
119 passing (41ms)
```

(VS Code test runner blocked Inno Setup mutex — workaround mocha direct, документировано в TASK-013 standard-review-report.md.)

## DoD verify evidence

### Configuration baseline regression — t156 (initial verify)

```json
{
  "success": true,
  "command": "verify",
  "project": "t156",
  "steps": {
    "flutterAnalyze": { "ok": true, "ms": 4938, "counts": { "errors": 0, "warnings": 1, "infos": 44 } },
    "pubGet": { "ok": true, "ms": 4542 },
    "serverpodGenerate": { "ok": true, "ms": 8927 },
    "buildRunner": { "ok": true, "ms": 3919 }
  },
  "errors": [],
  "duration_ms": 22328
}
```

### E2E generate-entity test — t157 (closes Bomb #1 + #2)

Test scenario: Project (parent) + Member (parent) + ProjectMember (junction, 2 FK + base only) — non-conflicting с t115 template schemas (RolePermission/Role/Permission уже занят админ auth schema'ой).

YAML files в `t157/t157_server/lib/src/models/projects/`:
- `project.spy.yaml`, `project_sync_event.spy.yaml`
- `member.spy.yaml`, `member_sync_event.spy.yaml`
- `project_member.spy.yaml` (junction, FK projectId+memberId), `project_member_sync_event.spy.yaml`

3 generate-entity calls: project, member, project_member.

**Result: junction file generation correct:**

```
t157_flutter/lib/features/projects/data/adapters/
├── member/                    (regular adapter dir)
├── project/                   (regular adapter dir)
└── project_member/            ← TASK-014 fix: junction directory ✅
    ├── project_member_event_adapter.dart
    ├── project_member_local_apply.dart
    ├── project_member_payload_codec.dart
    ├── project_member_pull_adapter.dart
    └── project_member_remote_adapter.dart
```

**Class refs:** `ProjectMemberEntity` (НЕ `ProjectMemberMap`) — verified через grep `ProjectMemberMap|TaskTagMap|task_tag_map` returns empty.

**Orchestrator docstring (sync_orchestrator_provider.dart):**

```dart
// ── Adapter bundle: ProjectMember (junction FK→project+member) ───────────────────
// Junction-specific: server has no `updateProjectMember` RPC, only
// `createProjectMember` (idempotent create + resurrect) and
// `deleteProjectMemberByProjectAndMember` (soft-delete via business key).
```

`junction FK→project+member` + `deleteProjectMemberByProjectAndMember` — НЕ `task+tag` / `ByTaskAndTag` (Bomb #6 closed).

### Final verify t157 — после E2E generate-entity flow

```json
{
  "success": true,
  "command": "verify",
  "project": "t157",
  "steps": {
    "flutterAnalyze": {
      "ok": true,
      "ms": 4999,
      "counts": { "errors": 0, "warnings": 1, "infos": 67 }
    },
    "pubGet": { "ok": true, "ms": 4546 },
    "serverpodGenerate": { "ok": true, "ms": 9122 },
    "buildRunner": { "ok": true, "ms": 20890 }
  },
  "errors": [],
  "duration_ms": 39559
}
```

**`success: true`, `errors=0`, `warnings=1`, `infos=67`** — flutter analyze, serverpod generate, build_runner все ok. Закрывает TASK-013 incomplete DoD acceptance (Bomb #1+#2).

### Side note: t156 verify FAIL'ed

`t156` тест проект изначально использовал `RolePermission` для junction — но t115 template **уже** имеет `RolePermission`/`Role`/`Permission` модели в `models/user/` (для admin auth). Schema name conflict → serverpod generate FAIL. Это НЕ TASK-014 баг — pre-existing issue в t115 template namespace. t157 (с `Project`/`Member`/`ProjectMember`) → verify PASS.

## Риски / Заметки

1. **Backward compat для VS Code path:** старый VS Code call теперь передаёт `targetJunctionClassName: model.className`. Если call идёт **без** className (legacy path) — MANY_TO_MANY rules используют legacy fallback `<E1><E2>Map` shape (test #3 в replacement_util suite).

2. **Junction FK extraction — Option A (declaration order)** per task.md. Если YAML reorders FK → entity1/entity2 silently flip (pre-existing limitation, не TASK-014 scope).

3. **t156 dirty state:** содержит partial generated files в `permission/data/adapters/role_permission/`. Не удалял (sandbox denies rm directory). Не влияет на acceptance — DoD evidence через t157.

## Статус

Ready for review.
