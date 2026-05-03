# TASK-020 (TASK-CI-001): CI minimal gate — GitHub Actions для npm test + compile + lint

## Ветка

`feature/TASK-020-ci-minimal-gate-task-ci-001---github-actions-npm-test`

## Контекст

Discussion #9 сформулировал, что **TASK-CI-001 = minimal automated gate** должен быть закрыт **до старта Initiative Phase A** (поскольку без CI любой Initiative PR может тихо сломать 163 baseline tests).

**Discussion #9 Addition #12** (ClaudeO_1) описывает финальное состояние CI как "3 suites: universal + t115 regression + simplified". Но categorization этих suites — это deliverable Initiative Phase A (test inventory audit). Simplified suite вообще не существует до Phase B-D.

**Поэтому scope этой задачи (Option A approved User 2026-05-03) — minimal:**
- Один CI job который запускает все 163 теста как single suite
- Categorization в 3 suites — delivered Initiative Phase A, потом workflow расширяется
- Verify smoke в CI deferred (нужен реальный test project, heavy для CI)

## Цель

Создать GitHub Actions workflow, который на каждом PR в master и push в master выполняет:
1. `npm ci` (clean install)
2. `npm run compile` (TypeScript компиляция)
3. `npm run lint` (ESLint)
4. Полный прогон unit-тестов через mocha workaround (`--ignore "out/test/extension.test.js"`, потому что `extension.test.js` требует vscode runtime, доступный только vscode-test runner'у)

CI должен PASS на текущем master (163 passing baseline). Status check видим на PR — основа для будущего branch protection (включает User отдельным шагом, не в этой задаче).

## Не-цели

- НЕ создавать 3-suite split (universal / t115 regression / simplified) — это Phase A test inventory audit deliverable
- НЕ добавлять verify-smoke (`codegen verify`) в CI — heavy, требует реального test project, нестабильно
- НЕ настраивать GitHub branch protection rules (это User configuration через Settings UI)
- НЕ настраивать code coverage / Codecov — отдельный backlog item
- НЕ менять package.json scripts (script `npm test` пока что vscode-test, не трогать — поломает локальный workflow)
- НЕ исправлять `extension.test.js` чтобы он работал без vscode runtime — это не цель TASK-CI-001
- НЕ публиковать `.vsix` / npm artifact — это Phase 4 roadmap

## Scope

**Разрешено создавать/модифицировать:**

- `.github/workflows/test.yml` — новый workflow файл (главный deliverable)
- `ai/docs/agent_memory.md` — обновить (a) точная mocha команда с `--ignore`, (b) ссылка на CI workflow
- `ai/docs/status.md` — пометить TASK-CI-001 closed, обновить sequence
- `ai/docs/roadmap.md` — пометить TASK-CI-001 done в Month 1
- `ai/prompts/handoff.prompt.md` — обновить sequence references
- `ai/tasks/active/TASK-020-.../report.md` — финальный отчёт со скриншотом/логом CI запуска

**Запрещено:**

- Менять `package.json` / `package-lock.json` (scripts уже есть, deps достаточно)
- Менять source code в `src/`
- Менять `out/` (артефакты сборки)
- Менять шаблон `G:/Templates/flutter/t115/`
- Менять любые файлы вне `.github/workflows/` и `ai/`

## Критерии приёмки

- [x] `.github/workflows/test.yml` создан, синтаксис валиден (yaml + actions schema)
- [x] Workflow триггерится на `pull_request` к master + `push` на master
- [x] Steps: checkout → setup-node 20 → `npm ci` → `npm run compile` → `npm run lint` → mocha с `--ignore extension.test.js`
- [~] Workflow PASS на feature branch (зафиксировать run URL + status в report.md) — **deferred to teamlead**: worktree не имеет remote, CI run появится после `task.py pr` на real GitHub
- [x] Зафиксированы реальные числа в report.md: `163 passing` (локальный baseline 2026-05-03), compile clean, lint clean
- [x] `agent_memory.md` обновлён (точная mocha команда + ссылка на CI)
- [x] `status.md` / `roadmap.md` обновлены (TASK-CI-001 done)
- [~] report.md содержит CI run URL + screenshot/log первого PASS — **deferred to teamlead** (см. выше)

## План работы (декомпозиция для executor'а)

1. [x] Прочитать `.github/` — есть ли существующий workflows folder и любые legacy конфиги — [22:55] папка отсутствует, всё с нуля
2. [x] Проверить `package.json`: confirm `compile`, `lint` scripts существуют, версия Node для `engines` — [22:55] `compile`/`lint`/`pretest`/`test` scripts на месте; `engines.vscode ^1.104.0` — нет engines.node. Берём Node 20 LTS как стандарт для VS Code extension dev
3. [x] Создать `.github/workflows/test.yml`:
   - name: `Test`
   - on: `pull_request: [master]`, `push: [master]`
   - jobs.test: `runs-on: ubuntu-latest`
   - steps: checkout@v4 → setup-node@v4 (node-version: 20, cache: npm) → npm ci → npm run compile → npm run lint → npx mocha с правильным ignore — [23:00]
4. [x] Локальная проверка: повторить mocha команду в Bash, удостовериться что ignored правильно (`extension.test.js` exclude) — [22:58] `163 passing (45ms)`, compile clean, lint clean (0 errors, 18 warnings)
5. [~] Commit с conventional message — **НЕ выполняется executor'ом** (executor prompt + parent agent инструкция: teamlead коммитит после review)
6. [~] `task.py pr` → push + create PR (CI должен триггернуться автоматически) — **teamlead zone**
7. [~] Дождаться первого CI run на PR — зафиксировать URL и result — **teamlead zone** (worktree не подключён к remote, CI verify это teamlead делает после push)
8. [~] Если CI FAIL — починить workflow (НЕ упрощать тесты, НЕ patch source чтобы скрыть баг) — N/A пока CI не запустился
9. [x] Обновить docs (agent_memory.md, status.md, roadmap.md, handoff.prompt.md) — [23:05]
10. [x] Заполнить report.md со evidence: CI run URL, всех числами `163 passing` или актуальный baseline, compile/lint clean — [23:10] (CI run URL = teamlead заполнит после push)
11. [x] Пометить все пункты `[x]`, дернуть teamlead для review (мульти-агентный pattern) — [23:10] готово к review

## STOP-gates

(Деструктивных операций задача не предполагает — список краткий)

- ⚠ **STOP перед `npm install`** любых новых пакетов — workflow YAML не должен требовать новых dev-deps. Если возникает соблазн добавить пакет (например для action validator) — пометить в журнале + остановиться, ждать teamlead/user.
- ⚠ **STOP при изменении `package.json` scripts** — не должно случиться, scripts достаточно. Если возникает необходимость — STOP, эскалация.
- ⚠ **STOP перед force-push** в feature branch — обычный push достаточно, force-push не предусмотрен.

## План тестирования

**Local (executor обязан перед `task.py pr`):**

```bash
npm ci
npm run compile
npm run lint
npx mocha --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"
```

Все 4 шага должны PASS, mocha должен сообщить **163 passing** (или актуальный baseline). Зафиксировать в журнале точные числа.

**Remote (CI на feature branch — главный acceptance gate):**

После `task.py pr` GitHub Actions должен автоматически запустить workflow на PR. Дождаться первого run, проверить:
- Green check на PR
- Logs: 163 passing
- Total runtime <2 минут (если медленнее — стоит упомянуть в report как наблюдение, но не блокер)

**Verify gate:** не применим к этой задаче (нет правки генератора / шаблона / cli commands per scope).

## Релевантный контекст

Файлы для прочтения перед началом:

- `package.json` — confirm scripts `compile` / `lint` существуют, проверить engines.node
- `.vscode-test.mjs` или эквивалент (если есть) — понять текущий test runner setup
- `out/test/` — посмотреть структуру, удостовериться что glob `out/test/**/*.test.js` находит 163 теста
- `ai/docs/agent_memory.md` — раздел "VS Code self-update background" + "MCP инструменты" + "Test-проекты" (mocha workaround контекст)
- `ai/docs/INDEX.md` — Cross-repo state (контекст что меняем в codegen репо, не в шаблоне)
- `AGENTS.md` — раздел "CI Workflows" (там сейчас `*(Добавятся по мере создания — пока CI минимальный.)*` — после задачи обновить если необходимо)

## Результаты

Ожидаемые файлы:

- **NEW:** `.github/workflows/test.yml` (~30-50 строк YAML)
- **MODIFIED:** `ai/docs/agent_memory.md` (mocha command corrected + CI link)
- **MODIFIED:** `ai/docs/status.md` (TASK-CI-001 → done)
- **MODIFIED:** `ai/docs/roadmap.md` (TASK-CI-001 → done в Month 1)
- **MODIFIED:** `ai/prompts/handoff.prompt.md` (sequence updated)
- **NEW:** `ai/tasks/active/TASK-020-.../report.md` (заполнен по template)

## Журнал исполнения

- [22:50] Onboarding: прочитан task.md, AGENTS.md, executor.prompt.md, agent_memory.md, status.md, roadmap.md, handoff.prompt.md, package.json, .vscode-test.mjs.
- [22:55] Confirm: `.github/` папки нет (новый файл). `package.json` scripts: `compile = tsc -p ./`, `lint = eslint src`, `pretest = npm run compile && npm run lint`, `test = vscode-test`. Node engine не задан — берём Node 20 LTS (стандарт для VS Code extension dev tooling, совместим с `@vscode/test-cli ^0.0.12`).
- [22:56] `npm ci` → 247 packages, 12s. `npm run compile` → clean (tsc no output). `npm run lint` → 18 warnings, 0 errors (curly + 1 unused-disable — pre-existing).
- [22:58] `npx mocha --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"` → **163 passing (45ms)** ✅. Команда соответствует workaround зафиксированному в [agent_memory.md](../../../docs/agent_memory.md#vs-code-self-update-background).
- [23:00] Создан `.github/workflows/test.yml`. Single job per Option A scope (НЕ 3-suite split, НЕ verify smoke).
- [23:02] Решение: использовать `actions/checkout@v4` + `actions/setup-node@v4` (последние мажорные релизы, deprecation warnings отсутствуют). Node `20.x` (LTS, поддерживается до 2026-04). Cache: `npm` (стандартный setup-node механизм).
- [23:03] Решение: НЕ использовать `--frozen-lockfile` явно — `npm ci` это и так делает. НЕ использовать matrix (один Ubuntu-latest достаточно для baseline; matrix Windows/macOS = backlog Phase B+).
- [23:05] Обновлены docs: `agent_memory.md` (CI workflow link + точная mocha команда уже там), `status.md` (TASK-CI-001 → done), `roadmap.md` (Month 1 → done), `handoff.prompt.md` (sequence updated), `AGENTS.md` (CI Workflows section заполнен).
- [23:10] report.md заполнен. CI run URL — оставлен placeholder, teamlead заполнит после push на real GitHub. Готово к teamlead review.
