# Workflow: Как организована работа

Схема взаимодействия между участниками.

---

## 👥 Роли и ответственности

```
┌─────────────────────────────────────────────────────────┐
│                         USER                            │
│                   (Владелец проекта)                    │
│                                                         │
│  ✓ Финальные решения                                    │
│  ✓ Одобрение merge                                      │
│  ✓ Координация между агентами                          │
└────────────────────────┬────────────────────────────────┘
                         │
             ┌───────────┴───────────┐
             │                       │
             ▼                       ▼
    ┌─────────────┐         ┌─────────────┐
    │  TEAMLEAD   │         │  EXECUTOR   │
    │    Agent    │         │    Agent    │
    ├─────────────┤         ├─────────────┤
    │ Организует  │         │ Выполняет   │
    │ Читает      │         │ Кодит       │
    │ roadmap.md  │         │ Отчитывается│
    │ Ревьюит     │         │             │
    └─────────────┘         └─────────────┘
```

> **Стратегические решения** принимаются через мульти-агентные дискуссии и фиксируются в `project/docs/decisions/`.

> **Структура v2:** шаблон разделён на `ai/core/` (upstream-owned, обновляется `sync.py`)
> и `ai/project/` (project-owned). Задачи, дискуссии, документация проекта — в `project/`;
> скрипты, промпты, шаблоны — в `core/`. См. [core/README.md](../README.md).

---

## 🔄 Жизненный цикл задачи

```
                    BACKLOG
                       │
                       ▼
    ┌──────────────────────────────────┐
    │  new_task.py → project/tasks/    │
    │  active/TASK-XXX (frontmatter v2) │
    └──────────────────┬───────────────┘
                       │
                       ▼
    ┌──────────────────────────────────┐
    │         User одобряет            │
    │         задачу                   │
    └──────────────────┬───────────────┘
                       │
                       ▼
    ┌──────────────────────────────────┐
    │         Executor работает        │
    │         в feature branch         │
    └──────────────────┬───────────────┘
                       │
          ┌────────────┴────────────┐
          │                         │
          ▼                         ▼
    ┌───────────┐             ┌───────────┐
    │ BLOCKED   │             │ DONE      │
    │ (ждёт)    │             │ report.md │
    └─────┬─────┘             └─────┬─────┘
          │                         │
          └────────────┬────────────┘
                       ▼
    ┌──────────────────────────────────┐
    │ TeamLead ревьюит diff/report и   │
    │ показывает User                  │
    └──────────────────┬───────────────┘
                       │ User: COMMIT + PR OK
                       ▼
    ┌──────────────────────────────────┐
    │ Код commit в feature; затем      │
    │ task.py pr --done: move+commit,  │
    │ feature push и PR                │
    └──────────────────┬───────────────┘
                       │ CI + reviewer
                       ▼
    ┌──────────────────────────────────┐
    │ User: MERGE OK → task.py merge   │
    │ (squash PR); post-merge verify   │
    └──────────────────────────────────┘
```

> **Статусы двигает только скрипт** (`task.py move <id> <status>`). Руками папки между
> active/blocked/done не таскать. Текущий move делает `git mv`, затем правит frontmatter:
> `task.py lint` ловит расхождение, но crash-atomic recovery появится только в TASK-024.
> Подробно: [task-schema.md](task-schema.md) и ADR-0003 в project docs.
>
> **Порядок publication нормативен:** task переводится в `done` **в feature branch до PR**
> через `task.py pr --done`; после merge на `main` отдельного move/commit нет. Команда также
> push'ит feature и создаёт PR, поэтому её запускает владелец либо агент только после явного
> разрешения владельца на commit + feature push + PR. `task.py merge` делает squash merge
> только после отдельного `MERGE OK`; ни одна команда не разрешает прямую правку/push `main`.

### CI и защита merge (B7)

`task.py merge` ждёт регистрации checks у PR и не мержит на красном CI. Но **пустой список
checks сам по себе НЕ разрешает merge** — GitHub Actions регистрирует checks с задержкой, и
«ноль checks» может означать «workflow ещё не поднялся», а не «CI не предусмотрен». Поэтому:

- Окно ожидания регистрации checks — настраиваемое: флаг `--ci-wait <сек>` или env
  `TASK_CI_WAIT_SECONDS` (default 30с, экспоненциальная пауза).
