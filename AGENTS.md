# AGENTS.md — процесс работы с задачами

Процесс feature branch → PR → squash merge для многоагентной работы над задачами в code-generator (TypeScript: VS Code extension + CLI `codegen`).

## Глобальные правила (обязательны для ВСЕХ агентов)

### Запреты

- **НИКОГДА не костыльные/хакерские решения** без явного разрешения пользователя.
  Примеры костылей: `Future.delayed` вместо правильного ожидания события, глобальные singleton'ы вместо DI, подавление ошибок через try/catch без re-throw, hardcoded константы вместо конфига, "временное" решение которое останется навсегда.
  Если корректное решение невозможно — **сказать честно**, предложить варианты, ждать решения пользователя. НЕ маскировать проблему.
- **НИКОГДА не упрощать тесты/критерии приёмки** самовольно. Если тест невозможен/сложен — **заблокировать задачу** и уведомить пользователя.
- **НИКОГДА не принимать архитектурные решения** без согласования. Выбор библиотеки, паттерна, подхода, нового компонента — требует обсуждения с пользователем (или ADR через дискуссию).
- **НИКОГДА не мержить в master** без явного `y/N` confirm от пользователя (или `--yes`/`-y` флага, который пользователь сам передал).
- **Никогда не push в master напрямую.** Все изменения через feature branch → PR.
- **Никогда не `push --force` в master.** Force push разрешён только в feature branches.
- **Никогда не объединять несколько задач в один PR** — один task = один PR.

### Правила остановки (block + notify user)

Агент ДОЛЖЕН остановить работу и уведомить пользователя если:

- **Тесты не прогоняются** (`npm test` / `npm test` ошибка окружения) и нет очевидного пути их починить.
- **Сборка падает на неочевидной ошибке** (не typo, а conceptual issue).
- **Критерий приёмки не выполняется** и нет очевидного пути его выполнить.
- **Требуется архитектурное решение** которого нет в task.md/ADR.
- **Данные для работы не совпадают** с task.md (например "прочти X" но X отсутствует).

Формат уведомления: в `report.md` чёткий раздел `## BLOCKED — требуется решение user'а` с описанием проблемы и предложенными вариантами.

### Коммиты

