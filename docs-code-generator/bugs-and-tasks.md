# Баги и задачи генератора

## Исправленные баги (2026-03-26 — 2026-03-27)

| # | Баг | Файл | Статус |
|---|-----|------|--------|
| 1 | `??` в freezedConstructor | `code_formatter.ts` | ИСПРАВЛЕН |
| 2 | `CargotypeTable` вместо `CargoTypeTable` | `text_util.ts` | ИСПРАВЛЕН |
| 3 | `title` в provider orElse | Шаблон `category_get_by_id_provider.dart` | ИСПРАВЛЕН |
| 4 | `Cargo_type` вместо `CargoType` | `create_data_files_by_replacement.ts` | ИСПРАВЛЕН |
| 5 | Nullable relation `String` без `?` | `code_formatter.ts` | ИСПРАВЛЕН |
| 6 | Enum → String не конвертируется | `code_formatter.ts`, `relation_generation.ts` | ИСПРАВЛЕН |
| 7 | `.name` на String в model extension | `section_generators.ts` | ИСПРАВЛЕН |
| 8 | import `cargo_type_table.dart` вместо `cargoType_table.dart` | `relation_generation.ts` | ИСПРАВЛЕН |
| 9 | Дублирующие relation methods | `relation_patcher.ts` | ИСПРАВЛЕН |
| 10 | `avoid_print` warnings | Шаблоны DAO и remote datasource | ИСПРАВЛЕН |
| 11 | `unnecessary_import` flutter_riverpod | Шаблоны usecase_providers | ИСПРАВЛЕН |

## Оставшиеся задачи

> **Миграция:** задачи перенесены в `ai/tasks/` и `ai/bug-reports/`. Этот раздел — исторический срез.

### TASK-1: Написать тесты для генератора → TASK-004 в ai/roadmap
**Приоритет:** Высокий
**Статус:** 🟡 Частично — есть тесты для openapi_parser, python_endpoint_generator, template_service. Нет тестов для entity-генератора.
**Описание:** Unit-тесты для:
- `code_formatter.ts` — enum, nullable relations, составные имена
- `server_yaml_parser.ts` — парсинг isEnum, isRelation
- `relation_generation.ts` — serverpodToModelParams, entityToServerpodParams с enum
- `app_database_generator.ts` — PascalCase таблиц

### TASK-2: snake_case файлы → BUG-002 + TASK-003 в ai/
**Приоритет:** Средний
**Статус:** 🔴 Open — см. [ai/bug-reports/002-file-names-camelcase.md](../ai/bug-reports/002-file-names-camelcase.md)
**Описание:** Генератор создаёт файлы `cargoType_dao.dart` вместо `cargo_type_dao.dart`. Dart convention требует snake_case.
**Файлы:** `generation_service.ts` — при записи файла конвертировать имя в snake_case

### TASK-3: CLI для генератора → ✅ DONE
**Приоритет:** (был) Низкий
**Статус:** 🟢 Реализовано. Коммиты `7335eda` (CLI-адаптер) + `cece8a5` (чистка legacy).
**Результат:** 10 команд в `out/adapters/cli/index.js`, `bin: codegen` в `package.json`. Верифицировано (2026-04-18): `create-project --name t139 --human` создаёт валидное монорепо за ~3 мин.

---

## Заметки

- `isEnum` определяется как: не built-in тип Dart и не relation → enum
- Шаблон entity предполагает поля `userId`, `customerId`, `isDeleted`, `lastModified`, `SyncEvent`
- `valueWrappedFields` — для Serverpod→Drift (enum `.name`), `valueWrappedFieldsModel` — для Model→Drift (без конвертации)
- `serverpodToModelParams` — Serverpod→Model (enum `.name`, relation `.toString()`)
- `entityToServerpodParams` — Entity→Serverpod (enum `.values.byName()`, relation `UuidValue.fromString()`)