- Если по истечении окна checks так и нет — merge **блокируется**. Смержить без CI можно
  только осознанно: флаг `--no-ci` (checks для этого PR действительно не предусмотрены) или
  `--force`. Без флага — отказ (fail-closed).
- Не удалось узнать статус CI (`gh` упал / сеть) — тоже BLOCK, не «checks нет».

> **Рекомендация (обязательна для командной работы):** включи на GitHub полный server-side gate
> из milestone M-AUTOMERGE: require PR + required status checks, запрет bypass (включая admin,
> где платформа позволяет), direct push, force-push и удаления защищённой ветки. Только весь этот
> набор гарантирует «нет CI = нет merge» независимо от клиентского `--no-ci`/`--force`.
> Одни required checks без PR/no-bypass/push restrictions такой гарантии не дают. Настройка:
> Repo → Settings → Rules/Branches; точный обязательный набор зафиксирован в project backlog.

### ⚡ HOTFIX (Fast Track)

Для мелких изменений (< 10 строк):

```
Executor → HOTFIX-XXX/report.md → TeamLead ревьюит → User merges
```

Без полного task.md. См. `docs/conventions.md` для деталей.

---

## 🚨 Цепочка эскалации

При возникновении блокировки (`BLOCKED` статус) используй эту цепочку:

```
┌───────────┐     ┌───────────┐     ┌───────────┐     ┌───────────┐
│ EXECUTOR  │────►│ TEAMLEAD  │────►│ ДИСКУССИЯ │────►│   USER    │
│           │     │           │     │           │     │           │
│ Блокировка│     │Организа-  │     │Архитек-   │     │Бизнес/    │
│ кодом     │     │ционные    │     │турные     │     │финальные  │
│           │     │решения    │     │решения    │     │решения    │
└───────────┘     └───────────┘     └───────────┘     └───────────┘
```

### Когда эскалировать

| Проблема                     | Кому эскалировать           |
| ---------------------------- | --------------------------- |
| Непонятна задача             | TeamLead                    |
| Нужна библиотека/зависимость | TeamLead → Дискуссия → User |
| Архитектурный конфликт       | Дискуссия (мульти-агенты)   |
| Требуется бизнес-решение     | User                        |
| Задача невыполнима           | TeamLead → User             |

### Как эскалировать

1. Опиши проблему в `report.md` или в задаче
2. Поставь статус `BLOCKED`
3. Укажи причину и варианты решения (если есть)
4. Жди ответа от следующего уровня

---

## 💬 Потоки коммуникации

```
┌─────────┐
│  USER   │◄───────────────────────────────────┐
└────┬────┘                                    │
     │                                         │
     │            ┌─────────┐                  │
     ├─── Чат 1 ─►│TEAMLEAD │                  │
     │            └─────────┘                  │
     │                                         │
     │            ┌─────────┐                  │
     └─── Чат 2 ─►│EXECUTOR │                  │
                  └─────────┘                  │
                                               │
         │                        ┌────────────┴────┐
         ▼                        │   ДИСКУССИЯ     │
    ┌─────────┐                   │ (мульти-агенты) │
    │  REPO   │  ◄── Единственный │ → ADR           │
    │ (files) │      способ       └─────────────────┘
    └─────────┘      связи
```

**Важно:** Агенты не общаются напрямую. User — связующее звено.

---

## 🧠 Политика моделей (capability tiers)

Ядро описывает **абстрактные уровни** (tiers); привязка уровней к конкретным моделям —
**на проектном уровне**: `ai/project/docs/model-policy.md` (референс формы, без имён —
`core/examples/model-policy.example.md`). Так смена модельного парка не требует правки core.

> **В `core/` нет ни привязки tier→модель, ни конкретных model ID** — это инвариант, а не
> случайность. Единственное место, где они живут, — `ai/project/docs/model-policy.md`.
> Появилась в core таблица «tier = такая-то модель» или строка вида `claude-…-2026…` —
> это дефект, а не документация.
>
> Что в `core/` встречается и дефектом НЕ является: имена вендоров как **псевдонимы
> участников дискуссии** (`core/discussions/scripts/discuss.py`, `_template_prompt.md`,
> `discussions/docs/*`) — это метки колонок в протоколе обсуждения, а не указание, какой
> моделью что запускать.

