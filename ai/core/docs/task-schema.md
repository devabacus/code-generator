# Схема задач v2 (frontmatter-контракт + runtime-state)

Реализация ADR-0002 п.1. Единица истины — папка `TASK-XXX/` в `ai/project/tasks/{active|blocked|done}/`.
Внутри разделены **контракт** (владелец — человек) и **runtime-состояние** (владелец — только драйвер/`task.py`).

## 1. Контракт: YAML-frontmatter в `task.md`

Каждый `task.md` начинается с YAML-frontmatter между `---`:

```yaml
---
id: TASK-XXX
schema_version: 2
status: active            # active | blocked | done
mode: interactive         # interactive | auto
zone: ""
verification_profile: ""  # имя профиля из ai/project/profiles/ (см. profiles.md)
checks: []                # имена проверок из этого профиля
max_attempts: 3
depends_on: []            # список id задач-предпосылок
---
```

Ниже frontmatter — человеческое тело контракта (Цель / Не-цели / Scope / Критерии приёмки /
План тестирования). Тело редактирует человек; frontmatter — тоже человек, **кроме поля
`status`**, которое двигает только `task.py move` / драйвер.

### Поля

| Поле | Тип | Назначение |
| --- | --- | --- |
| `id` | str | `TASK-NNN`, уникален по всем задачам. Должен совпадать с префиксом папки. |
| `schema_version` | int | `2` для v2. v1-задачи без frontmatter допустимы (warning в lint). |
| `status` | enum | `active`/`blocked`/`done`. Каноничный источник статуса. Папка канбана — производна. |
| `mode` | enum | `interactive` (человек в цикле) / `auto` (ночной драйвер). |
| `zone` | str | Имя зоны из `ai/project/profile.yaml`. |
| `verification_profile` | str | Имя verification-профиля (`ai/project/profiles/<имя>.yaml`). Обязателен для `mode:auto`. |
| `checks` | list[str] | Имена проверок внутри профиля. Обязателен непустым для `mode:auto`. |
| `max_attempts` | int | Лимит попыток драйвера до перевода в `blocked`. |
| `depends_on` | list[str] | id задач, которые должны быть `done` до старта. |

### Правило владения статусом

- Каноничный статус — поле `status` во frontmatter.
- Папка `active|blocked|done` — **производное представление**.
- Перемещает папку **только скрипт** (`task.py move`) атомарно вместе со сменой `status`.
- Человек руками папки не таскает; ручное расхождение папка↔status ловит `task.py lint`.

## 2. Runtime-state: `state.json` + `runs.jsonl`

Файлы в папке задачи, **владелец — только драйвер/`task.py`**. Executor их НЕ пишет.
Сейчас `task.py` их только читает (`task.py state`); писать будет ночной драйвер.

> ⚠️ **Границы enforcement.** Всё в этом разделе (`contract_sha`/`profile_sha`, пиновка,
> аннуляция прогона) — **контракт будущего драйвера (TASK-009), сейчас никем не пишется и не
> сверяется**. Схема задокументирована заранее; runtime-гарантии появятся с драйвером. Что
> проверяется кодом уже сейчас — статический `task.py lint` (см. таблицу команд) и
> `profile.py lint`. Полная граница «статика vs runtime» — в `profiles.md` § «Границы
> enforcement». До TASK-009 policy НЕ является security boundary для недоверенного исполнителя.

### `state.json` — текущее состояние (перезаписывается)

```json
{
  "id": "TASK-042",
  "attempt": 2,
  "max_attempts": 3,
  "contract_sha": "<sha256 task.md на момент прогона>",
  "profile_sha": "<sha256 verification-профиля на момент прогона>",
  "last_exit_code": 1,
  "last_run_at": "2026-07-20T23:14:05Z",
  "blocked_reason": null,
  "status": "active"
}
```

- `contract_sha` / `profile_sha` — пиновка SHA контракта и профиля на прогон (ADR-0002 п.3).
  Если между попытками task.md/профиль изменились — прогон аннулируется (защита от
  самовольного ослабления verify или подмены golden исполнителем).
- `blocked_reason` — заполняется при переводе в `blocked` после исчерпания `max_attempts`.

### `runs.jsonl` — append-only журнал прогонов

Одна строка JSON на попытку, дописывается (никогда не переписывается):

```jsonl
{"attempt":1,"started_at":"2026-07-20T22:01:00Z","checks":{"compile":"pass","unit":"fail"},"exit_code":1,"result":"retry"}
{"attempt":2,"started_at":"2026-07-20T22:40:00Z","checks":{"compile":"pass","unit":"pass"},"exit_code":0,"result":"green"}
```

Журнал нужен утреннему разбору: по нему видно, что падало и почему BLOCKED, без раскопок.

## 3. Команды `task.py`

| Команда | Что делает |
| --- | --- |
| `task.py lint` | Валидация всех задач. Проверяет: frontmatter парсится; `status` ↔ каталог совпадают; `id` уникальны и совпадают с папкой; `mode:auto` ⇒ непустые `verification_profile`+`checks`; профиль резолвится; **`zone` резолвится против `profile.yaml`** (несуществующая зона — error для `mode:auto`, warning для interactive); **каждое имя `checks` существует в указанном verification-профиле** (иначе error); **`mode:auto` в зоне `execution:never` — error**; `max_attempts` int>0; `depends_on` — существующие id **без циклов** (DFS); неизвестные поля frontmatter → warning. v1-задачи без frontmatter → warning `schema v1`, не error. Ненулевой exit при ошибках (годится для pre-commit / старта ночной смены). |
| `task.py move <id> <status>` | Атомарно меняет `status` во frontmatter и `git mv` папки в соответствующий канбан-каталог. Если `status==каталог` — только выравнивает frontmatter. |
| `task.py state <id>` | Печатает `state.json` и `runs.jsonl` задачи (или сообщает об их отсутствии). Только чтение. |

Команды `start`/`pr`/`merge`/`finish` (git-workflow) не изменены.

## 4. Совместимость v1

Задачи без frontmatter считаются `schema v1`. `lint` выдаёт по ним warning, не error;
`move` для них не применим (нет поля `status`). Миграция v1→v2 — см. `migration-v1-to-v2.md`.
