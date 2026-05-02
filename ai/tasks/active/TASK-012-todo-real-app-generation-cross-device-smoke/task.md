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

1. [ ] Прочитать `ai/docs/agent_memory.md`, `CLAUDE.md`, последние reports TASK-011/013/014 для контекста sync_core 0.3.0 generation patterns
2. [ ] `python ai/scripts/task.py start TASK-012-todo-real-app-generation-cross-device-smoke --stash` — feature branch (с pop текущего uncommitted handoff cleanup)
3. [ ] `npm run compile` — clean compile baseline
4. [ ] `npm test` — baseline 119 passing
5. [ ] `node out/adapters/cli/index.js create-project --name todo --human` — bootstrap todo project
6. [ ] Подготовить YAML модели в `todo_server/lib/src/models/`:
   - `project/project.spy.yaml` + `project_sync_event.spy.yaml` (simple entity)
   - `project/member.spy.yaml` + `member_sync_event.spy.yaml` (FK на user)
   - `project/project_member.spy.yaml` + `project_member_sync_event.spy.yaml` (junction Project + Member, **без `Map` суффикса** — TASK-013/014 detection check)
   - `todo/todo_item.spy.yaml` + `todo_item_sync_event.spy.yaml` (FK на Project + Member)
7. [ ] Запустить `generate-entity --workspace todo` для каждой entity (4 запуска)
8. [ ] `codegen verify --name todo --human` — должен вернуть PASS errors=0; если FAIL → root cause, новая TASK для fix, blocker on TASK-012
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

(Заполняется executor'ом по ходу работы — решения, блокеры, ссылки на discussions/bug-reports.)
