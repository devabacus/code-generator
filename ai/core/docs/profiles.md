# Зонные профили и capability policy (v2)

Реализация ADR-0002 п.3. Профиль объявляется на **зону** (не на проект) в
`ai/project/profile.yaml`. Verification-профили — в `ai/project/profiles/<имя>.yaml`.
Валидатор — `ai/core/scripts/profile.py lint`.

Референс-примеры (документация формата, не рабочие) — `ai/core/examples/`:
`profile.example.yaml` (4 архетипа портфеля) + `profiles/*.yaml`.

## Главный принцип: класс — метка, policy — механизм

Римские классы **I–IV** — удобная человеку классификация зоны по способу верификации:

| Класс | Смысл | Пример |
| --- | --- | --- |
| I | полный self-check в облаке | чистый Dart-код, VS Code extension, web-инструменты |
| II | железо-зависимая верификация на офисном ПК | BLE-зона, прошивки ESP32 |
| III | внешний API без своего окружения | 1С, Битрикс24, WordPress (пока нет staging) |
| IV | прод-запрещённая зона | прод-кластер k8s, прод 1С |

**Но решение о запуске драйвер принимает НЕ по классу, а по capability policy.**
Класс — подсказка человеку; policy — то, что реально ограничивает драйвер.

## `ai/project/profile.yaml` — поля зоны

```yaml
project: <name>
zones:
  - name: <zone>              # уникальное имя зоны
    class: I                  # I|II|III|IV — человеческая метка
    execution: apply          # apply | prepare_only | never
    runner: cloud             # cloud | office
    network: none             # none | allowlist
    allowlist: []             # обязателен непустым при network: allowlist
    side_effects: none        # none | read_only | staging
    secrets: []               # имена секретов, доступных зоне
    hardware: []              # обязателен непустым при runner: office
    protected_paths: []       # пути, которые драйвер не трогает
    frozen_contracts: []      # имена frozen-контрактов (golden-эталоны)
    verification_profile: <имя>  # ссылка на ai/project/profiles/<имя>.yaml
```

### Capability policy — что это ограничивает

| Поле | Значения | Что означает |
| --- | --- | --- |
| `execution` | `apply` / `prepare_only` / `never` | apply — драйвер применяет изменения; prepare_only — только готовит (код/тесты/PR), не выполняет побочные эффекты («ночь готовит — человек применяет»); never — зона драйверу запрещена. |
| `runner` | `cloud` / `office` | Где исполняется: облачная VM (always-on) или офисный ПК с железом. |
| `network` | `none` / `allowlist` | Сетевой доступ: закрыт или только перечисленные хосты. |
| `side_effects` | `none` / `read_only` / `staging` | Уровень допустимых эффектов: без эффектов / только чтение / staging-контур. |
| `secrets` | list | Какие секреты доступны (отсутствие prod-кредов = механический запрет прода). |
| `hardware` | list | Требуемое железо (обязательно для `runner: office`). |
| `protected_paths` | list | Пути, которые драйвер не изменяет (напр. legacy fixtures). |
| `frozen_contracts` | list | Замороженные контракты — сравнение с golden разрешено, изменение эталона — нет. |

### Правила валидации (`profile.py lint`)

- Неизвестные поля зоны → ошибка (защита от опечаток).
- `class IV` ⇒ `execution: never` (прод-запрет — guardrail, не соглашение).
- `class III` ⇒ `execution` НЕ `apply` (ADR: класс III стартует в `prepare_only`).
- `runner: office` ⇒ непустой `hardware`.
- `network: allowlist` ⇒ непустой `allowlist`, и **каждая запись валидной формы**:
  hostname (`a.b.com`), wildcard-поддомен (`*.domain.com`), IPv4, IPv4/CIDR. **`*` целиком —
  ошибка** (открывает весь трафик — не guardrail); схемы (`http://…`) и пути — ошибка.
- `execution: apply` ⇒ задан `verification_profile`, и он существует в `profiles/`.
- Любой указанный `verification_profile` должен резолвиться (даже для prepare_only/never) и
  быть простым именем — **без слэшей, `..`, абсолютных путей** (защита от path traversal).
- `protected_paths` — запрет `..`, абсолютных путей, выхода за project root.

## `ai/project/profiles/<имя>.yaml` — verification-профиль

Именованные проверки → команда, таймаут (сек), опционально рабочая директория:

```yaml
name: ts-generator
checks:
  compile: {cmd: "npm run compile", timeout: 300}
  unit:    {cmd: "npm test", timeout: 600}
```

**Verify — только по именам checks**, не произвольными shell-командами в задаче (контракт с
схемой задач v2). `task.md` ссылается: `verification_profile: ts-generator`, `checks: [compile, unit]`.

## Связь со схемой задач (TASK-002)

