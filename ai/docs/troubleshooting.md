# Решение проблем

## Executor заблокирован

**Симптом:** Executor не может продолжить работу.

**Решение:**

1. Executor заполняет `report.md` со статусом `BLOCKED`
2. TeamLead анализирует причину
3. Если нужно архитектурное решение → Дискуссия → ADR
4. Если нужен User → эскалация к User

---

## Агент "забыл" контекст

**Симптом:** Агент делает то, что противоречит правилам или архитектуре.

**Решение:**

```
Перечитай:
- docs/conventions.md
- docs/architecture.md
- docs/agent_memory.md
```

---

## Задача слишком большая

**Симптом:** Задача требует > 500 строк изменений.

**Решение:**

- TeamLead разбивает на подзадачи
- Каждая подзадача = отдельный TASK-XXX

---

## Конфликт в git

**Симптом:** Не можете сделать merge.

**Решение:**

1. `git fetch origin`
2. `git rebase origin/dev` (или merge)
3. Разрешите конфликты
4. Продолжите работу

---

## Непонятно какой файл редактировать

**Симптом:** Executor не понимает где находится нужный код.

**Решение:**

- Прочитай `docs/architecture.md`
- Прочитай `docs/dev_guide.md`
- Спроси TeamLead если непонятно

---

## VS Code: `Cannot find name 'path'` (TS2591) при работающем `tsc`

**Симптом:**
VS Code подчёркивает `import path from "path";` ошибкой TS2591 "Cannot find name 'path'. Do you need to install type definitions for node?". При этом `npm run compile` / `npx tsc -p ./` проходит без ошибок, `@types/node` установлен. Перезапуск TS Server и Reload Window не помогают.

**Причина:**
VS Code использует **встроенный** TypeScript (bundled), а в проекте стоит более новая локальная версия (`typescript@5.9.3` в `node_modules`). Встроенный TS Server может отставать и некорректно резолвить типы Node при `"module": "Node16"`. CLI `tsc` работает из `node_modules/.bin/tsc` — отсюда расхождение.

**Решение:**
В `.vscode/settings.json`:
```json
{
    "typescript.tsdk": "node_modules/typescript/lib"
}
```
Затем в VS Code:
1. `Ctrl+Shift+P` → `TypeScript: Select TypeScript Version` → `Use Workspace Version`
2. Или `Developer: Reload Window`

В правом нижнем углу должна появиться версия TypeScript 5.9.3 (workspace), не встроенная.

См. также: [docs-code-generator/troubleshooting.md](../../docs-code-generator/troubleshooting.md) — расширенная версия той же заметки с `xxd`/`listFiles` диагностикой.

---

## Команда из package.json не работает: `command '...' not found`

**Симптом:**
В `package.json#contributes.commands` команда задекларирована, но при вызове из Command Palette VS Code пишет `command 'code-generator.xxx' not found`.

**Причина:**
`contributes.commands` — только декларация (отображение в палитре, иконка). Для работы нужна **отдельная регистрация обработчика** через `commands.registerCommand(id, handler)` в `activate()` ([src/adapters/vscode/extension.ts](../../src/adapters/vscode/extension.ts)).

**Решение:**
Добавить обе части:
1. Декларация в `package.json` → `contributes.commands`
2. Регистрация в `extension.ts`:
   ```ts
   context.subscriptions.push(
       commands.registerCommand("code-generator.xxx", xxxHandler),
   );
   ```

---

## CLI не видит `.bat` тулзы (serverpod, flutter, gh)

**Симптом:**
При запуске CLI `codegen create-project ...` падает с ошибкой типа `'serverpod' is not recognized as an internal or external command`, хотя в терминале команда работает.

**Причина:**
`child_process.exec` по умолчанию использует bash/cmd. Windows `.bat`-файлы (serverpod, flutter, gh) резолвятся только через PowerShell.

**Решение:**
В [src/core/utils/exec.ts](../../src/core/utils/exec.ts) выставлено `shell: 'powershell.exe'` на Windows. **НЕ менять** это поведение. Если команда всё равно не находится — проверить что `.bat` лежит в PATH PowerShell-сессии.

---

## `flutter analyze` показывает сотни errors типа `non_type_as_type_argument` / `undefined_getter` после `create-project`

**Симптом:**
После `codegen create-project --name <X>` запуск `flutter analyze` (или `codegen verify --name <X>`) даёт 300+ errors:
```
error - The name 'CategoryTableData' isn't a type, so it can't be used as a type argument
error - The getter 'isDeleted' isn't defined for the type 'HasResultSet'
error - Undefined class 'CategoryTableCompanion'
```

**Причина:**
Признак **BUG-005** (закрыт 2026-04-26). `database.dart` имеет пустые секции `// === GENERATED_IMPORTS_START ===` и `// === GENERATED_TABLES_START ===` — drift не сгенерил `*TableData`/`*Companion` классы. Раньше `AppDatabaseGenerator` работал инкрементально и при определённом порядке вызовов оставлял секции пустыми.

