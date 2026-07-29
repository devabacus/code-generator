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

---

# Часть 3: полный цикл новой сущности (TASK-047, 2026-07-29)

Закрытие остатка части 1. Там прогон шёл **без `--with-server`**, и компиляция не
проверялась — то есть «новая сущность генерируется без конфликтов» доказывало ровно
половину: сгенерировать файлы ≠ получить рабочий код.

## Условия прогона

Та же worktree-копия `G:/Projects/Flutter/serverpod-probe/weight` (detached, HEAD `1d5f7c0`),
приведённая к чистому состоянию: сняты артефакты части 1 (`.codegen/`, `features/probe/`,
`models/probe/`, правки `database.dart` и `sync_orchestrator_provider.dart`).
Оригинал weight не тронут — `git status` чист до и после.

Сущность `ProbeItem` (7 полей, без relations), feature `probe`, ceremony `full`.

⚠ Копия **отстаёт от текущего weight на 21 коммит** (`df84e21`). Дельта проверена: целиком
рукописные слои — `device_settings`, `configuration/presentation`, `settings_definitions`,
тесты, `shared/api_spec`. Ни одного `.spy.yaml`, `database.dart`,
`sync_orchestrator_provider.dart`, `*_dao/_table/_model/_adapter`. Для вопроса о генераторе
копия репрезентативна.

## Факт 9: цикл проходит целиком, дельта по ошибкам — ноль

| Замер | errors | warnings | infos |
| --- | --- | --- | --- |
| baseline **до** генерации | **0** | 1 | 46 |
| **после** генерации сущности | **0** | 1 | 46 |

```text
# baseline
PASS: verify weight
  ✓ flutterAnalyze — 19262ms (errors=0, warnings=1, infos=46)
  ✓ pubGet — 6125ms
  ✓ serverpodGenerate — 26097ms
  ✓ buildRunner — 76532ms

# после generate-entity --with-server
PASS: verify weight
  ✓ flutterAnalyze — 15551ms (errors=0, warnings=1, infos=46)
  ✓ pubGet — 5005ms
  ✓ serverpodGenerate — 20260ms
  ✓ buildRunner — 44849ms
```

Baseline чистый — значит любая ошибка после генерации была бы наша. Её нет.

Сама генерация:

```text
SUCCESS: generate-entity
Created (25): 23 flutter + weight_server/lib/src/endpoints/probe_item_endpoint.dart
              + .codegen/ledger.json
Modified (2): sync_orchestrator_provider.dart, database.dart
Ledger: записано 24, seed 0
Duration: 156ms
EXIT=0 — ни одного конфликта
```

`--with-server` отработал: серверный endpoint на месте (в части 1 без флага его не было).

## Факт 10: общие файлы получают только вставки

```text
git diff --numstat
19  0   weight_flutter/lib/core/sync/sync_orchestrator_provider.dart
6   1   weight_flutter/lib/core/data/datasources/local/database.dart
```

Единственная удалённая строка во всём диффе — `int get schemaVersion => 25;` (заменена на 26).
Больше ни одного удаления.

**Повторный прогон молчит и идемпотентен:** exit 0, ноль конфликтов, диффы те же (19/0 и 6/1),
`schemaVersion` остался **26** (не подскочил до 27), вставки не задвоились. Ledger отработал:
`existing == ledger` → молчаливая перезапись.

## Факт 11: доля merge-файлов ещё ниже, чем считалось

В ledger'е 24 записи, из них с `ownership: merge` — **3**. Остальные 21 — full-replace.

**3 из 24 = 12.5%**, тогда как часть 1 давала 6 из 38 ≈ 16% для существующей сущности.
Это входное число «до» для [TASK-049](../tasks/active/TASK-049-миграция-шаблонов-на-merge-дисциплину--base-регионы-в-full-replace-файлы/task.md):
цель ≥60% стартует с более низкой отметки, чем предполагал контракт.

Побочно: три предупреждения `[SectionReplacer] Generator function not found for name: base`
в первом прогоне — **не дефект**. `:base` не секционный генератор, а при **создании** файла
идёт полный render; поведение описано комментарием в `generation_service.ts` и покрыто тестом.
Во втором прогоне (target существует → merge-ветка) шума нет. Число предупреждений ровно
совпало с числом merge-файлов — 3.

## Факт 12: писатели вне plan в ledger не попадают — подтверждено на реальном проекте

24 записи ledger'а — это ровно 24 сгенерированных `.dart`. `database.dart` и
`sync_orchestrator_provider.dart` среди них **нет**, хотя оба изменены. Это ровно
[TASK-046](../tasks/active/TASK-046-ledger--протухающие-записи-для-писателей-вне-plan--патчеры--bootstrap/task.md)
(патчеры пишут в обход plan/apply), теперь наблюдение не теоретическое.

## Факт 13: `serverpod generate` сам по себе даёт большой дифф

На **baseline**-прогоне (ещё до появления сущности) `serverpod generate` переписал ~60 файлов
в `weight_server/lib/src/generated/` — **4866 вставок / 4391 удалений**. Причина — дрейф
версии Serverpod относительно той, которой weight генерировался раньше. К `generate-entity`
отношения не имеет, `flutter analyze` после этого чистый.

