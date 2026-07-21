# Отчёт TASK-036 — версионирование расширения + фикс reinstall handler

## Резюме

Расширение всегда показывало `0.0.1` → непонятно, обновилось ли после переустановки. Сделано (Вариант A — авто-bump для ясности): UI reinstall-handler теперь поднимает patch-версию перед упаковкой, выводит имя `.vsix` из актуальной version, пакует через `npx @vscode/vsce` (не зависит от глобального `vsce`), а `.vscodeignore` убирает раздувающие .vsix деревья.

## Изменения

- [src/adapters/vscode/utils/vsix_name.ts](../../../../src/adapters/vscode/utils/vsix_name.ts) — **новый** pure-хелпер `vsixFileName(name, version)` (без `vscode`-импорта → тестируем). Убирает хардкод `code-generator-0.0.1.vsix`.
- [src/adapters/vscode/utils/vs_code_menu.ts](../../../../src/adapters/vscode/utils/vs_code_menu.ts) `reinstallExtension`:
  1. `npm version patch --no-git-tag-version` (видимый инкремент, без git-тега/коммита — диф коммитит пользователь когда удобно);
  2. имя `.vsix` из `package.json` name+version (после bump'а хардкод бы сломался);
  3. `vsce package` → `npx @vscode/vsce package --allow-missing-repository` (без глобальной зависимости);
  4. install + reload как раньше.
  Последовательность гарантирована: `terminalCommands` → `execCommand` (child_process.exec) **awaited**, race нет.
- [.vscodeignore](../../../../.vscodeignore) — исключены `ai/`, `docs-code-generator/`, `.claude/`, `.github/`, `tmp/`, `*.vsix`, `CLAUDE.md`, `AGENTS.md`, `changelog.md`, `code-generator.code-workspace`.
- `package.json` / `package-lock.json` — version `0.0.1 → 0.0.2` (первый видимый инкремент).

## Тесты

- Добавлено: 3 (suite `vsixFileName` в [src/test/utils/vsix_name.test.ts](../../../../src/test/utils/vsix_name.test.ts)) — формат `<name>-<version>.vsix`, отражение поднятой версии, отсутствие хардкода имени.
- Все проходят: **Да** — 306 passing (303 + 3), 0 failing; lint 0 errors; compile clean.

## Эмпирическая проверка (полный loop симулирован из терминала)

Reinstall-handler — UI-код (vscode runtime), не запускается из CLI, поэтому прогнал его последовательность вручную:

1. `npm version patch --no-git-tag-version` → `0.0.1 → 0.0.2` ✓
2. имя выведено: `code-generator-0.0.2.vsix` ✓
3. `npx @vscode/vsce package --allow-missing-repository` → собрано ✓, **.vsix ужался 571 файл / 1.71 MB → 368 файлов / 699.59 KB** (~59%, ai/ ушло) ✓
4. `code --install-extension ... --force` → установлено, `code --list-extensions --show-versions` = **`mrfrolk.code-generator@0.0.2`** ✓ (версия видимо выросла — цель достигнута)

## Риски / Заметки

- Не-generator tooling-изменение, эмпирически проверено end-to-end → multi-agent review не запускался (proportionate).
- Авто-bump на каждый UI reinstall меняет `package.json` (tracked) — мелкий диф, коммитится пользователем. Сознательный выбор (Вариант A, User approved) ради «понятно что обновилось».
- `.vsix` остаётся 368 файлов — дальнейшее ужатие требует bundling (esbuild/webpack), отдельная задача (vsce warning), вне scope.
- Productization (публичный Marketplace) — НЕ делалось: расширение не самодостаточно (внешние t115-шаблоны, Windows-only powershell, toolchain-deps). Отдельный трек если понадобится внешний пользователь.

## Статус

Ready for review. Коммит/PR — по явному указанию User.
