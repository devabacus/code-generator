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

---

# Часть 2: анализ git-истории (2026-07-29)

Продолжение разведки — ответ на вопрос «что в этих файлах ручное».

## Методика

Codegen-файлы определены по маркеру `// manifest:` в шапке (остаётся от шаблона):
в `weight_flutter/lib` их **389**. По истории этих файлов коммиты разделены на
**массовые** (≥10 codegen-файлов — почти наверняка регенерация) и **точечные**
(<10 — почти наверняка ручная правка).

```
коммитов, трогавших codegen-файлы: 51
  массовых (>=10 файлов):  12
  точечных (<10 файлов):   39
```

Скрипты разбора — одноразовые, лежали в scratchpad сессии; методика воспроизводится
командами `git grep -l "^// manifest:"` + `git log --name-only`.

## Факт 7: ручная работа сосредоточена ВНЕ зоны генератора

Топ файлов по числу точечных правок:

```
6x  weight_flutter/lib/main.dart
6x  core/routing/router_config.dart
5x  main_common.dart / main_esp32.dart / main_esp32_cloud.dart / main_nrf.dart
5x  developer_tools/presentation/pages/developer_tools_page.dart
5x  home/presentation/pages/home_page.dart
5x  configuration/presentation/pages/configuration_page.dart
3x  core/services/logger/file_log_appender.dart
3x  core/sync/base_sync_repository.dart
```

Это **entry points, роутинг, UI-страницы и core-инфраструктура**. Ни одного
`*_dao.dart`, `*_model.dart`, `*_adapter.dart`, `*_table.dart` — то есть слои, которые
переписывает `generate-entity`, руками почти не трогали.

## Факт 8: пересечение «ручное» × «зона перезаписи» — 6 файлов

Прогнаны четыре сущности (`subscription`, `terminal_device`, `weighing`, `configuration`
— 38/38/38/46 конфликтов соответственно):

| Множество | Файлов |
| --- | --- |
| A — с точечными (ручными) правками | 41 |
| B — которые перезапишет генератор (4 сущности) | 80 |
| **A ∩ B** | **6** |

Все шесть — в фиче `weighing` (самая старая и сложная), и все **full-replace**
(регион `:base` отсутствует → при подтверждённой перезаписи затираются целиком):

```
weighing/data/datasources/local/tables/extensions/weighing_table_extension.dart
weighing/data/datasources/remote/sources/weighing_remote_data_source.dart
weighing/data/providers/weighing/weighing_data_providers.dart
weighing/data/repositories/weighing_repository_impl.dart
weighing/domain/entities/extensions/weighing_entity_extension.dart
weighing/presentation/providers/weighing/weighing_state_providers.dart
```

Происхождение правок (по сообщениям коммитов): TASK-019 sync_core wire-up,
TASK-007/008, и — содержательное — `fix(sync): защита sync engine от потери данных
и гонок`. Последнее прямо указывает на ручную логику в `repository_impl` /
`data_providers`, которую нельзя терять.

## Вывод — стратегия миграции меняется

Разведка первой части («570 файлов, 84% full-replace») выглядела как «миграция
неподъёмна». Анализ истории это опровергает:

- **риск не размазан по 570 файлам, а локализован в единицах**;
- на четырёх проверенных сущностях под угрозой **6 файлов, все в `weighing`**;
- остальные сущности (`subscription`, `terminal_device`, `configuration`) руками не
  правились вовсе → их конфликты — чистая эволюция шаблона, перезапись безопасна.

**Практический план** (предложение):

1. Прогнать оставшиеся 11 сущностей тем же способом и достроить список A ∩ B.
2. Для сущностей с пустым пересечением — массовая перезапись с backup, без разбора.
3. Для `weighing` (и других с непустым пересечением) — ручной разбор шести файлов:
   вытащить кастомные куски из git, применить поверх свежесгенерированного.
4. `--preserve` (обратный флаг) остаётся желательным, но **перестаёт быть блокером**:
   при таком раскладе проще перечислить то, что перезаписываешь.

Оценка трудоёмкости после этих фактов: не «переписать проект», а «разобрать вручную
единицы файлов, остальное регенерировать пакетно».
