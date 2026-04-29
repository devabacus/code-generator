# Руководство по разработке

Стек: **TypeScript + Node.js + VS Code Extension API + commander (CLI)**.

## Требования

- **Node.js** 22.x (см. `@types/node` в `package.json`)
- **TypeScript** 5.9.3 (из `node_modules`, НЕ встроенный в VS Code — см. [troubleshooting.md](troubleshooting.md))
- **VS Code** ≥ 1.104.0
- **Windows** — CLI использует PowerShell для `child_process.exec` ([core/utils/exec.ts](../../src/core/utils/exec.ts))
- **Serverpod CLI** + **Flutter SDK** — для запуска сгенерированных проектов

## Установка

```bash
npm install
```

Шаблоны (`t115` и другие) ожидаются по пути `codeGenerator.templatesPath` (default: `G:/Templates`).

## Окружение

Проект НЕ требует `.env`. Конфигурация через:
- VS Code: `codeGenerator.templatesPath`, `codeGenerator.pythonProjectsPath`, `codeGenerator.patchingMode`
- CLI: флаги `--templates-path`, `--projects-path`, `--templ-project`

---

## Команды

### Сборка

```bash
npm run compile          # tsc -p ./ (однократно)
npm run watch            # tsc -watch -p ./ (постоянно)
npm run lint             # eslint src
```

### Тесты

```bash
npm test                 # vscode-test (запускает out/test/**/*.test.js)
npm run pretest          # compile + lint (запускается автоматически перед test)
```

### Запуск CLI

```bash
# Через npm script
npm run cli -- <command> [options]

# Напрямую
node out/adapters/cli/index.js <command> [options]

# Примеры
node out/adapters/cli/index.js --help
node out/adapters/cli/index.js create-project --name t140 --human
node out/adapters/cli/index.js generate-entity --yaml path/to/task.spy.yaml --human
node out/adapters/cli/index.js add-microservice --language python --name myservice --human
```

CLI-вывод:
- **JSON** (default) — в stdout, для автоматизации
- **Human-readable** (`--human`) — форматированный вывод
- **Логи/прогресс** — всегда в stderr

### Запуск VS Code-расширения (dev)

1. Открыть проект в VS Code
2. `F5` — запустится Extension Development Host
3. В новом окне открыть любой воркспейс
4. `Ctrl+Shift+P` → `Code Generator: ...` (11 команд)

### Сборка `.vsix`

```bash
npm install -g @vscode/vsce   # если не установлен
vsce package                  # создаст code-generator-0.0.1.vsix
```

Установить: `code --install-extension code-generator-0.0.1.vsix`.

---

## Структура папок

Подробнее см. [architecture.md](architecture.md).

```
src/
├── adapters/
│   ├── cli/              # entry: out/adapters/cli/index.js (bin: codegen)
│   └── vscode/           # entry: out/adapters/vscode/extension.js (main)
├── core/                 # доменная логика без vscode
├── features/generation/  # entity-генератор из YAML
├── modules/              # реализации языков микросервисов
├── test/                 # vscode-test: out/test/**/*.test.js
└── utils/                # shared helpers
```

---

## Перед "Ready for Review"

Executor ОБЯЗАН запустить:

```bash
npm run compile    # без ошибок
npm run lint       # без ошибок
npm test           # все тесты проходят
```

Для CLI-команд — smoke-test:
```bash
node out/adapters/cli/index.js <command> --help   # help отдаётся без краша
```

---

## Добавление новой CLI-команды

1. Создать файл `src/adapters/cli/commands/<name>.ts` по образцу [generate_entity.ts](../../src/adapters/cli/commands/generate_entity.ts)
2. Экспортировать `register<Name>(program: Command)` через `.command()` и `.action()`
3. Зарегистрировать в [src/adapters/cli/index.ts](../../src/adapters/cli/index.ts)
4. Использовать `CliLogger` для вывода (JSON по умолчанию)
5. Все exec-вызовы — через `cliExec` (PowerShell на Windows)

## Добавление новой VS Code-команды

1. Создать обработчик в `src/adapters/vscode/commands/<name>.ts`
2. Декларировать в `package.json` → `contributes.commands`
3. **Обязательно** зарегистрировать обработчик в [extension.ts](../../src/adapters/vscode/extension.ts): `commands.registerCommand("code-generator.xxx", xxxHandler)`

⚠️ Одна только декларация в `package.json` без `registerCommand` даёт ошибку `command '...' not found` — см. [troubleshooting.md](troubleshooting.md).

## Добавление нового языка микросервиса

1. Создать `src/modules/<lang>/<lang>_language.ts` с реализацией `MicroserviceLanguage`
2. Создать `src/modules/<lang>/services/<lang>_initializer.ts`
3. Зарегистрировать в [src/core/language_registry.ts](../../src/core/language_registry.ts)
4. Добавить шаблон в `G:/Templates/<lang>/`
5. Обновить [architecture.md](architecture.md) и [agent_memory.md](agent_memory.md)

---

## Заметки

- Проект использует `"module": "Node16"` в tsconfig — все импорты без расширения
- Коммиты — на русском, Conventional Commits, без `Co-Authored-By`
- Текущая dev-ветка — `feature--create-cli` (master отстал)
