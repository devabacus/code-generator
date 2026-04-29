# Память агентов

Операционные факты для AI-агентов.
**Агенты ОБЯЗАНЫ читать этот файл при каждой сессии.**

**Последнее обновление:** 2026-04-26

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

- **11 команд**, commander-based — `verify` добавлена 2026-04-26 как DoD-гейт
- Все команды выводят **JSON в stdout** (default) или human-readable с `--human`
- Логи и прогресс — в **stderr**
- Запуск: `node out/adapters/cli/index.js <command>` или `npm run cli -- <command>`
- **Последний верифицированный e2e** (2026-04-26): `create-project --name t143` (~232s) → `verify --name t143` PASS errors=0/warnings=2/infos=75 → server runtime HTTP 200 → все 5 sync-таблиц в Postgres присутствуют

### Тестовое покрытие (важно!)

- **Есть тесты (62 passing на 2026-04-26):** `openapi_parser`, `python_endpoint_generator`, `template_service`, `mock_file_system` (использовать как источник моков), `relation_patcher` (TASK-008), `entity_yaml_validator` (TASK-009), `replacement_util` (BUG-002), `app_database_generator` (5 кейсов: scan-based / deleted feature cleanup / camelCase rejection / idempotency / .g.dart filter / migration append BUG-006), `verify_analyzer_parser`
- **НЕТ тестов:** `code_formatter`, `server_yaml_parser`, workflow-модули, остальные CLI-команды, `project_creator.ts`
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

### relation_patcher (после TASK-008, 2026-04-25)

- Один marker-блок `:oneToManyMethods` на файл — все relation-методы внутри.
- Patcher идемпотентный: повторный gen с тем же YAML → identical content; добавление relation в YAML → новый метод во всех 8 слоях (endpoint, remote_data_source, usecases, local_datasource_service, local_data_source, dao, repository, repository_impl).
- Replace через `replace(blockRegexAll, callback)` — первое вхождение заменяется на свежий fullBlock, остальные удаляются (recovery от legacy-дубликатов).
- НЕ трогает `:base` секции — это отдельная архитектурная проблема (BUG-003 part 2, в backlog).

### entity_yaml_validator (после TASK-009, 2026-04-25)

- 3 hard-required поля: `userId`, `customerId`, `isDeleted`. M2M (junction `*Map`) пропускают.
- Парный `<table>_sync_event.spy.yaml` обязателен в той же директории (только для `--yaml <path>`, не для stdin).
- CLI `--skip-validation` — escape hatch.
- VS Code — диалог с двумя кнопками `Generate anyway` / `Cancel`.

### app_database_generator — scan-based (BUG-005, 2026-04-26)

- `generate()` СКАНИРУЕТ `<flutterLib>/features/*/data/datasources/local/tables/*_table.dart` (фильтруя `.g.dart`, `.freezed.dart`, не-`*_table.dart`) и собирает imports/tables-list **с нуля** на каждом вызове.
- НЕ инкрементальный — не зависит от порядка вызовов и от текущего `targetFeaturePath`.
- Migration **append-only**: `updateMigration()` добавляет новые ветки `if (from < N+1) {...}` в КОНЕЦ блока `:GENERATED_MIGRATION:` (BUG-006 fix). Раньше делал prepend → давал обратный порядок выполнения → SqliteException на Android при `from < 12`.
- `removeStaleMigrationLines` чистит `await m.createTable(<var>);` для исчезнувших таблиц + пустые `if (from < N) {}` блоки. SchemaVersion **не понижается** (миграции append-only).

### create-project — обогащённый bootstrap (после 2026-04-26)

После основной `generationService.generate(config)` команда `create-project` дополнительно делает:

1. **`autoGenerateTasksFeature`** — итерирует `t115_server/lib/src/models/tasks/*.spy.yaml` (исключая `*_sync_event.spy.yaml`), копирует все YAMLs в `<target>/lib/src/models/tasks/` и запускает `generate-entity` для Category/Tag/Task/TaskTagMap. Затем явно копирует `tasks/presentation/widgets/*.dart` (creation_section, data_display_section, relation_management_section) в `<target>/lib/features/tasks/presentation/widgets/` с применением словаря `t115 → targetProject` для package-импортов. **Без этого шага** home_page.dart (с manifest startProject) не компилируется — он импортирует `../../../tasks/presentation/widgets/...`.
2. **`patchPubspecPackagePaths`** — пост-процесс `pubspec.yaml` в `_flutter/` и `_admin/`: заменяет `path: ../../Packages/X` → `path: ../../../Packages/X`. Шаблонный путь корректен в `Templates/flutter/t115/t115_flutter/`, но в target проекте (на 1 уровень глубже из-за `serverpod/`) резолвится в несуществующий путь.

