# Troubleshooting

## VS Code: "Cannot find name 'path'" (TS2591) при работающем `tsc`

**Симптом:**
VS Code подчёркивает `import path from "path";` ошибкой TS2591 "Cannot find name 'path'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node`...". При этом:
- `npm run compile` / `npx tsc -p ./` проходит без ошибок
- `@types/node` установлен в `node_modules/@types/node/`
- `tsc --listFiles` показывает, что `@types/node` грузится
- Перезапуск TS Server (`TypeScript: Restart TS Server`) не помогает
- Reload Window не помогает

**Причина:**
VS Code использует **встроенный** TypeScript (bundled), а в проекте стоит более новая локальная версия (`typescript@5.9.3` в `node_modules`). Встроенный TS Server может отставать и некорректно резолвить типы Node при `"module": "Node16"` в tsconfig. CLI `tsc` работает из `node_modules/.bin/tsc` — отсюда расхождение.

**Решение:**
Принудительно использовать workspace-версию TypeScript. В `.vscode/settings.json`:
```json
{
    "typescript.tsdk": "node_modules/typescript/lib"
}
```

После сохранения в VS Code:
1. `Ctrl+Shift+P` → `TypeScript: Select TypeScript Version` → `Use Workspace Version`
2. Или перезапустить окно: `Developer: Reload Window`

Статус-бар в правом нижнем углу должен показать `{}` TypeScript 5.9.3 (версия из node_modules), а не версию, идущую с VS Code.
