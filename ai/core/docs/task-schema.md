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

> **Что читается сейчас, а что зарезервировано.** Поведением управляет `status`: его пишет
> `task.py move` / `pr --done`. Задачу по id резолвит `find_task_dir`/`find_task_anywhere`
> **по имени папки** — frontmatter при резолве не открывается вообще. Поле `id` из
> frontmatter читают только `move_task_status` (как одну из двух альтернатив сопоставления,
> вторая — то же имя папки) и `lint` (сверяет `id` с префиксом папки, ловит дубли).
> Все остальные поля сейчас **только валидируются** `task.py lint` (функция
> `collect_lint_issues`) — ни один исполнитель их не читает и ничего по ним не делает.
> Это заранее объявленный интерфейс ночного драйвера (TASK-009), которого нет.
>
> **Поля необязательны.** Любое из `mode` / `zone` / `verification_profile` / `checks` /
> `max_attempts` / `depends_on` можно опустить: `collect_lint_issues` читает их через
> `fm.get(..., дефолт)`, и отсутствие поля не даёт ни ошибки, ни предупреждения. Проверяется
> только то, что заполнено — и не всё одинаково строго (см. следующий раздел).

Ниже frontmatter — человеческое тело контракта (Цель / Не-цели / Scope / Критерии приёмки /
План тестирования). Тело редактирует человек; frontmatter — тоже человек, **кроме поля
`status`**, которое двигает только `task.py move` / драйвер.

### Поля

| Поле | Тип | Дефолт, если поле опущено | Назначение | Кто читает СЕЙЧАС |
| --- | --- | --- | --- | --- |
| `id` | str | — (пустой ⇒ error) | `TASK-NNN`, уникален по всем задачам. Должен совпадать с префиксом папки. | `task.py`: `lint` (сверка с папкой, дубли), `move_task_status` (одна из двух альтернатив сопоставления). Резолв `find_task_anywhere` идёт по имени папки, не по этому полю |
| `schema_version` | int | `None` ⇒ warning | `2` для v2. v1-задачи без frontmatter допустимы (warning в lint). | `task.py lint` (warning при `≠ 2`) |
| `status` | enum | — (пустой ⇒ error) | `active`/`blocked`/`done`. Каноничный источник статуса. Папка канбана — производна. | `task.py`: `lint`, `move`, `pr --done` |
| `mode` | enum | `interactive` | `interactive` (человек в цикле) / `auto` (ночной драйвер). | `task.py lint`: для `auto` включает строгие проверки. Драйвера, который бы исполнял `auto`, нет |
| `zone` | str | `""` (резолв пропускается) | Имя зоны из `ai/project/profile.yaml`. | `task.py lint`: резолв против `profile.yaml` |
| `verification_profile` | str | `""` (резолв пропускается) | Имя verification-профиля (`ai/project/profiles/<имя>.yaml`). Обязателен для `mode:auto`. | `task.py lint`: anti-traversal + резолв профиля. Проверки по нему никто не запускает |
| `checks` | list[str] | `[]` | Имена проверок внутри профиля. Обязателен непустым для `mode:auto`. | `task.py lint`: каждое имя обязано быть в профиле |
| `max_attempts` | int | `3` | Лимит попыток драйвера до перевода в `blocked`. | `task.py lint`: `int > 0`. Попытки никем не считаются — задел под TASK-009 |
| `depends_on` | list[str] | `[]` | id задач, которые должны быть `done` до старта. | `task.py lint`: существование id + детекция циклов. Порядок запуска никем не навязывается |

### Что реально проверяет lint

Источник — `collect_lint_issues()` в `core/scripts/task.py`. **Error** = ненулевой exit (текст
уходит в stderr). **Warning** = `lint` всё равно проходит с exit 0.

Error (независимо от `mode`):

| Условие | Сообщение |
| --- | --- |
| нет `task.md`; frontmatter не парсится | `нет task.md` / ошибка парсера |
| пустой `id`; дубль `id`; `id` не совпадает с префиксом папки | `пустой id` / `дубль id` / `id … не совпадает с именем папки` |
| `status` не из `active/blocked/done`; папка ≠ `status` | `status '…' не из …` / `расхождение папка/status` |
| `mode` не `interactive` и не `auto` | `mode '…' не из (interactive, auto)` |
| `verification_profile` содержит слэш, `..` или абсолютный путь | `verification_profile … path traversal` |
| `checks` не список; имя check отсутствует в указанном профиле | `check '…' отсутствует в профиле` |
| `max_attempts` не целое или `≤ 0` | `max_attempts должен быть целым > 0` |
| `depends_on` не список; ссылка на несуществующий id; цикл | `depends_on ссылается на несуществующий id` / `обнаружен цикл` |