Но при реальной миграции weight **этот дифф придёт с первым же `serverpod generate`**, ещё до
того как будет тронута хоть одна сущность. Учитывать в TASK-048/049: он засорит `git diff`
и его легко спутать с работой генератора.

## Вывод части 3

**Новые сущности в weight добавлять можно сегодня.** Полный цикл проходит, компилируется,
общие файлы не страдают, повторный прогон безопасен.

**Не проверено:** runtime — миграция БД не применялась, сервер не поднимался, sync не гонялся.
`verify` покрывает compile + analyze, но не поведение. Для 19 вставок в оркестратор это
существенно: они компилируются, но что регистрация в sync работает, прогон не доказывает.

Вопрос регенерации **существующих** сущностей этой частью не затрагивается — там по-прежнему
38 конфликтов на сущность (части 1-2, далее TASK-048/049).

---

# Часть 4: полная карта риска, 15 сущностей (TASK-048, 2026-07-29)

Достроено то, что части 1-2 сделали для четырёх сущностей. Плюс — **поправка к числам
частей 1-2**, см. факт 14.

Прогон read-only: guard fail-closed, при конфликтах не записывается ни один файл.
Та же worktree-копия, приведена к чистому состоянию до и после.

## Факт 14 (ПОПРАВКА): конфликтов вдвое меньше, чем сообщали части 1-2

Части 1-2 считали конфликты по числу `✗`-строк в выводе. **`generate-entity --human`
печатает отчёт о конфликтах дважды** — потоком и повторно в сводке `FAILED / Errors (2)`
([BUG-031](../bug-reports/031-generate-entity-duplicates-conflict-report-in-output.md)).
Заголовок `Обнаружено конфликтов: N` всё это время сообщал правду.

| Величина | Части 1-2 | **Реально** |
| --- | --- | --- |
| конфликтов на сущность | 38 | **19** |
| `configuration` | 46 | **23** |
| всего по проекту | ≈570 | **271** |

Сверка, снявшая вопрос: `19+19+23+19 = 80` — ровно то `B`, которое часть 2 посчитала для
четырёх сущностей. **Множества файлов у частей 1-2 верны**, завышен был только счётчик и
экстраполяция. Все выводы про A ∩ B остаются в силе.

## Факт 15: полная карта — 13 файлов под угрозой, все в `weighing`

Множество **A** (файлы с точечными правками) воспроизведено по методике части 2:
389 codegen-файлов по маркеру `// manifest:`, 51 коммит их трогал (12 массовых, ≥10 файлов;
39 точечных), **A = 41 файл**. Числа совпали с частью 2 — методика воспроизводима.

| Сущность | Конфликтов | Под угрозой (A ∩ B) | Источник |
| --- | ---: | ---: | --- |
| `weighing` | 19 | **6** | части 1-2 |
| `driver` | 19 | **3** | TASK-048 |
| `vehicle` | 19 | **3** | TASK-048 |
| `contractor` | 19 | **1** | TASK-048 |
| `cargo_type` | 19 | 0 | TASK-048 |
| `configuration` | 23 | 0 | части 1-2 |
| `correction_button` | 19 | 0 | TASK-048 |
| `custom_field` | 19 | 0 | TASK-048 |
| `device_owner` | 20 | 0 | TASK-048 |
| `subscription` | 19 | 0 | части 1-2 |
| `terminal_device` | 19 | 0 | части 1-2 |
| `terminal_set` | 19 | 0 | TASK-048 |
| `weighing_correction` | 19 | 0 | TASK-048 |
| `weighing_photo` | 19 | 0 | TASK-048 |
| `custom_field_value` | — | — | особый случай, факт 17 |

**B = 271 уникальный файл** (сумма по сущностям равна объединению — сущности не делят
между собой конфликтующие файлы).

**A ∩ B = 13 файлов, все в фиче `weighing`.** Часть 2 нашла 6 из них на своих четырёх
сущностях; остальные 7 добавили `driver`, `vehicle`, `contractor`.

## Факт 16: 10 из 14 сущностей перезаписываются пакетно, без разбора

Пустое пересечение → руками не правились ни разу → конфликты это чистая эволюция шаблона:

```text
cargo_type, configuration, correction_button, custom_field, device_owner,
subscription, terminal_device, terminal_set, weighing_correction, weighing_photo
```

Разбирать вручную нужно **четыре**: `weighing` (6 файлов), `driver` (3), `vehicle` (3),
`contractor` (1).

### Все 13 файлов под угрозой — full-replace

Ни у одного нет региона `:base` → при подтверждённой перезаписи затираются целиком
(прежнее содержимое уйдёт в `.codegen/backup/<timestamp>/`).

