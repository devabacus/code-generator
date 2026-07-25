# Отчёт TASK-042 — BUG-029 preflight + ledger

> Текст подготовлен executor-агентом; файл записан teamlead'ом (harness блокирует запись
> отчётов субагентами). Числа compile/unit/lint **перепроверены teamlead'ом независимо**
> на той же ветке — см. «Тесты».

## Резюме

Двухфазный fail-closed preflight + ledger хешей машинного вывода — реализованы неделимой
единицей по трём инвариантам ADR-0007. Регенерация больше не может молча затереть
пользовательский код: при расхождении файла на диске с последним машинным выводом генератор
останавливается **до единой записи** и выходит с non-zero, показывая diff.

## Изменения

**Новые модули:**

- `src/features/generation/generators/ledger.ts` — `.codegen/ledger.json`, `schemaVersion: 1`,
  project-relative пути, точный SHA-256 по UTF-8 через `node:crypto` (новых npm-зависимостей
  нет), запись атомарная (temp + rename) и **последней**. Битый JSON / незнакомая
  `schemaVersion` → громкая `LedgerReadError`, а не «считаем пустым» (иначе весь проект молча
  уходит в legacy). Ключи сортируются — детерминированный diff в git.
- `src/features/generation/generators/region_parser.ts` — разбор `generated_start/end:<name>`.
  Отличает «маркеров нет вообще» (`hasAnyMarker: false`) от «маркеры битые» (`duplicate` /
  `unclosed` / `orphanEnd` / `mismatched`). `replaceRegionBody` возвращает `null` вместо
  молчаливого возврата исходника — это закрывает третий silent-режим (staleness).
  Парсер последовательный: вложенность = порча. Проверено по t115 — `base` и
  `oneToManyMethods` идут строго друг за другом (`task_dao.dart`: 3…178, 180…196).
- `src/features/generation/generators/preflight.ts` — классификация
  (`create | overwrite-clean | overwrite-reviewed | seed | conflict`), причины конфликта,
  компактный diff, `GenerationConflictError`, `formatConflictReport`.

**Изменённые файлы и почему:**

| Файл | Что и зачем |
| --- | --- |
| `generation_service.ts` | `_processFile`/`_mergeBaseContent` заменены на `_plan` (read-only) + apply + `_recordBaseline`. `Promise.all` остался **только** в фазе plan. `generate()` возвращает `GenerationResult`, принимает `GenerationOptions` |
| `core/interfaces/file_system.ts` + `DefaultFileSystem` + `TrackingFileSystem` + `MockFileSystem` | метод `rename` — без него «temp + rename» невозможен. В `TrackingFileSystem` temp снимается с учёта (`CliLogger.untrackFile`), чтобы отчёт CLI не врал про несуществующий `.tmp` |
| `cli/commands/generate_entity.ts` | флаг `--overwrite-existing` (узкий, не `--force`), отчёт с diff, non-zero exit |
| `cli/commands/create_project.ts` + `vscode/commands/create_new_project.ts` | `overwriteExisting: true` (обоснование ниже) |
| `vscode/commands/create_data_files_by_replacement.ts` | модальный preview/confirm списка конфликтов; отмена = ничего не записано |
| `bug-reports/029-*.md` | статус RESOLVED (guard), с пометкой что миграция 65 шаблонов и ownership-директива — следующие этапы |

## Ключевое решение: baseline снимается с диска

Ledger хеширует **содержимое на диске после apply и после патчеров**, а не `plan.content`.
Причина: `RelationPatcher` дописывает `:oneToManyMethods` в те же файлы уже после apply —
хеш до-патчевого содержимого давал бы конфликт на КАЖДОМ regen сущности со связями, то есть
ровно тот prompt fatigue, ради которого ledger и заводился. Подтверждено на t208: пятый
прогон подряд молчит.

## Решение по `create-project` (пункт 6 плана)

