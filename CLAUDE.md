# CLAUDE.md — Code Generator (агентский гайд)

> Этот файл — то, что нужно знать каждому новому AI-агенту перед тем, как трогать репозиторий.
> Обновляется при каждом изменении архитектуры/инвариантов.

## TL;DR

**Что это.** VS Code расширение + CLI `codegen` для генерации Serverpod/Flutter монорепо из шаблона t115 и Clean-Architecture фич из `*.spy.yaml`.

**Где живут вещи:**
- Код: `src/` (TypeScript)
- Шаблоны: `G:/Templates/flutter/t115/` — **вне репозитория**, путь конфигурируется
- Сгенерированные проекты: `G:/Projects/Flutter/serverpod/<name>/`
- Документация процесса: `ai/docs/`, задачи: `ai/tasks/`, баги: `ai/bug-reports/`
- **Начинай с**: [ai/docs/INDEX.md](ai/docs/INDEX.md) → [ai/docs/agent_memory.md](ai/docs/agent_memory.md)

**Не пропусти:**
- [AGENTS.md](AGENTS.md) — глобальные правила процесса (запреты, block-rules, PR/merge flow, коммиты)
- [ai/docs/agent_memory.md](ai/docs/agent_memory.md) — обязателен к прочтению каждой сессии
- [ai/bug-reports/](ai/bug-reports/) — статус известных багов (часть закрыта 2026-04-25/26)
- [ai/prompts/{teamlead,executor,finalize}.prompt.md](ai/prompts/) — промпты для ролей (teamlead — оркестратор, executor — реализация, finalize — закрытие задачи)
- [ai/scripts/{new_task.py, task.py}](ai/scripts/) — task management CLI: создать TASK-XXX, feature branch → PR → merge

---

## Архитектура (минимум)

```
adapters/cli  ─┐
               ├─→  features/generation  →  templates t115  →  target project
adapters/vscode┘    + core services
```

- **`src/core/*` НЕ импортирует `vscode`.** Если нужно — lazy `require('vscode')` с fallback. Иначе CLI ломается.
- **`src/adapters/cli/*`** — commander-based, 10 команд. Entry: `out/adapters/cli/index.js`. JSON в stdout (default), human-readable с `--human`, логи в stderr.
- **`src/adapters/vscode/*`** — 11 команд, регистрируются в `extension.ts`.
- **`src/features/generation/*`** — entity-генерация. Парсер YAML → модель → словарные замены + section-генераторы → файлы.

Подробно: [ai/docs/architecture.md](ai/docs/architecture.md).

---

## Шаблон t115 — критические инварианты

### Маркеры в файлах шаблона

```dart
// manifest: startProject     → копируется при create-project
// manifest: entity           → шаблон для entity-генерации
// === generated_start:base ===  ...  // === generated_end:base ===   → merge-блок
// === generated_start:oneToManyMethods ===  ...  → relation-блок (один на файл!)
// === generated_start:driftTableColumns ===  ...
// === generated_start:simpleFields ===  ...  и т.п.
```

**Файл без `// manifest:` маркера → MarkerAnalyzer ставит `ignore` → НЕ копируется.** Это частый источник багов "почему файл не появляется в новом проекте".

### Обязательные поля entity YAML (валидация — TASK-009/BUG-004)

```yaml
class: Foo
table: foo
fields:
  id: UuidValue?, defaultPersist=random_v7
  userId: int                                                  # required
  customerId: UuidValue, relation(parent=customer, ...)        # required
  isDeleted: bool, default=false                               # required
  createdAt: DateTime
  lastModified: DateTime
  ...
```

**Без 3 hard-required полей** (`userId`, `customerId`, `isDeleted`) генерация падает с понятной ошибкой.
**Без парного `<table>_sync_event.spy.yaml`** в той же папке — тоже падает.
M2M (junction `*Map`, sync_core 0.3.0 conventions Pattern 7) — пропускают валидацию.

Escape hatch: CLI `--skip-validation`, VS Code → диалог `Generate anyway`.

### Структура target-проекта

```
G:/Projects/Flutter/serverpod/<name>/
├── <name>_server/lib/src/{models,endpoints,...}
├── <name>_flutter/lib/{core,features/<entity>/{data,domain,presentation}}
├── <name>_admin/
└── <name>_client/   (output of `serverpod generate`)
```

