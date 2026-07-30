# Точка входа в документацию (НАЧНИ ЗДЕСЬ)

Карта: что читать и в каком порядке. Файл принадлежит upstream-owned `core/` и
перезаписывается `sync.py --apply` целиком — **описание конкретного проекта сюда не
вписывают**, оно живёт в `project/docs/`.

**Порядок чтения на старте сессии:** [workflow.md](workflow.md) → `project/docs/status.md`
(состояние на сегодня) → `project/docs/agent_memory.md` (факты и gotchas) → промпт своей роли
→ `task.md` своей задачи.

## Процесс — одинаково во всех проектах (core)

- ⭐ [workflow.md](workflow.md) — роли, жизненный цикл задачи, capability tiers моделей, CI-гейты
- [task-schema.md](task-schema.md) — frontmatter задачи: какие поля читаются, а какие зарезервированы
- [profiles.md](profiles.md) — зоны, capability policy, verification-профили
- [../README.md](../README.md) — граница `core/` ↔ `project/`: что править нельзя и почему
- [../guides/user_guide.md](../guides/user_guide.md) — установка и первые шаги (рядом: `folder_structure.md`, `worktree_guide.md`, `migration-v1-to-v2.md`)
- [../prompts/](../prompts/) — промпты ролей: teamlead, executor, reviewer, adversarial-reviewer, finalize

## Этот конкретный проект (project — заполняет проект)

- [../../project/docs/](../../project/docs/) — `status.md`, `agent_memory.md`, `architecture.md`,
  `conventions.md`, `dev_guide.md`, `roadmap.md`, `troubleshooting.md`, `model-policy.md`
  (единственное место, где живут конкретные model ID), `decisions/` (ADR)
- [../../project/tasks/](../../project/tasks/) — `active/`, `blocked/`, `done/`, `backlog.md`
- `project/profile.yaml` и `project/profiles/` — зоны и verification-профили проекта

> `sync.py init` создаёт в `project/` только пустые каталоги. Пока файла нет — его нет:
> не додумывай содержимое, заведи файл или спроси владельца.

## Золотые правила

- Репозиторий > память чата
- Задачи — это контракты
- Никаких merge без одобрения владельца