`create-project` вызывает `generate(..., { overwriteExisting: true })`. `serverpod create` /
`flutter create` раскладывают свой скелет (pubspec.yaml, main.dart, analysis_options.yaml,
README), который шаблон обязан заменить; записей в ledger для них нет → preflight
классифицировал бы их как `legacy-mismatch` и уронил бы создание проекта. Пользовательского
кода в новом проекте не существует. Побочный и нужный эффект: ledger засевается именно здесь,
до `git init`, поэтому попадает в первый коммит — проверено (`git ls-files` находит
`.codegen/ledger.json`, `.gitignore` его не ловит; 248 записей, из них 5 `merge`).

## Пункт 7 — что осталось вне guard'а

| Писатель | Записей | Что пишет | Почему оставлено и что это значит |
| --- | --- | --- | --- |
| `relation_patcher` | 3 | блок `:oneToManyMethods` в файлы текущей сущности | Файлы **в** plan-множестве, но патчер пишет после apply без preflight. Дыра уже, чем казалось (перепроверено по t115 2026-07-25, см. таблицу ниже): молча теряется правка только в **трёх** merge-шаблонах. Завод патчера под plan/apply — отдельный рефакторинг: он считает свои destination по другому маппингу шаблонов. Заведено как [BUG-030](../../../bug-reports/030-relation-patcher-otm-region-outside-guard.md) |
| `orchestrator_patcher` | 1 | `lib/core/sync/sync_orchestrator_provider.dart` | Файл startProject-манифеста: есть в plan `create-project`, но не в plan `generate-entity`, поэтому при генерации сущности не проверяется. Патчит 3 marker-блока идемпотентно, код вне маркеров сохраняет |
| `app_database_generator` | 1 | `lib/core/.../database.dart` | Та же ситуация + собственная логика фильтрации stale-импортов |
| bootstrap-шаги `create-project` | — | `pubspec.yaml` (patch), `ai/**` (copy), `startAppFix` | Правят файлы **после** снятия baseline → записи в ledger для них устаревают. Практического эффекта нет: эти файлы планирует только `create-project`, а он одноразовый |

**Точная зона поражения `relation_patcher`** (пересчитано по шаблонам t115 —
`grep -rl generated_start:oneToManyMethods` × `grep -rl generated_start:base`;
первая редакция этого отчёта завышала дыру, приписывая `usecases` /
`usecase_providers` / `repository_impl` / `local_datasource_service` к merge-файлам):

| Шаблон с `:oneToManyMethods` | Есть `:base`? | ownership | Правка внутри блока |
| --- | --- | --- | --- |
| `<entity>_dao.dart` | да | merge | ❌ теряется молча |
| `<entity>_local_data_source.dart` | да | merge | ❌ теряется молча |
| `<entity>_repository.dart` | да | merge | ❌ теряется молча |
| `<entity>_local_datasource_service.dart` | нет | generated | ✅ conflict (хеш файла целиком) |
| `<entity>_repository_impl.dart` | нет | generated | ✅ conflict |
| `<entity>_usecases.dart` | нет | generated | ✅ conflict |
| `<entity>_usecase_providers.dart` | нет | generated | ✅ conflict |

(`:base` есть также у пяти шаблонов фичи `configuration`, но они `manifest: startProject`,
не entity, и `:oneToManyMethods` в них нет.)

Для журнала (вне scope): `ReplacingFileProcessor` инстанцируется в конструкторе
`GenerationService`, но не используется — мёртвое поле.

## Тесты

- **Добавлено тестов: 73** (62 в раунде 1 + 11 в раунде 2) — `region_parser.test.ts` (17+2),
  `ledger.test.ts` (21+1), `preflight_guard.test.ts` (24+6, интеграция через
  `GenerationService` + `MockFileSystem`), `tracking_file_system.test.ts` (2, новый).
  **Итог: 345 baseline → 418 passing, 0 failing.**
- **Все проходят: Да.**
- Как запустить:
  `node node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"`
- Покрыт каждый критерий приёмки: двухфазность (конфликт в одном файле → второй, чистый, тоже
  не записан), ledger после apply (инъекция сбоя записи → ledger отсутствует),
  `existing == ledger` при изменившемся render → молча, `existing != ledger` → conflict + diff +
  нулевой дифф файловой системы, merge custom-зона vs `:base`, три формы порчи маркеров,
  legacy state machine (seed / conflict / «оставить как есть» не сеет baseline), хеш без
  нормализации (пробел внутри строкового литерала, CRLF/LF, отступ, trailing newline),
  `--overwrite-existing` → ledger получает хеш render.

