# Project Info Before Refactoring

> **Дата анализа**: 2025-12-21  
> **Версия**: 0.0.1  
> **Цель**: Документирование текущей структуры проекта перед рефакторингом

---

## 📦 Обзор проекта

**code-generator** — VS Code расширение для генерации кода и управления микросервисами в Serverpod проектах.

### Зависимости

| Пакет | Версия | Назначение |
|-------|--------|------------|
| `js-yaml` | ^4.1.0 | Парсинг YAML файлов |
| `typescript` | ^5.9.3 | Компилятор |
| `vscode` | ^1.104.0 | VS Code API |

---

## 📁 Структура проекта

```
code-generator/
├── src/
│   ├── extension.ts              # Точка входа (29 строк)
│   ├── createNewProject.ts       # Legacy команда
│   ├── generation_config.ts      # Конфигурация генерации
│   │
│   ├── core/                     # ⭐ Ядро (новый код)
│   │   ├── interfaces/
│   │   │   ├── microservice_language.ts   # MicroserviceLanguage интерфейс
│   │   │   └── file_system.ts             # IFileSystem интерфейс
│   │   ├── services/
│   │   │   ├── microservice_service.ts    # MicroserviceService (190 строк)
│   │   │   ├── workflow_modifier.ts       # WorkflowModifier (552 строки) ⚠️
│   │   │   ├── template_service.ts        # TemplateService (5.8KB)
│   │   │   ├── language_detector.ts       # detectLanguage()
│   │   │   └── service_locator.ts         # DI контейнер
│   │   ├── commands/
│   │   │   ├── add_microservice.ts        # Унифицированная команда add
│   │   │   ├── import_microservice.ts     # Унифицированный import
│   │   │   ├── export_microservice.ts     # Унифицированный export
│   │   │   └── remove_microservice.ts     # Унифицированный remove
│   │   ├── generators/
│   │   │   └── base_generator.ts          # Базовый генератор
│   │   ├── implementations/
│   │   │   └── default_file_system.ts     # Реализация IFileSystem
│   │   └── language_registry.ts           # Реестр языков
│   │
│   ├── modules/                  # Языковые модули
│   │   ├── python/
│   │   │   ├── python_language.ts         # Реализация MicroserviceLanguage
│   │   │   ├── index.ts                   # Регистрация 4 команд
│   │   │   ├── commands/
│   │   │   │   ├── add_python_project.ts  # 195 строк ⚠️ ДУБЛИРОВАНИЕ
│   │   │   │   ├── import_microservice.ts # 7.3KB
│   │   │   │   ├── export_microservice.ts # 7.6KB
│   │   │   │   └── remove_microservice.ts # 7.5KB
│   │   │   ├── services/
│   │   │   │   ├── python_initializer.ts  # uv sync / pip install
│   │   │   │   └── workflow_modifier.ts   # 523 строки ⚠️ ДУБЛИРОВАНИЕ (почти идентичен core/)
│   │   │   └── ui/
│   │   │       └── project_picker.ts      # UI для выбора шаблона/назначения
│   │   │
│   │   ├── node/
│   │   │   ├── node_language.ts           # Реализация MicroserviceLanguage
│   │   │   ├── index.ts                   # Регистрация 1 команды
│   │   │   ├── commands/
│   │   │   │   └── add_node_project.ts    # 133 строки ⚠️ ДУБЛИРОВАНИЕ (копия Python)
│   │   │   └── services/
│   │   │       └── node_initializer.ts    # npm install
│   │   │
│   │   ├── go/
│   │   │   ├── go_language.ts             # Реализация MicroserviceLanguage
│   │   │   ├── index.ts                   # Регистрация 1 команды
│   │   │   ├── commands/
│   │   │   │   └── add_go_project.ts      # 133 строки ⚠️ ДУБЛИРОВАНИЕ (копия Python)
│   │   │   └── services/
│   │   │       └── go_initializer.ts      # go mod tidy
│   │   │
│   │   └── flutter/
│   │       └── index.ts                   # Legacy Flutter команды
│   │
│   ├── features/                 # Feature-based код
│   │   └── generation/
│   │       ├── commands/
│   │       │   ├── add_python_to_project.ts   # Legacy
│   │       │   ├── add_node_to_project.ts     # Legacy
│   │       │   ├── add_go_to_project.ts       # Legacy
│   │       │   ├── create_new_project.ts      # Legacy
│   │       │   ├── generate_python_bridge.ts  # OpenAPI → Dart
│   │       │   ├── generate_serverpod_k8s.ts  # K8s генератор
│   │       │   └── setup_cicd.ts              # Terraform setup
│   │       ├── generators/
│   │       │   ├── generation_service.ts      # 12KB
│   │       │   ├── app_database_generator.ts
│   │       │   ├── manifests.ts
│   │       │   ├── section_generators.ts
│   │       │   ├── relation_patcher.ts
│   │       │   ├── flutter/                   # Flutter-специфичное
│   │       │   ├── python/                    # Python-специфичное
│   │       │   ├── k8s/                       # K8s генераторы
│   │       │   └── terraform/                 # Terraform
│   │       ├── parsers/
│   │       │   ├── openapi_parser.ts          # OpenAPI → структуры
│   │       │   ├── server_yaml_parser.ts      # Serverpod YAML
│   │       │   ├── relation-analyzer.ts
│   │       │   └── type-mappers.ts
│   │       ├── config/
│   │       │   ├── generation_config.ts
│   │       │   └── path_handle.ts
│   │       └── replacement/
│   │
│   ├── ui/
│   │   └── flutter_menu.ts        # Legacy UI меню
│   │
│   └── utils/
│       ├── dir_handle.ts          # Работа с директориями
│       ├── dir_handle_adv.ts      # Расширенные функции
│       ├── git_init.ts            # Git инициализация
│       ├── path_util.ts           # Утилиты путей
│       ├── terminal_handle.ts     # Выполнение команд
│       ├── vscode_ui.ts           # VS Code UI хелперы
│       ├── vs_code_menu.ts        # Legacy меню
│       └── text_work/             # Работа с текстом
│
├── docs/
│   └── task refactor.md          # План рефакторинга
│
└── package.json                  # 14 команд зарегистрировано
```

