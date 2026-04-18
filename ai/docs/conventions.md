# Project Conventions

## General

- Explicit over implicit
- No hidden behavior
- No undocumented decisions

## Git Workflow

- **NEVER commit directly to main/master** — absolute rule
- All work is done in feature branches: `feature/TASK-XXX-name`
- Executors do not merge
- Only User performs merges

## Git Commits

Use Conventional Commits format:

```
<type>: <short description>

<body - what and why>
```

**Types:**
| Type | When |
|------|------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation |
| `refactor:` | Refactoring (no behavior change) |
| `test:` | Tests |
| `chore:` | Configs, deps, other |

**Example:**

```
feat: add user authentication

- Implemented JWT-based auth
- Added login/logout endpoints
- Created middleware for protected routes
```

**Rules:**

- First line ≤ 50 characters
- Body: explain WHAT and WHY, not just what files changed
- Reference task: "Part of TASK-XXX"

## Tasks

- Every change must belong to a task
- Tasks define scope and limits

## Approval Delegation

Different change types require different approval levels:

| Тип изменения              | Кто одобряет                  |
| -------------------------- | ----------------------------- |
| HOTFIX (<10 строк, 1 файл) | TeamLead                      |
| Задачи без архитектуры     | TeamLead → User информируется |
| Архитектурные изменения    | **User обязательно**          |

### Что считается "Архитектурными изменениями"

Если изменение соответствует **хотя бы одному** критерию — требуется одобрение User:

| Критерий                    | Примеры                                     |
| --------------------------- | ------------------------------------------- |
| Новые зависимости           | `npm install`, `pip install`, новые imports |
| Изменение структуры папок   | Перемещение/переименование директорий       |
| Публичные API               | Новые endpoints, изменение контрактов       |
| Схема данных                | БД миграции, изменение моделей              |
| Конфигурация инфраструктуры | Docker, CI/CD, деплой                       |
| Межсервисное взаимодействие | Новые интеграции, протоколы                 |

> [!warning] Сомневаешься? Спроси User.
> Лучше спросить и подождать, чем сломать архитектуру.

## Code Size & Complexity Policy

We optimize for readability and maintainability, not arbitrary file sizes.

Preferred limits (soft limits, exceptions allowed with justification):

- Function/method length: <= 60 lines
- Nesting depth: <= 4
- Cyclomatic complexity (if tooling exists): <= 15
- Single task change size: prefer <= 500 changed lines; split tasks if larger

File length is NOT a hard limit.
However, if a file exceeds ~600 lines, the author must either:

- Split by responsibility, or
- Provide a short justification in report.md

## Testing

- Executor writes tests together with code (part of the task)
- Tests must pass before "Ready for review"
- TeamLead verifies tests exist and pass during review
- Test files: `*.test.ts`, `*.spec.ts`, or `tests/` folder

## HOTFIX Mode (Fast Track)

For trivial changes (< 10 lines, no architecture impact):

- Executor can skip full task.md
- Create only: `tasks/active/HOTFIX-XXX/report.md`
- Must include: what changed, why, and tests (if applicable)
- TeamLead reviews as usual
- User still approves merge

**Examples of HOTFIX:**

- Typo fixes
- CSS tweaks
- Config value changes
- Small bug fixes with obvious solutions

**NOT HOTFIX (requires full task):**

- New features
- Refactoring
- Anything touching > 3 files

---

## CLI Automation (`scripts/new_task.py`)

The `new_task.py` script automates task creation.

### Usage

```bash
# Full task (creates folder structure)
python scripts/new_task.py "Implement user auth"

# Lite mode (quick entry in QUICK_TASKS.md)
python scripts/new_task.py "Fix typo in README" --lite

# Skip status.md update
python scripts/new_task.py "Internal refactor" --no-status
```

### Flags

| Flag          | Effect                                                     |
| ------------- | ---------------------------------------------------------- |
| (none)        | Creates `tasks/active/TASK-XXX-name/` folder from template |
| `--lite`      | Appends to `tasks/active/QUICK_TASKS.md` instead of folder |
| `--no-status` | Skips automatic `docs/status.md` update                    |

### When to use `--lite`

Use for tasks matching HOTFIX criteria:

- < 10 lines of code
- No architecture impact
- Single file change
- Obvious solution

### QUICK_TASKS.md Format

```markdown
- [ ] [HOTFIX-001] Fix typo in README — 2024-12-26
- [x] [HOTFIX-002] Update config value — 2024-12-25
```

---

## Protected Files

Файлы, которые AI-агенты НЕ ДОЛЖНЫ изменять без явного одобрения User:

### Всегда защищены

```
prompts/*              # Промпты агентов
docs/conventions.md    # Правила проекта (этот файл)
```

### Требуется одобрение

```
docs/architecture.md   # Архитектурные изменения
docs/INDEX.md          # Структура проекта
tasks/_template/*      # Шаблоны задач
```

Если нужно изменить защищённый файл — предложи изменение в report.md и дождись одобрения User.