`*_flutter/pubspec.yaml` использует `path: ../../../Packages/<pkg>` для local packages.
**В шаблоне** путь `../../Packages/` (на 1 уровень мельче) — `create_project.ts` пост-процессит и углубляет.

---

## CLI команды (коротко)

| Команда | Что делает |
|---|---|
| `create-project --name X` | Создаёт монорепо: server + flutter + admin + client. Auto-gen Task/Tag/Category/TaskTagMap из шаблонных YAMLs (для compileable home_page). |
| `generate-entity --yaml <path> --feature-path ... --workspace ...` | Entity feature. Pre-flight валидация (BUG-004). |
| `generate-k8s` | k8s-манифесты для сервера. |
| `generate-openapi-bridge` | Serverpod endpoint-обёртка вокруг external OpenAPI service. |
| `add-microservice` | Добавляет микросервис (python/node/go) в монорепо. |
| `import/export/remove-microservice` | Перенос микросервисов между моно/standalone. |
| `local-setup` | docker compose up + migrations + serve. |
| `setup-cicd` | Terraform-based GitHub Secrets. |
| `verify --name <project>` | **Запускает Definition of Done цепочку**: serverpod generate + build_runner + flutter analyze в `G:/Projects/Flutter/serverpod/<project>/`. Возвращает JSON `{ generate, buildRunner, analyze: {errors, warnings} }`. Используется агентами для подтверждения работоспособности после правок генератора/шаблона. |

Запуск: `node out/adapters/cli/index.js <command>` или `npm run cli -- <command>`.

---

## Главные инварианты генератора

### 1. relation_patcher (TASK-008/BUG-003) — **реальный coverage** (corrected 2026-05-03)

⚠ **Предыдущая версия этого блока заявляла "8 слоях patching" — это было неверно.** Audit 2026-05-03 (TASK-012 + BUG-013) показал реальный coverage:

- **Layer 1 — interface (`<entity>_repository.dart`):** patcher через markers `:oneToManyMethods` ✅
- **Layers 2-4 — dao, local_data_source, remote_data_source:** через **hardcoded inheritance** в template + MANY_TO_MANY substitution (Task→TodoItem, Category→Project automatically). Markers отсутствуют, regen работает через template substitution.
- **Layers 5-6 — repository_impl, usecases:** ❌ **полностью broken** в t115 template. Нет ни markers, ни hardcoded methods. Каждый fresh project с FK relations получит `non_abstract_class_inherits_abstract_member` + `undefined_identifier` errors. См. [BUG-013](ai/bug-reports/013-template-markers-gap-repository-impl-usecases.md).
- **Layer 7-8 — endpoint, local_datasource_service:** через hardcoded inheritance (предположительно).

**Markers properties (где работают, layer 1):**

- **Один marker-блок `:oneToManyMethods` на файл.** Внутри — все relation-методы.
- **Идемпотентный** на interface layer.
- **Recovery от legacy-дубликатов.** Если в файле несколько marker-пар → схлопываются в одну.

**Дополнительно:** parser игнорирует `relation(parent=X)` directive — derives `relatedModel` через `name.replace(/(.*)Id/, '$1')`, что ломает FK alias case (`assigneeId, parent=member` → broken). См. [BUG-012](ai/bug-reports/012-server-yaml-parser-ignores-relation-parent-directive.md).

- НЕ ТРОГАЕТ `:base` секции — это отдельная проблема (см. BUG-005 в backlog).

### 2. Файловые имена — snake_case (TASK / BUG-002)

- **Multi-word entity** (`CorrectionButton`, `CargoType`) → файлы `correction_button_dao.dart`, папки `correction_button/`.
- **Identifier-контекст** (variables, class names, Drift global getters) — camelCase: `correctionButtonTable`, `class CorrectionButtonDao`.
- Реализация: dictionary правило `category(?=_|/|\.dart\b)` → snake_case применяется ПЕРЕД camelCase правилом для `d`.
- `_getDestinationPath` использует `toSnakeCase(unCap(targetEntity))` для путей.

### 3. AppDatabaseGenerator (BUG-005 fix)

- Фильтрует stale imports/tables/migrations: если файл не существует — import/класс/migration-line удаляются.
- Schema version **append-only** (не понижается).