---

## ⚙️ Зарегистрированные команды (14)

### В package.json

| Команда | Название | Статус |
|---------|----------|--------|
| `flutter-handler` | Flutter handler | Legacy |
| `vsCodeExtHandler` | AntigravityHandler | Legacy |
| `createNewProject` | Create New Serverpod Project | Active |
| `addPython` | Add Python to Serverpod Project | Legacy |
| `addGo` | Add Go to Serverpod Project | Legacy |
| `addNode` | Add Node.js to Serverpod Project | Legacy |
| `createDataFiles` | Create Data Files from YAML | Active |
| `generateK8s` | Generate Serverpod K8s Files | Active |
| `addPythonProject` | Add Python Project from Template | Active ⚠️ |
| `addNodeProject` | Add Node.js Project from Template | Active ⚠️ |
| `addGoProject` | Add Go Project from Template | Active ⚠️ |
| `importMicroservice` | Import Existing Microservice | Active |
| `exportMicroservice` | Export Microservice from Monorepo | Active |
| `removeMicroservice` | Remove Microservice from Project | Active |
| `setupCICD` | Setup CI/CD (Terraform) | Active |

### Регистрация в extension.ts

```typescript
// Legacy команды
commands.registerCommand("code-generator.flutter-handler", flutterHandler);
commands.registerCommand("code-generator.vsCodeExtHandler", vsCodeExtHandler);

// Модули
context.subscriptions.push(...registerFlutterCommands());
context.subscriptions.push(...registerPythonCommands());  // 4 команды
context.subscriptions.push(...registerNodeCommands());    // 1 команда
context.subscriptions.push(...registerGoCommands());      // 1 команда
```

---

## 🔴 Проблемы и дублирование

### 1. Дублирование WorkflowModifier

**2 почти идентичных файла:**

| Файл | Строк | Назначение |
|------|-------|------------|
| `core/services/workflow_modifier.ts` | 552 | Новый (в core) |
| `modules/python/services/workflow_modifier.ts` | 523 | Старый (используется Python/Node/Go) |

**Проблема**: Node и Go команды импортируют `WorkflowModifier` из `modules/python/services/`.

### 2. Дублирование add_*_project команд

**3 почти идентичных файла:**

| Файл | Строк | Различия |
|------|-------|----------|
| `modules/python/commands/add_python_project.ts` | 195 | Python-специфичная логика |
| `modules/node/commands/add_node_project.ts` | 133 | Только templateCategory='node' |
| `modules/go/commands/add_go_project.ts` | 133 | Только templateCategory='go' |

**Проблема**: ~90% кода идентично, различается только:
- Имя языка в сообщениях
- templateCategory при сканировании
- Инициализатор (uv sync / npm install / go mod tidy)

### 3. Неравномерность функционала

| Модуль | add | import | export | remove |
|--------|-----|--------|--------|--------|
| Python | ✅ | ✅ | ✅ | ✅ |
| Node.js | ✅ | ❌ | ❌ | ❌ |
| Go | ✅ | ❌ | ❌ | ❌ |

