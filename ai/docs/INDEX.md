# Индекс проекта (НАЧНИ ЗДЕСЬ)

## Что это за проект

(Краткое описание своими словами)

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

## Знания агентов

- Факты и gotchas: [agent_memory.md](agent_memory.md)

## Роли

| Роль               | Описание                           | Документация                                                   |
| ------------------ | ---------------------------------- | -------------------------------------------------------------- |
| **User**           | Финальные решения, одобрение merge | —                                                              |
| **TeamLead Agent** | Декомпозирует работу, ревьюит      | [../prompts/teamlead.prompt.md](../prompts/teamlead.prompt.md) |
| **Executor Agent** | Реализует задачи                   | [../prompts/executor.prompt.md](../prompts/executor.prompt.md) |

> **Стратегические решения** принимаются через мульти-агентные дискуссии и фиксируются в [decisions/](decisions/).

## Золотые правила

- Репозиторий > память чата
- Задачи — это контракты
- Никаких merge без одобрения User