### 4. Что НЕ генерируется автоматически

- **UI-фабрики, формы, widget-тесты, helpers** — codegen их не патчит. Любое изменение `required` поля в YAML → ручная правка мест где `<Entity>(...)` создаётся.
- **Кастом sync hooks** в `sync_orchestrator_provider.dart` (Hook 5+ за пределами 4 default'ов) — patcher трогает только 3 marker блока (`:syncImports` / `:syncEntityTypes` / `:syncRegistrations`). Любые user-добавленные hooks (custom scope listeners, telemetry) сохраняются вне marker блоков. Sync_core 0.3.0 generation покрыт codegen после TASK-011 (см. [docs-code-generator/sync-core-integration.md](docs-code-generator/sync-core-integration.md)).

---

## Жёсткие правила для агента

> **Полный набор правил** — в [AGENTS.md](AGENTS.md). Здесь — выжимка специфичная для code-generator.

### Definition of Done (для изменений в генераторе или шаблоне t115)

Изменение **НЕ считается готовым** к показу пользователю пока:

1. На тестовом проекте (свежий или существующий) **успешно прошёл `codegen verify --name <test>`**, или эквивалентная цепочка вручную:
   - `serverpod generate --experimental-features=all` → exit 0
   - `dart run build_runner build --delete-conflicting-outputs` → exit 0
   - `flutter analyze` → собран и зафиксированы числа
2. **В ответе пользователю зафиксированы реальные числа:** `errors: N, warnings: M`. Не "вроде ок", не "должно работать".
3. Если что-то **не запускалось** (нет docker, нет flutter run, нет окружения) — это написано **в первом предложении** ответа, а не в конце мелким шрифтом.
4. Если для верификации пришлось **руками** что-то править в target-проекте — это **сигнал бага генератора**, а не "локальный фикс окружения". Завести bug-report или починить генератор. Запрещено отдавать проект пользователю с ручными правками "чтобы заработало".

**Запрещённые формулировки:** "скорее всего скомпилируется", "должно работать", "вроде готов", "не падал последний раз когда я смотрел".
**Разрешённые формулировки:** "запустил X, результат: Y", "не запускал X, потому что: Z, проверь сам перед продакшеном".

### Git
- **НЕ коммить** без явного "коммить" от пользователя. Коммиты на русском, Conventional Commits, **БЕЗ** `Co-Authored-By`.
- Не делать destructive операции (`rm -rf`, force-push, `git reset --hard`) без подтверждения.

### Костыли
- **НЕ делать костыли** (magic sleep, глобальные буферы, подавление ошибок). Если правильного решения нет — озвучить и предложить варианты.
- **НЕ патчить руками сгенерированные проекты** чтобы скрыть баг генератора. Сначала чини генератор, потом проверяй на проекте. Если есть стейл-данные в target проекте — это сигнал что генератор не дочистил.

### Окружение Windows
- Bash в Claude Code — это Git Bash, **не** PowerShell. Команды типа `flutter`, `serverpod`, `idf.py` запускать через PowerShell wrapper:
  ```bash
  env -u MSYSTEM powershell.exe -Command 'Remove-Item Env:\MSYSTEM -EA SilentlyContinue; Set-Location "<path>"; <command>'
  ```
- В core/utils/exec.ts CLI использует `shell: 'powershell.exe'` на Win — иначе `.bat` файлы не находятся.
- В цепочках команд для PowerShell — `;` вместо `&&`.
- Слэши: `/` в PathString'ах работает, но `path.resolve` на Windows добавит `C:\` префикс — для file-existence проверок против MockFs использовать `path.posix.normalize(path.posix.join(baseDirPosix, importPath))` (см. AppDatabaseGenerator).

### Тесты
- `npm test` — vscode-test runner, 51 passing на 2026-04-26.
- Новые тесты: `src/test/{parsers,generators,replacement}/`.
- MockFileSystem: `src/test/mocks/mock_file_system.ts` — нормализует пути в forward-slash.
- Тесты на entity-генерацию покрыты для `relation_patcher`, `app_database_generator`, `entity_yaml_validator`, `replacement_util`. **НЕ покрыты:** `code_formatter`, `server_yaml_parser`, workflow-модули, CLI-команды.

### Длительные команды
- `create-project --name X` — ~3 минуты. **НЕ перезапускать** для "посмотреть лог", если команда не упала. Проверять результат через `ls`/Read.
- `serverpod generate` — ~10 сек, нормально для повторов.
- `flutter pub run build_runner build` — 30-60 сек.

### Test-проекты — incremental numbering, агент НЕ удаляет (HARD RULE)

**Политика 2026-05-02 (User decision):** агент **НЕ имеет прав** на удаление test-проектов в `G:/Projects/Flutter/serverpod/t<N>/`. Sandbox **намеренно блокирует** `rm -rf` / `Remove-Item -Recurse -Force` / подобные ops. Это **не bug**, это политика User'а.

**Hard rule — НИКОГДА:**
- НЕ пробовать workaround sandbox через PowerShell wrappers (`powershell.exe -Command "Remove-Item ..."`)
- НЕ через `cmd /c rd /s /q ...`
- НЕ через `node` child_process exec
- НЕ через любые другие альтернативные shell paths

**Что делать вместо удаления:**
1. Узнай актуальный последний `t<N>` через `ls G:/Projects/Flutter/serverpod/`
2. Используй `t<N+1>` (или `t<N+2>` если только что создавал `t<N+1>`)
3. После validation — оставь broken проекты на disk **как есть**
4. User сам удалит когда сочтёт нужным — это его зона
5. Если sandbox error на delete attempt — flag User'у конкретную команду которую попытался, **не пробуй workaround**

**Расширение incremental numbering** (BUG-005 lesson 2026-04-26): теперь явно запрещены **попытки удаления** broken `t<N>` directories. Это касается **всех TASK-XXX** где есть `create-project` или подобные disk-heavy operations.

---

## Task workflow (TASK-XXX через скрипты)

### ⚠ HARD RULE — tasks/discussions ТОЛЬКО через python скрипты

User decision 2026-05-02: **создание новых TASK-XXX и discussions — ТОЛЬКО через python скрипты в `ai/scripts/` и `ai/discussions/scripts/`. Запрещено создавать `ai/tasks/active/*/task.md` или `ai/discussions/active/N-*.md` через `Write` tool вручную.**

**Почему:** scripts обеспечивают auto-ID (без conflicts), копируют свежий template, обновляют `STATUS.md`, применяют naming conventions. Manual creation breaks все эти invariants. Конкретный случай: 2026-05-02 manually-created TASK-011 conflict'нул с auto-ID 011 от new_task.py — пришлось переименовывать руками.

**Скрипты в codegen:**
- `ai/scripts/new_task.py "название"` — новая TASK-XXX (auto-ID)
- `ai/scripts/task.py start|pr|merge|finish` — workflow feature branch → PR → squash merge
- `ai/discussions/scripts/discuss.py new|list|continue|close` — discussions

### Создание задачи
```bash
python ai/scripts/new_task.py "Краткое название"
# → создаёт ai/tasks/active/TASK-XXX-краткое-название/{task.md, report.md}
```

### Workflow feature branch → PR → merge
```bash
python ai/scripts/task.py start TASK-XXX-краткое-название   # feature branch от свежего master
# ... работа executor'а: коммиты, тесты ...
python ai/scripts/task.py pr        # push + gh pr create с body=report.md
python ai/scripts/task.py merge     # дождаться CI, squash-merge, обратно на master
# или одной командой:
python ai/scripts/task.py finish    # pr + merge
```

Требования: `gh` CLI авторизован (`gh auth status`), запуск из корня репо.

### Структура `ai/tasks/`
- `_template/` — шаблон task.md/report.md (копируется new_task.py)
- `active/TASK-XXX-*/` — текущие задачи
- `done/TASK-XXX-*/` — завершённые

См. [AGENTS.md → Прогресс через task.md](AGENTS.md) — три секции в task.md ("План работы" / "STOP-gates" / "Журнал исполнения") как live-журнал executor'а.

## Порядок работы для типичных задач

### "Добавь поле X в существующую сущность"
1. Прочитать [ai/docs/agent_memory.md](ai/docs/agent_memory.md) и этот файл.
2. Отредактировать `<entity>.spy.yaml` в `<name>_server/lib/src/models/<entity>/`.
3. `codegen generate-entity --yaml ... --feature-path ... --workspace ...` — относительно безопасно для добавления полей и relations (см. инварианты выше).
4. **ВНИМАНИЕ:** `:base` секции (handleSyncEvent, createX, mappers) **перезапишутся**. Если в них есть кастомный код — забэкапить через `git diff` ПЕРЕД regen. `:syncImports` / `:syncEntityTypes` / `:syncRegistrations` marker блоки в orchestrator — патчатся идемпотентно (existing entries сохраняются + новый append'ится).
5. `serverpod generate --experimental-features=all` (server)
6. `flutter pub run build_runner build --delete-conflicting-outputs` (flutter)
7. `flutter analyze` — проверить чистоту.

### "Создай новый проект"
1. `codegen create-project --name <name>` (~3 мин).
2. **`codegen verify --name <name>` (Definition of Done гейт).** Должен вернуть `{ success: true }`. Цитировать `steps.flutterAnalyze.counts` в ответе пользователю.
3. Проект должен сразу компилироваться: home_page.dart с Configuration baseline (tasks UI закомментирован — TASK-002 default, раскомментируется после `generate-entity`), sync_orchestrator_provider подключен с Configuration register'ом, pubspec пути правильные (включая sync_core path-dep).
4. Если что-то не так — это **баг генератора**, не патчить руками. Завести bug-report.

### "Почини баг генератора"
1. Завести TASK в `ai/tasks/active/TASK-NNN-...`.
2. Воспроизвести: создать минимальный YAML/scenario, сгенерировать, увидеть проблему.
3. Найти источник в `src/features/generation/`.
4. Написать unit-тест на MockFileSystem **СНАЧАЛА** (TDD).
5. Починить.
6. Проверить на реальном проекте через CLI (можно использовать существующий test-проект, не пересоздавать).
7. **`codegen verify --name <test_project>` (DoD гейт).** Цитировать результат в report.md.
8. Обновить bug-report до Resolved, написать report.md в TASK папке, обновить `ai/docs/status.md`.

---

## Известные ограничения / backlog

- **BUG-001 (Open, High):** Ref disposed в state_providers — повторяется в каждой новой сущности. См. [ai/bug-reports/001-state-provider-ref-disposed.md](ai/bug-reports/001-state-provider-ref-disposed.md).
- **BUG-005 (backlog):** перезапись `:base` секций при regen теряет custom code. Требует архитектурного решения (per-method markers или patch-only mode). Сейчас workaround — `git diff` перед regen.
- **MCP сервер для генератора** — отдельная задача (стек: Python stdio как `webcam` сервер, обёртки над JSON-режимом CLI). Делать после стабилизации основных багов.

---

## Полезные пути для поиска

```
AGENTS.md                                                       # глобальные правила процесса
ai/scripts/{new_task.py, task.py}                               # task management CLI
ai/prompts/{teamlead,executor,finalize}.prompt.md               # промпты для ролей
ai/tasks/{_template,active/,done/}                              # задачи
ai/bug-reports/                                                 # известные баги (001-006)
ai/discussions/{active/,done/}                                  # multi-agent дискуссии
ai/docs/{INDEX,agent_memory,architecture,status,roadmap}.md     # документация процесса

src/features/generation/parsers/server_yaml_parser.ts          # YAML → модель
src/features/generation/parsers/entity_yaml_validator.ts       # 6-field + sync-event валидация
src/features/generation/parsers/relation-analyzer.ts           # detection one/many-to-one
src/features/generation/generators/generation_service.ts       # оркестратор
src/features/generation/generators/relation_patcher.ts         # :oneToManyMethods патчинг
src/features/generation/generators/app_database_generator.ts   # database.dart Drift сборка
src/features/generation/replacement/replacement_util.ts        # словари (ENTITY/M2M/COMMON)
src/adapters/cli/commands/create_project.ts                    # full project bootstrap
src/adapters/cli/commands/generate_entity.ts                   # entity feature gen

ai/docs/INDEX.md               # старт
ai/docs/agent_memory.md        # факты, gotchas
ai/docs/architecture.md        # детали
ai/docs/status.md              # текущее состояние
ai/bug-reports/                # известные баги
ai/tasks/active/               # текущие задачи
```

---

**Последнее обновление:** 2026-05-02
**Активная ветка:** `master` (Phase 1.5 active — sync_core 0.3.0 templates integration)
