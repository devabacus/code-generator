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

- **Destructive ops через субагента = STOP-gate.** Любая destructive op (`flutter pub upgrade --major`, destructive Serverpod migration, `git push --force`, массовое удаление файлов) внутри субагента — субагент обязан вернуть управление teamlead'у через секцию "нужно подтверждение", teamlead передаёт user'у, user одобряет, только тогда субагент продолжает.
- **Промпт субагенту** должен явно содержать: "при любой destructive op — записать в report.md `⚠ STOP: <op>, жду ok` и остановиться до моего ответа".
- **После работы субагента** — teamlead читает его результат (report / diff / CLI вывод), не доверяет слепо. Субагент не видит контекст user'а, может принять неверное решение.
- **Multi-agent code review:** после implementation сложной задачи — diff отдать двум независимым агентам для review до commit'а. Validated в weight-system (TASK-009/013, нашли 4-5 багов на каждой задаче). Применимо и в этом проекте.

Альтернатива (если нужно изолированное окружение): user запускает executor'а в новом чате с `ai/prompts/executor.prompt.md`. Оба пути валидны, выбор по контексту.

### MCP инструменты — blacklist

Запрещено использовать `mcp__dart__*` (N/A для TS-проекта) tools (особенно `analyze_files`) — подвешивают сессию. Всё через Bash:

```bash
cd <package> && flutter analyze
cd <package> && flutter test
cd <package> && dart analyze
cd <package> && dart test
```

Это правило применяется и к субагентам — в промпте явно указывать "MCP инструменты запрещён, через Bash".

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

- `pubspec.yaml` / `pubspec.lock` любого пакета
- `.gitignore` или `.dart_tool/` (housekeeping автоген-артефактов)
- сгенерированные файлы (`*.freezed.dart`, `*.g.dart`, Drift, Serverpod protocol)
- структуру пакета (новый `packages/<X>/`, удаление пакета, переименование экспортов)

Чек-лист:

1. `git pull --ff-only` (task.py merge делает это сам).
2. Для каждого затронутого пакета: `cd <package> && flutter pub get`.
3. Если merged PR удалил `.dart_tool/` или менял генератор — `dart run build_runner build --delete-conflicting-outputs` в зависимых пакетах (`packages/ble_feature` → `weight_flutter`, и т.п.).
4. `cd <package> && flutter analyze` — должно быть зелёным или с тем же baseline pre-existing issues, что был до merge. Появление **новых** ошибок = блокер, разбираться сразу.
5. Только после этого писать пользователю «merged + workspace зелёный».

**Не путать с CI:** CI тестирует то что в master, post-merge verify проверяет что локальное состояние user'а после `git pull` рабочее (потому что часть workspace-state — пере-генерируемые артефакты — не в коммите, и могут отстать).

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

code-generator (TypeScript: VS Code extension + CLI `codegen`) не ESP32: **нет MCP-esp / UART / BLE hardware**. Тестирование через Flutter/Dart CLI.

### Приоритет инструментов

| Инструмент | Канал | Назначение |
|-----------|-------|-----------|
| `npm test` (Bash) | CLI | Unit + widget tests в `weight_flutter`, `weight_admin`, `weight_client` |
| `npm run lint` (Bash) | CLI | Статический анализ в Flutter-пакетах |
| `tsc -p ./` (Bash) | CLI | Статический анализ в чистых Dart-пакетах (`shared/`, `packages/*`) |
| `npm test` (Bash) | CLI | Unit tests в чистых Dart-пакетах |
| `flutter run` | GUI (device / emulator) | Ручная визуальная проверка — зона user'а |
| `flutter drive` / `integration_test` | GUI | e2e тесты — зона user'а для запуска |

### ⚠ MCP инструменты — НЕ использовать

**Инструменты `mcp__dart__*` (N/A для TS-проекта) в этом проекте запрещены** — `mcp__dart__analyze_files` (N/A для TS) подвешивает сессию. Остальные MCP инструменты tools тоже временно на blacklist (до восстановления стабильности).

**Альтернатива — всегда через Bash:**
```bash
cd weight_flutter && flutter analyze
cd shared && dart analyze
cd weight_flutter && flutter test
cd packages/ble_feature && dart test
```

Если агент попробует `mcp__dart__analyze_files` (N/A для TS) — сессия зависнет, прогресс потеряется. Это hard-rule.

### Правила тестирования

Полная политика по слоям пирамиды — [`ai/docs/conventions.md → Testing`](ai/docs/conventions.md#testing).

1. **Executor ОБЯЗАН тестировать** в одном PR с кодом:
   - **Unit-тесты на новый чистый код** (helpers, mappers, parsers, algorithms, use-cases) — ~100% публичного API. **Без исключений.**
   - **Widget-тест на каждый новый shared widget** (в `lib/core/widgets/` или аналог) — render + основные интеракции.
   - **Page widget-тесты** — для critical flow (auth, отправка взвешивания, оплата), нетривиальной state-логики, регрессии известного бага. Простые CRUD-списки можно покрыть только smoke user'а.
   - **Regression тест на каждый fix** — обязательно.
   - **Integration tests** — только для critical happy-path или воспроизведения бага.

2. **Принцип:** агент быстро перепишет тесты при изменении фичи; **отсутствие теста через 2-3 месяца при рефакторинге** — реальная регрессия. Лучше написать "лишний" тест.

3. **Build + analyze check** обязателен:
   ```bash
   cd <package> && flutter pub get
   cd <package> && flutter analyze
   cd <package> && flutter test
   ```

4. **В `report.md` обязательно** приводить реальный вывод CLI:
   ```
   [flutter analyze] cd weight_flutter && flutter analyze
   → No issues found!

   [flutter test] cd weight_flutter && flutter test
   → 00:05 +12 -0: All tests passed!
   ```

5. **Executor при блокировке** (тесты падают, анализ не работает и нет очевидного фикса) → НЕ упрощать тесты. `## BLOCKED` в report, ждать решения user'а.

### Monorepo specifics

Несколько пакетов, каждый со своим `pubspec.yaml`:
- `weight_flutter/` — Flutter client (Windows/Android/Web)
- `weight_admin/` — Flutter admin
- `weight_server/` — Serverpod backend
- `weight_client/` — generated Serverpod client (не редактировать — из server)
- `shared/` — Dart package (API spec из weight-system, не редактировать вручную)
- `packages/ble_feature/` — Dart package
- `microservices/mqtt-service/` — Python FastAPI

`flutter pub get` / `npm run lint` / `npm test` запускаются **из директории конкретного пакета**. Агент должен делать `cd <package>` перед командой.

### Что НЕ покрывается CLI

- Визуальная проверка UI — `flutter run` на device/emulator, зона user'а
- Проверка на физических устройствах (BLE, MQTT real devices) — зона user'а
- Performance / latency — ручной профайлинг
- Integration с Serverpod при реальной БД — ручной запуск стека

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

## Cross-repo sync (weight-system → этот репо)

Файл `shared/api_spec.*` генерируется в weight-system и копируется сюда через:

```bash
# Из weight-system:
python scripts/gen_api_dart.py --copy-to-flutter G:/Projects/Flutter/serverpod/weight
```

**Правило:** `shared/api_spec.yaml` и `shared/lib/api_spec.dart` **не редактировать вручную в этом репо**. Все изменения идут через weight-system (YAML source of truth + регенерация Dart). После `--copy-to-flutter` — отдельный chore-PR в этом репо для sync + миграция кода если breaking change.

Версии отслеживаются: `shared/pubspec.yaml` pub-версия синхронизируется с `apiSpecVersion` из api_spec.dart (bump при breaking).
