# Разведочный прогон guard'а на weight — 2026-07-28

Первая проверка codegen-контура (TASK-042 preflight+ledger + TASK-043 per-file preserve)
на **реальном проекте**, а не на синтетических `t2xx`. Цель — получить факты вместо
предположений перед тем, как чинить оставшиеся follow-up'ы.

**Ничего не мигрировалось и не перезаписывалось.** Прогон read-only по сути: guard
fail-closed, при конфликтах генератор не пишет ни одного файла.

## Как воспроизвести

Копия weight сделана git-worktree'ом в detached-режиме — рабочее дерево и ветки оригинала
не затрагиваются (после прогона `git status` в оригинале показывал 0 изменений):

```bash
cd G:/Projects/Flutter/serverpod/weight
git worktree add --detach G:/Projects/Flutter/serverpod-probe/weight HEAD
```

⚠ Имя директории обязано быть `weight`: `targetProject` выводится как
`path.basename(--workspace)` ([generation_config.ts:123](../../../src/features/generation/config/generation_config.ts)),
опции переопределить его нет. Первая попытка с папкой `weight-codegen-probe` дала бы
`weight-codegen-probe_flutter` — пришлось пересоздавать.

```bash
node out/adapters/cli/index.js generate-entity \
  --yaml "G:/Projects/Flutter/serverpod-probe/weight/weight_server/lib/src/models/subscription/subscription.spy.yaml" \
  --feature-path "G:/Projects/Flutter/serverpod-probe/weight/weight_flutter/lib/features/subscription" \
  --workspace "G:/Projects/Flutter/serverpod-probe/weight" \
  --projects-path "G:/Projects/Flutter/serverpod-probe" --human
```

Worktree на 2026-07-28 оставлен на месте (пригодится для анализа кастомов);
убирается `git worktree remove G:/Projects/Flutter/serverpod-probe/weight`.

## Факт 1: под codegen — 15 сущностей из 43

`.spy.yaml` в `weight_server/lib/src/models` (без `*_sync_event`): **43**.
С парным sync-event И тремя обязательными полями (`userId`/`customerId`/`isDeleted`): **15**.

```
configuration, device_owner, subscription, terminal_device, terminal_set,
cargo_type, contractor, correction_button, custom_field, custom_field_value,
driver, vehicle, weighing, weighing_correction, weighing_photo
```

Остальные 28 — system-scoped, DTO, exceptions, enum'ы. Генератор отвергает их pre-flight
(проверено на `device_log`: `missing required field "userId"/"customerId"/"isDeleted"` +
`missing paired sync-event YAML`, exit 1). Это корректное поведение BUG-004-валидации,
а не дефект.

> Прежние оценки в доках («13 сущностей weight») — неточны, верное число **15**.

## Факт 2: 38 конфликтов на сущность, все — `legacy-mismatch`

Замерено на `subscription` и `terminal_device` — у обеих ровно 38.
Экстраполяция на 15 сущностей: **≈570 файлов**.

Причина у всех одна: в weight нет `.codegen/ledger.json`, поэтому генератор не может
отличить «нетронутый машинный вывод» от «файл с ручными правками» и честно говорит
`legacy-mismatch — неизвестно, есть ли внутри ручные правки`. Это предусмотренная
state machine инварианта «в» (ADR-0007), а не сбой.

Разбивка по слоям (subscription):

| Слой | Файлов |
| --- | --- |
| `data/datasources` | 10 |
| `data/adapters` | 10 |
| `presentation/providers` | 4 |
| `domain/entities` | 4 |
| `data/models` | 4 |
| `domain/repositories` | 2 |
| `data/repositories` | 2 |
| `data/providers` | 2 |

## Факт 3: 84% конфликтов — full-replace, регионы не спасают

| Тип | Файлов | Что при подтверждённой перезаписи |
| --- | --- | --- |
| merge (есть `:base`) | **6** | код снаружи региона выживает |
| full-replace | **32** | файл затирается целиком (прежнее содержимое → `.codegen/backup/`) |

## Факт 4: BUG-030 на текущем weight НЕ стреляет

Проверены **все 25** файлов с регионом `:oneToManyMethods`. Внутри — исключительно
машинные методы вида `get<Entities>By<Fk>Id`:

```
getWeighingsByVehicleId, getWeighingsByDriverId, getWeighingsByContractorId,
getWeighingsByCargoTypeId, getVehiclesByContractorId, getSubscriptionsByTerminalSetId,
getDriversByContractorId, getWeighingsByTerminalSetId, getWeighingPhotosByWeighingId,
getWeighingCorrectionsByWeighingId, getTerminalDevicesByTerminalSetId
```

Самый крупный регион (65 строк, `weighing_dao.dart`) — это пять сгенерированных методов
по числу FK, а не кастом. **Ручного кода в otm-регионах нет →
[BUG-030](../bug-reports/030-relation-patcher-otm-region-outside-guard.md) можно понижать
в приоритете** (он остаётся открытым как класс, но на текущем состоянии weight не бьёт).

## Факт 5: расхождения системные, а не пользовательские

Конфликтуют даже заведомо машинные файлы (`*_mappers.dart`, `*_table.dart`). Природа —
шаблон ушёл вперёд с момента генерации weight: появились `:base`-регионы, флаги
`fullCeremony`, изменился состав импортов.

Гипотеза «weight построен в minimal-стиле» **не подтвердилась**: прогон с
`--ceremony minimal` дал те же 38 конфликтов.

## Факт 6: терять есть что

Git-история файлов фичи `subscription` (19 `.dart` без `.g/.freezed`):
**14 файлов правились более одного раза** после первичной генерации, 5 — один раз.

Это не доказательство кастомов (часть правок могла быть перегенерацией), но исключает
вариант «там нечего терять, можно смело затирать всё».

## Выводы

1. **Guard работает как задумано на реальных данных** — ноль записей, внятная причина по
   каждому файлу, diff. Первая проверка контура вне синтетических `t2xx` пройдена.
2. **Per-file preserve (TASK-043) не масштабируется на эту задачу.** Он отлично решает
   «три конфликта, два сохранить», но перечислить 500+ путей в `--overwrite-existing`
   нереально. Не хватает **обратного флага** (`--preserve <пути>`): перечислять
   приходится то, что уничтожаешь, а не то, что бережёшь — на первом прогоне живого
   проекта это ровно наоборот от нужного.
3. **Регенерация weight — это миграция, а не запуск команды.** 570 файлов, из них 84%
   full-replace, при живой истории правок.

## Что делать дальше (предложение, не решение)

Приоритет **не** у TASK-044/045/046 — они не про эту проблему.

Сначала — разовая аналитика: пройти git-историю codegen-файлов weight и выделить
содержательные правки (что менялось руками после генерации). По её итогам развилка:

- **кастомов мало и они локальны** → массовая перезапись с backup + ручной возврат
  нескольких кусков;
- **кастомов много** → нужен инструмент: обратный флаг `--preserve`, отчёт «что именно
  потеряется», либо поэтапная миграция по одной сущности.

Оценка BUG-030 после этой разведки — низкий приоритет (см. Факт 4).
