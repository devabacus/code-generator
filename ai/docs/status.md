# Статус проекта

**Обновлено:** 2026-05-02

## Текущая фаза

**Фаза 1 — Стабилизация (после CLI-рефакторинга)**

- ✅ **CLI реализован и верифицирован** — 10 команд, `codegen --help` работает, `create-project --name t139` отработала за 193 сек (проект создан в `G:/Projects/Flutter/serverpod/t139/`)
- ✅ **VS Code декуплен от core** — все 11 команд регистрируются в `extension.ts`, `src/core/*` не импортирует `vscode`
- ✅ **BUG-002 / BUG-003 / BUG-004 / BUG-005 / BUG-006 исправлены** (2026-04-25/26, ветка `feature--fix-codegen-regen-bugs`) — snake_case filenames, relation_patcher идемпотентный, pre-flight валидация YAML, AppDatabaseGenerator scan-based, migration-ветки append вместо prepend (production-блокер на Android, найден внешними агентами TASK-015 в weight)
- ✅ **Тесты — 62 passing:** `openapi_parser`, `python_endpoint_generator`, `template_service`, `mock_file_system`, **`relation_patcher`**, **`entity_yaml_validator`**, **`replacement_util`**, **`app_database_generator`**, **`verify_analyzer_parser`**
- ✅ **End-to-end pipeline проверен на t143** (свежий `create-project`, **с первого раза**): verify PASS errors=0, server поднялся (HTTP 200), все 5 sync-таблиц в Postgres присутствуют
- ✅ **`codegen verify --name <project>` команда добавлена** (2026-04-26) — Definition of Done гейт. Запускает pub get → serverpod generate → build_runner → flutter analyze, JSON с counts (errors/warnings/infos)
- ✅ **`autoGenerateTasksFeature` + pubspec post-process в create-project** — сразу после создания проект компилируется и работает с tasks-фичей (Category/Tag/Task/TaskTagMap)
- 🟡 Tech debt — `code_formatter`, `server_yaml_parser` не покрыты тестами

## Активные задачи

| ID | Описание | Статус | Дата |
|---|---|---|---|
| TASK-010 | `codegen verify --runtime` + sync_smoke_test шаблон | 🟡 New (Open) | 2026-04-26 |
| TASK-012 | codegen → todo real app + cross-device smoke (Phase 1.5 final gate) | ⏭ Next | — |

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

- **BUG-001 (Open, High):** Ref disposed в сгенерированных state_providers — единственный открытый High баг. May surface в TASK-012 todo app generation (не блокер acceptance, noise в production). [ai/bug-reports/001-state-provider-ref-disposed.md](../bug-reports/001-state-provider-ref-disposed.md)
- **BUG-007 (Open, Medium):** relation_patcher silent no-op без `:oneToManyMethods` markers — pre-existing limitation для regen на template directory. [ai/bug-reports/007-relation-patcher-misses-template-without-markers.md](../bug-reports/007-relation-patcher-misses-template-without-markers.md)
- **BUG-010 (Open, Medium-High):** `code_formatter.ts:81 !field.name.includes('Map')` silent data loss landmine для fields с "Map" в имени. [ai/bug-reports/010-code-formatter-field-name-includes-map-silent-data-loss.md](../bug-reports/010-code-formatter-field-name-includes-map-silent-data-loss.md)
- **BUG-002/003/004/005/006/008/009 — Resolved.** 008 closed via TASK-011 Phase D5 + G1, 009 closed via TASK-013 D6 (commit a299f52, 2026-05-02).
- **BUG-003 part 2 (backlog):** перезапись `:base` секций при regen теряет custom code — требует архитектурного решения (per-method markers или patch-only mode).
- **Cross-repo gate:** weight TASK-018 (13 entities production migration) blocked до TASK-012 acceptance ✅
- **TASK-015 (backlog):** robust junction FK extraction для non-FK pseudo-keys — НЕ блокер TASK-012, flag для weight TASK-018 (CustomerUser-style)
- **Tech debt:** `code_formatter`, `server_yaml_parser`, workflow-модули, `project_creator.ts` не покрыты unit-тестами
- **HOTFIX-001 (backlog):** `scripts/new_task.py` добавляет запись `status.md` после таблицы, а не в неё

## Недавно завершено (Phase 1.5)

| ID | Описание | Дата |
|---|---|---|
| TASK-011 | sync_core 0.3.0 templates integration (PR #2) | 2026-05-02 |
| TASK-013 | junction detection robust YAML field analysis (PR #3) — закрыл BUG-009 в D6 | 2026-05-02 |
| TASK-014 | junction adapter file path generation для non-Map entities (PR #4) | 2026-05-02 |
| TASK-001 | базовая документация — done через TASK-011 docs work | 2026-05-02 |
| TASK-008 | relation_patcher идемпотентный (BUG-003 fix) — moved active→done | 2026-05-02 |
| TASK-009 | EntityYamlValidator (BUG-004 fix) — moved active→done | 2026-05-02 |

## Следующий фокус

1. **TASK-012** (Phase 1.5 final gate) — `codegen create-project --name todo` + 3-5 entities (FK + junction, ProjectMember pattern из t157) + flutter analyze 0 errors + cross-device runtime smoke (manual user testing). После acceptance ✅ → weight TASK-018 unblocked.
2. **TASK-002 — fix BUG-001 (Ref disposed)** — единственный открытый High баг, production-блокер weight
3. **TASK-010** — `codegen verify --runtime` (docker + server + integration test) — закрывает DoD-дыру для runtime-гарантий
4. **TASK-004** — unit-тесты для `code_formatter`, `server_yaml_parser` (BUG-010 fix входит сюда)
5. **TASK-015** (backlog) — robust junction FK extraction (deferred from TASK-014, нужен для weight CustomerUser-style)
6. **ADR-0001** — перенести `docs-code-generator/decisions/adr-0001-logger-in-templates.md`, обновить статус Proposed→Accepted
| TASK-012 | todo real app generation cross-device smoke (Phase 1.5 final gate) | 🟡 In Progress | 2026-05-02 |
