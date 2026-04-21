# Статус проекта

**Обновлено:** 2026-04-18

## Текущая фаза

**Фаза 1 — Стабилизация (после CLI-рефакторинга)**

- ✅ **CLI реализован и верифицирован** — 10 команд, `codegen --help` работает, `create-project --name t139` отработала за 193 сек (проект создан в `G:/Projects/Flutter/serverpod/t139/`)
- ✅ **VS Code декуплен от core** — все 11 команд регистрируются в `extension.ts`, `src/core/*` не импортирует `vscode`
- ✅ **Частичные тесты:** `openapi_parser`, `python_endpoint_generator`, `template_service`, `mock_file_system`
- 🟡 Приоритет — починка багов генератора, найденных в production (проект weight)
- 🟡 Tech debt — entity-генератор не покрыт тестами

## Активные задачи

| ID | Описание | Статус | Дата |
|---|---|---|---|
| TASK-001 | Заполнить базовую документацию | 🟡 In Progress (ждёт approval) | 2026-04-18 |

## Недавно завершено

| ID | Описание | Дата |
|---|---|---|
| — | CLI-адаптер + 10 команд (коммит `7335eda`) | 2026-04-XX |
| — | Чистка мёртвого кода, миграция legacy `addMicroservice` (коммит `cece8a5`) | 2026-04-18 |
| — | Регистрация всех 11 VS Code-команд напрямую в `extension.ts` | 2026-04-18 |
| — | Замена `antigravity -g` на `code` в 3 местах | 2026-04-18 |

## Риски / Открытые вопросы

- **BUG-001 (High):** Ref disposed в сгенерированных state_providers — появляется в каждой новой сущности. [ai/bug-reports/001-state-provider-ref-disposed.md](../bug-reports/001-state-provider-ref-disposed.md)
- **BUG-002 (Medium):** имена файлов в camelCase вместо snake_case — засоряет `dart analyze`. [ai/bug-reports/002-file-names-camelcase.md](../bug-reports/002-file-names-camelcase.md)
- **Tech debt:** нет unit-тестов для entity-генератора (`code_formatter`, `server_yaml_parser`, `relation_generation`, `app_database_generator`) — новые баги ловим только в production
- **Tech debt:** `project_creator.ts` не покрыт тестами — регрессия в standalone-режиме (gitInit + CI/CD prompt) не будет замечена автоматически
- **Вопрос User:** нужно ли мержить `feature--create-cli` в `master` перед следующим этапом багфиксов? Накопился большой diff (~2000 строк изменений)
- **HOTFIX-001 (backlog):** `scripts/new_task.py` добавляет запись `status.md` после таблицы, а не в неё

## Следующий фокус

1. Завершить TASK-001 (approval протектед-файлов)
2. **TASK-002 — fix BUG-001 (Ref disposed)** — High, критичный для production проекта weight
3. **TASK-003 — fix BUG-002 (camelCase)** — Medium, очищает `dart analyze`
4. **TASK-004 — unit-тесты для entity-генератора** — снизит вероятность регрессий (BUG-001 и похожие)
5. **ADR-0001 (актуализация)** — перенести `docs-code-generator/decisions/adr-0001-logger-in-templates.md` в `ai/docs/decisions/`, обновить статус