### verify CLI команда (DoD-гейт, 2026-04-26)

`codegen verify --name <project> --human` (или `--json`):

```
[1/4] dart pub get (server) + flutter pub get
[2/4] serverpod generate --experimental-features=all
[3/4] dart run build_runner build --delete-conflicting-outputs
[4/4] flutter analyze
```

Парсит analyzer output, возвращает structured JSON:
```json
{
  "success": true,
  "steps": {
    "pubGet": { "ok": true, "ms": 5515 },
    "serverpodGenerate": { "ok": true, "ms": 12566 },
    "buildRunner": { "ok": true, "ms": 5257 },
    "flutterAnalyze": { "ok": true, "ms": 6871, "counts": { "errors": 0, "warnings": 2, "infos": 75 } }
  }
}
```

Exit 0 = success, exit 1 = fail. На Windows запускает через PowerShell shell. **TASK-010 (active)** расширит до `--runtime` (docker + migrations + server start + healthcheck + integration test).

### Не рерунить длительные CLI-генераторы

- После `create-project` (~3 мин) проверять результат через `ls`/Read, НЕ перезапускать команду «посмотреть лог»
- Исключение: команда явно упала с ошибкой

### Definition of Done — `codegen verify` обязателен (после 2026-04-26)

Любая правка в `src/features/generation/`, `src/adapters/cli/commands/create_project.ts`, `src/adapters/cli/commands/generate_entity.ts` или в шаблоне `G:/Templates/flutter/t115/` НЕ считается готовой пока:

```bash
node out/adapters/cli/index.js verify --name <test_project> --human
```

вернёт `PASS` (или JSON `{ "success": true }`).

`verify` запускает: `dart pub get` (server) → `flutter pub get` → `serverpod generate` → `dart run build_runner build` → `flutter analyze`. JSON-вывод содержит `steps.flutterAnalyze.counts: { errors, warnings, infos }` — эти числа цитировать в ответе пользователю.

Флаги: `--skip-pub-get`, `--skip-serverpod`, `--skip-build-runner` для быстрых итераций (только если уверен что эти шаги не затронуты твоими изменениями).

**Запрещённые формулировки в ответе пользователю** (см. CLAUDE.md → Definition of Done): "скорее всего скомпилируется", "должно работать", "вроде готов". Только цитированные результаты verify или явное "не запускал, потому что: ...".

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

### `flutter analyze` показывает сотни errors типа `non_type_as_type_argument` / `undefined_getter` после `create-project`

→ Признак BUG-005 (закрыт 2026-04-26): пустые секции `:GENERATED_IMPORTS:` / `:GENERATED_TABLES:` в `database.dart`. Drift не сгенерил `*TableData`/`*Companion`. Проверь на свежем проекте `database.dart` — должны быть imports на все live `*_table.dart` файлы из `features/*/`. Если пусто — генератор работает по старой инкрементальной схеме (нужна пересборка `.vsix` после фикса коммита `5708072`).

### Сервер не стартует с `errno = 10048, address = ::, port = 8082`

→ Зомби `dart.exe` процесс держит порт после прошлого запуска. PowerShell:
```powershell
Get-NetTCPConnection -LocalPort 8082 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```
Бывает при остановке через `kill -9` или после crash без graceful shutdown.

### `DatabaseQueryException: password authentication failed for user "postgres"` на работающем сервере

→ Postgres контейнер потерял volume (например после `docker compose down -v` или Docker Desktop рестарта), пароль в `config/passwords.yaml` не совпадает с тем что в БД. Решение:
```powershell
cd <name>_server
docker compose down -v       # снести контейнеры + volumes
docker compose up -d          # свежий postgres с правильным паролем
dart bin/main.dart --apply-migrations
```

### Цикл итераций при правке генератора (политика 2026-04-26)

User: "если будешь чинить генератора значит создавать 142 и так далее пока все не сработает с первого раза"

→ Каждое **исправление генератора** требует свежего `create-project --name t<N+1>` + `verify --name t<N+1>` без ручных правок target-проекта. Если verify FAIL → починить генератор → `t<N+2>`. Не патчить руками target проект чтобы скрыть баг.

Реальная история ветки `feature--fix-codegen-regen-bugs`:
- `t141` → 327 errors (BUG-005: пустые секции database.dart) → fix scan-based
- `t142` → 48 errors (widgets копировались в `features/home/`, не в `features/tasks/`) → fix явное копирование widgets в autoGen
- `t143` → **PASS errors=0** + runtime HTTP 200 + все таблицы в Postgres
