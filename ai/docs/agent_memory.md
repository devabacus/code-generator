# Память агентов

Операционные факты для AI-агентов.
**Агенты ОБЯЗАНЫ читать этот файл при каждой сессии.**

**Последнее обновление:** 2026-05-02

---

## Текущее состояние (2026-05-02 snapshot)

### Phase 1.5 progress (sync_core 0.3.0 templates integration)

- ✅ **TASK-011** sync_core 0.3.0 templates integration (PR #2) — manifest markers + orchestrator_patcher + 87 tests
- ✅ **TASK-013** junction detection robust YAML field analysis (PR #3) — `JunctionDetector.isJunctionEntity()` shared utility, 4 call-sites updated, 110 tests
- ✅ **TASK-014** junction adapter file path generation для non-Map entities (PR #4) — `MANY_TO_MANY` parametrization + `_getDestinationPath` junction-aware + FK placeholders, 119 tests
- ⏭ **TASK-012** todo real app generation + cross-device smoke — последний gate перед weight TASK-018

### Active backlog

- **TASK-015** robust junction FK extraction для non-FK pseudo-keys (`userId: int` без `relation()` declaration). Trigger: weight TASK-018 если CustomerUser-style migration.
- **BUG-001** Ref disposed в state_providers (High, единственный открытый)
- **BUG-007** relation_patcher gap для template без `:oneToManyMethods` markers
- **BUG-010** `code_formatter.ts:81 field.name.includes('Map')` silent data loss landmine для fields с "Map" в имени

### Junction detection / generation (post-TASK-013/TASK-014)

**Detection** (TASK-013 — `src/features/generation/parsers/junction_detector.ts`):
- Default field analysis: 2+ FK + base-only fields = junction
- Explicit override: `junction: true` top-level YAML field
- `JunctionValidationError` если `junction:true` но FK<2
- Nullable FK = FK
- 4 call-sites: `server_yaml_parser.ts:13`, `entity_yaml_validator.ts`, `orchestrator_patcher.ts:52`, `relation_patcher.ts:32`
- Hard technical gate: НЕТ `endsWith('Map')` / `includes('Map')` в production decision paths (только legitimate JSDoc + BUG-010 deferred)

**File path generation** (TASK-014):
- `replacement_util.ts MANY_TO_MANY` parametrized — `templEntity1/templEntity2 + targetEntity1/targetEntity2 + targetJunctionClassName`
- `generation_service.ts _getDestinationPath` детектит junction context через `model.isRelation` → two-entity path rewrite (`task_tag_map/` → `<targetSnakeCase>/`, file prefix `task_tag_map_` → `<targetSnakeCase>_`)
- `orchestrator_patcher.ts _JUNCTION_REGISTER_TEMPLATE` использует `__FK1__/__FK2__` placeholders для docstring (`junction FK→role+permission`) + method names (`deleteRolePermissionByRoleAndPermission`)
- Backward compat: TaskTagMap (`task` + `tag` template defaults) → identical output (no-op substitution)

### Cross-repo blocking — current state

- **sync_core 0.3.0** в master, R3+R3.5 release ✅
- **t115/TASK-001** done (5 entities multi-entity validated) ✅
- **codegen TASK-011/013/014** done ✅
- **codegen TASK-012** pending — последний gate
- **weight TASK-018** blocked до TASK-012 acceptance ✅

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

### Sync-паттерн в шаблоне (sync_core 0.3.0, после TASK-011)

Шаблон t115 использует `sync_core` 0.3.0 — outbox-first multi-entity sync (validated cross-device на Windows + Android через t115/TASK-001 acceptance 2026-05-02). Архитектура:

- **`lib/core/sync/`** — 5 source файлов (manifest: startProject): `app_lifecycle_provider`, `device_id_provider`, `drift_sync_queue_store`, `sync_orchestrator_provider`, `sync_queue_table`
- **Per-entity adapters** — 5 файлов на сущность в `lib/features/<feature>/data/adapters/<entity>/`:
  `*_remote_adapter.dart` (SyncRemoteWriteAdapter), `*_pull_adapter.dart` (SyncRemotePullAdapter),
  `*_event_adapter.dart` (SyncRemoteEventAdapter), `*_payload_codec.dart`, `*_local_apply.dart`
- **Configuration baseline** (manifest: startProject) — singleton сущность, копируется как есть в свежий проект
- **Tasks reference** (manifest: entity / manyToMany) — Category/Task/Tag (regular) + TaskTagMap (junction) — генерируются через `generate-entity` + парный `*_sync_event.spy.yaml`
- **Mutation-first Repository** — `_db.transaction { dao.insert + orchestrator.enqueue }` через manifest: entity (валидировано в Phase 2c/d t115/TASK-001)

Orchestrator wire-up (`sync_orchestrator_provider.dart`) патчится автоматически через `OrchestratorPatcher` (3 marker блока: `:syncImports`, `:syncEntityTypes`, `:syncRegistrations`). Junction (`*Map` className) routing через docstring + manifest: manyToMany.

См. также:
- [docs-code-generator/sync-core-integration.md](../../docs-code-generator/sync-core-integration.md) — детальное описание + YAML requirements + limitations
- sync_core conventions.md Pattern 6/7 — multi-entity registration + junction patterns
- sync_core ADR-0004 — multi-entity runtime guidance (no lib/ changes для consumers)

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

→ Зомби `dart.exe` процесс держит порт после прошлого запуска. Бывает при остановке через `kill -9` или после crash без graceful shutdown.

**⚠ PowerShell tool broken (2026-05-02 verified)** — Exit 1 даже на `"hello"`. Использовать **Bash tool** с pwsh wrapper.

**Resolve (через Bash tool):**

```bash
# Найти процесс на порту 8082:
pwsh -NoProfile -Command "Get-NetTCPConnection -LocalPort 8082 -State Listen -ErrorAction SilentlyContinue | Select-Object OwningProcess"

# Убить dart.exe процессы:
pwsh -NoProfile -Command "Stop-Process -Name dart -Force -ErrorAction SilentlyContinue"

# Или одной командой (kill всех dart на порту):
pwsh -NoProfile -Command "Get-NetTCPConnection -LocalPort 8082 -State Listen | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force }"
```

**НЕ использовать** `tasklist /FI` через Bash — Git Bash path-translation ломает `/FI` → `C:/Program Files/Git/FI`. Через pwsh -Command — clean.

Если порт другой (8181, 8000) — заменить `8082` в команде.

### `DatabaseQueryException: password authentication failed for user "postgres"` на работающем сервере

→ Postgres контейнер потерял volume (например после `docker compose down -v` или Docker Desktop рестарта), пароль в `config/passwords.yaml` не совпадает с тем что в БД. Решение:
```powershell
cd <name>_server
docker compose down -v       # снести контейнеры + volumes
docker compose up -d          # свежий postgres с правильным паролем
dart bin/main.dart --apply-migrations
```

### Цикл итераций при правке генератора (политика 2026-04-26 + 2026-05-02 update)

User: "если будешь чинить генератора значит создавать 142 и так далее пока все не сработает с первого раза"

→ Каждое **исправление генератора** требует свежего `create-project --name t<N+1>` + `verify --name t<N+1>` без ручных правок target-проекта. Если verify FAIL → починить генератор → `t<N+2>`. Не патчить руками target проект чтобы скрыть баг.

**Update 2026-05-02 — агент НЕ удаляет test-проекты.** Sandbox блокирует `rm -rf` для `G:/Projects/Flutter/serverpod/t<N>/` — это ожидаемо. Агент **никогда не workaround'ит через PowerShell `Remove-Item -Force`** или подобное. При failed `t<N>` агент **просто использует `t<N+1>`** и оставляет broken проект на disk — User удалит сам когда сочтёт нужным. Это касается всех TASK-XXX где есть `create-project`.

Реальная история ветки `feature--fix-codegen-regen-bugs`:
- `t141` → 327 errors (BUG-005: пустые секции database.dart) → fix scan-based
- `t142` → 48 errors (widgets копировались в `features/home/`, не в `features/tasks/`) → fix явное копирование widgets в autoGen
- `t143` → **PASS errors=0** + runtime HTTP 200 + все таблицы в Postgres

TASK-011 (2026-05-02):
- `t150` → broken (post-F0 orchestrator state mismatch) → variant A rollback
- `t151` → 170 errors (новый блокер AppDatabaseGenerator теряет SyncQueueTable import + table) → t152 после root cause fix
