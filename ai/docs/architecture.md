# Архитектура code-generator

**Обновлено:** 2026-04-18

## Высокоуровневая структура

```
┌─────────────┐      ┌─────────────┐
│  VS Code UI │      │   CLI user  │
│  (команды)  │      │  / AI agent │
└──────┬──────┘      └──────┬──────┘
       │                    │
       ▼                    ▼
┌─────────────┐      ┌─────────────┐
│ adapters/   │      │ adapters/   │
│  vscode/    │      │   cli/      │
└──────┬──────┘      └──────┬──────┘
       │                    │
       └─────────┬──────────┘
                 │
                 ▼
      ┌─────────────────────┐
      │   core/ + features/ │
      │   (доменная логика) │
      └─────────┬───────────┘
                │
                ▼
    ┌───────────┴────────────┐
    │ шаблон t115            │
    │ G:/Templates/flutter/  │
    │ ───────────────────────│
    │ сгенерированный проект │
    │ G:/Projects/Flutter/   │
    │ serverpod/<name>/      │
    └────────────────────────┘
```

Два адаптера (`cli`, `vscode`) вызывают общую доменную логику в `core/` и `features/`. vscode-зависимости изолированы в `src/adapters/vscode/`.

## Ключевые компоненты

### `src/adapters/cli/` — CLI-адаптер

- `index.ts` — commander-based точка входа, регистрирует 10 команд
- `commands/` — по файлу на команду: `generate-entity`, `generate-k8s`, `generate-openapi-bridge`, `create-project`, `add-microservice`, `import/export/remove-microservice`, `local-setup`, `setup-cicd`
- `utils/cli_exec.ts` — делегирует в `core/utils/exec.ts` (PowerShell на Windows)
- `utils/cli_file_system.ts` — реализация `IFileSystem` с tracking для логирования изменённых файлов
- `utils/cli_logger.ts` — JSON-режим (default) в stdout, human-readable с `--human`, логи в stderr
- `utils/stdin_reader.ts` — чтение YAML из stdin для `generate-entity --stdin`

Запуск: `node out/adapters/cli/index.js <command>` или `codegen <command>` (если установлен глобально через `npm link`).

### `src/adapters/vscode/` — VS Code-адаптер

- `extension.ts` — регистрация всех 11 команд через `commands.registerCommand` + инициализация `ServiceLocator` из `workspace.getConfiguration('codeGenerator')`
- `commands/` — обработчики команд (dialog-based UX через `showQuickPick`, `showInputBox`, `withProgress`)
  - `commands/add_microservice/` — unified команда добавления микросервиса любого языка: `language_picker → template_picker → project_name_input → destination_resolver → project_creator`
- `ui/` — Command Palette меню: `flutter_menu`, `project_picker`, `ui_ask_folder`
- `utils/terminal_handle.ts` — re-export `execCommand` из `core/utils/exec` для vscode-контекста
- `modules/` — **удалено** (`flutter_index`, `python_index`, `go_index`, `node_index` — мёртвые регистраторы)

### `src/core/` — доменная логика без vscode

- `interfaces/` — `IFileSystem`, `MicroserviceLanguage`
- `implementations/` — `DefaultFileSystem`
- `services/`:
  - `ServiceLocator` — singleton для `IFileSystem` и `templatesPath`
  - `TemplateService` — сканирование шаблонов, copyTemplate, getExclusions
  - `MicroserviceService` — высокоуровневые операции над проектом микросервиса
  - `LanguageDetector` — определение языка по структуре папки проекта
  - `WorkflowModifier` — **фасад** для `workflow/`
  - `workflow/` — 10 специализированных модулей: `workflow_monorepo_modifier`, `workflow_standalone_modifier`, `workflow_file_finder`, `k8s_manifest_updater`, `serverpod_deployment_updater`, `flutter_integration`, `serverpod_endpoint_copier`, `developer_tools_patcher`, `types`, `index`
- `generators/base_generator.ts` — базовый класс для генераторов
- `utils/exec.ts` — shared `child_process.exec` с PowerShell на Windows (используется и CLI, и vscode)
- `language_registry.ts` — реестр `MicroserviceLanguage` по типу (python/node/go/flutter)

### `src/features/generation/` — entity-генерация

Генерирует Clean Architecture слои из Serverpod `.spy.yaml` модели.

- `parsers/` — парсинг YAML → модель entity (определение isEnum, isRelation)
- `config/generation_config.ts` — конфиг путей (targetProject, templatesPath, projectsPath, расчёт производных путей)
- `generators/`:
  - `generation_service.ts` — оркестратор генерации
  - `section_generators.ts` — генерация секций (table columns, imports, model extensions, и т.д.)
  - `code_formatter.ts` — форматирование Dart-кода (freezedConstructor, nullable relations, enum conversions)
  - `relation_generation.ts` — логика relations (parent/child, onDelete, typing)
  - `relation_patcher.ts` — точечное добавление relation-методов без дублей
  - `app_database_generator.ts` — генерация `database.dart` (Drift AppDatabase)
  - `replacing_file_processor.ts` — обработка маркеров `=== generated_start:<section> ===`
  - `marker_analyzer.ts` — анализ маркеров в файлах шаблона
  - `manifests.ts` — типы манифестов (startProject, entity, ...)
  - `python/`, `flutter/`, `k8s/`, `terraform/` — специфичные генераторы