Дополнительно error **только для `mode: auto`** (драйвер исполнял бы задачу без человека в цикле):

| Условие | Сообщение |
| --- | --- |
| `zone` пустая или отсутствует | `mode:auto требует непустую zone` |
| `zone` не найдена в `profile.yaml` | `zone '…' не найдена в profile.yaml (error для mode:auto)` |
| `verification_profile` пуст | `mode:auto требует непустой verification_profile` |
| `verification_profile` задан, но файла нет (только если каталог `profiles/` вообще существует) | `verification_profile '…' не найден в …` |
| `checks` пуст | `mode:auto требует непустой список checks` |
| зона с `execution: never` | `mode:auto в зоне '…' с execution:never` |

Warning (exit остаётся 0):

| Условие | Сообщение |
| --- | --- |
| frontmatter нет вовсе | `schema v1 (нет frontmatter) — пропущены v2-проверки` |
| `schema_version ≠ 2` (включая отсутствие поля) | `schema_version=… (ожидается 2)` |
| неизвестные ключи frontmatter | `неизвестные поля frontmatter […]` |
| `zone` не найдена в `profile.yaml` при `mode: interactive` | `… (warning для interactive)` |
| нет `ai/project/profile.yaml` | `резолв zone пропущен` |
| `verification_profile` задачи ≠ профилю её зоны | `… допустимо, если это осознанный профиль из profiles/` |

Чего lint **не** делает: не требует наличия самих полей (см. колонку «Дефолт»), не запускает
ни одну проверку из профиля, не сверяет `depends_on` со статусом зависимостей и не считает
попытки.

### Правило владения статусом

- Каноничный статус — поле `status` во frontmatter.
- Папка `active|blocked|done` — **производное представление**.
- Перемещает папку **только скрипт** (`task.py move`). Текущая реализация делает `git mv`, затем правит frontmatter: обычное расхождение ловит `lint`, но crash-atomicity пока **нет** и не планируется. Transaction journal/recovery описывались в TASK-024, **закрытой по ADR-0004** (машинерия для драйвера, которого нет; вместе с ней снят ADR-0003). Docs не называют move атомарным.
- Человек руками папки не таскает; ручное расхождение папка↔status ловит `task.py lint`.

## 2. Runtime-state: `runs.jsonl` + `head.witness` + `state.json`

Канонический future runtime из TASK-009 живёт не в tracked task folder, а в ignored `ai/project/.runtime/driver/tasks/<task-id>/`: **владелец — только драйвер/`task.py`**, executor не видит этот root в sandbox и их НЕ пишет. `state.json/runs.jsonl` рядом с `task.md` — deprecated draft layout и не считается driver state.
Сейчас `task.py state` только read-only и может показать старый task-local draft; перевод команды на external lookup и атомарную запись входит в TASK-009.

> ⚠️ **Границы enforcement.** Всё в этом разделе (`contract_sha`/`profile_sha`, пиновка,
> аннуляция прогона) — **контракт будущего драйвера (TASK-009), сейчас никем не пишется и не
> сверяется**. Схема задокументирована заранее; runtime-гарантии появятся с драйвером. Что
> проверяется кодом уже сейчас — статический `task.py lint` (см. таблицу команд) и
> `profile.py lint`. Полная граница «статика vs runtime» — в `profiles.md` § «Границы
> enforcement». До TASK-009 policy НЕ является security boundary для недоверенного исполнителя.

### `state.json` — rebuildable cache (перезаписывается)

Это **rebuildable materialized cache**, а не второй source of truth. Он пишется только после durable append authoritative `runs.jsonl` и durable advancement `head.witness` через temp→flush/fsync→atomic replace→durable parent update под single-instance driver OS-lock. Startup replay/rebuild'ит только missing/behind cache. Cache ahead либо divergent — признак rollback/truncation log, поэтому quarantine/fail-closed; перестройка «вниз» запрещена. Torn/unknown/schema/hash mismatch log не превращается в «новую задачу», а даёт startup reconciliation из TASK-009.