### Реальный вывод команд — раунд 1 (t208)

```text
[compile] npm run compile
→ > tsc -p ./            (без вывода = clean)

[lint] npm run lint
→ ✖ 18 problems (0 errors, 18 warnings)     (все 18 — pre-existing, baseline не изменился)

[unit] node node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"
→ 407 passing (232ms)     (baseline 345 + 62 новых, 0 failing)

[E2E-1] create-project --name t208 --human
→ exit 0, Duration: 283810ms; ledger засеян: 248 записей, 5 merge; .codegen/ledger.json в первом коммите

[E2E-2] generate-entity Note (--with-server)
→ exit 0; Ledger: ...\t208\.codegen\ledger.json (записано 24, seed 0)

[E2E-3] повторный generate-entity без правок
→ exit 0, молча

[E2E-4] после ручной правки note_entity.dart
→ EXIT=1
   ERROR: Обнаружено конфликтов: 1. Ни один файл НЕ записан (fail-closed preflight, BUG-029).
     ✗ t208_flutter/lib/features/notes/domain/entities/note/note_entity.dart
       причина: user-modified — файл на диске отличается от последнего машинного вывода
       @@ строка 26 @@
       - // ВАЖНЫЙ РУЧНОЙ КОД ПОЛЬЗОВАТЕЛЯ — не должен пропасть при regen
       - extension NoteBusinessRules on NoteEntity {
       -   bool get isImportant => title.startsWith('!');
       - }
   → ledger побайтово не изменён (diff -q: IDENTICAL), правка на диске цела

[E2E-5] тот же запуск с --overwrite-existing
→ exit 0; перезаписано файлов с ручными правками — 1
   ledger sha256 == sha256 файла на диске (02ed4764...bff29bae), ownership: generated
   note_dao.dart → {"ownership": "merge", "regions": {"base": "ffc15d90..."}}

[E2E-6] custom-метод ПОСЛЕ generated_end:base в note_dao.dart → regen
→ exit 0, конфликта нет, метод жив

[E2E-7] правка ВНУТРИ :base
→ EXIT=1, причина: region-modified — machine-owned регион "base" изменён вручную
   после --overwrite-existing: правка в base удалена, custom-зона сохранена

[stdout-JSON при конфликте]
→ keys: ['command','duration_ms','errors','files_created','files_modified','success']
   success: False | files_created: 0 | files_modified: 0 | errors: 2

[verify] node out/adapters/cli/index.js verify --name t208 --human
→ PASS: verify t208
    ✓ flutterAnalyze — 22001ms (errors=0, warnings=1, infos=44)
    ✓ pubGet — 5661ms
    ✓ serverpodGenerate — 29112ms
    ✓ buildRunner — 18598ms
```

После проверки формы JSON состояние t208 восстановлено байт-в-байт (sha256 `note_entity.dart`
совпадает с состоянием на момент verify), поэтому числа verify актуальны для текущего
содержимого проекта.

**Независимая перепроверка teamlead'ом после раунда 1** (та же ветка): `npm run compile` clean;
mocha → **407 passing, 0 failing**; `npm run lint` → 0 errors, 18 warnings. Совпало с заявленным.

## Ревью и раунд 2

Проведено обязательное multi-agent ревью (Standard + Adversarial, параллельно, `standard`-tier).

| Ревьюер | Вердикт |
| --- | --- |
| Standard | APPROVE WITH MINOR |
| Adversarial | **REQUEST CHANGES** (блокер HIGH-1) |

