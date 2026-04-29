# Индекс проекта code-generator (НАЧНИ ЗДЕСЬ)

**Обновлено:** 2026-04-26

## Что это за проект

**VS Code расширение + CLI `codegen`** для генерации Serverpod/Flutter монорепо и микросервисов (Python/Node/Go).
Основное применение — генерация feature-слоёв по Clean Architecture из Serverpod YAML-моделей (`.spy.yaml`).

## Целевая аудитория

- **Разработчики Flutter/Serverpod:** используют расширение через VS Code UI
- **AI-агенты и CI/CD пайплайны:** используют CLI `codegen` (JSON-режим) из терминала

## Текущее состояние (важное)

- ✅ CLI реализован и работает — **11 команд** включая `verify` (DoD-гейт), `out/adapters/cli/index.js` (см. [status.md](status.md))
- ✅ VS Code-адаптер декуплен от core, все 11 команд зарегистрированы в `extension.ts`
- ✅ **BUG-002 / BUG-003 / BUG-004 / BUG-005 / BUG-006 закрыты** (2026-04-25/26):
  - snake_case filenames для multi-word entity (BUG-002)
  - relation_patcher идемпотентный (BUG-003)
  - pre-flight YAML-валидация 6-field pattern (BUG-004)
  - AppDatabaseGenerator scan-based (BUG-005)
  - migration-ветки append вместо prepend (BUG-006, найден внешними агентами TASK-015 в weight)
- ✅ **`codegen verify`** — обязательный DoD-гейт перед сдачей user'у. Возвращает structured JSON с counts.
- ✅ **`autoGenerateTasksFeature` + `patchPubspecPackagePaths`** в `create-project` — свежий проект сразу компилируется (e2e на t143: errors=0, server runtime HTTP 200)
- ✅ Тесты — **62 passing**
- ⚠️ Открытые баги: [BUG-001](../bug-reports/001-state-provider-ref-disposed.md) (High), BUG-003 part 2 (`:base` секции перетирают custom code на regen — backlog)
- 🟡 Активная задача: [TASK-010](../tasks/active/TASK-010-codegen-verify-runtime/task.md) — `codegen verify --runtime` (docker + server + integration test)
- ⚠️ Нет тестов для `code_formatter`, `server_yaml_parser`, workflow-модулей

## Как организована работа

- ⭐ **Основной процесс:** [workflow.md](workflow.md)
- Стратегические решения: [decisions/](decisions/)
- Архитектура: [architecture.md](architecture.md)
- Дорожная карта: [roadmap.md](roadmap.md)
- Правила: [conventions.md](conventions.md)
- Настройка разработки: [dev_guide.md](dev_guide.md)
- Текущее состояние: [status.md](status.md)
- Решение проблем: [troubleshooting.md](troubleshooting.md)
- Задачи: [../tasks/](../tasks/)
- Баг-репорты: [../bug-reports/](../bug-reports/)

## Знания агентов

- Факты и gotchas: [agent_memory.md](agent_memory.md) — **обязателен к чтению каждой сессии**

## Исторические документы

Архив рефакторинга и старой документации: [../../docs-code-generator/](../../docs-code-generator/)
- `progress.md` — лог рефакторинга декабрь 2025 — апрель 2026
- `project-info-before-refactoring.md` — описание архитектуры до decoupling
- `implementation-plan.md` — план рефакторинга
- `bugs-and-tasks.md` — список исправленных багов и старых TASK-1..3 (все закрыты или перенесены в `ai/`)
- `troubleshooting.md` — развёрнутая версия троблшутинга с примерами

## Роли

| Роль | Описание | Документация |
|---|---|---|
| **User** | Финальные решения, одобрение merge | — |
| **TeamLead Agent** | Декомпозирует работу, ревьюит | [../prompts/teamlead.prompt.md](../prompts/teamlead.prompt.md) |
| **Executor Agent** | Реализует задачи | [../prompts/executor.prompt.md](../prompts/executor.prompt.md) |

> **Стратегические решения** принимаются через мульти-агентные дискуссии и фиксируются в [decisions/](decisions/).

## Золотые правила

- Репозиторий > память чата
- Задачи — это контракты
- Никаких merge без одобрения User
- `src/core/*` НЕ импортирует `vscode` (только lazy `require` с fallback)
- Windows: CLI использует PowerShell для exec (см. [agent_memory.md](agent_memory.md))
- Коммиты на русском, Conventional Commits, без `Co-Authored-By`

## Definition of Done (короткая версия — полная в [CLAUDE.md](../../CLAUDE.md))

Любое изменение в `src/features/generation/`, `src/adapters/cli/commands/{create_project,generate_entity}.ts`, или в `G:/Templates/flutter/t115/` НЕ готово к показу user'у пока:

1. `codegen verify --name <test_project>` вернул `success: true` (или прогон вручную: serverpod generate + build_runner + flutter analyze).
2. **Цитированы реальные числа** в ответе user'у: `errors: N, warnings: M`. Запрещены формулировки "вроде работает", "должно скомпилироваться".
3. **Не патчены руками** target-проекты чтобы скрыть баг генератора. Если что-то требует ручной правки — это **сигнал бага**, заводить bug-report.

Политика 2026-04-26: каждое исправление генератора → новый тестовый проект `t<N+1>` пока не сработает с первого раза. Реальная история ветки `feature--fix-codegen-regen-bugs`: t141 (327 errors) → fix BUG-005 → t142 (48 errors) → fix widgets → t143 (PASS errors=0).
