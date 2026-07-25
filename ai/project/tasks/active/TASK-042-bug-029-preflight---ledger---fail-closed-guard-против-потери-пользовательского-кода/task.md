---
id: TASK-042
schema_version: 2
status: active            # active | blocked | done
mode: interactive         # interactive | auto
zone: "generator-core"
verification_profile: "ts-generator"
checks: [compile, lint, unit]
max_attempts: 3
depends_on: []
---

# TASK-042: BUG-029 preflight + ledger — fail-closed guard против потери пользовательского кода

## Цель

Закрыть [BUG-029](../../bug-reports/029-base-section-overwrite-loses-custom-code.md) в его
переформулированном виде: **65 из 81 entity-шаблона идут через `createFile()` без проверки
существования** — пользовательский код молча затирается при regen.

Первый (и единственный в этой задаче) deliverable — **двухфазный fail-closed preflight
ПЛЮС ledger хешей машинного вывода**. Это **неделимая единица**: guard без baseline
нежизнеспособен (см. ниже), ledger без guard ничего не предотвращает.

## Почему preflight и ledger нельзя разделить

Каждый штатный regen меняет вывод генератора во ВСЕХ файлах сущности (добавили поле →
изменились модель, адаптеры, таблицы, провайдеры — ~21 файл). Если preflight сравнивает
только `existing ↔ new render`, он выдаст conflict на всех файлах, которых пользователь
не касался → пользователь рефлекторно жмёт `--overwrite-existing` при каждом запуске →
guard превращается в шум и перестаёт защищать ровно тогда, когда custom-код есть
(prompt fatigue). Ledger даёт недостающую **третью точку сравнения**: хеш того, что
записал сам генератор.

| Состояние | Значение | Действие |
| --- | --- | --- |
| хеш existing == хеш в ledger | нетронутый машинный вывод | перезаписать молча, **даже если render изменился** |
| хеш existing != хеш в ledger | пользователь правил файл | conflict, fail-closed + diff |
| записи в ledger нет | legacy / первый запуск | по state machine ниже (инвариант «в») |

## Три технических инварианта (обязательны, из дискуссии #14 → Decision)