### 4. Legacy код

Файлы в `features/generation/commands/`:
- `add_python_to_project.ts` — дублирует функционал
- `add_node_to_project.ts` — дублирует функционал
- `add_go_to_project.ts` — дублирует функционал

---

## 🏛️ Архитектурные паттерны

### Текущие

1. **MicroserviceLanguage Interface** — определён в `core/interfaces/`
2. **Language Registry** — реестр языков в `core/language_registry.ts`
3. **Service Locator** — DI контейнер в `core/services/service_locator.ts`
4. **Template Metadata** — `template.json` для хранения метаданных

### MicroserviceLanguage Interface

```typescript
interface MicroserviceLanguage {
    readonly name: string;           // 'python', 'node', 'go'
    readonly displayName: string;    // 'Python', 'Node.js', 'Go'
    readonly templateCategory: string;
    readonly templatePlaceholder: string;
    readonly defaultPort: number;    // 8000, 3000, 8080

    initialize(projectPath: string): Promise<void>;
    getExclusions(): string[];
    getOpenApiUrl(port?: number): string;
}
```

### Реализации

| Язык | Файл | Порт | Исключения | OpenAPI URL |
|------|------|------|------------|-------------|
| Python | `python_language.ts` | 8000 | `__pycache__`, `.venv`, `.pytest_cache` | `/openapi.json` |
| Node.js | `node_language.ts` | 3000 | `node_modules`, `dist`, `build` | `/swagger.json` |
| Go | `go_language.ts` | 8080 | `vendor`, `bin` | `/swagger/doc.json` |

---

## 📊 Статистика кода

### По директориям

| Директория | Файлов | Назначение |
|------------|--------|------------|
| `src/core/` | 12 | Ядро (интерфейсы, сервисы, команды) |
| `src/modules/` | 15 | Языковые модули (Python/Node/Go/Flutter) |
| `src/features/` | 20+ | Генерация кода, парсеры |
| `src/utils/` | 11 | Утилиты |
| `src/ui/` | 1 | UI меню |

### Ключевые файлы по размеру

| Файл | Размер | Строк |
|------|--------|-------|
| `core/services/workflow_modifier.ts` | 24.8KB | 552 |
| `python/services/workflow_modifier.ts` | 23.9KB | 523 |
| `features/generation/generators/generation_service.ts` | 12.1KB | ~300 |
| `core/services/microservice_service.ts` | 7.5KB | 190 |
| `python/commands/add_python_project.ts` | 8.5KB | 195 |

---

## 🔧 Конфигурация

### VS Code Settings

```json
{
  "codeGenerator.templatesPath": "G:/Templates",
  "codeGenerator.pythonProjectsPath": "G:/Projects/Python"
}
```

### Структура шаблонов

```
G:/Templates/
├── python/
│   └── python-fastapi/
├── node/
│   └── node-fastify/
└── go/
    └── go-fiber/
```

---

## 📋 Рекомендации по рефакторингу

### Приоритет 1: Устранение дублирования

1. **Удалить** `modules/python/services/workflow_modifier.ts`
2. **Обновить** импорты в Node/Go на `core/services/workflow_modifier.ts`
3. **Создать** унифицированную команду `addMicroservice` в `core/commands/`
4. **Удалить** отдельные `add_*_project.ts` после миграции

### Приоритет 2: Оптимизация меню

Текущие команды (6+ для микросервисов):
- addPythonProject, addNodeProject, addGoProject
- importMicroservice, exportMicroservice, removeMicroservice

**Цель** (4 команды):
- `Add Microservice` — универсальная (язык определяется из шаблона)
- `Import Microservice`
- `Export Microservice`
- `Remove Microservice`

### Приоритет 3: Выравнивание функционала

Добавить import/export/remove для Node и Go (используя унифицированный сервис).

### Приоритет 4: Очистка

1. Удалить legacy команды из `features/generation/commands/`
2. Обновить `package.json` — убрать неиспользуемые команды
3. Вынести общие UI компоненты из `modules/python/ui/` в `src/ui/`

---

## ✅ Готовность к рефакторингу

| Компонент | Готов | Комментарий |
|-----------|-------|-------------|
| MicroserviceLanguage interface | ✅ | Уже создан |
| LanguageRegistry | ✅ | Уже создан |
| MicroserviceService | ✅ | Уже создан (частично) |
| WorkflowModifier (core) | ✅ | Уже создан |
| detectLanguage() | ✅ | Уже создан |
| Унифицированные команды | ⚠️ | В `core/commands/`, но не используются |
| Удаление дублирования | ❌ | Требуется |
| Обновление package.json | ❌ | Требуется |