**Решение:**
1. Убедиться что `.vsix` пересобран после коммита `5708072` (`fix(app_database): scan-based вместо инкрементального`):
   ```powershell
   cd G:/Projects/vs_code_extensions/code-generator
   npm run compile
   npm run vscode:prepublish
   # установить .vsix вручную или работать через CLI напрямую
   ```
2. Сгенерировать **новый** проект (`t<N+1>`) — проверить что `database.dart` содержит imports на все live `*_table.dart` из `features/*/`.
3. Если в проекте уже накопились пустые секции — перегенерировать любую сущность через `generate-entity`, scan подцепит все таблицы.

---

## Сервер не стартует с `errno = 10048, address = ::, port = 8082`

**Симптом:**
`dart bin/main.dart --apply-migrations` падает с:
```
SocketException: Failed to create server socket (OS Error: Only one usage of each socket address... is normally permitted., errno = 10048), address = ::, port = 8082
Failed to start the Serverpod servers
```

**Причина:**
Зомби `dart.exe` процесс держит порт после прошлого запуска. Бывает при kill -9 или crash без graceful shutdown.

**Решение:**
PowerShell:
```powershell
Get-NetTCPConnection -LocalPort 8082 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
# проверить что порты свободны:
Get-NetTCPConnection -LocalPort 8080,8081,8082 -State Listen -ErrorAction SilentlyContinue
```

После очистки повторно запустить `dart bin/main.dart --apply-migrations`.

---

## `DatabaseQueryException: password authentication failed for user "postgres"` на работающем сервере

**Симптом:**
Сервер до этого отвечал HTTP 200, потом начал писать в логи:
```
DatabaseQueryException: { message: password authentication failed for user "postgres", code: 28P01 }
Failed to connect to database in future call manager
```

**Причина:**
Postgres контейнер потерял volume или пересоздался — пароль в `config/passwords.yaml` не совпадает с тем что в БД. Бывает после `docker compose down -v`, Docker Desktop рестарта или ручного удаления volume.

**Решение:**
```powershell
cd <name>_server
docker compose down -v       # снести контейнеры + volumes
docker compose up -d          # свежий postgres с правильным паролем
dart bin/main.dart --apply-migrations
```

---

## `flutter pub get` падает с `path: ../../Packages/X doesn't exist`

**Симптом:**
В свежем проекте `flutter pub get` валится:
```
Because t<X> depends on ble_feature from path which doesn't exist (could not find package ble_feature at "..\..\Packages\ble_feature"), version solving failed.
```

**Причина:**
Шаблон t115 использует `path: ../../Packages/X` — корректный путь в template-контексте (`Templates/flutter/t115/t115_flutter/` → `Templates/flutter/Packages/`), но в target проекте на 1 уровень глубже из-за `serverpod/` (`Projects/Flutter/serverpod/<name>/<name>_flutter/` → `Projects/Flutter/serverpod/Packages/` — не существует, реальные Packages в `Projects/Flutter/Packages/`).

**Решение:**
Закрыто фиксом 2026-04-26 — `create-project` пост-процессит `pubspec.yaml` через `patchPubspecPackagePaths()`. Если на свежем проекте всё же возникает — пересобрать `.vsix` после коммита `127f4e8`. Если работаешь со старым проектом — поправить руками: `path: ../../Packages/X` → `path: ../../../Packages/X`.

---

## `home_page.dart` не компилируется: `Target of URI doesn't exist '../../../tasks/presentation/widgets/...'`

**Симптом:**
В свежем проекте после `create-project` `flutter analyze` ругается:
```
error - Target of URI doesn't exist: '../../../tasks/presentation/widgets/creation_section.dart'
error - The method 'CreationSection' isn't defined for the type '_HomePageState'
```

**Причина:**
`home_page.dart` (с manifest startProject) импортирует `tasks/presentation/widgets/...` — этих файлов в свежем проекте может не быть, если `autoGenerateTasksFeature` не отработал.

**Решение:**
Закрыто фиксом 2026-04-26 — `create-project` явно копирует `tasks/presentation/widgets/*.dart` в target через `autoGenerateTasksFeature`. Если на свежем проекте всё же возникает — пересобрать `.vsix` после коммита `d28ff0d`. Альтернатива (быстрый workaround): скопировать файлы вручную из `G:/Templates/flutter/t115/t115_flutter/lib/features/tasks/presentation/widgets/` в `<X>_flutter/lib/features/tasks/presentation/widgets/`.

---

## После правки генератора verify FAIL — что делать?

**Политика 2026-04-26 (см. CLAUDE.md → Definition of Done):**

1. НЕ патчить руками target проект чтобы скрыть баг.
2. Создать **новый** тестовый проект `t<N+1>`:
   ```bash
   codegen create-project --name t<N+1>
   codegen verify --name t<N+1>
   ```
3. Если verify FAIL → починить генератор → создать `t<N+2>` → verify.
4. Цикл пока не сработает с первого раза.
5. Реальная история ветки `feature--fix-codegen-regen-bugs`: t141 (327 errors) → fix BUG-005 → t142 (48 errors) → fix widgets → t143 (PASS errors=0).

Если verify повторно FAIL по той же причине — это **сигнал что фикс не применился**: проверить `.vsix` пересобран или CLI работает из свежего `out/`.
