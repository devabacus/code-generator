# Баги и задачи генератора

## Баги (найдены 2026-03-26)

### BUG-1: Двойной `??` в freezedConstructor — ИСПРАВЛЕН
**Файл:** `src/features/generation/parsers/formatters/code_formatter.ts`
**Симптом:** Генерирует `String?? code` вместо `String? code`
**Причина:** `formatRequiredTypeFields()` — строка 20 добавляет `?` к типу, строка 30 добавляет ещё один `?`
**Решение:** Убрать дублирующий `?` из строки 30 (nullable ветка)
**Статус:** ИСПРАВЛЕН

### BUG-2: `CargotypeTable` вместо `CargoTypeTable` в database.dart
**Файл:** `src/features/generation/generators/app_database_generator.ts`
**Симптом:** При составных именах (cargo_type → CargoType) в database.dart генерируется `CargotypeTable` вместо `CargoTypeTable`
**Причина:** `AppDatabaseGenerator` неправильно форматирует PascalCase для составных имён. Вероятно используется `cap()` которая делает только первую букву заглавной, а не `snakeToPascalCase()`
**Решение:** Использовать `snakeToPascalCase()` для имён таблиц в database.dart

### BUG-3: `title` захардкожено в provider шаблоне
**Файл:** Шаблон `t115_flutter/lib/features/tasks/presentation/providers/category/category_get_by_id_provider.dart`
**Симптом:** Генерирует `title: entity.title` но у CargoType нет поля `title`, есть `name`
**Причина:** В шаблоне `category_get_by_id_provider.dart` поле `title` захардкожено, не генерируется из модели
**Решение:** Либо убрать захардкоженное поле из шаблона, либо добавить секцию `generated_start` для полей в provider

### BUG-4: snakeToCamelCase для targetEntity — ИСПРАВЛЕН
**Файл:** `src/features/generation/commands/create_data_files_by_replacement.ts`
**Симптом:** `Category` заменяется на `Cargo_type` (со snake_case) вместо `CargoType`
**Причина:** `targetEntity: model.tableName` использовал snake_case из YAML `table:` поля
**Решение:** Добавлена функция `snakeToCamelCase()`, `targetEntity: snakeToCamelCase(model.tableName)`
**Статус:** ИСПРАВЛЕН

---

## Задачи

### TASK-1: Написать тесты для генератора
**Приоритет:** Высокий
**Описание:** Написать unit-тесты для ключевых компонентов:
- `code_formatter.ts` — `formatRequiredTypeFields()`, `formatClassFields()`, `formatSimpleFields()`
- `replacement_util.ts` — проверка замен для составных имён (cargoType, customField и т.д.)
- `app_database_generator.ts` — проверка генерации database.dart с правильными именами таблиц
- `server_yaml_parser.ts` — парсинг YAML с составными именами и relations

**Тестовые кейсы:**
```
1. category (простое имя) → Category, categories, CategoryEndpoint
2. cargo_type (составное) → CargoType, cargoTypes, CargoTypeEndpoint
3. custom_field_value (тройное) → CustomFieldValue, customFieldValues
4. task_tag_map (manyToMany) → правильные имена обеих сущностей
```

### TASK-2: Починить BUG-2 (CargotypeTable)
**Приоритет:** Высокий
**Описание:** В `app_database_generator.ts` найти где формируется имя таблицы для database.dart и заменить на `snakeToPascalCase()`
**Файлы:** `src/features/generation/generators/app_database_generator.ts`

### TASK-3: Починить BUG-3 (title в provider)
**Приоритет:** Средний
**Описание:** В шаблоне `category_get_by_id_provider.dart` заменить захардкоженное поле `title` на генерируемую секцию, или убрать его
**Файлы:** Шаблон в `G:\Templates\flutter\t115\t115_flutter\`

### TASK-4: CLI для генератора
**Приоритет:** Низкий
**Описание:** Создать standalone CLI (`cli.ts`) для запуска генерации без VS Code. Позволит AI-агентам вызывать генератор из терминала.
**Проблемы:**
- `ServiceLocator` импортирует `vscode`
- `DefaultFileSystem` тянет `terminal_handle.ts` → `vscode`
- Нужен `CliFileSystem` без VS Code зависимостей
- Нужен отдельный tsconfig для CLI (без VS Code типов)

### TASK-5: Валидация составных имён
**Приоритет:** Низкий
**Описание:** Добавить предупреждение или автоматическую конвертацию когда `tableName` содержит `_` (составное имя). Генератор должен корректно обрабатывать:
- `cargo_type` → class `CargoType`, table `cargo_type`, variable `cargoType`
- Все замены (Ds, ds, D, d) должны работать правильно

---

## Заметки

- Шаблон entity (`category_endpoint.dart`) предполагает поля `userId`, `customerId`, `isDeleted`, `lastModified`, `SyncEvent`
- Составные имена (snake_case с `_`) требуют camelCase конвертацию перед передачей в генератор
- `cap()` делает только первую букву заглавной, `snakeToPascalCase()` конвертирует `cargo_type` → `CargoType`
