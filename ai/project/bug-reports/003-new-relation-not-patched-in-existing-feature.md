# BUG-003: Добавление нового relation в существующую сущность — частично не патчит локальные слои

**Статус:** Resolved (2026-04-25, TASK-008, ветка `feature--fix-codegen-regen-bugs`)
**Обнаружено:** 2026-04-22
**Источник:** проект weight (Flutter, Serverpod 3.1.1), TASK-007
**Критичность:** High (компиляция ломается, ручная правка обязательна)

## Resolution

`relation_patcher.ts` переработан: теперь идемпотентный и additive. Один marker-пара на файл, заменяется через single-pass replace-callback. Все 8 шаблонных слоёв (endpoint, remote, usecases, interfaces, local, dao, repository, repository_impl) обрабатываются одинаково. Recovery от legacy-дубликатов (4 marker-пары после старого patcher'а) тоже работает: схлопываются в 1.

См. [TASK-008 report](../tasks/active/TASK-008-fix-bug-003-relation-patcher/report.md).

> **Не входит в фикс:** перезапись `:base` секций (BUG-003 update 2026-04-22, "Перезаписываемые секции содержат кастомный код") — это отдельная архитектурная задача (сужение marker-схемы до per-method markers). Переоформить как BUG-005, если станет блокером.

## Симптом

При regen существующей фичи (`generate-entity --yaml <existing>.spy.yaml --feature-path <existing feature>`), в которую добавлен **новый `relation(parent=X)` field** на уже созданной сущности, codegen патчит одни слои и пропускает другие. После regen `flutter analyze` падает с `undefined_method` / `non_abstract_class_inherits_abstract_member`.

## Воспроизведение

1. Существующая сущность `Weighing` с несколькими one-to-many relations (`contractorId`, `vehicleId`, `driverId`, `cargoTypeId`), уже полностью сгенерированная ранее.
2. Добавить в `weighing.spy.yaml` новое поле:
   ```yaml
   terminalSetId: UuidValue, relation(parent=terminal_set, onDelete=Restrict)
   ```
3. Запустить:
   ```bash
   codegen generate-entity \
     --yaml weight_server/lib/src/models/weighing/weighing.spy.yaml \
     --feature-path weight_flutter/lib/features/weighing \
     --workspace <monorepo root>
   ```
4. `flutter analyze` → 4 ошибки.

## Что пропатчено ✅

- `weighing_endpoint.dart` (server) — метод `getWeighingsByTerminalSetId` добавлен
- `weighing_remote_data_source.dart` (Flutter remote) — добавлен + вызывает `_client.weighing.getWeighingsByTerminalSetId(...)`
- `weighing_usecases.dart` — класс `GetWeighingsByTerminalSetIdUseCase` добавлен
- `weighing_local_datasource_service.dart` (abstract interface local) — добавлен метод в секцию `oneToManyMethods`

## Что пропущено ❌

- `weighing_local_data_source.dart` (impl) — **нет** `@override getWeighingsByTerminalSetId(...)` → `non_abstract_class_inherits_abstract_member`
- `weighing_dao.dart` — **нет** `getWeighingsByTerminalSetId(...)` → сопряжённый метод недоступен для impl
- `weighing_repository.dart` (abstract) — **нет** метода в контракте
- `weighing_repository_impl.dart` — **нет** реализации метода → `undefined_method` при вызове из usecase

## Ожидаемое поведение

Все 4 слоя должны получить новый `ByTerminalSetId` метод симметрично существующим one-to-many (`ByContractorId`, `ByVehicleId` и пр.). Т.е. каждый раз когда `generate-entity` находит новый `relation(parent=X)` в YAML существующей сущности — должна пройти идемпотентная вставка нового блока `@override Future<List<Model>> getXxxByYId(...) { ... }` в соответствующие файлы.

## Текущий обходной путь

Руками скопировать блок для самого первого relation (например `getWeighingsByContractorId`) в 4 пропущенных файла, заменить `Contractor` → `TerminalSet`, `contractorId` → `terminalSetId`, `contractor_id` → `terminal_set_id`. Работает т.к. паттерн в файлах уже присутствует для других one-to-many и симметричен.

## Гипотеза о причине

- Секция `// === generated_start:oneToManyMethods === … // === generated_end:oneToManyMethods ===` в `*_local_datasource_service.dart` (abstract) **повторяется для каждого relation** — codegen умеет добавлять новый блок рядом с существующими.
- В `weighing_local_data_source.dart` (impl), `weighing_dao.dart`, `weighing_repository.dart`, `weighing_repository_impl.dart` — такая же секционная структура должна быть, но, судя по поведению, codegen не находит в этих файлах "шаблон следующего relation" и не вставляет новый блок (или вставка условна на какое-то поле, которое для нового relation не триггерится).

Стоит проверить:
1. Сравнить секции-маркеры в `*_local_data_source.dart` / `*_dao.dart` / `*_repository_impl.dart` / `*_repository.dart` с теми что в `*_local_datasource_service.dart` — возможно, маркеры другие / отсутствуют для some слоёв.
2. Логика `relation_patcher.ts` / `section_generators.ts`: вероятно, она обрабатывает только `features/` `remote_data_source.dart` + `usecases.dart` + interface-файл, но не impl/dao/repo.

## Параллельно обнаружено (не баг, но заметка)

UI-код (`weighing_form.dart`, `weighing_dashboard_page.dart`, формы, widget-тесты, фабрики в `test/helpers/`) codegen **никогда не патчит** — он вне секций-маркеров. Любое изменение required fields в YAML → ручная правка всех мест, где создаётся `<Entity>(...)` или `<Entity>Entity(...)`. Это не баг, но стоит задокументировать в user_guide.md / agent_memory.md целевых проектов как шаг после YAML-правки.

## Update 2026-04-22 — более широкая проблема regen на existing feature

По мере лечения BUG-003 вскрылись дополнительные регрессии при `generate-entity` на уже сгенерированную фичу:

### Перезаписываемые секции содержат кастомный код

Маркеры `// === generated_start:base === … // === generated_end:base ===` охватывают ОГРОМНЫЕ куски логики (весь `handleSyncEvent`, весь `createWeighing` в remote_data_source, весь `toServerpodWeighing` mapping). Эти секции **перезаписываются полностью**, включая любую ручную кастомизацию, которая была добавлена внутри маркеров:

1. **C1-guard в `handleSyncEvent`** (защита от перезаписи несинхронизированных локальных правок, часть sync engine ADR-0008/0011) — стёрт, заменён стандартным `insertOrUpdateFromServer(event.weighing!, SyncStatus.synced)` без проверки `localRecord.syncStatus == SyncStatus.local && localRecord.lastModified.isAfter(...)`.
2. **`LoggerService` в `remote_data_source`** — заменён на `print(...)` с emoji-префиксами из шаблона t115.
3. **Safe enum parser `_tryParseEnum<T>`** в `entity_extension` — заменён на `.byName(...)` (throws при unexpected value, старое поведение было forgiving).

### Последствия

Практически **нельзя запускать `generate-entity` на existing feature** без полного diff-аудита и ручного восстановления каждой стёртой кастомизации. Это эффективно блокирует любое изменение уже сгенерированной сущности.

### Текущий обходной путь (используется в TASK-007)

1. `git checkout HEAD -- <feature>` — откатить всё что codegen regen перезаписал.
2. Руками добавить новое поле в **минимальный набор** файлов с маркерами:
   - `<entity>.dart` (freezed `:freezedConstructor`)
   - `<model>.dart` (freezed `:freezedConstructor`)
   - `<entity>_table.dart` (Drift `:driftTableColumns`)
   - `<entity>_extension.dart` (`:simpleFields`, `:entityToServerpodParams`)
   - `<model>_extension.dart` (`:simpleFields`, `:valueWrappedFieldsModel`, `:serverpodToModelParams`)
   - `<table>_extension.dart` (`:simpleFields`, `:valueWrappedFields`)
3. **НЕ** добавлять `getBy<NewRelation>Id` методы в dao/local/repo_impl/repo_abstract — если они не нужны для текущего UI. Интерфейсы не требуют метод, код компилируется.
4. Bump `schemaVersion` в `database.dart` + руками дописать `addColumn` миграцию для existing таблицы (codegen ни создания миграции, ни bump version не делает).
5. build_runner → freezed/drift регенерят `.g.dart` / `.freezed.dart`.

### Рекомендация (расширенная)

- **Краткосрочно (высокий приоритет):** сузить секции-маркеры. Вместо одного `:base` на весь класс — маркеры per-метод (`:handleSyncEvent`, `:createWeighing` и т.д.), чтобы codegen перезаписывал только тот конкретный метод, который поменялся из-за YAML, а не всё подряд. Плюс добавить в CLI output warning когда regen detects что в `base` секции есть код, не совпадающий с шаблоном t115 — "handwritten customization detected, aborting regen of section X".
- **Альтернатива:** запретить `generate-entity` на existing feature вообще; новую relation-колонку добавлять только через специальный `patch-entity --add-field <name>:<type>` который трогает только freezed constructor + drift column + 3 mapping extension. Без `base` секций.
- **Долгосрочно:** доработать `relation_patcher` чтобы затрагивать все 4 слоя симметрично (dao, local_data_source, repository_impl, repository_abstract), **без** перезаписи других методов этих файлов. Это предусловие для того чтобы regen был безопасным.

### Параллельно обнаружено (не баг, но заметка)

## Затронутый коммит

Ветка `feature/TASK-007-domain-yaml-models` в `G:/Projects/Flutter/serverpod/weight`. Файлы после ручной правки:
- `weight_flutter/lib/features/weighing/data/datasources/local/datasources/weighing_local_data_source.dart` (+ метод)
- `weight_flutter/lib/features/weighing/data/datasources/local/daos/weighing/weighing_dao.dart` (+ метод)
- `weight_flutter/lib/features/weighing/data/repositories/weighing_repository_impl.dart` (+ метод)
- `weight_flutter/lib/features/weighing/domain/repositories/weighing_repository.dart` (+ контракт)