**(а) Preflight ДО начала любой записи, НЕ внутри `_processFile`.**
Файлы обрабатываются через `Promise.all`
([generation_service.ts:172-177](../../../../src/features/generation/generators/generation_service.ts#L172-L177)) —
конкурентно. Бросок в одном promise не остановит остальные → частично записанное дерево.
Поток строго двухфазный:

1. **Plan/preflight:** вычислить все destination paths и новый контент, прочитать
   existing, классифицировать (`create` / `safe merge` / `full replace` / `broken markers`),
   **не меняя filesystem**.
2. **Apply:** только если конфликтов нет ИЛИ получено явное подтверждение — выполнить записи.

CLI по умолчанию: non-zero exit со списком путей. VS Code: preview/confirm. Флаг подтверждения
назвать узко — `--overwrite-existing`, не универсальный `--force`.

**(б) Для merge-файлов хешируются РЕГИОНЫ, не файл целиком.**
Иначе легальное добавление custom-импорта/метода в preserved-зону даёт conflict на пустом
месте. Форма ledger зависит от ownership:

```json
{
  "schemaVersion": 1,
  "files": {
    "lib/.../task_model.dart": { "ownership": "generated", "sha256": "..." },
    "lib/.../task_dao.dart": {
      "ownership": "merge",
      "regions": { "imports": "...", "base": "..." }
    }
  }
}
```

Custom-зоны в ledger не входят и при preflight игнорируются. Исчезнувший, дублированный
или malformed region-marker — conflict независимо от хеша (это закрывает silent staleness).

**(в) Legacy-состояние НЕ «усыновляется» как generated.**
Если existing ≠ render и пользователь выбрал «оставить как есть» — **нельзя** писать хеш
existing как baseline: внутри может быть custom-код, и на следующем regen
`existing == ledger` → генератор молча сотрёт его (guard лишь отложит BUG-029 на один
запуск). Безопасная state machine для отсутствующей записи:

1. `existing == render` → безопасно seed hash без prompt.
2. `existing != render` → conflict + diff.
3. После conflict допустимо ТОЛЬКО: **overwrite reviewed** (записать render, затем
   хешировать именно render) ИЛИ **preserve** (ничего не писать и не seed'ить).
   Команда «adopt existing as generated» по умолчанию **недопустима**.

## Дополнительные требования к ledger

- Путь: `<project>/.codegen/ledger.json`, **versioned** (`schemaVersion`), хранится **в git**
  (иначе свежий clone = пустой baseline = всё в conflict), пути **project-relative**.
- Хеш — **точный SHA-256 по UTF-8 содержимому**, БЕЗ lossy-нормализации. В Dart whitespace
  внутри строковых литералов и комментариев является содержимым; схлопывание пробелов
  способно сделать разные программы одинаковыми для guard. Format-on-save иногда даст
  ложный conflict — это **безопасная деградация** (одно подтверждение, ledger пересевается).
- Ledger записывается в FS **последним** — после успешного apply всех файлов, атомарной
  заменой временного файла. Если записать первым, crash оставит ложное «файл нетронут».
- Backup/diff перед подтверждённым destructive apply полезен: ledger хранит только хеши
  и восстановить прежний код не может.

## Не-цели

- **НЕ мигрировать 65 шаблонов** на merge-дисциплину — это отдельный инкрементальный этап
  ПОСЛЕ guard'а, по файлу.
- **НЕ вводить per-method markers** и **НЕ делать patch-only постоянным режимом** — оба
  отклонены дискуссией #14.
- **НЕ решать правку тела generated-метода** — не сохраняется ни одной маркерной схемой,
  это вопрос точек расширения (callback/strategy/wrapper/subclass), отдельное решение.
- НЕ вводить ownership-директиву `// codegen:ownership:` в шаблоны в этой задаче — но
  структура ledger обязана быть к ней готова (поле `ownership` уже в схеме).
- НЕ трогать junction-задачи (TASK-040/041).

## Scope

Разрешено:

- `src/features/generation/generators/generation_service.ts` — двухфазный поток plan/apply
- новый модуль preflight/ledger (напр. `src/features/generation/generators/ledger.ts`)
- `src/adapters/cli/commands/generate_entity.ts` (+ прочие точки генерации) — флаг
  `--overwrite-existing`, non-zero exit, вывод плана
- `src/adapters/vscode/**` — preview/confirm (минимально: показать список и запросить подтверждение)
- `src/test/**`
- `ai/project/bug-reports/029-*.md` — статус

Запрещено:

- шаблоны `G:/Templates/flutter/*` (миграция — отдельный этап)
- target-проекты (руками не патчить)
- lossy-нормализация при хешировании
- «adopt existing as generated» по умолчанию

## Критерии приёмки

- [x] Двухфазный поток: ни одной записи в FS до завершения plan; доказать тестом (конфликт в одном файле → НИ ОДИН файл не записан)
- [x] Ledger создаётся/обновляется атомарно и **после** успешного apply
- [x] `existing == ledger` при изменившемся render → молчаливая перезапись (нет prompt fatigue) — тест
- [x] `existing != ledger` → conflict, fail-closed, non-zero exit в CLI, diff в выводе — тест
- [x] merge-файл: правка в custom-зоне НЕ даёт conflict; правка в `:base` — даёт — тест
- [x] Сломанные/дублированные `:base`-маркеры → conflict (silent staleness закрыт) — тест
- [x] Legacy без записи в ledger: `existing == render` → seed; `existing != render` → conflict; «оставить как есть» НЕ сеет baseline — тест
- [x] Хеширование без нормализации (тест: файл, отличающийся только пробелами в строковом литерале, даёт другой хеш)
- [x] `--overwrite-existing` подтверждает и записывает render, ledger получает хеш render
- [x] E2E: свежий `t<N>` → create-project → generate-entity → повторный generate-entity без правок = молча; с ручной правкой файла = conflict. Числа `codegen verify` в report.md *(прогон раунда 1 на `t208`; правки раунда 2 E2E не переснимались — см. журнал [18:40])*
- [x] checks compile/lint/unit зелёные, baseline не падает

## План работы

> Декомпозиция teamlead'а (2026-07-25). Текст пунктов executor НЕ меняет — только статусы
> `[ ]` / `[~]` / `[x] [HH:MM]` / `[!]`. Порядок важен: 1-3 — ядро, 4-6 — интеграция,
> 7-8 — гейты.

- [x] [14:05] **1. Модуль `ledger.ts`** — schema v1 (`schemaVersion`, `files{path → {ownership, sha256 | regions}}`), пути project-relative, чтение при отсутствии файла → пустой ledger (не ошибка), запись атомарная (temp + rename), SHA-256 по UTF-8 **без нормализации** (`node:crypto`, без новых npm-зависимостей). Unit-тесты на MockFileSystem.
- [x] [14:20] **2. Region-парсер как переиспользуемый helper** — вынести разбор `generated_start:<name>` / `generated_end:<name>` из inline-regex `_mergeBaseContent` в отдельную функцию, возвращающую регионы + признак «маркеры сломаны» (отсутствует / дублирован / незакрыт). Кейс «маркеров нет вообще» отличать от «маркеры битые»: сегодня `_mergeBaseContent` в обоих случаях [тихо возвращает destinationContent](../../../../src/features/generation/generators/generation_service.ts#L255-L257) — третий silent-режим по ADR-0007. Unit-тесты на каждую форму порчи.
- [x] [15:10] **3. Двухфазный поток в `generation_service.generate`** — расщепить `_processFile` на чистый `plan` (вычисляет destinationPath + новый контент + классификацию `create | safe-merge | full-replace | conflict | broken-markers`, **не трогая FS**) и `apply` (пишет). Инвариант (а): ни одной записи до завершения plan по ВСЕМ файлам — `Promise.all` остаётся только в фазе plan. Тест: конфликт в одном файле → ни один файл не записан.
- [x] [15:10] **4. Классификация через три точки сравнения** — `existing` ↔ `ledger` ↔ `render`. Молчаливая перезапись при `existing == ledger` даже если render изменился (анти-prompt-fatigue); conflict при `existing != ledger`; для merge-файлов сравнение **по регионам**, custom-зоны игнорируются. Legacy без записи в ledger — state machine инварианта (в): `existing == render` → seed; иначе conflict; «оставить как есть» **не** сеет baseline. Тесты по каждому переходу.
- [x] [15:10] **5. Ledger пишется последним** — после успешного apply всех файлов, атомарной заменой. Тест: падение в середине apply не оставляет ledger с «файл нетронут».
- [~] **6. Точки входа** — CLI `generate-entity`: флаг `--overwrite-existing` (узкий, НЕ `--force`), печать плана конфликтов + diff, **non-zero exit** при конфликте; поле конфликтов в JSON-выводе (не ломая существующую форму stdout — см. STOP-gate). VS Code: минимальный preview/confirm списка конфликтов. **Отдельно проверить `create-project` (startProject flow):** он пишет baseline-сущности тем же сервисом — ledger обязан засеяться там же, иначе первый `generate-entity` на свежем проекте увидит legacy-состояние без записи и уйдёт в conflict на ровном месте. Решение зафиксировать в журнале.
- [x] [15:40] **7. Писатели вне плана — решение и фиксация** — `relation_patcher` (3 записи), `orchestrator_patcher` (1), `app_database_generator` (1) пишут в обход `_processFile`. В этой итерации допустимо оставить их вне guard'а, но **обязательно** записать в report.md: какие файлы остаются незащищёнными и почему. Молча игнорировать — нельзя. (Мелочь для журнала, не для фикса: `ReplacingFileProcessor` инстанцируется в конструкторе `GenerationService`, но не используется — мёртвое поле, вне scope.)
- [x] [17:05] **8. Гейты** — compile + lint + mocha (**baseline 345 passing**, снят 2026-07-25 на этой ветке; должно стать 345 + N новых). E2E на свежем `t208`: `create-project` → `generate-entity` → повторный `generate-entity` без правок = молча → ручная правка одного сгенерированного файла → повторный запуск = conflict + non-zero exit → `--overwrite-existing` = запись + ledger обновлён. `codegen verify --name t208 --human` с цитированием `errors=N, warnings=M` в report.md.

## STOP-gates

> Деструктивные / необратимые операции. Перед каждой: `[~]` + `⚠ STOP: <op>` в чате, ждать
> явного «ok» владельца. Список составлен teamlead'ом; если понадобится операция не из списка —
> добавить пункт сюда и всё равно спросить.

- [ ] **Правка шаблонов `G:/Templates/flutter/{t115,simplified}/**`** — Scope это **запрещает** (миграция 65 шаблонов = отдельный этап). Если фикс окажется невозможен без правки шаблона → СТОП, вернуть управление teamlead'у, не править.
- [ ] **Изменение формы stdout-JSON у `generate-entity`** — это контракт для внешних вызовов (VS Code adapter, агенты в репо-потребителях). Добавление нового поля — обсудить; переименование/удаление существующих — запрещено без ok.
- [ ] **Новая npm-зависимость** — не нужна (хеш через встроенный `node:crypto`). Если возникнет необходимость — СТОП.
- [ ] **`git commit` / `push` / создание PR** — только по явному слову владельца («коммить» / «пр»). Executor не мержит ничего и никогда.
- [ ] **Удаление любых `t<N>` тест-проектов** — HARD RULE: запрещено, sandbox блокирует намеренно. Обходных путей не искать. Следующий свободный номер — **t208**.

Не являются STOP-gate (pre-authorized владельцем): `create-project`, `verify`, `generate-entity`
на тестовых проектах. Ручная правка файла в `t208` **в рамках E2E-сценария конфликта** —
разрешена и ожидаема (это тест guard'а, а не сокрытие бага генератора); зафиксировать в журнале.

## Журнал исполнения

- [teamlead 2026-07-25] Ветка `feature/TASK-042-preflight-ledger` создана от master `943535a`. Baseline снят: compile clean, **345 passing**, lint без изменений.
- [13:40] Онбординг закончен. Ветка `feature/TASK-042-preflight-ledger` подтверждена. Baseline воспроизведён локально: compile clean, **345 passing**, lint 0 errors / 18 warnings (все pre-existing).
- [14:05] п.1: `ledger.ts` — schema v1, SHA-256 через встроенный `node:crypto` (новых npm-зависимостей нет). Атомарная запись «temp + rename» потребовала метода `rename` в `IFileSystem` — иначе temp-файл нечем заменить целевой. Реализован во всех трёх реализациях (`DefaultFileSystem`, `TrackingFileSystem`, `MockFileSystem`); в `TrackingFileSystem` temp-путь снимается с учёта (`CliLogger.untrackFile`), чтобы отчёт CLI не врал про несуществующий `.tmp`.
- [14:07] Решение (не из task.md): битый JSON / незнакомая `schemaVersion` ledger'а → громкая `LedgerReadError`, а НЕ «считаем пустым». Молчаливый fallback в пустой ledger увёл бы все файлы в legacy-режим и обесценил baseline.
- [14:20] п.2: `region_parser.ts` — последовательный state machine (вложенность регионов трактуется как `unclosed`). Проверено по шаблонам t115: `base` и `oneToManyMethods` идут строго последовательно (`task_dao.dart`: 3…178 и 180…196), вложенности нет. Кейс «маркеров нет вообще» отличается от «маркеры битые» полем `hasAnyMarker`.
- [15:10] п.3-5: `Promise.all` остался ТОЛЬКО в фазе plan; apply последовательный. Ключевое решение: baseline для ledger снимается **с диска после apply и после патчеров**, а не из `plan.content`. Причина — `RelationPatcher` дописывает блок `:oneToManyMethods` в те же самые файлы уже после apply; хеш до-патчевого содержимого давал бы ложный конфликт на КАЖДОМ regen сущности со связями (ровно тот prompt fatigue, ради которого заведён ledger).
- [15:15] Решение (не из task.md): machine-owned регион для merge-классификации — только `base`, вынесен в константу `MACHINE_OWNED_REGIONS`. Это единственный регион, который заменяет merge-apply; `oneToManyMethods` пишет `RelationPatcher` в обход plan/apply (см. п.7).
- [15:30] п.6, решение по `create-project` (контракт требовал зафиксировать в журнале): CLI `create-project` и VS Code `createNewProject` вызывают `generate(..., { overwriteExisting: true })`. Шаги `serverpod create` / `flutter create` раскладывают свой скелет (pubspec.yaml, main.dart, analysis_options.yaml, README), который шаблон обязан заменить; записи в ledger для них нет → preflight классифицировал бы их как `legacy-mismatch` и уронил бы создание проекта. Пользовательского кода в только что созданном проекте не существует — терять нечего. Побочный и нужный эффект: ledger засевается именно здесь, до `git init` (шаг 7), поэтому `.codegen/ledger.json` попадает в первый коммит.
- [15:35] п.6, STOP: поле конфликтов в stdout-JSON `generate-entity` НЕ добавлено — это перечислено в STOP-gates («добавление нового поля — обсудить»). Реализовано без изменения формы stdout: полный отчёт с diff идёт в stderr и попадает в СУЩЕСТВУЮЩЕЕ поле `errors`, выход non-zero. Пункт оставлен `[~]` до решения владельца.
- [15:40] п.7: вне guard'а осознанно остаются `relation_patcher` (3 записи), `orchestrator_patcher` (1) и `app_database_generator` (1) — детали и обоснование в report.md.
- [16:10] п.8: гейты зелёные — compile clean, lint 0 errors / 18 warnings (все pre-existing), mocha **407 passing** (baseline 345 + 62 новых), 0 failing.
- [16:15] E2E `t208`: `create-project` PASS (283 с, exit 0). Ledger засеян на bootstrap — 248 записей, из них 5 `merge` (Configuration baseline). `.codegen/ledger.json` попал в первый git-коммит проекта (`git ls-files` подтверждает, `.gitignore` его не ловит).
- [16:30] E2E сценарии на `t208` (ручные правки файлов — в рамках проверки guard'а, как разрешает контракт): (1) `generate-entity` Note → exit 0, 24 файла; (2) повторный запуск без правок → exit 0, молча; (3) ручная правка `note_entity.dart` (extension NoteBusinessRules) → **exit 1**, conflict `user-modified` с diff, ledger побайтово не изменён, правка на диске цела; (4) `--overwrite-existing` → exit 0, render записан, хеш в ledger == sha256 файла на диске; (5) повторный запуск → снова молча (round-trip с relation_patcher стабилен); (6) custom-метод ПОСЛЕ `generated_end:base` в `note_dao.dart` → regen без конфликта, метод жив; (7) правка ВНУТРИ `:base` → **exit 1**, conflict `region-modified`; (8) подтверждённая перезапись merge-файла восстановила регион и **сохранила** custom-зону.
- [16:40] Проверена форма stdout-JSON при конфликте: ключи ровно прежние (`command, duration_ms, errors, files_created, files_modified, success`), новых полей нет; `files_created=0, files_modified=0` подтверждает, что при конфликте не записано ничего. Отчёт о конфликте лежит в существующем `errors`.
- [17:05] `codegen verify --name t208 --human` → **PASS**: flutterAnalyze errors=0, warnings=1, infos=44; pubGet/serverpodGenerate/buildRunner зелёные. После verify состояние t208 восстановлено байт-в-байт (sha256 сверен).

### Раунд 2 — правки по ревью (Standard: APPROVE WITH MINOR, Adversarial: REQUEST CHANGES)

- [18:05] **HIGH-1 (блокер) закрыт.** В ветке «запись в ledger есть» обеих классификаций не было сверки `existing == render`, из-за чего расхождение ledger'а с диском **не по вине пользователя** объявлялось `user-modified` — с diff'ом «(содержимое совпадает)», то есть отчёт опровергал собственную причину. Достижимо минимум четырьмя путями (сбой `save()` после apply — на Windows `rename` даёт EPERM/EBUSY; throw между apply и save, напр. `OrchestratorPatcher` по дизайну (BUG-025); Ctrl-C; разрешение git-конфликта в закоммиченном `.codegen/ledger.json`). Единственным предложенным выходом был деструктивный all-or-nothing `--overwrite-existing` — механизм тренировал жать его там, где терять нечего. Теперь: диск побайтово равен render (для merge — тело каждого owned-региона) → `seed`, ledger пересеивается, генерация молчит. Ledger стал самовосстанавливающимся. Ограничение зафиксировано в коде: для сущностей со связями `RelationPatcher` пишет после apply, поэтому `existing != render` и самовосстановление там не срабатывает — fail-closed сохраняется.
- [18:12] **MEDIUM-3 закрыт.** `CodegenLedger.save()`: `createFile(temp)` + `rename` завёрнуты в `try/finally` с удалением temp (ошибки самой уборки глушатся — иначе они подменили бы исходную причину сбоя, та же блокировка не даст и удалить). `TrackingFileSystem.rename`: `untrackFile(source)` перенесён в `finally` — иначе при сбое rename temp оставался в `files_created` JSON-отчёта, то есть отчёт врал про созданный файл. Мотив не косметический: `create-project` делает `git add .`, а `.gitignore` не ловит `.codegen/ledger.json.tmp`.
- [18:20] **LOW-8 закрыт.** `mismatched` приписывался имени **закрывающего** маркера, поэтому для `generated_start:base … generated_end:other` `problemsFor(scan,'base')` был пуст и пользователь получал `missing-markers` («маркеров нет») о файле, где `generated_start:base` есть. Теперь проблема относится к обоим именам (`name` = открытый регион, `counterpart` = чужой закрывающий), `problemsFor` учитывает оба, текст `describeProblems` называет оба.
- [18:26] **LOW-9 закрыт.** `fullRender` считается лениво — merge-ветка при живом target его не трогает. Убран шум `[SectionReplacer] Generator function not found for name: base` (по строке на каждый из 16 merge-шаблонов t115); это восстанавливает до-TASK-042 поведение, где merge возвращался ДО секционных генераторов. Поведение merge не изменилось (все прежние тесты зелёные + новый тест на отсутствие шума).
- [18:30] **NIT-очистка.** Мутация `plan.action = 'overwrite-reviewed'` убрана вместе с мёртвой веткой `if (plan.action === 'conflict')` в `_recordBaseline` (apply-цикл переписывал все conflict'ы до неё). Состояние `'overwrite-reviewed'` удалено из `PlannedAction` — классификаторы его не возвращали, а подтверждённые конфликты и так перечислены в `GenerationResult.overwritten`. Инвариант «в» обеспечен раньше и жёстче: неподтверждённый конфликт бросает до фазы apply. Убран неиспользуемый импорт `PathInfo`.
- [18:35] Гейты раунда 2: compile clean, lint 0 errors / 18 warnings (те же pre-existing), mocha **418 passing, 0 failing** (407 + 11 новых: 6 в `preflight_guard.test.ts`, 2 в `region_parser.test.ts`, 1 в `ledger.test.ts`, 2 в новом `src/test/utils/tracking_file_system.test.ts`). `MockFileSystem` получил `setRenameFailure` — прежний `setWriteFailure` роняет `createFile`, то есть единственную ветку, которая мусора и не оставляет.
- [18:40] **E2E раунда 2 НЕ переснимался** (по указанию teamlead'а: `create-project` ~5 минут, `t208` прогнан в раунде 1). Правки раунда 2 затрагивают фазу apply в двух местах: (1) состояние `seed` вместо `conflict` при устаревшей записи ledger — новый путь, на t208 не встречался; (2) ленивый `fullRender` — по построению не меняет содержимое записи. Решение о повторном E2E — за teamlead'ом.
- [18:50] Документация: BUG-029 переформулирован как «RESOLVED для regen-пути» с явным списком зон, где guard не действует (`create-project` bootstrap — осознанно, `overwriteExisting: true`); заведён **BUG-030** (`:oneToManyMethods` в merge-файлах вне guard'а); исправлена таблица пункта 7 в report.md — дыра касается **трёх** шаблонов (`*_dao`, `*_local_data_source`, `*_repository`), а не семи: у `*_usecases`, `*_usecase_providers`, `*_repository_impl`, `*_local_datasource_service` региона `:base` нет → они `generated`, и правка внутри их otm-блока ловится хешем файла целиком (перепроверено по t115). Обновлены CLAUDE.md (workaround «`git diff` перед regen» снят) и status.md.

- [teamlead 16:05] E2E раунда 2 переснят на свежем **t209** (правки снова затронули `src/features/generation/**`). Подтверждено на реальном проекте различение двух сценариев, которые до фикса HIGH-1 были неразличимы: испорченная запись ledger при неизменном файле → тишина, exit 0, хеш пересеян (**самовосстановление**); настоящая ручная правка → exit 1, ни одной записи, файл и ledger побайтово целы. `verify --name t209` → **PASS, errors=0, warnings=1, infos=44**. Гейты: compile clean, **418 passing**, lint 0 errors / 18 pre-existing warnings.
- [teamlead 16:20] **Пункт 6 плана остаётся `[~]` осознанно.** Вопрос о поле `conflicts` в stdout-JSON эскалирован владельцу трижды; ответа не поступило, вместо него дана команда коммитить и мержить. Решение: **поле НЕ добавляется** в этой задаче, форма stdout-JSON не меняется (STOP-gate не пройден — значит операция не выполняется). Машиночитаемого признака конфликта у CLI по-прежнему нет: потребителям (VS Code adapter, агенты в репо-потребителях) остаётся exit-код и текст в поле `errors`. Вынесено в follow-up вместе с HIGH-2 / MEDIUM-4 / MEDIUM-6.

## Заметки по реализации

- СТРАТЕГИЯ 1 (merge) / СТРАТЕГИЯ 2 (full replace) — `generation_service.ts:214-239`;
  именно СТРАТЕГИЯ 2 (65 файлов) пишет `createFile` без проверок.
- `_mergeBaseContent` при отсутствии маркеров
  [тихо возвращает destinationContent](../../../../src/features/generation/generators/generation_service.ts#L255-L257) —
  это третий silent-режим, закрывается инвариантом (б).
- `AppDatabaseGenerator` и патчеры (`relation_patcher`, `orchestrator_patcher`) пишут файлы
  своими путями — проверить, нужно ли их тоже завести под plan/apply (как минимум
  зафиксировать в report.md, если оставлены вне guard'а в этой итерации).
- Грабля: `git commit -m` с кавычками в PowerShell 5.1 → `git commit -F <файл>`.
- HARD RULE: test-проекты не удалять, incremental numbering.

## Релевантный контекст

Файлы для прочтения перед началом:

- [дискуссия #14](../../discussions/archive/14-bug-029-base-overwrite-как-сохранять-cus/discussion.md) — полный разбор + Decision (три инварианта, форма ledger, state machine legacy)
- [BUG-029](../../bug-reports/029-base-section-overwrite-loses-custom-code.md) — переформулированный баг, три режима отказа
- `src/features/generation/generators/generation_service.ts` — обе стратегии, `Promise.all`, `_mergeBaseContent`
- `src/features/generation/generators/marker_analyzer.ts` — manifest/dictionaries/flags строки (референс для будущей `ownership:`)
- `CLAUDE.md` → DoD, «Что НЕ генерируется автоматически»

## План тестирования

Unit на MockFileSystem (`src/test/mocks/mock_file_system.ts`) — все пункты критериев;
E2E на свежем `t<N>`: двойной regen без правок (молча) и с ручной правкой (conflict).
Гейт: checks профиля ts-generator + `codegen verify` на тестовом проекте.

## Результаты

- Двухфазный plan/apply + ledger-модуль + флаг подтверждения.
- Тесты по всем критериям.
- BUG-029 → Resolved (первый deliverable), с явной пометкой что миграция 65 шаблонов и
  ownership-директива — следующие этапы.
- report.md с реальными CLI-выводами.