**HIGH-1 (блокер, воспроизведён ревьюером на `MockFileSystem` через реальный `GenerationService`).**
В ветке «запись в ledger есть» отсутствовала сверка `existing === render` — она была только в
legacy-ветке. Как только ledger расходился с диском по причине, не связанной с правкой
пользователя, генератор объявлял `user-modified` о файле, побайтово равном тому, что сам же и
записал бы, печатая дифф со строкой `(содержимое совпадает)`. Достижимо четырьмя реальными
путями: упавший `ledger.save()` (на Windows `fs.rename` → `EPERM/EBUSY`, если файл держит
антивирус/редактор), throw между apply и save (`OrchestratorPatcher` бросает по дизайну —
BUG-025), Ctrl-C, git-операция над закоммиченным ledger (он меняется при каждом regen →
конфликтует при merge веток). Единственным выходом в сообщении CLI был деструктивный
all-or-nothing флаг — то есть механизм тренировал жать его там, где терять нечего.

**Исправлено в раунде 2:**

| Пункт | Что сделано |
| --- | --- |
| HIGH-1 | Сверка с render в обеих ветках: `generated` → `seed`; `merge` → по каждому owned-региону (совпал с render → устаревшая запись, а не правка). Ledger стал самовосстанавливающимся после всех четырёх сценариев. Ограничение зафиксировано в коде: для сущностей со связями `RelationPatcher` пишет после apply, поэтому там самовосстановление не срабатывает — остаётся fail-closed |
| MEDIUM-3 | `try/finally` с удалением temp в `ledger.ts` + `untrackFile` в `finally` (`cli_file_system.ts`) — `.tmp` больше не остаётся на диске, в `files_created` и в `git add .`. `MockFileSystem.setRenameFailure` для теста именно ветки `rename` |
| LOW-8 | `RegionProblem.counterpart`: `generated_end:other` поверх открытого `base` теперь даёт `broken-markers` с внятным текстом, а не `missing-markers` |
| LOW-9 | `fullRender` считается лениво — ушёл шум `[SectionReplacer] Generator function not found for name: base` (16 строк на прогон в t115) |
| NIT | Убраны мутация `plan.action` in-place, мёртвая ветка в `_recordBaseline`, состояние `overwrite-reviewed` из `PlannedAction`, неиспользуемый импорт |
| Документация | BUG-029 → «RESOLVED для regen-пути» + блок «где guard НЕ действует»; заведён [BUG-030](../../../bug-reports/030-relation-patcher-otm-region-outside-guard.md); исправлена таблица пункта 7 (дыра — 3 шаблона, не 7); обновлены `CLAUDE.md` и `status.md` |

**Вынесено в follow-up** (решение владельца, в этой задаче не делалось): HIGH-2 (per-file
preserve вместо all-or-nothing + backup перед деструктивным apply), MEDIUM-4 (валидация
`--feature-path` ⊂ `--workspace` — иначе ключи ledger становятся `../../../…`, а относительный
путь делает их зависимыми от cwd), MEDIUM-6 (устаревание записей ledger для писателей вне
plan — на t208 таких два: `sync_orchestrator_provider.dart` и `pubspec.yaml`).

### Реальный вывод команд — раунд 2 (t209, прогон teamlead'ом)

Правки раунда 2 снова затронули `src/features/generation/**`, поэтому E2E переснят на свежем
проекте **t209** (t208 — предыдущий максимум). Ключевой новый сценарий — самовосстановление
ledger'а, которого в раунде 1 не существовало.

