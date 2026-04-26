# Статус проекта

**Обновлено:** 2026-04-25

## Текущая фаза

**Фаза 1 — Стабилизация (после CLI-рефакторинга)**

- ✅ **CLI реализован и верифицирован** — 10 команд, `codegen --help` работает, `create-project --name t139` отработала за 193 сек (проект создан в `G:/Projects/Flutter/serverpod/t139/`)
- ✅ **VS Code декуплен от core** — все 11 команд регистрируются в `extension.ts`, `src/core/*` не импортирует `vscode`
- ✅ **BUG-002 / BUG-003 / BUG-004 / BUG-005 исправлены** (2026-04-25/26, ветка `feature--fix-codegen-regen-bugs`) — snake_case filenames, relation_patcher идемпотентный, pre-flight валидация YAML, AppDatabaseGenerator scan-based
- ✅ **Тесты — 61 passing:** `openapi_parser`, `python_endpoint_generator`, `template_service`, `mock_file_system`, **`relation_patcher`**, **`entity_yaml_validator`**, **`replacement_util`**, **`app_database_generator`**, **`verify_analyzer_parser`**
- ✅ **End-to-end pipeline проверен на t143** (свежий `create-project`, **с первого раза**): verify PASS errors=0, server поднялся (HTTP 200), все 5 sync-таблиц в Postgres присутствуют
- ✅ **`codegen verify --name <project>` команда добавлена** (2026-04-26) — Definition of Done гейт. Запускает pub get → serverpod generate → build_runner → flutter analyze, JSON с counts (errors/warnings/infos)
- ✅ **`autoGenerateTasksFeature` + pubspec post-process в create-project** — сразу после создания проект компилируется и работает с tasks-фичей (Category/Tag/Task/TaskTagMap)
- 🟡 Tech debt — `code_formatter`, `server_yaml_parser` не покрыты тестами

## Активные задачи

| ID | Описание | Статус | Дата |
|---|---|---|---|
| TASK-001 | Заполнить базовую документацию | 🟡 In Progress (ждёт approval) | 2026-04-18 |
| TASK-008 | Фикс BUG-003 (relation_patcher идемпотентный) | ✅ Done (ждёт review) | 2026-04-25 |
| TASK-009 | Фикс BUG-004 (валидация YAML) | ✅ Done (ждёт review) | 2026-04-25 |
| TASK-010 | `codegen verify --runtime` + sync_smoke_test шаблон | 🟡 New (Open) | 2026-04-26 |

## Недавно завершено

| ID | Описание | Дата |
|---|---|---|
| BUG-005 fix | AppDatabaseGenerator scan-based: подключает все таблицы из всех фич сразу (5 тестов) | 2026-04-26 |
| t143 e2e | Свежий create-project + verify PASS + server runtime HTTP 200 + Postgres tables — с первого раза | 2026-04-26 |
| TASK-008 | relation_patcher: один маркер-блок, идемпотентный replace через callback, recovery от дубликатов | 2026-04-25 |
| TASK-009 | EntityYamlValidator: 6-field pattern + paired sync-event, wired в CLI и vscode | 2026-04-25 |
| — | CLI-адаптер + 10 команд (коммит `7335eda`) | 2026-04-XX |
| — | Чистка мёртвого кода, миграция legacy `addMicroservice` (коммит `cece8a5`) | 2026-04-18 |
| — | Регистрация всех 11 VS Code-команд напрямую в `extension.ts` | 2026-04-18 |
| — | Замена `antigravity -g` на `code` в 3 местах | 2026-04-18 |

## Риски / Открытые вопросы

- **BUG-001 (High):** Ref disposed в сгенерированных state_providers — появляется в каждой новой сущности. [ai/bug-reports/001-state-provider-ref-disposed.md](../bug-reports/001-state-provider-ref-disposed.md)
- **BUG-002 (Resolved):** имена файлов в camelCase — закрыто 2026-04-25. [ai/bug-reports/002-file-names-camelcase.md](../bug-reports/002-file-names-camelcase.md)
- **BUG-005 (Open, High):** AppDatabaseGenerator работает только инкрементально — `database.dart` секции могут стать пустыми → 347 errors в analyze. Workaround: regen каждой фичи. Правильный фикс: scan `features/*/data/datasources/local/tables/`. [ai/bug-reports/005-app-database-generator-incremental-only.md](../bug-reports/005-app-database-generator-incremental-only.md)
- **BUG-003 part 2 (открыт как backlog):** перезапись `:base` секций при regen теряет custom code — требует архитектурного решения (per-method markers или patch-only mode). Переоформить как BUG-006 когда станет блокером.
- **Tech debt:** `code_formatter`, `server_yaml_parser`, `app_database_generator` не покрыты тестами
- **Tech debt:** `project_creator.ts` не покрыт тестами — регрессия в standalone-режиме (gitInit + CI/CD prompt) не будет замечена автоматически
- **Вопрос User:** нужно ли мержить `feature--create-cli` + `feature--fix-codegen-regen-bugs` в `master`? Накопился большой diff
- **HOTFIX-001 (backlog):** `scripts/new_task.py` добавляет запись `status.md` после таблицы, а не в неё

## Следующий фокус

1. Завершить TASK-001 (approval протектед-файлов)
2. Code review TASK-008 / TASK-009, мерж в master
3. **TASK-002 — fix BUG-001 (Ref disposed)** — High, критичный для production проекта weight
4. **TASK-003 — fix BUG-002 (camelCase)** — Medium, очищает `dart analyze`
5. **TASK-004 — unit-тесты для остального entity-генератора** — снизит вероятность регрессий
6. **ADR-0001 (актуализация)** — перенести `docs-code-generator/decisions/adr-0001-logger-in-templates.md` в `ai/docs/decisions/`, обновить статус
