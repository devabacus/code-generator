# AI Team Framework — code-generator

Папка `ai/` — рабочее пространство для AI-агентов на этом проекте.

## 🚀 С чего начать

| Кто | Что читать |
|---|---|
| Любой агент | [docs/INDEX.md](docs/INDEX.md) — точка входа в документацию |
| TeamLead | [prompts/teamlead.prompt.md](prompts/teamlead.prompt.md) |
| Executor | [prompts/executor.prompt.md](prompts/executor.prompt.md) |

## 📁 Структура

```
ai/
├── prompts/          # Промпты агентов (TeamLead, Executor, finalize)
├── docs/             # Документация проекта
│   ├── INDEX.md      # Точка входа
│   ├── status.md     # Текущее состояние
│   ├── roadmap.md    # План развития
│   ├── architecture.md
│   ├── conventions.md
│   ├── dev_guide.md
│   ├── workflow.md
│   ├── troubleshooting.md
│   ├── agent_memory.md
│   └── decisions/
│       └── adr-0001-logger-in-templates.md
├── tasks/            # Активные и завершённые задачи
│   ├── _template/
│   ├── active/
│   ├── done/
│   ├── blocked/
│   └── backlog.md
├── bug-reports/      # Входящие баг-репорты (с других проектов или от User)
├── discussions/      # Мульти-агентные дискуссии (для архитектурных вопросов)
├── guides/           # Гайды (user_guide, worktree_guide, folder_structure)
├── scripts/          # CLI-утилиты (new_task.py)
└── version.md        # Версия AI Team Framework
```

## 📖 Ключевая документация

| Файл | Когда читать |
|---|---|
| [docs/INDEX.md](docs/INDEX.md) | Первое, что читает агент в новой сессии |
| [docs/workflow.md](docs/workflow.md) | Как устроен жизненный цикл задачи |
| [docs/conventions.md](docs/conventions.md) | Правила (git, scope, protected files) |
| [docs/agent_memory.md](docs/agent_memory.md) | Факты о проекте, gotchas, предпочтения User |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Решение типовых проблем |

## 🔗 Связь с проектом

Этот `ai/` настроен для проекта **code-generator** — VS Code расширение + CLI для генерации Serverpod/Flutter монорепо и микросервисов. Подробнее — в [docs/INDEX.md](docs/INDEX.md).

**Исторический архив:** [../docs-code-generator/](../docs-code-generator/) — документация до введения этого фреймворка (рефакторинг-логи, план, первоначальная архитектура).

## 🏁 Быстрые команды

```bash
# Создать задачу
python ai/scripts/new_task.py "Название задачи"

# Быстрая задача (HOTFIX)
python ai/scripts/new_task.py "Fix typo" --lite

# Собрать проект
npm run compile

# Запустить тесты
npm test

# CLI codegen
node out/adapters/cli/index.js --help
```

---

> **Repository is the source of truth. Chats are disposable.**
