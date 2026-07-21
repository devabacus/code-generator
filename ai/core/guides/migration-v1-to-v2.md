# Миграция проекта v1 → v2

Пошаговый гайд перевода существующего проекта (структура `ai/` v1) на v2: граница
core/project, frontmatter-задачи, sync, зонные профили. Гайд самодостаточен — ADR читать
не обязательно. Пример — проект weight (Flutter+Serverpod).

> **Работать на task-ветке.** Не мигрировать напрямую в master/main. Сначала
> `git switch -c chore/migrate-ai-v2`, потом шаги ниже.

---

## Что меняется

| v1 | v2 |
| --- | --- |
| `ai/docs`, `ai/tasks`, `ai/prompts`, `ai/scripts`, `ai/discussions`, `ai/guides` вперемешку | `ai/core/` (upstream) + `ai/project/` (project) |
| `task.md` — только человеческое тело | `task.md` = YAML-frontmatter + тело |
| статус = папка active/blocked/done | статус = поле `status` во frontmatter; папку двигает `task.py move` |
| дистрибуция копированием | `sync.py` + `ai/template.lock` |
| — | `ai/project/profile.yaml` (зоны + capability policy) |

---

## Шаг 1. Установить core/ через sync init

Из шаблон-репо поставь свежий `core/` и скелет `project/` в отдельную временную папку,
чтобы не затереть текущий проектный контент:

```bash
python <шаблон-репо>/ai/core/scripts/sync.py init /tmp/ai-v2 --template <шаблон-репо>/ai
```

Это создаст `/tmp/ai-v2/core/`, `/tmp/ai-v2/project/` (пустой скелет) и `/tmp/ai-v2/template.lock`.

## Шаг 2. Перенести core/ в проект

Скопируй `/tmp/ai-v2/core/` и `/tmp/ai-v2/template.lock` в `ai/` проекта. `core/` —
upstream-owned, его не редактируем.

```bash
cp -r /tmp/ai-v2/core <проект>/ai/core
cp /tmp/ai-v2/template.lock <проект>/ai/template.lock
```

## Шаг 3. Разнести существующие файлы по project/

Перемести (через `git mv`, чтобы сохранить историю) v1-файлы в `ai/project/`:

| Было (v1) | Стало (v2) |
| --- | --- |
| `ai/docs/architecture.md`, `status.md`, `roadmap.md`, `conventions.md`, `agent_memory.md`, `troubleshooting.md`, `dev_guide.md` | `ai/project/docs/` |
| `ai/docs/decisions/*` (ADR проекта) | `ai/project/docs/decisions/` |
| `ai/tasks/active|blocked|done/*`, `ai/tasks/backlog.md` | `ai/project/tasks/` |
| `ai/discussions/active|archive|prompts/*` | `ai/project/discussions/` |

**НЕ переноси** в project то, что теперь в core: `workflow.md`, `INDEX.md`, `_template/`,
промпты ролей, скрипты, шаблоны дискуссий — они пришли из шаблона свежими.

Удали старые v1-каталоги (`ai/docs` в корне, `ai/scripts`, `ai/prompts`, `ai/guides`,
`ai/tasks` в корне) после переноса — их роль занята `core/` и `project/`.

## Шаг 4. Конвертировать активные задачи в frontmatter

`task.py` **не** делает автоконверсию (команды `migrate-v1` нет). Для каждой активной задачи
добавь YAML-frontmatter в начало `task.md` (шаблон — `core/tasks/_template/task.md`):

```yaml
---
id: TASK-042
schema_version: 2
status: active            # совпадает с каталогом, где лежит папка
mode: interactive
zone: ""
verification_profile: ""
checks: []
max_attempts: 3
depends_on: []
---
```

Тело задачи (Цель/Не-цели/Scope/…) не трогай. Правило: `status` во frontmatter обязан
совпадать с каталогом (`active`/`blocked`/`done`). v1-задачи без frontmatter продолжат
работать — `task.py lint` даст по ним warning `schema v1`, не error; конвертируй по мере
касания.