| Файл | Сущность | Происхождение правки |
| --- | --- | --- |
| `weighing/.../tables/extensions/weighing_table_extension.dart` | weighing | `113aec87` двойное взвешивание; `ccde34ab` UI весовой |
| `weighing/.../remote/sources/weighing_remote_data_source.dart` | weighing | `ac464554` TASK-008 subscription guard |
| `weighing/data/providers/weighing/weighing_data_providers.dart` | weighing | `ac464554` TASK-008 subscription guard |
| `weighing/data/repositories/weighing_repository_impl.dart` | weighing | `3dcf6003` (сообщение «1») |
| `weighing/domain/entities/extensions/weighing_entity_extension.dart` | weighing | `cb5c3751` печать талона взвешивания |
| `weighing/presentation/providers/weighing/weighing_state_providers.dart` | weighing | `ac464554` guard; `113aec87` двойное взвешивание |
| `weighing/.../tables/extensions/driver_table_extension.dart` | driver | `ccde34ab` UI весовой программы |
| `weighing/data/models/extensions/driver_model_extension.dart` | driver | `ccde34ab` UI весовой программы |
| `weighing/presentation/providers/driver/driver_state_providers.dart` | driver | `bc6a7a1f` (сообщение «work») |
| `weighing/.../tables/extensions/vehicle_table_extension.dart` | vehicle | `ccde34ab` UI весовой программы |
| `weighing/data/models/extensions/vehicle_model_extension.dart` | vehicle | `ccde34ab` UI весовой программы |
| `weighing/presentation/providers/vehicle/vehicle_state_providers.dart` | vehicle | `bc6a7a1f` (сообщение «work») |
| `weighing/presentation/providers/contractor/contractor_state_providers.dart` | contractor | `bc6a7a1f` (сообщение «work») |

**Вердикт по ценности правок.** Содержательными выглядят четыре группы:

- `weighing_repository_impl` + `weighing_data_providers` + `weighing_remote_data_source` +
  `weighing_state_providers` — sync-логика и subscription-guard (`ac464554`), терять нельзя;
- `weighing_entity_extension` — печать талона (`cb5c3751`), прикладная логика;
- `*_table_extension` / `*_model_extension` у `driver`/`vehicle`/`weighing` (`ccde34ab`) —
  похоже на доменные хелперы, смотреть глазами;
- `*_state_providers` у `driver`/`vehicle`/`contractor` (`bc6a7a1f`, сообщение «work») —
  происхождение непрозрачное, обязательно смотреть диффом, а не по сообщению коммита.

## Факт 17: `custom_field_value` — не регенерация, а создание с нуля

Пятнадцатая сущность выпадает из карты риска: YAML на сервере есть, а во flutter
**ни одного файла** (`find weight_flutter/lib -name "*custom_field_value*"` → 0).
Она никогда не генерировалась на клиент.

Прогон: **exit 0, ноль конфликтов**, 24 файла создано, 9 «изменено» — все девять
принадлежат ей самой (созданы в этом же прогоне и затем допатчены `relation_patcher`,
у неё есть FK), плюс два общих файла. Чужого не тронуто.

То есть это тот же безопасный сценарий, что и TASK-047, а не миграция.

## Факт 18: `:base` есть ровно у трёх типов файлов

По всему множеству B (271 файл): **merge — 44 (16%), full-replace — 227 (83%)**.
Доля из части 1 подтверждается.

Регион `:base` несут только:

```text
*_dao.dart                    *_repository.dart (domain-интерфейс)
*_local_data_source.dart      + единичные local_datasource_service / usecases / usecase_providers
```

Для [TASK-049](../tasks/active/TASK-049-миграция-шаблонов-на-merge-дисциплину--base-регионы-в-full-replace-файлы/task.md)
это точная отправная точка: защищены три типа из ~19 на сущность. Причём **ни один из
13 файлов под угрозой не относится к защищённым типам** — под ударом ровно те слои,
которые `:base` не покрывает: `*_extension`, `*_state_providers`, `*_data_providers`,
`repository_impl`, `remote_data_source`.

## Вывод части 4

Миграция weight **меньше и безопаснее**, чем выглядела после части 1:

1. не ≈570 файлов, а **271**;
2. под угрозой **13 файлов**, все в одной фиче;
3. **10 из 14** сущностей перезаписываются пакетно без разбора;
4. `custom_field_value` — вообще не миграция.

Порядок действий, вытекающий из фактов:

1. Пакетно перезаписать 10 «чистых» сущностей — 199 файлов, backup включён по умолчанию.
2. `contractor` (1 файл), `driver` (3), `vehicle` (3) — посмотреть три `*_state_providers`
   из коммита `bc6a7a1f` и четыре `*_extension` из `ccde34ab` диффом, решить по каждому.
3. `weighing` (6 файлов) — самый содержательный кусок: sync-логика и печать талона.
   Вытащить кастом из git, применить поверх свежесгенерированного.
4. `custom_field_value` — сгенерировать как новую, отдельно.

TASK-049 (`:base` в full-replace файлы) от этого **не теряет смысла, а получает адрес**:
мигрировать в первую очередь те типы, что стоят в таблице выше — `*_extension`,
`*_state_providers`, `*_data_providers`, `repository_impl`, `remote_data_source`.
Именно они и рвутся на живом проекте.
