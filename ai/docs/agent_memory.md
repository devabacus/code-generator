# Память агентов

Операционные факты для AI-агентов.
**Агенты ОБЯЗАНЫ читать этот файл при каждой сессии.**

**Последнее обновление:** 2026-04-18

---

## Факты о проекте

### Что это

VS Code расширение + CLI `codegen` для генерации Serverpod/Flutter монорепо и микросервисов (Python/Node/Go). Основное использование — генерация feature-слоёв по Clean Architecture из Serverpod YAML-моделей.

### Архитектура

- `src/adapters/cli/` — CLI-адаптер (entry: `out/adapters/cli/index.js`, bin: `codegen`)
- `src/adapters/vscode/` — VS Code-адаптер (entry: `out/adapters/vscode/extension.js`, main)
- `src/core/` — доменная логика БЕЗ зависимости от vscode (commands пусты после рефакторинга, registry, services, interfaces, utils)
- `src/features/generation/` — генерация entity из YAML (code_formatter, section_generators, replacing_file_processor, parsers)
- `src/modules/{flutter,go,node,python}/` — реализации `MicroserviceLanguage` для каждого языка

vscode используется через lazy `require('vscode')` в shared utils (`terminal_handle.ts`, `service_locator.ts`, `git_init.ts`, workflow modifiers) — CLI падает в fallback без vscode API.

### Шаблон проекта

- Основной шаблон: `G:/Templates/flutter/t115/` — **жёстко зашит** в [create_new_project.ts:36](../../src/adapters/vscode/commands/create_new_project.ts#L36) и [create_project.ts:44](../../src/adapters/cli/commands/create_project.ts#L44) (дефолт `--templ-project t115`)
- Структура: `t115_server/` (Serverpod), `t115_flutter/` (клиент), `t115_admin/`, `t115_client/` (генерируемый client), `t115_{python,node,go}/` (микросервисы)
- Путь конфигурируется через `codeGenerator.templatesPath` (default `G:/Templates`)

### Manifest-система и маркеры

- `# manifest: startProject` — корневые файлы для копирования при `create-project`
- `# manifest: entity` (в `table.dart`) — для entity-генерации
- `// === generated_start:<section> ===` / `// === generated_end:<section> ===` — вставляемые блоки (`driftTableImports`, `driftTableColumns` и т.д.) — правятся через `replacing_file_processor.ts`

### Sync-паттерн в шаблоне

Каждая сущность имеет парный `*_sync_event.spy.yaml` + базовый `base_sync_repository.dart` + `sync_controller_provider` + `sync_registry`. Это offline-first sync (Drift локально + Serverpod remote).

### Обязательные поля entity YAML

`userId`, `customerId`, `isDeleted`, `lastModified` — ожидаются генератором. Пример: `task.spy.yaml`.

### CLI

- 10 команд, commander-based — **верифицирован и работает** (2026-04-18)
- Все команды выводят **JSON в stdout** (default) или human-readable с `--human`
- Логи и прогресс — в **stderr**
- Запуск: `node out/adapters/cli/index.js <command>` или `npm run cli -- <command>`
- Тестовый прогон: `create-project --name t139 --human` отработал за 193 сек, создал валидное монорепо (t139_server, _flutter, _admin, _client в `G:/Projects/Flutter/serverpod/t139/`)

### Тестовое покрытие (важно!)

- **Есть тесты:** `openapi_parser`, `python_endpoint_generator`, `template_service`, `mock_file_system` (использовать как источник моков)
- **НЕТ тестов:** entity-генератор (`code_formatter`, `server_yaml_parser`, `relation_generation`, `app_database_generator`), workflow-модули, CLI-команды, `project_creator.ts`
- Запуск: `npm test` (vscode-test)
- TASK-004 в roadmap — расширение покрытия

---

## Gotchas / Подводные камни

### Windows

- CLI `child_process.exec` ОБЯЗАТЕЛЬНО использует `shell: 'powershell.exe'` на Windows ([core/utils/exec.ts](../../src/core/utils/exec.ts)). Иначе `serverpod.bat`, `flutter.bat`, `gh.exe` не находятся из bash.
- PowerShell требует `;` вместо `&&` для цепочки команд
- Путь к bat-файлам в PATH — только PowerShell и cmd их резолвят, bash из Claude Code — нет

### VS Code TS Server

- VS Code может использовать встроенный TypeScript вместо локального 5.9.3 → ошибки типа `TS2591 Cannot find name 'path'` в IDE при том, что `tsc` проходит чисто
- Фикс: `.vscode/settings.json` → `"typescript.tsdk": "node_modules/typescript/lib"` + `Ctrl+Shift+P → Select TypeScript Version → Use Workspace Version`
- Подробно: [troubleshooting.md](troubleshooting.md)

### Генератор

- `isEnum` определяется как: НЕ built-in Dart-тип и НЕ relation → enum
- `valueWrappedFields` — для Serverpod→Drift (enum `.name`)
- `valueWrappedFieldsModel` — для Model→Drift (без конвертации)
- `serverpodToModelParams` — Serverpod→Model (enum `.name`, relation `.toString()`)
- `entityToServerpodParams` — Entity→Serverpod (enum `.values.byName()`, relation `UuidValue.fromString()`)

### Не рерунить длительные CLI-генераторы

- После `create-project` (~3 мин) проверять результат через `ls`/Read, НЕ перезапускать команду «посмотреть лог»
- Исключение: команда явно упала с ошибкой

---

## Предпочтения User

- **Язык:** русский для коммуникаций, технические термины на английском
- **Git:** коммиты ТОЛЬКО когда User явно сказал "коммить"/"закоммить". Сообщения на русском, Conventional Commits, БЕЗ `Co-Authored-By`
- **Без костылей:** если нет правильного решения — сказать честно, предложить варианты
- **Decoupling:** vscode-зависимости ТОЛЬКО в `src/adapters/vscode/`. CLI/core не импортируют `vscode`

---

## Технические заметки

- `src/core/commands/` и все папки `src/modules/*/commands/`, `src/features/generation/commands/` удалены (коммит `cece8a5`) — перенесены в `src/adapters/vscode/commands/`
- `add_microservice_legacy.ts` удалён; фичи standalone-режима (gitInit + CI/CD prompt через Terraform + открытие нового окна VS Code) перенесены в `project_creator.ts` в ветке `!isMonorepo`
- `add_*_project.ts` (per-language add commands) удалены — полностью покрыты unified `addMicroservice` с `pickLanguage` → `pickTemplate`
- Все 11 команд VS Code регистрируются напрямую в [extension.ts](../../src/adapters/vscode/extension.ts) (больше не через `modules/*_index.ts`)
- `antigravity -g "<path>"` заменено на `code "<path>"` во всех 3 местах (create_new_project, export_microservice, и бывший legacy — уже удалён)

---

## Типовые проблемы и решения

### Executor вышел за scope

→ TeamLead просит откатить изменения вне scope

### Агент "забыл" правила

→ "Перечитай docs/conventions.md"

### Задача слишком большая (> 500 строк)

→ TeamLead разбивает на подзадачи

### Потерялся контекст

→ "Прочитай docs/status.md и docs/agent_memory.md"

### Ошибка `Cannot find name 'path'` в VS Code

→ Установить workspace TypeScript. См. [troubleshooting.md](troubleshooting.md)

### Команда не найдена при вызове из Command Palette

→ Проверить, что есть и декларация в `package.json#contributes.commands` И регистрация через `commands.registerCommand(...)` в `extension.ts`. Обе части обязательны.
