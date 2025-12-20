# Code Generator - Project Description

VS Code расширение для автоматизации создания и интеграции Serverpod проектов с микросервисами (Python, Node, Go).

## Архитектура

```
src/
├── core/                    # Базовые интерфейсы и сервисы
│   ├── interfaces/          # IFileSystem и др.
│   ├── implementations/     # DefaultFileSystem
│   └── services/            # ServiceLocator (DI)
├── features/generation/     # Генерация кода
│   ├── commands/            # VS Code команды
│   ├── generators/          # Генераторы кода (python/)
│   └── parsers/             # Парсеры (openapi_parser.ts)
├── modules/                 # Модули по технологиям
│   ├── flutter/             # Flutter команды
│   └── python/              # Python микросервисы
│       ├── commands/        # add_python_project, import_microservice
│       └── services/        # workflow_modifier, project_initializer
└── utils/                   # Утилиты (terminal, path, git)
```

## Ключевые команды

| Команда | Файл | Описание |
|---------|------|----------|
| `createNewProject` | `create_new_project.ts` | Создаёт Serverpod проект (monorepo) |
| `addPythonProject` | `add_python_project.ts` | Добавляет Python микросервис |
| `generatePythonBridge` | `generate_python_bridge.ts` | Генерирует Serverpod endpoints из OpenAPI |
| `generateServerpodK8s` | `generate_serverpod_k8s.ts` | Генерирует K8s манифесты для Serverpod |
| `setupCICD` | `setup_cicd.ts` | Настраивает CI/CD через Terraform |
| `importMicroservice` | `import_microservice.ts` | Импортирует существующий микросервис в monorepo |

## Python Bridge — генерация endpoints

### Процесс
1. Сканирует `microservices/` для поиска Python сервисов
2. Показывает QuickPick для выбора микросервиса
3. Получает OpenAPI spec с `http://localhost:8000/openapi.json`
4. Парсит endpoints через `openapi_parser.ts`
5. Генерирует `{serviceName}_endpoint.dart` с методами
6. Запускает `serverpod generate` для обновления клиента

### Структура endpoints
```dart
// python1_endpoint.dart
class Python1Endpoint extends MicroserviceEndpoint {
  @override String get serviceUrl => 'PYTHON1_SERVICE_URL';
  @override String get serviceName => 'python1';

  Future<String> ping(Session session) =>
      callGet(session, '/api/v1/ping');
}
```

### MicroserviceEndpoint (базовый класс)
Находится в `endpoints/shared/microservice_endpoint.dart`. Содержит общую логику HTTP вызовов:
- `callGet()`, `callPost()`, `callPut()`, `callDelete()`
- Timeout, error handling, logging

## WorkflowModifier — модификация для monorepo

При добавлении микросервиса в monorepo:
1. Добавляет `paths` фильтр в workflow (CI запускается только при изменении папки)
2. Обновляет пути Docker build (`context`, `file`)
3. Обновляет пути K8s манифестов
4. Заменяет `python-fastapi` на имя проекта (для уникальных service names)
5. Перемещает workflow в корень репо

### Именование сервисов
- Шаблон: `python-fastapi-service`
- При копировании: `python-fastapi` → `{projectName}`
- Результат: `python1-service`, `python2-service`, etc.

## Шаблоны

Хранятся в `g:\Templates\`:
- `python/python-fastapi/` — Python FastAPI микросервис
- `serverpod/t115/` — Serverpod проект

### Требования к шаблонам
- **Должны быть рабочими проектами** (без placeholders)
- Генератор заменяет имена при копировании

## OpenAPI Parser

Файл: `parsers/openapi_parser.ts`

### cleanOperationId
Очищает FastAPI operationId для создания Dart методов:
- `calculate_square_square_api_v1_square_get` → `calculateSquare`
- Удаляет дубликаты слов
- Фильтрует `api`, `v1`, `post`, `get`
- Преобразует в camelCase

### Типы
- `integer` → `int`
- `number` → `double`
- `array` → `List<T>`
- `object` без schema → `Map<String, dynamic>`

## Важные особенности

1. **Модели не генерируются** — для Bridge используйте Freezed на Flutter стороне
2. **serverpod generate** вызывается автоматически после генерации endpoints
3. **Каждый микросервис = отдельный workflow** с path filter
4. **terminalCommands** — синхронное выполнение команд (ждёт завершения)

## Типичный flow разработки

```
1. createNewProject          # Создать Serverpod monorepo
2. addPythonProject          # Добавить Python микросервис
3. Разработка API в Python
4. generatePythonBridge      # Сгенерировать Serverpod endpoints
5. Flutter использует client.python1.methodName()
6. git push → GitHub Actions деплоит изменённые сервисы
```

## Зависимости

- VS Code Extension API
- Node.js `child_process` для terminal команд
- `fetch` для HTTP запросов к OpenAPI
