# Баги и задачи генератора

> **⚠ АРХИВ (сверка 2026-07-21, TASK-038).** Документ — исторический срез 2026-03-26 —
> 2026-03-27, предшествующий переезду трекинга в `ai/`. Каждая запись ниже помечена
> вердиктом triage (закрыто / открыто / устарело / unclear) по итогам сверки с текущим
> состоянием репозитория. Живые хвосты перенесены в
> [`ai/project/tasks/backlog.md`](../ai/project/tasks/backlog.md). Документ не удалён и не
> переписан — только добавлены пометки вердиктов и эта шапка. Детали triage:
> [`ai/project/tasks/active/TASK-038-.../report.md`](../ai/project/tasks/active/TASK-038-triage-docs-code-generator-bugs-and-tasks-md---сверка-с-актуальным-состоянием/report.md).

## Исправленные баги (2026-03-26 — 2026-03-27)

| # | Баг | Файл | Статус (2026-03) | Вердикт triage (2026-07-21) |
| --- | --- | --- | --- | --- |
| 1 | `??` в freezedConstructor | `code_formatter.ts` | ИСПРАВЛЕН | **unclear** — запись предшествует `ai/`-трекингу (нет bug-report/TASK/коммита с атрибуцией); текущий `code_formatter.ts` не содержит очевидного `??`-паттерна, но подтвердить именно этот фикс артефактом не удалось. |
| 2 | `CargotypeTable` вместо `CargoTypeTable` | `text_util.ts` | ИСПРАВЛЕН | **закрыто** — casing multi-word entity накрыт [BUG-002](../ai/project/bug-reports/002-file-names-camelcase.md) (Resolved 2026-04-25, TASK-008/relation_patcher + replacement_util), тесты `src/test/utils/text_util.test.ts`, `src/test/replacement/replacement_util.test.ts`. Текущий `toPascalCase`/`toSnakeCase` в `src/utils/text_work/text_util.ts` корректны. |
| 3 | `title` в provider orElse | Шаблон `category_get_by_id_provider.dart` | ИСПРАВЛЕН | **unclear** — файл живёт в `G:/Templates/flutter/t115/` (вне этого репо, deprecated path), git-историю шаблона проверить в рамках docs-only triage кода-генератора не входит в scope; артефакта в `ai/project/` нет. |
| 4 | `Cargo_type` вместо `CargoType` | `create_data_files_by_replacement.ts` | ИСПРАВЛЕН | **закрыто** — та же casing-проблема, что и #2, накрыта [BUG-002](../ai/project/bug-reports/002-file-names-camelcase.md) fix в `replacement_util.ts`/`generation_service.ts`. |
| 5 | Nullable relation `String` без `?` | `code_formatter.ts` | ИСПРАВЛЕН | **unclear** — текущий `formatRequiredTypeFields` в `code_formatter.ts` содержит корректную `field.nullable ? 'String?' : 'String'` логику, но нет bug-report/TASK/теста, атрибутирующего именно этот фикс — не удалось отличить «всегда так было» от «пофиксили и это тот самый фикс». |
| 6 | Enum → String не конвертируется | `code_formatter.ts`, `relation_generation.ts` | ИСПРАВЛЕН | **unclear** — текущий код (`isEnum` → `String`/`String?` в `code_formatter.ts`) конвертирует корректно, но это НЕ то же самое, что [BUG-022](../ai/project/bug-reports/022-enum-byname-state-error.md)/TASK-027 (graceful `tryParseEnum`, другая проблема — runtime `byName` throw). Артефакта на исходный баг #6 не найдено. |
| 7 | `.name` на String в model extension | `section_generators.ts` | ИСПРАВЛЕН | **unclear** — файл `section_generators.ts` существует, но нет bug-report/TASK/теста с атрибуцией конкретно этого фикса. |
| 8 | import `cargo_type_table.dart` вместо `cargoType_table.dart` | `relation_generation.ts` | ИСПРАВЛЕН | **unclear** — вероятно та же casing-семья, что BUG-002, но BUG-002 resolution явно называет другие файлы (`replacement_util.ts`, `generation_service.ts`, `relation_patcher.ts`, `app_database_generator.ts`), не `relation_generation.ts` — прямого совпадения нет, дотягивать догадкой запрещено правилом. |
| 9 | Дублирующие relation methods | `relation_patcher.ts` | ИСПРАВЛЕН | **закрыто** — [BUG-003](../ai/project/bug-reports/003-new-relation-not-patched-in-existing-feature.md)/TASK-008 resolution явно фиксирует idempotent single-pass patcher + "recovery от legacy-дубликатов... схлопываются в одну". |
| 10 | `avoid_print` warnings | Шаблоны DAO и remote datasource | ИСПРАВЛЕН | **unclear** — шаблонные файлы вне этого репо (`G:/Templates/flutter/t115/`), нет артефакта в `ai/project/`, вне scope этого triage для глубокой проверки. |
| 11 | `unnecessary_import` flutter_riverpod | Шаблоны usecase_providers | ИСПРАВЛЕН | **unclear** — то же самое: шаблон вне репо, нет атрибутирующего артефакта. |

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

