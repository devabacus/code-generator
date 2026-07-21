# ai/core/ — upstream-owned ядро шаблона

**Этот каталог принадлежит шаблон-репо AI Team Framework. В проектах он НЕ редактируется никогда.**

При `sync.py --apply` содержимое `core/` перезаписывается целиком из шаблон-репо.
Любая локальная правка файла внутри `core/` **блокирует sync** — скрипт покажет
изменённый файл и потребует перенести фикс в шаблон-репо.

## Правило для всех агентов

> Фикс core-файла (скрипт, промпт, протокол, шаблон задачи) делается **сначала в
> шаблон-репо**, затем распространяется в проекты через `sync.py --apply`.
> НЕ наоборот. Правка core прямо в проекте — нарушение границы, ловится sync'ом.

Обоснование — ADR-0002 п.2 (граница core/project, версионный lock, контроль дрейфа).

## Что лежит в core/

| Путь | Назначение |
| --- | --- |
| `core/scripts/` | `task.py`, `new_task.py`, `sync.py`, `profile.py` — рабочие скрипты |
| `core/prompts/` | Промпты ролей (teamlead, executor, reviewer, adversarial-reviewer, finalize) |
| `core/discussions/` | `scripts/discuss.py`, `_template*.md`, `docs/` (протокол мульти-агентных дискуссий) |
| `core/tasks/_template/` | Шаблон задачи (`task.md` с frontmatter, `report.md`) |
| `core/docs/` | `workflow.md`, `INDEX.md` (каркас), `task-schema.md`, `profiles.md` |
| `core/guides/` | `user_guide.md`, `folder_structure.md`, `worktree_guide.md` |
| `core/version.md` | Версия шаблона + changelog |

## Что лежит в project/ (сюда пишет проект, sync НЕ трогает)

`project/docs/` (architecture, status, roadmap, agent_memory, troubleshooting,
conventions, decisions/ADR проекта), `project/tasks/` (active|blocked|done + backlog),
`project/discussions/` (active|archive|prompts контент), `project/profile.yaml`,
`project/profiles/*.yaml`.

## Точки расширения

Core-скрипты читают проектную конфигурацию из `project/` (профили, зоны). Расширять
поведение нужно через эти конфиги, а НЕ через правку файлов в `core/`.
