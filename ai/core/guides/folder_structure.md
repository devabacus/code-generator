# Структура папок AI-агентов

Полная структура каталога для работы с ИИ-агентами.

---

## 📁 Дерево каталогов (v2)

Верхний уровень — только `README.md`, `.gitignore` и две границы: `core/` (upstream-owned,
перезаписывается `sync.py`) и `project/` (project-owned, `sync.py` не трогает). Контракт
границы — [../README.md](../README.md).

```
📁 ai/
├── 📄 README.md            — Главный README (входная точка)
├── 📄 .gitignore
│
├── 📁 core/                — UPSTREAM-OWNED (sync.py перезаписывает)
│   ├── 📄 README.md        — контракт границы core/project
│   ├── 📄 version.md       — версия шаблона + changelog
│   ├── 📁 scripts/
│   │   ├── 📄 new_task.py  — создание задачи (frontmatter v2)
│   │   ├── 📄 task.py      — git-workflow + lint/move/state
│   │   ├── 📄 sync.py      — распространение шаблона + контроль дрейфа
│   │   ├── 📄 profile.py   — валидатор зонных профилей
│   │   └── 📄 test_sync.py — smoke-тест sync
│   ├── 📁 prompts/         — промпты ролей (teamlead, executor, reviewer, …)
│   ├── 📁 discussions/     — discuss.py, _template*.md, docs/ (протокол)
│   ├── 📁 tasks/_template/ — шаблон задачи (task.md с frontmatter, report.md)
│   ├── 📁 docs/            — workflow.md, INDEX.md, task-schema.md, profiles.md
│   ├── 📁 guides/          — user_guide, folder_structure(этот), worktree_guide,
│   │                          migration-v1-to-v2
│   └── 📁 examples/        — profile.example.yaml + profiles/ (референс формата)
│
└── 📁 project/             — PROJECT-OWNED (sync.py НЕ трогает)
    ├── 📄 profile.yaml     — зонный профиль + capability policy
    ├── 📁 profiles/        — verification-профили (<имя>.yaml)
    ├── 📁 docs/
    │   ├── 📁 decisions/   — ADR проекта
    │   ├── 📄 architecture.md, status.md, roadmap.md, conventions.md
    │   ├── 📄 agent_memory.md, troubleshooting.md, dev_guide.md
    ├── 📁 tasks/
    │   ├── 📁 active/ blocked/ done/   — канбан (двигает только task.py move)
    │   └── 📄 backlog.md
    └── 📁 discussions/     — active/ archive/ prompts/ (контент)

(в проекте после sync init) 📄 ai/template.lock — JSON: версия шаблона + хэши core
```

---

## 📋 Назначение папок

| Папка                 | Владелец | Назначение                                       |
| --------------------- | -------- | ------------------------------------------------ |
| `core/scripts/`       | upstream | Python-скрипты (task, new_task, sync, profile)   |
| `core/prompts/`       | upstream | Системные промпты ролей                          |
| `core/discussions/`   | upstream | discuss.py, шаблоны, протокол                    |
| `core/docs/`          | upstream | workflow, INDEX, task-schema, profiles           |
| `core/guides/`        | upstream | Руководства (user_guide, миграция, worktree)     |
| `core/examples/`      | upstream | Референс-профили (документация формата)          |
| `project/docs/`       | project  | Документация проекта, включая ADR                |
| `project/tasks/`      | project  | Kanban: `active/` → `blocked/` → `done/`         |
| `project/discussions/`| project  | Контент дискуссий (active/archive/prompts)       |
| `project/profile.yaml`| project  | Зонный профиль + capability policy               |
| `project/profiles/`   | project  | Verification-профили                             |

---

## 📄 Ключевые файлы

| Файл                          | Когда читать                     |
| ----------------------------- | -------------------------------- |
| `core/guides/user_guide.md`   | Первый запуск, настройка проекта |
| `core/docs/INDEX.md`          | Точка входа в документацию       |
| `core/docs/task-schema.md`    | Формат задач v2 (frontmatter)    |
| `core/docs/profiles.md`       | Зонные профили и policy          |
| `project/docs/status.md`      | Текущее состояние проекта        |
| `core/docs/workflow.md`       | Понимание процесса работы        |
| `project/tasks/backlog.md`    | Список запланированных задач     |

---

## 🔗 Связанные документы

- [user_guide.md](user_guide.md) — Пошаговое руководство пользователя
- [worktree_guide.md](worktree_guide.md) — Настройка Git Worktree
- [../docs/workflow.md](../docs/workflow.md) — Детальное описание процесса (в core/docs/)
