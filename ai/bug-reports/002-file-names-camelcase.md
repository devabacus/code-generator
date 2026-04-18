# BUG-002: Имена файлов в camelCase вместо lower_case_with_underscores

**Статус:** Open
**Обнаружено:** 2026-04-18
**Источник:** проект weight (Flutter), `dart analyze`
**Затронутые сущности:** все с составными именами (`CargoType`, `CorrectionButton`, `CustomField`, `WeighingCorrection`, `WeighingPhoto`)

## Симптом

`dart analyze` выдаёт десятки `info` замечаний типа:

```
info - lib\features\weighing\data\models\correctionButton\correctionButton_model.dart:1:1
  The file name 'correctionButton_model.dart' isn't a lower_case_with_underscores identifier.
  Try changing the name to follow the lower_case_with_underscores style.
  — file_names
```

Примеры всех некорректных имён, генерируемых для `CorrectionButton`:
- `correctionButton_dao.dart`
- `correctionButton_data_providers.dart`
- `correctionButton_entity.dart`
- `correctionButton_entity_extension.dart`
- `correctionButton_get_by_id_provider.dart`
- `correctionButton_local_data_source.dart`
- `correctionButton_local_datasource_service.dart`
- `correctionButton_model.dart`
- `correctionButton_model_extension.dart`
- `correctionButton_remote_data_source.dart`
- `correctionButton_remote_datasource_service.dart`
- `correctionButton_repository.dart`
- `correctionButton_repository_impl.dart`
- `correctionButton_state_providers.dart`
- `correctionButton_table.dart`
- `correctionButton_table_extension.dart`
- `correctionButton_usecase_providers.dart`
- `correctionButton_usecases.dart`
- Плюс папки: `correctionButton/`

**Итого ~18 файлов на сущность × количество сущностей с составными именами = десятки info-warnings.**

## Правильные имена (по Dart convention)

Стандарт Dart — `lower_case_with_underscores` для файлов и папок:
- `correction_button_dao.dart`
- `correction_button_model.dart`
- `correction_button/` (папка)

Для одинарных имён (`Contractor`, `Driver`, `Vehicle`, `Weighing`) генератор работает корректно, потому что совпадает с lowercase.

## Причина

Предположительно генератор преобразует `ClassName` → имя файла через `toLowerCase()[0] + rest`, то есть `CorrectionButton` → `correctionButton`. Нужен `camelToSnake` / `toSnakeCase`:
- `CorrectionButton` → `correction_button`
- `CargoType` → `cargo_type`
- `WeighingCorrection` → `weighing_correction`

## Как фиксить

В генераторе найти функцию, формирующую имена файлов/папок из YAML `class:` поля и заменить на snake_case преобразование:

```ts
// было (предположительно):
const fileName = className.charAt(0).toLowerCase() + className.slice(1);

// надо:
const fileName = className.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
```

Места применения:
- Имена генерируемых `.dart` файлов (DAO, entity, model, repository, data_source, providers, usecase, table, extension)
- Имена папок (`entities/<name>/`, `providers/<name>/`, `daos/<name>/`, `models/<name>/`)
- Возможно строки в импортах — нужно проверить что импорты тоже перестроились после фикса

## Миграция existing проектов

После фикса генератора придётся переименовать уже существующие файлы в проекте. Это:
- Массовое `git mv correctionButton_xxx.dart correction_button_xxx.dart`
- Правка всех `import` на новые пути
- Regeneration `.g.dart` / `.freezed.dart`
- Обновление маркеров `// === generated_start ===` если они опираются на имена

Можно сделать скриптом автоматически. В генераторе добавить флаг `--rename-existing` или выполнить один раз отдельным мигратор-скриптом.

## Workaround (пока не починено)

Ничего не делать — `info`-замечания не ломают сборку. Просто захламляют `dart analyze`, мешают находить **настоящие** проблемы. В проекте weight уже ~60+ info на это и растёт с каждой новой сущностью.

Альтернативный workaround: добавить в `analysis_options.yaml` правило:
```yaml
analyzer:
  errors:
    file_names: ignore
```
Но это глушит правильную проверку по всему проекту, не только для generated кода. Лучше чинить генератор.

## Затронутые проекты

- weight (Flutter) — 5 сущностей с составными именами генерируют ~90 файлов с плохим naming
- Потенциально все другие Flutter проекты использующие этот кодогенератор

## Приоритет

**Medium** — не блокер, но каждая новая сущность с составным именем добавляет шум в `dart analyze`. Со временем usability инструмента падает (истинные ошибки теряются среди info'шек).