**Вердикт triage (2026-07-21): закрыто.** Актуальный `src/test/**` (315 passing) содержит:
`src/test/generators/code_formatter_fields_filter.test.ts` (code_formatter),
`src/test/parsers/server_yaml_parser.test.ts` (22 упоминания isEnum/isRelation),
`src/test/generators/relation_generation.test.ts`,
`src/test/generators/app_database_generator.test.ts` (107 упоминаний PascalCase/table/entityType).
Все 4 перечисленных файла имеют выделенные test-файлы — исходный gap закрыт (пусть и не через
единую TASK-004, а инкрементально по мере багфиксов TASK-008/012/016/017/023/027/034/035 и др.).

### TASK-2: snake_case файлы → BUG-002 + TASK-003 в ai/
**Приоритет:** Средний
**Статус:** 🔴 Open — см. [ai/project/bug-reports/002-file-names-camelcase.md](../ai/project/bug-reports/002-file-names-camelcase.md)
**Описание:** Генератор создаёт файлы `cargoType_dao.dart` вместо `cargo_type_dao.dart`. Dart convention требует snake_case.
**Файлы:** `generation_service.ts` — при записи файла конвертировать имя в snake_case

**Вердикт triage (2026-07-21): закрыто.** [BUG-002](../ai/project/bug-reports/002-file-names-camelcase.md)
статус Resolved (2026-04-25, ветка `feature--fix-codegen-regen-bugs`) — фикс в
`replacement_util.ts` (snake_case lookahead-правило), `generation_service.ts` и
`relation_patcher.ts` (`_getDestinationPath` через `toSnakeCase(unCap(...))`),
`app_database_generator.ts` (stale-import cleanup). Проверено на t140:
`flutter analyze` 0 `file_names` warnings. Ссылка в исходной записи была сломана
(`../ai/bug-reports/...` → актуально `../ai/project/bug-reports/...`, поправлено выше).

### TASK-3: CLI для генератора → ✅ DONE
**Приоритет:** (был) Низкий
**Статус:** 🟢 Реализовано. Коммиты `7335eda` (CLI-адаптер) + `cece8a5` (чистка legacy).
**Результат:** 10 команд в `out/adapters/cli/index.js`, `bin: codegen` в `package.json`. Верифицировано (2026-04-18): `create-project --name t139 --human` создаёт валидное монорепо за ~3 мин.

**Вердикт triage (2026-07-21): закрыто.** Коммиты `7335eda` и `cece8a5` подтверждены в
`git log` (17/18 апреля 2026, `refactor: разделение на адаптеры cli/vscode...` +
`refactor: удаление мёртвого кода...`). CLI `codegen` продолжает существовать и
развиваться (`src/adapters/cli/**`, актуально >10 команд, см. CLAUDE.md).

---

## Заметки

- `isEnum` определяется как: не built-in тип Dart и не relation → enum
- Шаблон entity предполагает поля `userId`, `customerId`, `isDeleted`, `lastModified`, `SyncEvent`
- `valueWrappedFields` — для Serverpod→Drift (enum `.name`), `valueWrappedFieldsModel` — для Model→Drift (без конвертации)
- `serverpodToModelParams` — Serverpod→Model (enum `.name`, relation `.toString()`)
- `entityToServerpodParams` — Entity→Serverpod (enum `.values.byName()`, relation `UuidValue.fromString()`)