Проверь:

```bash
python ai/core/scripts/task.py lint    # v1 → warnings, конвертированные → без ошибок
```

## Шаг 5. Завести profile.yaml

Создай `ai/project/profile.yaml` с зонами проекта и capability policy. Референс всех полей и
4 архетипов (классы I–IV) — `ai/core/examples/profile.example.yaml`; описание —
`ai/core/docs/profiles.md`. Минимум для weight (пример):

```yaml
project: weight-system
zones:
  - name: flutter-core
    class: I
    execution: apply
    runner: cloud
    network: none
    side_effects: none
    verification_profile: flutter-core
  - name: ble
    class: II
    execution: apply
    runner: office
    network: none
    side_effects: read_only
    hardware: [ble-nrf52832]
    frozen_contracts: [nordic-uart-protocol]
    verification_profile: ble-hardware
  - name: prod-k8s
    class: IV
    execution: never
    runner: cloud
    network: none
    side_effects: none
```

Заведи упомянутые verification-профили в `ai/project/profiles/<имя>.yaml` (пример формата —
`ai/core/examples/profiles/`). Проверь:

```bash
python ai/core/scripts/profile.py lint
```

## Шаг 6. Обновить README и ссылки проекта

- README проекта: входная точка `→ ai/core/docs/INDEX.md`.
- Проверь, что внутренние ссылки в проектных доках указывают на `project/docs/...` и
  `core/...`, а не на старые пути.

## Шаг 7. Первый sync --check

Убедись, что core проекта совпадает с шаблоном и нет случайных локальных правок core:

```bash
python ai/core/scripts/sync.py --check ai --template <шаблон-репо>/ai
```

Ожидаемо: «синхронизировано» (**exit 0**). Коды выхода `--check`: `0` — чисто; `2` — доступно
обновление шаблона; `3` — нарушен инвариант (локальная правка/добавление/удаление core,
несовпадение/повреждение `schema_version`, битый lock). Если показывает «ЛОКАЛЬНАЯ ПРАВКА
CORE» / «ЛОКАЛЬНО ДОБАВЛЕННЫЙ» / «УДАЛЁННЫЙ» (exit 3) — значит core в проекте кто-то поправил;
перенеси фикс в шаблон-репо и повтори.

> `ai/template.lock` — машинный **JSON** (`template_version`, `source_revision`,
> `source_dirty`, `schema_version`, `core_hashes`). Если у тебя lock со старого YAML-формата,
> первый `sync.py --apply` мигрирует его в JSON автоматически (с сообщением).

---

> ⚠️ **Закоммить задачи ДО первого `task.py move`.** `move` перемещает папку задачи через
> `git mv` — если задача ещё не закоммичена (untracked), git-история перемещения не
> сохранится и `git mv` может отработать как обычное перемещение файлов. Правило: после
> конверсии задач в frontmatter сначала commit, потом пользоваться `move`.

## Чеклист приёмки миграции

- [ ] `ai/core/` и `ai/project/` на месте; на верхнем уровне `ai/` больше нет v1-каталогов.
- [ ] `ai/template.lock` присутствует.
- [ ] `python ai/core/scripts/task.py lint` — без ошибок (допустимы v1-warnings).
- [ ] `python ai/core/scripts/profile.py lint` — без ошибок.
- [ ] `python ai/core/scripts/sync.py --check ai --template <шаблон>/ai` — «синхронизировано».
- [ ] README проекта ведёт на `ai/core/docs/INDEX.md`.

---

## Требования окружения

- Python 3.11+ с **PyYAML** (`pip install -r ai/core/scripts/requirements.txt`) — нужен для
  `profile.py` и полноценного frontmatter-парсинга в `task.py`. `sync.py` работает на stdlib
  (lock — JSON).
- На Windows-консоли запускать скрипты с `PYTHONIOENCODING=utf-8` (иначе emoji в выводе
  роняют print на cp1251).
- `git` в PATH (для `task.py move`, `sync.py --apply`).