```text
[gates] npm run compile → clean
        mocha → 418 passing (166ms), 0 failing
        npm run lint → 0 errors, 18 warnings (pre-existing)

[E2E-1] create-project --name t209 --human
→ exit 0, Duration: 273751ms
   ledger засеян: schemaVersion 1 | записей: 248 | merge: 5

[E2E-2] generate-entity Note (--with-server)
→ exit 0, Duration: 73ms; ledger.json в списке Modified

[E2E-3] повторный прогон без правок
→ exit 0, Duration: 58ms — молча (existing == ledger)

[E2E-4] ⭐ САМОВОССТАНОВЛЕНИЕ (фикс HIGH-1): sha256 записи note_entity.dart в ledger
        подменён на 'deadbeef…', файл на диске НЕ тронут
→ exit 0, Duration: 81ms — конфликта НЕТ (в раунде 1 здесь был бы ложный user-modified)
   ledger после прогона: 02ed4764bf406192…
   sha файла на диске  : 02ed4764bf406192…
   → хеш пересеян верным, ledger самовосстановился

[E2E-5] настоящая ручная правка note_entity.dart (extension NoteBusinessRules)
→ EXIT=1
   FAILED: generate-entity
     ! Обнаружено конфликтов: 1. Ни один файл НЕ записан (fail-closed preflight, BUG-029).
     ✗ t209_flutter/lib/features/notes/domain/entities/note/note_entity.dart
       причина: user-modified — файл на диске отличается от последнего машинного вывода
       @@ строка 26 @@
       - // ВАЖНЫЙ РУЧНОЙ КОД — не должен пропасть при regen
       - extension NoteBusinessRules on NoteEntity {
       -   bool get isImportant => title.startsWith("!");
       - }
     ! Ledger: …\t209\.codegen\ledger.json. Перепроверь diff выше и повтори с --overwrite-existing…
   → diff -q файла с эталоном: ДА, файл не тронут
   → diff -q ledger.json с эталоном: ДА, ledger идентичен

[E2E-6] тот же запуск с --overwrite-existing
→ exit 0; «перезаписано файлов с ручными правками — 1»
   ручной код в файле: НЕТ (перезаписан осознанно) | ledger == диск: ДА

[verify] node out/adapters/cli/index.js verify --name t209 --human
→ PASS: verify t209
    ✓ flutterAnalyze — 20079ms (errors=0, warnings=1, infos=44)
    ✓ pubGet — 5030ms
    ✓ serverpodGenerate — 23837ms
    ✓ buildRunner — 16941ms
  Total: 65889ms
```

**Различение двух сценариев подтверждено эмпирически:** устаревшая запись ledger при
неизменном файле (E2E-4) → тишина; настоящая правка пользователя (E2E-5) → fail-closed
конфликт без единой записи. Именно этой разницы в раунде 1 не было.

## ⚠ STOP — открытый вопрос владельцу

Пункт 6 плана требовал «поле конфликтов в JSON-выводе», но STOP-gates контракта помечают
изменение формы stdout-JSON как операцию, требующую согласования. **Поле не добавлено**,
пункт оставлен `[~]`.

Что сделано вместо: полный отчёт с diff идёт в stderr и попадает в **существующее** поле
`errors`, exit-код non-zero. Ключи stdout-JSON не изменились:
`command, duration_ms, errors, files_created, files_modified, success`.

Если нужно машиночитаемое поле — это ~10 строк в `CliResult`
(`conflicts?: {path, reason, message}[]`, аддитивно, появляется только при конфликте).

## Риски / Заметки

1. **Формат-он-сейв даёт ложный конфликт** — сознательная безопасная деградация (одно
   подтверждение, ledger пересевается). Нормализацию не вводили: в Dart пробелы внутри
   литералов и комментариев — содержимое.
2. **Правка внутри `:oneToManyMethods` merge-файлов не ловится** — три шаблона, см. таблицу
   пункта 7. Заведено отдельным
   [BUG-030](../../../bug-reports/030-relation-patcher-otm-region-outside-guard.md).
3. **Существующие проекты (weight и т.п.) при первом запуске получат конфликты** на всех
   файлах, чей текущий вид не совпадает с render. Это предусмотренная legacy state machine,
   но первый прогон на живом проекте потребует ревью diff'ов и осознанного
   `--overwrite-existing` по файлам, где правок нет.
4. **`GenerationService.generate` сменил сигнатуру** (`Promise<void>` → `Promise<GenerationResult>`,
   третий необязательный параметр) — обратно совместимо для всех текущих вызовов, но это
   публичный API генератора.
5. `.codegen/ledger.json` растёт линейно по числу сгенерированных файлов (248 записей на пустой
   проект ≈ 30 КБ) и меняется при каждом regen — в git заметный, но детерминированный
   (отсортированный) diff.
6. Тест-проект `t208` оставлен на диске как есть, `t201…t207` не трогали.

## Статус

Ready for review.
