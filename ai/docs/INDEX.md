# Индекс проекта code-generator (НАЧНИ ЗДЕСЬ)

**Обновлено:** 2026-04-18

## Что это за проект

**VS Code расширение + CLI `codegen`** для генерации Serverpod/Flutter монорепо и микросервисов (Python/Node/Go).
Основное применение — генерация feature-слоёв по Clean Architecture из Serverpod YAML-моделей (`.spy.yaml`).

## Целевая аудитория

- **Разработчики Flutter/Serverpod:** используют расширение через VS Code UI
- **AI-агенты и CI/CD пайплайны:** используют CLI `codegen` (JSON-режим) из терминала

## Текущее состояние (важное)

- ✅ CLI реализован и работает — 10 команд, `out/adapters/cli/index.js` (см. [status.md](status.md))
- ✅ VS Code-адаптер декуплен от core, все 11 команд зарегистрированы в `extension.ts`
- ✅ Частичные тесты: `openapi_parser`, `python_endpoint_generator`, `template_service`
- ⚠️ Открытые баги: [BUG-001](../bug-reports/001-state-provider-ref-disposed.md) (High), [BUG-002](../bug-reports/002-file-names-camelcase.md) (Medium)
- ⚠️ Нет тестов для entity-генератора (`code_formatter`, `server_yaml_parser`, `relation_generation`)

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