- `replacement/` — движок замены с маркерами

### `src/modules/{flutter,go,node,python}/`

- `<lang>_language.ts` — реализация `MicroserviceLanguage` (displayName, templateCategory, defaultPort, initialize, getDevServerCommand, getExclusions)
- `services/<lang>_initializer.ts` — язык-специфичная инициализация (uv sync / npm install / go mod tidy)
- `python/services/workflow_modifier.ts` — legacy-фасад для `core/services/workflow/*` (оставлен для back-compat — используется в `project_creator.ts`)

## Границы и ответственности

- `src/core/*` и `src/features/*` **НЕ импортируют** `vscode`. Если нужно — lazy `require('vscode')` с fallback
- `src/adapters/cli/*` и `src/adapters/vscode/*` — thin wrappers над core
- Templates лежат **вне репозитория** (`G:/Templates/flutter/t115/`) и конфигурируются через `codeGenerator.templatesPath`
- Сгенерированные проекты — в `G:/Projects/Flutter/serverpod/<name>/` (по умолчанию)

## Шаблон t115 (структурно)

```
G:/Templates/flutter/t115/
├── docker-compose.yaml        # Postgres + Redis + 3 микросервиса
├── switch_env.ps1
├── t115_server/               # Serverpod backend (Dart)
│   ├── lib/src/{endpoints,models,middleware,services,util}
│   ├── k8s/                   # namespace, deployment, service, ingress, configmap, job
│   ├── terraform/             # GitHub Secrets setup
│   └── _server_handle_files/_server_commands.ps1
├── t115_flutter/              # Main client app
│   ├── lib/{core,features/*}  # Clean Architecture + sync pattern
│   └── _service_files/{flutter,git}_handle.ps1
├── t115_admin/                # Admin panel app
├── t115_client/               # Generated Serverpod client (shared)
├── t115_python/               # FastAPI microservice template
├── t115_node/                 # Express-TS microservice template
└── t115_go/                   # Go microservice template
```

## Manifest и маркеры

Генератор использует комментарии в шаблонных файлах как директивы:

| Маркер | Назначение |
|---|---|
| `# manifest: startProject` | Файл копируется при `create-project` (root, pubspec, docker-compose, etc.) |
| `# manifest: entity` (в `table.dart`) | Файл — шаблон для entity-генерации |
| `// === generated_start:<section> ===` / `=== generated_end:<section> ===` | Вставляемые секции: `driftTableImports`, `driftTableColumns`, `base`, `entity`, `dao`, etc. |

Обработка — в [replacing_file_processor.ts](../../src/features/generation/generators/replacing_file_processor.ts) и [marker_analyzer.ts](../../src/features/generation/generators/marker_analyzer.ts).

## Sync-паттерн (в шаблоне t115)

Каждая сущность имеет парный `<entity>_sync_event.spy.yaml` + базу `core/sync/`:
- `base_sync_repository.dart` — общий repo-миксин для offline-first операций
- `sync_controller_provider.dart` — Riverpod провайдер контроллера синхронизации
- `sync_registry.dart` — реестр синкающихся сущностей

Offline-first: Drift локально + Serverpod remote. События синхронизации идут через `<entity>_sync_event`.

## Обязательные поля entity YAML

`.spy.yaml` должен содержать (генератор ожидает):
- `id: UuidValue?, defaultPersist=random_v7`
- `userId: int`
- `customerId: UuidValue, relation(parent=customer, onDelete=Cascade)`
- `createdAt: DateTime`
- `lastModified: DateTime`
- `isDeleted: bool, default=false`

Пример: [task.spy.yaml в шаблоне t115](G:/Templates/flutter/t115/t115_server/lib/src/models/tasks/task.spy.yaml).

## Что намеренно упрощено

- **Единственный шаблон `t115`** — хардкод в `create_new_project.ts:36` и `create_project.ts:44`. Плагинная архитектура (Фаза 3 roadmap) — в будущем.
- **Активная ветка `feature--create-cli`** — master отстал на весь рефакторинг CLI + decoupling. Решение о мерже — отдельный вопрос User.
- **Тестов для entity-генератора нет** — только openapi-bridge, template-service, parsers. TASK-004 в roadmap.
- **Windows-only path assumptions** — `G:/Templates`, `G:/Projects/Flutter/serverpod` хардкод в дефолтах CLI (можно переопределить флагами). Cross-platform не цель Фазы 1.
- **`python/services/workflow_modifier.ts` как фасад** — оставлен для back-compat. Постепенно `project_creator.ts` может мигрировать на прямое использование `core/services/workflow/*`.

## Кто обновляет

| Когда | Кто | Что делает |
|---|---|---|
| Новый проект | User | Заполняет начальную архитектуру |
| Архитектурный вопрос | TeamLead | Инициирует дискуссию |
| После дискуссии | User | Отражает изменения здесь |
| Рефакторинг | Executor (через TeamLead) | Предлагает обновление |

> **Связь:** Детали решений хранятся в [decisions/ADR-*.md](decisions/), здесь — только актуальное состояние.
