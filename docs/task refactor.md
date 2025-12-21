# Refactoring Plan — Microservice Module

## Цель

Устранить дублирование, подготовить код к тестированию, унифицировать поддержку Python/Node/Go.

---

## Оптимизация меню

**Было (6+ команд)** → **Будет (4 команды)**:

```
Code Generator: Microservices
├── Add Microservice          → все шаблоны, язык определяется автоматически
├── Import Microservice       → импорт в текущий проект
├── Export Microservice       → экспорт из текущего проекта
└── Remove Microservice       → удаление из текущего проекта
```

---

## Определение языка

### При добавлении (из шаблона)
По родительской папке: `Templates/python/` → `python`

### При import/export/remove (существующий проект)

**Приоритет:**
1. `template.json` (если создан расширением)
2. Файлы-маркеры (fallback для внешних проектов)

```typescript
function detectLanguage(projectPath: string): 'python' | 'node' | 'go' | null {
  // 1. Проверяем template.json
  const templateJson = path.join(projectPath, 'template.json');
  if (exists(templateJson)) {
    return JSON.parse(readFile(templateJson)).language;
  }
  
  // 2. Fallback по файлам-маркерам
  if (exists(path.join(projectPath, 'pyproject.toml'))) return 'python';
  if (exists(path.join(projectPath, 'package.json'))) return 'node';
  if (exists(path.join(projectPath, 'go.mod'))) return 'go';
  return null;
}
```

### Формат template.json

Создаётся при добавлении микросервиса:

```json
{
  "language": "python",
  "templateName": "python-fastapi",
  "createdAt": "2025-12-21T06:30:00Z"
}
```

## Архитектура

```
src/core/
├── interfaces/
│   └── microservice_language.ts     # Интерфейс языка
├── services/
│   ├── microservice_service.ts      # add/import/export/remove
│   └── workflow_modifier.ts         # Перенести из python/
│
src/modules/
├── python/python_language.ts
├── node/node_language.ts
└── go/go_language.ts
```

---

## Интерфейс MicroserviceLanguage

```typescript
interface MicroserviceLanguage {
  name: string;                     // 'python', 'node', 'go'
  displayName: string;              // 'Python', 'Node.js', 'Go'
  templateCategory: string;         // Папка в templates/
  defaultPort: number;              // 8000, 3000, 8080

  initialize(projectPath: string): Promise<void>;
  getExclusions(): string[];        // ['__pycache__'] или ['node_modules']
  
  // Bridge Generation (OpenAPI → Serverpod)
  getOpenApiUrl(port?: number): string;
}
```

---

## MicroserviceService

```typescript
class MicroserviceService {
  constructor(private language: MicroserviceLanguage) {}

  async addProject(options: AddOptions): Promise<void>
  async importProject(source: string, target: string): Promise<void>
  async exportProject(source: string, target: string): Promise<void>
  async removeProject(projectPath: string): Promise<void>
}
```

---

## План действий

### Фаза 1: Инфраструктура
- [ ] Создать `src/core/interfaces/microservice_language.ts`
- [ ] Перенести `WorkflowModifier` в `src/core/services/`
- [ ] Создать `src/core/services/microservice_service.ts`
- [ ] Создать `detectLanguage()` утилиту

### Фаза 2: Реализация языков
- [ ] Создать `python_language.ts`
- [ ] Создать `node_language.ts`
- [ ] Создать `go_language.ts`

### Фаза 3: Команды
- [ ] Переписать `addMicroservice` (одна команда для всех языков)
- [ ] Обновить `importMicroservice` (использовать detectLanguage)
- [ ] Обновить `exportMicroservice`
- [ ] Обновить `removeMicroservice`

### Фаза 4: Очистка
- [ ] Удалить `add_python_project.ts`, `add_node_project.ts`, `add_go_project.ts`
- [ ] Обновить `package.json` (4 команды вместо 6+)
- [ ] Вынести общие утилиты в `src/utils/`

### Фаза 5: Тесты
- [ ] Unit-тесты для `MicroserviceService`
- [ ] Mock `MicroserviceLanguage` для тестов