| Tier | Назначение | Кто на нём работает |
| --- | --- | --- |
| `frontier` | Архитектура, синтез, сложные решения | ТОЛЬКО главная интерактивная сессия владельца, по его явному выбору. Субагентам запрещён |
| `standard` | Реализация задач, ревью | Executor- и Reviewer-субагенты (default) |
| `mechanical` | Механика: поиск, массовые правки, первичное чтение, скачивание | Субагенты на простых шагах |
| `independent_reviewer` | Кросс-модельное adversarial-ревью | Модель ДРУГОГО вендора (протокол — backlog TASK-011) |

**Жёсткие правила:**

- В интерактиве субагенту назначается named profile/модель **явно**; до TASK-009 это advisory convention.
  В `mode:auto` subagents выключены, пока adapter-owned spawn не принудит named child profile, role и provenance.
- Ночной оркестратор — **детерминированный скрипт, не модель**; tier выбирается для
  каждой запускаемой им сессии-исполнителя.
- Исполнение обычных (не-архитектурных) задач — `standard`; `frontier` в исполнении задач
  не участвует.

**Задел под ночной драйвер (TASK-009):** `execution_profile` — имя exact profile из machine policy
TASK-023, не tier и не prose-модель. Driver пишет requested profile/adapter/vendor/model и раздельные
attested actual fields в ignored `project/.runtime/driver/tasks/<id>/runs.jsonl`; requested никогда не копируется в actual.
До TASK-009 runtime-записи/enforcement нет.

---

## 🖥️ Git Worktree для мульти-мониторов

Для работы с несколькими мониторами используй git worktree:

```
project/          → dev (TeamLead)
project-executor/ → feature/* (Executor)
```

Подробнее: [../guides/worktree_guide.md](../guides/worktree_guide.md)

---

## 📁 Структура репозитория (v2)

```
ai/
├── core/                        # upstream-owned (sync.py перезаписывает)
│   ├── README.md                # контракт границы core/project
│   ├── scripts/                 # task.py, new_task.py, sync.py, profile.py
│   ├── prompts/                 # промпты ролей
│   ├── discussions/             # discuss.py, _template*, docs/ (протокол)
│   ├── tasks/_template/         # шаблон задачи (frontmatter v2)
│   ├── docs/                    # workflow.md, INDEX.md, task-schema.md, profiles.md
│   ├── guides/                  # user_guide, folder_structure, worktree_guide, migration-v1-to-v2
│   ├── examples/                # profile.example.yaml + profiles/ (референс)
│   └── version.md
│
└── project/                     # project-owned (sync.py НЕ трогает)
    ├── profile.yaml             # зонный профиль + capability policy
    ├── profiles/                # verification-профили
    ├── docs/                    # architecture, status, roadmap, conventions,
    │   │                        # agent_memory, troubleshooting, dev_guide, decisions/
    ├── tasks/                   # active/ blocked/ done/ + backlog.md
    └── discussions/             # active/ archive/ prompts/
```

Машинный lock `ai/template.lock` (в проекте) фиксирует версию шаблона и хэши core.

---

## ⚡ Быстрая справка

| Хочу...                     | Делаю...                                                    |
| --------------------------- | ---------------------------------------------------------- |
| Начать проект               | `core/guides/user_guide.md`                                |
| Установить/обновить шаблон  | `core/scripts/sync.py init\|--check\|--apply`               |
| Создать задачу              | `core/scripts/new_task.py "Название"`                       |
| Проверить/двигать задачи    | `core/scripts/task.py lint\|move\|state`                    |
| Проверить профили           | `core/scripts/profile.py lint`                             |
| Консультация по архитектуре | Дискуссия (мульти-агенты) → ADR                            |
| Обновить архитектуру        | Дискуссия → ADR → User обновляет `project/docs/architecture.md` |
| Изменить roadmap            | TeamLead → `project/docs/roadmap.md`                       |
| Решить проблему             | `project/docs/troubleshooting.md`                          |
| Настроить worktree          | `core/guides/worktree_guide.md`                            |
| Мигрировать v1 → v2         | `core/guides/migration-v1-to-v2.md`                        |
