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