- Conventional Commits, комментарии на **русском**
- **НЕ добавлять строку `Co-Authored-By`**
- Коммит по явной команде пользователя (или внутри PR flow executor'а) — **не самовольно**

### Прогресс через task.md

Executor ведёт прогресс в **трёх секциях самого task.md**: "План работы" (чек-лист от teamlead'а), "STOP-gates" (деструктивные операции, подтверждение user'а перед каждой), "Журнал исполнения" (решения/блокеры от executor). Отдельного journal-файла нет. Детали — в `ai/prompts/executor.prompt.md` и `ai/tasks/_template/task.md`.

**Teamlead обязан:** декомпозировать задачу в "План работы" и перечислить ожидаемые destructive ops в "STOP-gates" при создании task.md. Абстрактные "реализовать X" недопустимы.

### Субагенты (2026-04-26 — разрешены с условиями)

**Spawn через Agent tool разрешён.** Условия:

- **Destructive ops через субагента = STOP-gate.** Любая destructive op (`npm install <package>@major`, правка шаблона `G:/Templates/flutter/t115/`, удаление test-проектов в `G:/Projects/Flutter/serverpod/t<N>/`, `git push --force`, массовое удаление файлов) внутри субагента — субагент обязан вернуть управление teamlead'у через секцию "нужно подтверждение", teamlead передаёт user'у, user одобряет, только тогда субагент продолжает.
- **Промпт субагенту** должен явно содержать: "при любой destructive op — записать в report.md `⚠ STOP: <op>, жду ok` и остановиться до моего ответа".
- **После работы субагента** — teamlead читает его результат (report / diff / CLI вывод), не доверяет слепо. Субагент не видит контекст user'а, может принять неверное решение.
- **Multi-agent code review:** после implementation сложной задачи — diff отдать двум независимым агентам для review до commit'а. Validated в weight-system (TASK-009/013, нашли 4-5 багов на каждой задаче). Применимо и в этом проекте.

Альтернатива (если нужно изолированное окружение): user запускает executor'а в новом чате с `ai/prompts/executor.prompt.md`. Оба пути валидны, выбор по контексту.

### MCP инструменты — частично blacklist

`mcp__dart__*` tools — N/A для этого проекта (он TypeScript, не Dart). Всё через Bash из корня репо:

```bash
npm run compile          # tsc -p ./
npm test                  # vscode-test (62 passing baseline)
npm run lint              # eslint
node out/adapters/cli/index.js verify --name <test_project> --human   # DoD-гейт
```

Это правило применяется и к субагентам — в промпте явно указывать "Dart MCP не использовать, через Bash npm/tsc commands".

## Workflow на задачу

Для автоматизации используется `ai/scripts/task.py` с subcommands `start / pr / merge / finish`.

### 1. Teamlead: создать ветку перед запуском executor

```bash
python ai/scripts/task.py start TASK-XXX-short-name
```

Эквивалент ручных команд:
```bash
git checkout master && git pull --ff-only origin master
git checkout -b feature/TASK-XXX-short-name
```

Ветка **не пушится** на этом этапе.

Для chore / fix / docs / hotfix используй соответствующий префикс: `task.py start chore/short-name`.

### 2. Executor

- Работает в основном репо на `feature/TASK-XXX` (создана через `task.py start`)
- Коммитит туда напрямую
- Обновляет task.md секции "План работы" / "STOP-gates" / "Журнал исполнения" по ходу работы
- Runtime тестирование через `npm test` / `npm run lint` (не через MCP инструменты analyze_files — зависает)

### 3. Teamlead: review → push → PR

Сначала прочитать 3 секции task.md + report.md:
```bash
cat ai/tasks/active/TASK-XXX-*/task.md
cat ai/tasks/active/TASK-XXX-*/report.md
```

Если ок — автоматизация:
```bash
python ai/scripts/task.py pr
```

Что делает:
- Перемещает task из `active/` в `done/` (`git mv` + commit)
- `git push -u origin feature/...`
- `gh pr create` с `--body-file report.md`

### 4. User: approve + squash merge

```bash
python ai/scripts/task.py merge       # интерактивный confirm
python ai/scripts/task.py merge -y    # без prompt (для скриптов)
```

**ВАЖНО ДЛЯ АГЕНТОВ:** НЕ передавать `--yes` / `-y` без явного одобрения пользователя — это касается **обеих** команд: `task.py merge -y` **и** `task.py finish -y` (finish внутри вызывает merge, флаг опасен одинаково). По умолчанию (без TTY + без `--yes`) скрипт откажется мержить.

### Post-merge verify (обязательно для teamlead)

После каждого merge — **не отчитываться "всё ок" пока локальный workspace не зелёный**. Особенно если merged PR трогал:

- `package.json` / `package-lock.json` (изменение зависимостей)
- `src/features/generation/` (генератор)
- `src/adapters/cli/commands/{create_project,generate_entity}.ts`
- `G:/Templates/flutter/t115/` (шаблон вне репо)

Чек-лист:

1. `git pull --ff-only` (task.py merge делает это сам).
2. `npm ci` или `npm install` — если менялся `package.json` / `package-lock.json`.
3. `npm run compile` — clean compile должен проходить.
4. `npm test` — все тесты passing (62 passing baseline на 2026-04-26).
5. **Если merged PR трогал генератор или шаблон t115** — обязательно `codegen create-project --name t<N+1>` + `codegen verify --name t<N+1>`. Зафиксировать `errors=N, warnings=M` в финальном отчёте user'у.
6. Только после п.4-5 писать пользователю «merged + master зелёный».

**Не путать с CI:** CI тестирует то что в master, post-merge verify проверяет что свежее e2e создание проекта работает (потому что шаблон вне репо может отстать или содержать конфликтующие правки от другого фикса).

С флагом `--force` мержит даже если CI не зелёный (для hotfix):
```bash
python ai/scripts/task.py merge --force
```

### 5. Одной командой (pr + merge)

Если задача простая и CI точно пройдёт:
```bash
python ai/scripts/task.py finish
```

Запускает `pr`, затем сразу `merge`.

## Параллельные vs последовательные задачи

### Последовательные (зависят друг от друга)

Пример: TASK-002 → TASK-003 (API из 002 используется в 003).

Следующую задачу запускать **только после merge предыдущей в master**. Executor берёт свежий master через `git checkout master && git pull` перед созданием feature branch.

### Параллельные (независимые)

Пример: UI-задача и data-layer задача могут идти одновременно в разных feature branch. PR создаются независимо, merge в порядке завершения.

### ⚠ Накопление открытых PR — антипаттерн

**Один открытый PR за раз — норма.** Если параллельные ветки нужны (две независимые фичи) — допустимо **2-3** одновременно, не больше. Накопление 5+ открытых PR гарантированно даст каскад rebase-конфликтов: после каждого squash-merge SHA в master меняются, и остальные ветки становятся «позади» master, у них появляются конфликты которых до merge не было (`MERGEABLE` → `CONFLICTING` сразу после merge соседнего PR).

**Если приходится накопить** (ушёл с машины, ждал review):

1. **Перед `gh pr create` каждой новой ветки** делай `git rebase origin/master` — иначе ветка отстаёт ещё до создания PR.
2. **Мержи в порядке зависимости**, не по дате создания: сперва те которые добавляют файлы, потом те которые их меняют, последним — refactor затрагивающий все.
3. После каждого merge **проверяй mergeable-статус остальных** через `gh pr view N --json mergeable` — если стал `CONFLICTING`, ребейзь до того как пытаться мержить.

**Lesson learned (2026-04-25):** в очереди стояло 7 PR, бранчеванных от разных pre-merge state'ов (TASK-013 от TASK-010, TASK-011 от TASK-010, остальные от разных снимков master). При мердже #19 hooks deny на push добавились к worktree, что заблокировало force-push для resolve конфликта #20 (rebase-конфликт по `.gitignore`). Сложность была не в "разработке на 2 машинах", а в том что 7 параллельных PR + hooks-меняющий PR в середине очереди.

### ⚠ Hooks-меняющие PR — отдельной волной

Любой PR который трогает `.claude/settings.json`, `pre-commit` хуки, `task.py`, или иные механизмы блокирующие/разрешающие команды — мержить **в окне когда других открытых PR нет**. Иначе:

- После merge PR с новым `deny` правилом — у уже-существующих PR может перестать работать команда нужная для resolve конфликта (force-push, rebase).
- После merge PR с новым `allow` — ничего не сломается, но непредсказуемо.

Правило: PR меняющий `.claude/settings.json` или хуки — **анонсируется в чате**, ждёшь пока остальные открытые PR смержатся, мержишь его **первым** в новой волне работ, потом продолжаешь обычный flow. Не смешивать с housekeeping в один PR (как сделал #19) — там получилось что hooks применились в середине обработки очереди.

## Runtime тестирование

code-generator — TypeScript: VS Code extension + CLI `codegen`. Тестирование через npm/tsc + DoD-гейт `codegen verify`.

### Приоритет инструментов

| Инструмент | Канал | Назначение |
|-----------|-------|-----------|
| `npm run compile` (Bash) | CLI | tsc — проверка типов TypeScript |
| `npm test` (Bash) | CLI | Unit-тесты на vscode-test + MockFileSystem (62 passing baseline) |
| `npm run lint` (Bash) | CLI | eslint статический анализ |
| `codegen verify --name <X>` (Bash) | CLI | **DoD-гейт**: pub get + serverpod generate + build_runner + flutter analyze на свежем сгенерированном проекте |
| `codegen create-project` + ручной `flutter run` | GUI | Smoke runtime проверка сгенерированного проекта — зона user'а |
| Установленный `.vsix` + Command Palette | GUI | Smoke VS Code расширения — зона user'а |

### ⚠ MCP инструменты

`mcp__dart__*` — N/A для этого проекта (он TypeScript). Не использовать.

**Всегда через Bash из корня репо:**
```bash
npm run compile
npm test
npm run lint
node out/adapters/cli/index.js verify --name <test_project> --human
```

Если агент попробует `mcp__dart__analyze_files` (N/A для TS) — сессия зависнет, прогресс потеряется. Это hard-rule.

### Правила тестирования

Полная политика по слоям пирамиды — [`ai/docs/conventions.md → Testing`](ai/docs/conventions.md#testing).

1. **Executor ОБЯЗАН тестировать** в одном PR с кодом:
   - **Unit-тесты на новый чистый код** (helpers, parsers, generators, mappers, валидаторы) — ~100% публичного API на MockFileSystem. **Без исключений.**
   - **Расширение existing test-suite** при правке `AppDatabaseGenerator`, `RelationPatcher`, `EntityYamlValidator`, `replacement_util`, `verify` — добавить покрытие изменённого поведения.
   - **`codegen verify --name t<N+1>` PASS** обязателен для любой правки `src/features/generation/` или шаблона `t115/`. Это **Definition of Done гейт**.
   - **Runtime-чек** для миграций / runtime-логики сервера: `docker compose up -d` + `serverpod create-migration --force` + `dart bin/main.dart --apply-migrations` + `curl http://localhost:8080/`.
   - **Regression тест на каждый fix** — обязательно.

2. **Принцип:** агент быстро перепишет тесты при изменении фичи; **отсутствие теста через 2-3 месяца при рефакторинге** — реальная регрессия. Лучше написать "лишний" тест. Без verify-гейта правка генератора **не считается** готовой.

3. **Build + test check** обязателен (из корня репо):
   ```bash
   npm run compile          # tsc -p ./
   npm test                  # vscode-test (62 passing baseline на 2026-04-26)
   npm run lint              # eslint
   node out/adapters/cli/index.js verify --name <test_project> --human   # DoD-гейт для генератора
   ```

4. **В `report.md` обязательно** приводить реальный вывод CLI:
   ```
   [npm test] npm test
   → 62 passing (115ms)

   [verify] node out/adapters/cli/index.js verify --name t144 --human
   → PASS: verify t144
       ✓ flutterAnalyze — 6158ms (errors=0, warnings=2, infos=75)
       ✓ pubGet — 5262ms
       ✓ serverpodGenerate — 9932ms
       ✓ buildRunner — 4726ms
   ```

5. **Executor при блокировке** (тесты падают, verify FAIL и нет очевидного фикса) → НЕ упрощать тесты, **НЕ патчить руками target-проект**. `## BLOCKED` в report, ждать решения user'а.

### Структура проекта

Не Flutter-монорепо, а TypeScript single-package (`package.json` в корне) с зонами в `src/`:
- `src/adapters/cli/` — CLI команды
- `src/adapters/vscode/` — VS Code расширение
- `src/core/` — доменная логика без vscode
- `src/features/generation/` — генератор сущностей (parsers, generators, replacement)
- `src/modules/{flutter,go,node,python}/` — реализации `MicroserviceLanguage`
- `src/test/` — тесты на `vscode-test` + MockFileSystem

Шаблон проектов **вне репозитория**: `G:/Templates/flutter/t115/`. Любая правка шаблона — это template-уровень, влияет на все будущие `create-project`. STOP-gate.

Сгенерированные test-проекты — в `G:/Projects/Flutter/serverpod/t<N>/`. Создаются через `codegen create-project --name t<N>`. **Не редактировать руками** для скрытия багов генератора (политика "новый t<N+1> при каждом фиксе").

### Что НЕ покрывается CLI

- Визуальная проверка VS Code UI команд (Command Palette) — установка `.vsix` + ручной кликинг
- Реальный multi-client sync flow (создать сущность → real-time event на другом клиенте) — зона user'а
- Performance / latency большой генерации (50+ сущностей)

Для этого — секция "Ручные проверки user" в task.md.

## CI Workflows

*(Добавятся по мере создания — пока CI минимальный.)*

## Branch Protection (master)

В GitHub Settings → Branches → Add rule для `master`:

- ✅ Require pull request before merging
- ✅ Block force push

## Hotfix процесс

Для критичных багов:

1. `python ai/scripts/task.py start hotfix/<short>`
2. Минимальный diff
3. PR с меткой `hotfix`
4. Быстрый review → squash merge

## Что хранится в репо

- `ai/tasks/active/` — задачи в работе (`task.md` → `report.md` во время работы)
- `ai/tasks/done/` — завершённые задачи
- `ai/tasks/blocked/` — заблокированные
- `ai/docs/decisions/` — ADR (не редактировать закрытые)
- `ai/discussions/active/` — активные обсуждения
- `ai/discussions/archive/` — завершённые

## Code-generator → потребители (weight-system, других проектов)

Code-generator **управляет шаблоном** `G:/Templates/flutter/t115/` и CLI `codegen`. Этим инструментом создаются конкретные проекты (например weight-system).

- Любая правка `src/features/generation/` или шаблона t115 имеет blast radius **на все будущие** `create-project` запуски. Учитывать это при scope.
- Внешние агенты в проектах-потребителях могут найти баг генератора и прислать фикс сюда (реальный кейс: TASK-015 в weight нашла BUG-006 → фикс пришёл в code-generator). Бывает.
- Шаблон t115 — **не репо**. Изменения в шаблоне `G:/Templates/flutter/t115/` не отслеживаются git'ом этого репо. Учитывать при описании изменений в PR (что именно поменяно в шаблоне).
- При изменении шаблона — обязательно прогон `codegen create-project --name t<N+1>` + `codegen verify --name t<N+1>` чтобы убедиться что шаблон не сломан.