```json
{
  "schema_version": 1,
  "id": "TASK-042",
  "last_seq": 7,
  "last_record_sha": "<sha256 canonical event 7>",
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

### `runs.jsonl` и `head.witness` — журнал и high-water mark

Одна строка JSON на immutable run-event, дописывается (никогда не переписывается). `runs.jsonl` — authoritative: первая запись имеет `seq:1`, `prev_record_sha:null`; далее `seq` растёт ровно на 1, а `prev_record_sha` равен `record_sha` предыдущей записи. Digest — lowercase 64-hex SHA-256. `record_sha` вычисляется без рекурсии от UTF-8 deterministic JSON уже validated event **с исключённым `record_sha`** и включённым `prev_record_sha`: sorted keys, separators ровно `,`/`:`, без лишнего whitespace и ASCII escaping, строки NFC. Duplicate keys, float, NaN и Infinity запрещены. Wall-clock поля `*_at` — canonical RFC3339 UTC с `Z`; интервалы/длительности/бюджеты — неотрицательные integer `*_ms`. Reader повторяет ровно эту canonicalization и сравнивает hash до replay.

До первого event durable создаётся `head.witness` со значением `{"seq":0,"record_sha":null}`. Для каждой записи порядок: newline frame flush/fsync → atomic/durable witness replace → materialize cache. Поэтому log может опережать witness ровно на один валидный event только как доказанный kill-window; startup докатывает witness. Missing witness при nonempty log, witness ahead/divergent, log более чем на один event впереди, log позади witness или middle corruption → quarantine. Только доказанно torn последний frame после валидного witnessed prefix может быть отброшен с последующей immutable recovery-записью:

```jsonl
{"schema_version":1,"seq":1,"prev_record_sha":null,"record_sha":"<lowercase-64-hex-sha256>","event":"attempt_finished","attempt":1,"started_at":"2026-07-20T22:01:00Z","duration_ms":234000,"checks":{"compile":"pass","unit":"fail"},"exit_code":1,"result":"retry"}
{"schema_version":1,"seq":2,"prev_record_sha":"<record-sha-event-1>","record_sha":"<lowercase-64-hex-sha256>","event":"attempt_finished","attempt":2,"started_at":"2026-07-20T22:40:00Z","duration_ms":201000,"checks":{"compile":"pass","unit":"pass"},"exit_code":0,"result":"green"}
```

Журнал нужен утреннему разбору: по нему видно, что падало и почему BLOCKED, без раскопок.

### Связь event log с canonical task status

Переход `active|blocked|done` выполняется exactly-once протоколом TASK-009↔TASK-024. Driver под common lock сначала публикует common-dir reservation, затем append'ит bound `task_move_requested` с operation id, canonical target ref/expected old SHA, source/target, contract SHA, expected status и typed basis. Для `done` basis = exact `proof_verified` candidate; для `blocked` строго `content_base_sha == parent == expected_old_ref_sha` exact current clean target head + protected terminal evidence без attempt diff (stale pre-attempt base только если всё ещё равен expected-old); reopen требует owner approval. TASK-024 пинует commit-object inputs/SHA, выполняет/recover'ит move+index и target-ref CAS, оставляет `committed` либо exact-all-pre `aborted_rolled_back` receipt. Driver держит common lock и reservation/journal до `task_move_committed|task_move_aborted`; только затем cache получает новый `status` и cleanup разрешён. Startup проверяет reservation/request/object/ref/receipt/event, а не выводит результат из имени папки.

## 3. Команды `task.py`

| Команда | Что делает |
| --- | --- |
| `task.py lint` | Валидация всех задач; поимённый разбор «что error, что warning» — в § 1, «Что реально проверяет lint». Кратко: отсутствующие поля не проверяются вовсе (подставляются дефолты), заполненные — да; ненулевой exit только на error, ошибки печатаются в stderr (годится для pre-commit / старта ночной смены). |
| `task.py move <id> <status>` | Меняет `status` во frontmatter и делает `git mv` папки в соответствующий канбан-каталог. Если `status==каталог` — только выравнивает frontmatter. Операция lint-detectable, но не crash-atomic — и такой не станет: TASK-024 (journal/recovery/driver receipt) закрыта по ADR-0004. |
| `task.py state <id>` | **Legacy read-only draft:** печатает старые task-local `state.json/runs.jsonl` или сообщает об отсутствии. Это не состояние будущего драйвера. TASK-009 переводит lookup на protected `project/.runtime/driver/tasks/<id>/`; executor-записи нет. |

Команды `start`/`pr`/`merge`/`finish` (git-workflow) не изменены.

## 4. Совместимость v1

Задачи без frontmatter считаются `schema v1`. `lint` выдаёт по ним warning, не error;
`move` для них не применим (нет поля `status`). Миграция v1→v2 — см. `migration-v1-to-v2.md`.
