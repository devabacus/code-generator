# TASK-012: codegen → todo real app generation + cross-device smoke

**Phase:** 1.5 final gate (sync_core 0.3.0 templates integration)
**Blocking:** weight TASK-018 (13 entities production migration)
**Origin:** sync_core Discussion #3 acceptance gate, approved 2026-05-01

## Ветка

`feature/TASK-012-todo-real-app-generation-cross-device-smoke`

## Цель

E2E acceptance Phase 1.5: подтвердить что **свежий проект, созданный через `codegen create-project` + `generate-entity` для нескольких сущностей (FK + junction), компилируется чисто и работает cross-device через Serverpod sync_core 0.3.0 stack**.

Это **последний gate** перед разблокировкой weight TASK-018 (production migration на 13 entities). Разница с TASK-011 (validated на t157 ProjectMember junction): TASK-012 — это full integration на todo app со сценарием реалистичных entity relations, не synthetic ProjectMember.

## Не-цели

- НЕ писать UI/widget tests — только статическая проверка через `codegen verify` + manual cross-device smoke
- НЕ исправлять BUG-001 (Ref disposed) — может всплыть в noise, но не блокер acceptance (отдельная TASK-002)
- НЕ покрывать BUG-007 (relation_patcher без markers) или BUG-010 (`includes('Map')`) — backlog, не входят в TASK-012 scope
- НЕ автоматизировать cross-device runtime smoke — это **manual user testing на 2 устройствах**, agent готовит окружение и flag User для actual device testing
- НЕ менять `src/features/generation/` без обнаруженного блокера — TASK-011/013/014 уже сделали integration; если что-то сломалось — это регрессия, не scope TASK-012

## Scope

Разрешено:

- `codegen create-project --name todo` — создать новый Serverpod/Flutter монорепо в `G:/Projects/Flutter/serverpod/todo/`
- Подготовить 3-5 entity YAMLs в `todo_server/lib/src/models/<feature>/`:
  - 1 simple entity без relations (например `Project`)
  - 2-3 entity с FK relations (например `Member` — FK на Project; `TodoItem` — FK на Project + Member)
  - 1 junction entity (M2M, ProjectMember pattern из t157 — FK на Project + Member, без `Map` суффикса для проверки TASK-013/014 detection)
  - Парные `*_sync_event.spy.yaml` для каждой
- Запустить `generate-entity` для каждой entity
- Прогнать `codegen verify --name todo` — должен вернуть `success: true`, errors=0
- Запуск Serverpod сервера + apply migrations + healthcheck (HTTP 200)
- **Manual cross-device smoke** — collect инструкции и тестовые сценарии для User (2 устройства Windows + Android, sync of CRUD operations), но не запускать сам
- Документация результатов в report.md (verify counts, runtime healthcheck output)
- Bug-reports если найдены регрессии генератора
- Update `ai/docs/status.md`, `ai/docs/agent_memory.md` после acceptance ✅

Запрещено:

