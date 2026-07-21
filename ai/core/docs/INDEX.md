# Индекс проекта (НАЧНИ ЗДЕСЬ)

## Что это за проект

(Краткое описание своими словами)

## Как организована работа

- ⭐ **Основной процесс:** [workflow.md](workflow.md) *(core)*
- Стратегические решения: [../../project/docs/decisions/](../../project/docs/decisions/)
- Архитектура: [../../project/docs/architecture.md](../../project/docs/architecture.md)
- Дорожная карта: [../../project/docs/roadmap.md](../../project/docs/roadmap.md)
- Правила: [../../project/docs/conventions.md](../../project/docs/conventions.md)
- Настройка разработки: [../../project/docs/dev_guide.md](../../project/docs/dev_guide.md)
- Текущее состояние: [../../project/docs/status.md](../../project/docs/status.md)
- Решение проблем: [../../project/docs/troubleshooting.md](../../project/docs/troubleshooting.md)
- Задачи: [../../project/tasks/](../../project/tasks/)

## Знания агентов

- Факты и gotchas: [../../project/docs/agent_memory.md](../../project/docs/agent_memory.md)

## Роли

| Роль               | Описание                           | Документация                                                   |
| ------------------ | ---------------------------------- | -------------------------------------------------------------- |
| **User**           | Финальные решения, одобрение merge | —                                                              |
| **TeamLead Agent** | Декомпозирует работу, ревьюит      | [../prompts/teamlead.prompt.md](../prompts/teamlead.prompt.md) |
| **Executor Agent** | Реализует задачи                   | [../prompts/executor.prompt.md](../prompts/executor.prompt.md) |

> **Стратегические решения** принимаются через мульти-агентные дискуссии и фиксируются в [../../project/docs/decisions/](../../project/docs/decisions/).

## Золотые правила

- Репозиторий > память чата
- Задачи — это контракты
- Никаких merge без одобрения User