- В `task.md` frontmatter поля `verification_profile` и `checks` — имена из профиля.
- `task.py lint` резолвит `verification_profile` против `ai/project/profiles/`, **резолвит
  `zone` против `profile.yaml`** (несуществующая зона — error для `mode:auto`), и **сверяет
  каждое имя `checks` с checks указанного verification-профиля** (чужое имя — error). Для
  `mode: auto` `verification_profile`+`checks` — обязательные непустые.
- Таким образом задача не может задать произвольную verify-команду, несуществующую зону или
  чужую проверку — только выбрать из утверждённого человеком профиля. (Границы этого
  enforcement — статические; runtime-пиновка — за драйвером, см. «Границы enforcement».)

## Пиновка SHA и human approval — ПЛАНИРУЕТСЯ (драйвер, TASK-009)

> ⚠️ Всё в этом разделе — **дизайн будущего ночного драйвера, ещё НЕ реализованный**. До
> появления драйвера (TASK-009) это не работающий механизм, а контракт на будущее. Что
> реально обеспечивается сегодня — см. «Границы enforcement» ниже.

- Драйвер будет запоминать **SHA контракта задачи и SHA verification-профиля** на прогон
  (`state.json`: `contract_sha`, `profile_sha`). Если между попытками task.md или профиль
  изменились — прогон аннулируется. Цель — не дать исполнителю ослабить verify, удалить
  падающий тест или подменить golden вместе с кодом. **Сейчас пиновка не выполняется никем**:
  поля `contract_sha`/`profile_sha` документированы в схеме, но пишет/сверяет их только
  будущий драйвер.
- **Изменение эталонов frozen-контрактов** (golden) — по замыслу только через human approval.
  Сегодня `frozen_contracts` в профиле — только метка; запрета на изменение golden кодом нет.
- **Запрет прода — механикой**: замысел — отсутствие prod-кредов (`secrets`) + сетевой
  `allowlist` на уровне runner'а. Сегодня `secrets`/`allowlist`/`network` **только
  валидируются на форму** (`profile.py lint`), но никакой runner их не применяет — сеть не
  ограничивается, креды не выдаются/не отзываются кодом.

## Класс III — стартовый режим

Проекты класса III (1С/Б24/WP) стартуют в `execution: prepare_only`: ночью готовятся код,
тесты и read-only проверки, но ни одного вызова, меняющего данные во внешнем API. `profile.py
lint` **enforces** `class III ⇒ execution != apply` статически; сам режим prepare_only
(ничего не применять) исполнит будущий драйвер. Переход к `staging` — только после появления
сбрасываемого тестового контура.

## Границы enforcement

Честная граница между тем, что **проверяется кодом уже сейчас**, и тем, что остаётся
**обещанием до драйвера (TASK-009)**. До появления runtime-драйвера **capability policy НЕ
является security boundary для недоверенного исполнителя** — это статический линт + метки.

### Что гарантирует `profile.py lint` / `task.py lint` СЕЙЧАС (статика)

- Форма и enum-значения всех полей зоны; неизвестные поля → ошибка.
- `class IV ⇒ execution:never`, `class III ⇒ execution!=apply`.
- `network:allowlist` ⇒ непустой allowlist валидных форм; **`*` целиком отклоняется**.
- `runner:office ⇒ hardware`; `execution:apply ⇒ существующий verification_profile`.
- `protected_paths` и имена профилей — без `..`/абсолютных путей (анти-traversal).
- Задача: `zone` резолвится против `profile.yaml` (несуществующая зона — error для
  `mode:auto`, warning для interactive); каждое имя `checks` существует в указанном
  verification-профиле; `mode:auto` в зоне `execution:never` — error; `max_attempts` int>0;
  `depends_on` — существующие id без циклов; неизвестные поля frontmatter — warning.

Смысл: **задача не может статически объявить произвольную verify-команду или несуществующую
зону/проверку** — линт это ловит и роняет pre-commit / старт смены.

### Что обеспечит ТОЛЬКО будущий драйвер (runtime, TASK-009) — сейчас НЕ enforced

- **Пиновка SHA** контракта/профиля на прогон и аннуляция при их изменении между попытками.
- **Read-only снимок policy** из доверенного места (задача не может подменить свой профиль на
  лету).
- **Сетевой allowlist / выдача секретов** на уровне runner'а (механический запрет прода).
- **prepare_only как поведение** (готовить, но не применять) и **запрет менять golden**
  frozen-контрактов без human approval.
- **Резолв zone → фактические capability** при принятии решения о запуске воркера.

До TASK-009 эти пункты — контракт на бумаге. Линт мешает *случайно* сломать инвариант, но не
защищает от *намеренно враждебного* исполнителя, имеющего доступ к файлам (он может править
profile.yaml, golden, verify-профили — линт лишь зафиксирует расхождение, но не помешает
записи). Поэтому автономный ночной режим не включается до TASK-009 (см. ADR-0002 п.4).