- Менять `src/features/generation/` без явной регрессии (если verify FAIL — first investigate, потом — отдельный fix как новая TASK)
- Менять шаблон `G:/Templates/flutter/t115/` без STOP-gate
- Удалять `t<N>` test-проекты (sandbox блокирует, политика User'а)
- Патчить руками target-проект `todo/` для скрытия багов генератора (DoD violation)
- Делать `--feature-path` с tasks-feature-name (used в template defaults — нужно тестировать non-tasks paths для validation BUG-009 fix)

## Критерии приёмки

- [ ] `codegen create-project --name todo` PASS, проект создан в `G:/Projects/Flutter/serverpod/todo/`
- [ ] 3-5 entities созданы (≥1 simple, ≥2 с FK relations, ≥1 junction без `Map` suffix)
- [ ] Парные `*_sync_event.spy.yaml` для каждой entity
- [ ] `generate-entity` PASS для каждой
- [ ] `codegen verify --name todo` PASS: errors=0 (warnings допустимы, infos игнор)
- [ ] Цитированы реальные числа `errors=N, warnings=M` в report.md (DoD requirement)
- [ ] Serverpod сервер стартует, healthcheck HTTP 200, все sync-таблицы в Postgres присутствуют
- [ ] Junction routing correct: `JunctionDetector.isJunctionEntity()` детектит non-Map junction → adapters в `<entity>/` directory с правильными class refs (НЕ `task_tag_map/`, НЕ `*Map` суффикс в именах)
- [ ] Orchestrator imports correct (BUG-009 regression check): `features/<entity>/data/adapters/...` для non-tasks feature-path
- [ ] AppDatabaseGenerator scan correct (BUG-008 regression check): SyncQueueTable + Configuration tables в `database.dart`
- [ ] Manual cross-device smoke инструкции для User: что создать на одном устройстве, что должно появиться на втором (не autoматизировано — User тестирует сам)
- [ ] report.md заполнен: verify output, runtime evidence, bug-reports (если есть), готовность gate

## STOP-gates

Ожидаемые destructive ops — каждая требует явного `user ok` перед выполнением:

- `codegen create-project --name todo` — создаёт directory `G:/Projects/Flutter/serverpod/todo/` (~3 минуты, не удалять test-проекты)
- `docker compose up -d` в `todo_server/` — postgres + redis контейнеры (для runtime healthcheck)
- `docker compose down -v` — снос контейнеров + volumes (если миграция нужна с чистого состояния)
- Любая правка `src/features/generation/` или шаблона `G:/Templates/flutter/t115/` — STOP-gate (если обнаружена регрессия, не fixать в TASK-012, а оформить отдельной TASK)
- `npm install <package>@major` — breaking deps bump (не ожидается в TASK-012 scope)

## План работы

1. [x] Прочитать `ai/docs/agent_memory.md`, `CLAUDE.md`, последние reports TASK-011/013/014 для контекста sync_core 0.3.0 generation patterns — [13:35]
2. [x] `python ai/scripts/task.py start TASK-012-todo-real-app-generation-cross-device-smoke --stash` — feature branch (сделано teamlead'ом, ветка готова)
3. [x] `npm run compile` — clean compile baseline — [13:38] PASS
4. [x] `npm test` — baseline 119 passing — [13:40] **119 passing 0 failing** через mocha workaround
5. [x] `node out/adapters/cli/index.js create-project --name todo --human` — [14:36] PASS, duration 202s. 4 sub-projects созданы (todo_admin, todo_client, todo_flutter, todo_server), `core/sync/` содержит 5 sync_core 0.3.0 файлов, `features/` содержит configuration baseline (без tasks — Variant A правильно).
6. [x] Подготовить YAML модели в `todo_server/lib/src/models/` — [14:42] 8 YAML файлов созданы (project + sync_event, member + sync_event, project_member junction + sync_event, todo_item + sync_event). ProjectMember junction БЕЗ `Map` суффикса (TASK-013/014 regression check).
   - `project/project.spy.yaml` + `project_sync_event.spy.yaml` (simple entity)
   - `project/member.spy.yaml` + `member_sync_event.spy.yaml` (FK на user)
   - `project/project_member.spy.yaml` + `project_member_sync_event.spy.yaml` (junction Project + Member, **без `Map` суффикса** — TASK-013/014 detection check)
   - `todo/todo_item.spy.yaml` + `todo_item_sync_event.spy.yaml` (FK на Project + Member)
7. [x] Запустить `generate-entity --workspace todo` для каждой entity (4 запуска) — [14:48] всё PASS.
   - Project: 24 created, `features/project/` ✅
   - Member: 24 created, `features/project/data/adapters/member/` ✅
   - **ProjectMember (junction): `relation: true` детектится, adapters в `project_member/` без `Map` суффикса** ✅ — TASK-013/014 regression check passed
   - TodoItem: 24 created + relation patcher запустился (FK на project + member), `features/todo/` ✅
   - **BUG-009 regression check passed:** все orchestrator imports на `features/project/` и `features/todo/` — НЕТ `features/tasks/` для созданных entities
   - **BUG-008 regression check passed:** database.dart содержит SyncQueueTable + ConfigurationTable + Project/Member/ProjectMember/TodoItem
   - **Junction FK docstring правильный:** `junction FK→project+member` + `deleteProjectMemberByProjectAndMember` (НЕ `task+tag`)
8. [!] `codegen verify --name todo --human` — [14:55] **FAIL** на serverpod generate. Bug template `task_tag_map_endpoint.dart`. См. журнал ниже + report.md.
9. [ ] Зафиксировать `errors=N, warnings=M, infos=K` в report.md
10. [ ] Запустить `docker compose up -d` в `todo_server/`, `serverpod create-migration --force`, `dart bin/main.dart --apply-migrations`, проверить `curl http://localhost:8080/` HTTP 200
11. [ ] `psql` проверка: все sync-таблицы (`sync_queue`, `configuration`, `project`, `member`, `project_member`, `todo_item`) присутствуют
12. [ ] Подготовить cross-device smoke сценарий для User: текстовая инструкция (build для Windows + Android, шаги CRUD, ожидаемое поведение sync)
13. [ ] Заполнить report.md (verify, runtime, smoke инструкция, готовность gate)
14. [ ] Обновить `ai/docs/status.md`, `ai/docs/agent_memory.md` — отметить Phase 1.5 closed, weight TASK-018 unblocked
15. [ ] `python ai/scripts/task.py pr` — push + PR (без merge, ждать User)

## План тестирования

**Unit (existing baseline):**
- `npm test` — 119 passing baseline (TASK-014 baseline). НЕ должны упасть. Если упадут — регрессия от изменений в TASK-012 (которых не должно быть, но проверить).

**Verify (DoD-гейт):**
- `node out/adapters/cli/index.js verify --name todo --human` — обязателен PASS errors=0
- Цитировать `flutterAnalyze.counts` в report.md

**Runtime:**
- `docker compose up -d` (postgres + redis из `todo_server/docker-compose.yaml`)
- `serverpod create-migration --force` + `dart bin/main.dart --apply-migrations`
- `curl http://localhost:8080/` → HTTP 200
- `psql` ... `\dt` — все ожидаемые таблицы созданы
- Зафиксировать в report.md реальные команды + output

**Smoke (зона User'а — manual cross-device):**
- Подготовить инструкцию: build `todo_flutter` для Windows + Android, запустить оба, выполнить CRUD на одном (create project → create member → assign member to project через junction → create todo item с FK), убедиться что sync через Serverpod передаёт изменения на второе устройство
- НЕ запускать самому — agent flag User для actual device testing
- В report.md — сценарий + ожидаемое поведение + место для User'а вставить результат

## Релевантный контекст

Файлы для прочтения перед началом:

- `ai/tasks/done/TASK-011-sync-core-0-3-0-templates-integration/report.md` — TASK-011 final report (templates integration patterns + Phase G fixes)
- `ai/tasks/done/TASK-013-junction-detection-robust-yaml-field-analysis/report.md` — junction detection через `JunctionDetector.isJunctionEntity()` + BUG-009 fix в D6
- `ai/tasks/done/TASK-014-junction-adapter-file-path-generation-non-map-entities/report.md` — file path generation для non-Map junction (ProjectMember pattern на t157)
- `ai/docs/agent_memory.md` — junction detection / generation invariants (после TASK-013/014)
- `docs-code-generator/sync-core-integration.md` — sync_core integration spec
- `src/features/generation/parsers/junction_detector.ts` — detection logic (TASK-013)
- `src/features/generation/replacement/replacement_util.ts` — `MANY_TO_MANY` parametrization (TASK-014)
- `src/features/generation/generators/orchestrator_patcher.ts` — feature segment substitution (BUG-009 fix)

## Результаты

Ожидаемые файлы / изменения:

- `G:/Projects/Flutter/serverpod/todo/` — fresh real app project (вне репо, evidence acceptance)
- 4 entity YAML pairs в `todo_server/lib/src/models/`
- Generated code в `todo_flutter/lib/features/<entity>/` (не commit'ится в codegen репо — это target проект)
- `ai/tasks/active/TASK-012-...` → перемещение в `done/` через `task.py pr`
- `report.md` с verify counts + runtime evidence + smoke инструкция
- Updated `ai/docs/status.md` — Phase 1.5 closed, weight TASK-018 unblocked
- Updated `ai/docs/agent_memory.md` — Phase 1.5 acceptance evidence

## Журнал исполнения

- [13:30] Прочитал контекстные файлы: executor.prompt.md, CLAUDE.md, AGENTS.md, agent_memory.md, TASK-011/013/014 reports.
- [13:35] На правильной ветке `feature/TASK-012-todo-real-app-generation-cross-device-smoke`, working tree clean.
- [13:38] Шаг 3 — `npm run compile` PASS clean (no TS errors).
- [13:40] Шаг 4 — `npm test` baseline через mocha workaround (vscode-test runner blocked Inno Setup mutex per TASK-013/014 reports). **119 passing, 0 failing** ✅ matches TASK-014 baseline.
- [13:42] Шаг 5 — обнаружен **BLOCKER**: directory `G:/Projects/Flutter/serverpod/todo/` УЖЕ существует с 5-6 декабря (timestamps `Dec 5/6`).
  - Содержимое: 4 sub-projects (todo_admin, todo_client, todo_flutter, todo_server), модели Configuration + Tasks (старый template).
  - `todo_flutter/lib/core/sync/` содержит **legacy sync architecture**: `base_sync_repository.dart`, `sync_controller_provider.dart`, `sync_registry.dart`. **НЕ sync_core 0.3.0** (которое использует `sync_orchestrator_provider.dart` + `drift_sync_queue_store.dart` + `sync_queue_table.dart` per TASK-011).
  - Это **stale pre-TASK-011 bootstrap** — для TASK-012 acceptance нужен fresh project на sync_core 0.3.0 templates.
- [13:45] Per HARD RULE #4 (CLAUDE.md L189-205) и executor prompt: агент **НЕ имеет права** удалять test-проекты — sandbox блокирует это намеренно. Любой workaround через PowerShell/cmd/node child_process **запрещён**.
- [13:46] Решение: STOP, эскалировать User для удаления `G:/Projects/Flutter/serverpod/todo/` или решения "использовать другое имя проекта вместо `todo`".
- [13:48] Заполняю report.md с findings + варианты для User.

### Resume session (новый executor)

- [14:30] **Sanity check passed:** ветка `feature/TASK-012-...`, working tree clean (только uncommitted task.md), `G:/Projects/Flutter/serverpod/todo/` УДАЛЕНО User'ом ✅ blocker resolved.
- [14:31] Перечитал executor.prompt.md, CLAUDE.md, agent_memory.md, TASK-014 report.md (для t157 ProjectMember pattern). Контекст загружен.
- [14:32] Изучил YAML паттерны: t115/tasks (`task.spy.yaml` + `task_sync_event.spy.yaml` + `task_tag_map.spy.yaml`) и t157/projects (`project.spy.yaml` + `member.spy.yaml` + `project_member.spy.yaml`) — будут источником для todo моделей.
- [14:36] Шаг 5 `create-project --name todo` PASS, duration 202s. 4 sub-projects, sync_core 0.3.0 layer чисто, configuration baseline присутствует.
- [14:42] Шаг 6: 8 YAML файлов созданы (project + member + project_member + todo_item + 4 sync_event пары).
- [14:48] Шаг 7: 4 generate-entity вызова, все PASS:
  - Project (8 fields, relation: false): 24 created, `features/project/` ✅
  - Member (8 fields, relation: false): 24 created, `features/project/data/adapters/member/` ✅
  - **ProjectMember (junction, 8 fields, `relation: true`)**: 24 created, adapters в `project_member/` (НЕ Map) ✅ TASK-013/014 regression check passed
  - TodoItem (10 fields, FK projectId+assigneeId): 24 created, `features/todo/` ✅
  - **BUG-008 ✅** database.dart содержит SyncQueueTable + ConfigurationTable + Project/Member/ProjectMember/TodoItem
  - **BUG-009 ✅** orchestrator imports на `features/project/` + `features/todo/` (НЕ tasks)
  - **Junction FK docstring правильный:** `junction FK→project+member` + `deleteProjectMemberByProjectAndMember`
- [14:55] **Шаг 8 BLOCKER:** `verify --name todo` FAIL на серверной части (НЕ flutter analyze, НЕ flutter side):
  - `[2/4] serverpod generate` ERROR в `todo_server/lib/src/endpoints/project_member_endpoint.dart`
  - Root cause: template `G:/Templates/flutter/t115/t115_server/lib/src/endpoints/task_tag_map_endpoint.dart` line 174+222 hardcoded `orderBy: (t) => t.title`. Project поле `name`, Member — `displayName`. **`title` не существует** → invalid Dart syntax → serverpod generate бросает.
  - Generator подменяет identifiers task→project, tag→member через MANY_TO_MANY словарь, но **field name `t.title`** не имеет покрытия в substitution rules. Это **новая регрессия: TASK-014 закрыл flutter-side junction generation, но server endpoint template остался жёстко привязан к Task/Tag schema**.
- [14:57] Per HARD RULE #5 (CLAUDE.md / executor.prompt.md / TASK-012 task.md "Не-цели"): правка `src/features/generation/` или шаблона `t115/` — STOP, вне scope TASK-012. Это **регрессия генератора**, не блокер интеграции.
- [14:58] STOP, заполняю report.md с findings + варианты для teamlead'а. **TASK-012 acceptance заблокирован** — нужна отдельная TASK для fix template или генератора.

### Resume session (3rd executor — post BUG-011 template fix)

- [15:30] Sanity: ветка `feature/TASK-012-...`, working tree status — несколько modified в `todo/` (project_member files post regen), task.md uncommitted. Контекст: teamlead зафиксил template `task_tag_map_endpoint.dart` lines 174+222 (`title` → `lastModified`), bug-report 011 создан и Resolved. Прочитал executor prompt.
- [15:32] Шаг 7-redo: `generate-entity` для `project_member.spy.yaml` PASS (369ms). 26 файлов modified. Junction routing сохранился (`features/project/data/adapters/project_member/`).
- [15:33] Verify post-regen: `grep orderBy project_member_endpoint.dart` → строки 174, 222, 239 все три = `(t) => t.lastModified` ✅ template fix успешно применился, BUG-011 закрыт e2e.
- [15:34] Шаг 8 `verify --name todo`:
  - `pubGet` ✅ 11627ms
  - `serverpodGenerate` ✅ 9493ms (был блокером — исправлено)
  - `buildRunner` ✅ 21899ms
  - `flutterAnalyze` ✗ 6224ms — **errors=3, warnings=3, infos=67**
  - Total: 49246ms; success=false
- [15:35] **Анализ 3 errors (НОВАЯ РЕГРЕССИЯ codegen, не template):**
  1. `lib/features/todo/data/datasources/local/tables/todo_item_table.dart:7` — `import 'assignee_table.dart'` URI does not exist (uri_does_not_exist)
  2. `lib/features/todo/data/datasources/local/tables/todo_item_table.dart:14` — `AssigneeTable` undefined identifier
  3. `lib/features/todo/data/repositories/todo_item_repository_impl.dart:25` — Missing implementations: `getTodoItemsByAssigneeId`, `getTodoItemsByProjectId` (non_abstract_class_inherits_abstract_member)
- [15:36] **Root cause analysis (FK alias mismatch):**
  - YAML: `assigneeId: UuidValue?, relation(parent=member, onDelete=SetNull)` — FK field `assigneeId` ссылается на entity `member`
  - Codegen вывел target table import/identifier из field name (`assigneeId` → strip `Id` → `assignee` → `assignee_table.dart` / `AssigneeTable`)
  - Должно быть из `parent=member` → `member_table.dart` / `MemberTable`. Реальный `member_table.dart` существует в `features/project/data/datasources/local/tables/` (Member entity сидит в Project feature).
  - Repository interface (`todo_item_repository.dart` lines 17, 22) объявляет методы `getTodoItemsByProjectId` + `getTodoItemsByAssigneeId` под `=== generated_start:oneToManyMethods ===` — но `repository_impl.dart` НЕ реализует эти методы. Это **relation_patcher gap** (известный BUG-007 candidate? возможно, или новый).
  - **Это codegen production bug в `src/features/generation/`**, не template/fixture/yaml issue. FK когда `field name ≠ parent entity name` (ID alias paradigm) обрабатывается некорректно.
- [15:37] Per HARD RULE #5 (executor.prompt.md / CLAUDE.md): правка `src/features/generation/` — STOP-gate, вне scope TASK-012. Это **новая регрессия, отличная от BUG-011**, нужна отдельная TASK или bug-report для teamlead'а.
- [15:38] **STOP** на шаге 8 verify. **TASK-012 acceptance снова заблокирован** двумя независимыми codegen issues: (a) FK field-name vs parent-entity-name resolution в table generation, (b) relation_patcher не пишет реализации generated методов в repository_impl. Шаг 9 (docker compose) **не достигнут** — ждать teamlead'а.

### Resume session (4th executor — Discussion #3 closure PR 1 partial)

- [16:10] Sanity: ветка `feature/TASK-012-...`, 5 modified + 5 untracked uncommitted (doc fixes + bug-reports + discussion archive). Контекст загружен: executor prompt, CLAUDE.md, Discussion #3 archive (Q1=c hybrid, Q2=a drop assigneeId, sequencing PR 1→2→3→4), task.md журнал, текущее состояние generated TodoItem.
- [16:12] **Шаг 1 — Drop `assigneeId`:** `todo_item.spy.yaml` отредактирован, удалена строка `assigneeId: UuidValue?, relation(parent=member, onDelete=SetNull)`. `projectId` сохранён (field=parent matching, НЕ FK alias).
- [16:13] **Шаг 2 — Re-generate TodoItem:** `generate-entity` PASS, 9 fields detected (было 10), `relation: false`, 29 файлов modified, 126ms. `todo_item_table.dart` теперь содержит ТОЛЬКО `import project_table.dart` (нет `assignee_table.dart`), columns `projectId/title/completed` (нет `assigneeId`), references `ProjectTable` (нет `AssigneeTable`).
- [16:18] **Шаг 3 — Verify (DoD-гейт): FAIL — errors=1, warnings=2, infos=67, success=false.**
  - pubGet ✅ 5571ms
  - serverpodGenerate ✅ 10069ms (было FAIL pre BUG-011 fix)
  - buildRunner ✅ 5097ms
  - flutterAnalyze ✗ 3668ms — 1 error
  - Прогресс: 3 errors → 1 error (drop assigneeId убрал 2 errors с FK alias mismatch — `uri_does_not_exist` + `undefined_identifier` для AssigneeTable)
- [16:20] **Анализ оставшегося 1 error:**
  - `lib\features\todo\data\repositories\todo_item_repository_impl.dart:25:7` — `Missing concrete implementation of 'abstract class ITodoItemRepository.getTodoItemsByProjectId'` — `non_abstract_class_inherits_abstract_member`
  - **Это РОВНО BUG-013** (template markers gap repository_impl + usecases). Interface (`todo_item_repository.dart` line 17) объявил `getTodoItemsByProjectId(...)` через markers `:oneToManyMethods` ✅, repository_impl НЕ имеет concrete impl — потому что template `task_repository_impl.dart` 0 markers + 0 hardcoded relation methods.
  - Warning #1: `local_data_source.dart:274` `override_on_non_overriding_member` — interface `ITodoItemLocalDataSource` НЕ имеет declaration для `getTodoItemsByProjectId`, но local_data_source имеет hardcoded impl с `@override`. Это часть того же BUG-013 — markers gap на interfaces local_data_source layer.
- [16:22] **CRITICAL FINDING — Discussion #3 contradiction:**
  - Decision пункт 1 явно требует "drop `assigneeId`, regenerate-entity, **verify PASS errors=0**"
  - НО reduced scope (только drop assigneeId, projectId сохранён) НЕ может achieve errors=0: BUG-013 systematically блокирует **любую FK relation** (interface markers вставляют abstract method → repository_impl не имеет impl → compile fail). Это **structural gap template**, не FK-alias-specific.
  - BUG-013 explicit confirmation (bug report L43-46): «Каждая weight entity с relation (≥10 of 13 entities) после generate-entity будет иметь broken repository_impl + usecases». TodoItem с `projectId, parent=project` (field=parent matching) ловит этот gap.
  - Discussion #3 4-х agents (chatgpt_1/Claude_1/teamlead_claude_1/Claude_2/chatgpt_2) **не учли** что reduced scope ≥1 FK сценарий **не может** PASS verify errors=0 БЕЗ BUG-013 fix. BUG-013 fix явно вынесен в PR 2 (chore/bug-013-template-markers-fill, ~30-45 min).
  - Drop `projectId` тоже = убрать ВСЕ FK relations из TodoItem = нарушает «≥1 FK» criterion + не exercises generation pipeline для relations
- [16:24] **STOP-gate triggered (per executor.prompt.md / CLAUDE.md HARD RULE #5):**
  - Менять template `t115/` для BUG-013 fix — STOP-gate (PR 2 scope, не TASK-012)
  - Менять `src/features/generation/` — STOP-gate
  - Manual patch target проекта — DoD violation (Q2=c явно отвергнут Decision)
  - Drop projectId — нарушает «≥1 FK» criterion + Decision specified только drop assigneeId
- [16:25] **Action:** записываю findings в report.md (BLOCKED статус с детальным анализом), эскалация к teamlead. Возможные пути решения:
  1. **Re-sequence Decision:** PR 2 (BUG-013) merge ПЕРЕД PR 1 (TASK-012 closure) — даст errors=0 на reduced scope. Меняет sequence PR 1→2→3→4 на PR 2→1→3→4.
  2. **Relax DoD для TASK-012 partial:** accept errors=1 (только BUG-013 manifestation, pre-fix expected) с явным пометкой в report.md «errors=1 это BUG-013 manifestation, addressed в PR 2». Compromises «PASS errors=0» Decision text.
  3. **Modify task scope:** TodoItem без FK relations (drop projectId тоже) — нарушает «≥1 FK» criterion, делает TASK-012 acceptance trivial, теряет regression coverage.
  4. **Перенести closure:** TASK-012 НЕ closes сейчас, ждёт PR 2 (BUG-013 fix) merge → re-verify → close TASK-012 → PR 3 (BUG-012) → PR 4 (re-acceptance).
