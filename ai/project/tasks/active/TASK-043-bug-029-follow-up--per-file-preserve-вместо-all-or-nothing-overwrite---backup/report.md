# Отчёт TASK-043 — per-file preserve + backup

> Follow-up к TASK-042 (BUG-029 preflight + ledger, merged `66ac705`). Два раунда исполнения,
> между ними — Standard + Adversarial ревью. Числа гейтов **перепроверены teamlead'ом
> независимо** на той же ветке.

## Резюме

`--overwrite-existing` перестал быть кнопкой «всё или ничего»: теперь он принимает **список
project-relative путей**, и перезаписываются только они. Остальные конфликты остаются
нетронутыми — включая писателей, работающих в обход plan/apply. Перед каждой деструктивной
записью снимается копия в `.codegen/backup/<timestamp>/`, поэтому подтверждённая перезапись
восстановима.

Это снимает блокер первого прогона guard'а на живом проекте: раньше пользователь, получив N
конфликтов, мог либо не генерировать вовсе, либо снести все N разом.

## Изменения

| Файл | Что и зачем |
| --- | --- |
| `generation_service.ts` | `GenerationOptions.overwriteExisting`: `boolean` → `boolean \| readonly string[]`. В фазе apply не выбранные конфликты пропускаются, в фазе baseline — тоже (два разных `continue`, см. «Главный инвариант») |
| `preflight.ts` | `resolveOverwriteSelection`, `UnknownOverwriteSelectionError`, `normalizeSelectionPath`, отчёт `formatOverwriteReport`; **класс `PreservedFiles`** — гард для писателей вне plan/apply |
| `backup.ts` (новый) | Копия прежнего содержимого ДО записи, только для подтверждённых конфликтов. `sanitizeBackupRelativePath` не даёт копии уйти за пределы каталога, если ключ ledger'а содержит `..` (страховка на случай TASK-045) |
| `relation_patcher.ts`, `orchestrator_patcher.ts`, `app_database_generator.ts` | Принимают `PreservedFiles` и пропускают preserved-файлы. **Расширение Scope, одобрено владельцем 2026-07-28** — см. «Блокер раунда 1» |
| `generate_entity.ts` | Флаг `--overwrite-existing [paths]`, `resolveOverwriteFlag`, `ConflictingOverwriteFormsError`, отчёт с diff при подтверждённом запуске |
| `create_data_files_by_replacement.ts` | QuickPick с `canPickMany` (ни одна галочка не стоит по умолчанию — безопасное значение «сохранить»), свой try/catch на повторном `generate()` |
| `CLAUDE.md`, `agent_memory.md` | Новое поведение флага, backup, точная формулировка про BUG-030 |

## Главный инвариант

Файл, оставленный пользователем, не трогается **и не получает baseline в ledger**. Второе
критично: если засеять хеш сохранённого файла, на следующем regen `existing == ledger`, и
генератор молча сотрёт custom-код — BUG-029 вернулся бы с отсрочкой в один запуск.

Standard-ревьюер проверил независимо, что `ledger.setGenerated/setMerge` вызываются **только**
из `_recordBaseline` — обходных путей засеять хеш нет. Тест не тавтологичен: он делает второй
полный `generate()` и требует `GenerationConflictError` ровно с двумя сохранёнными путями плюс
побайтовое равенство файлов; уберёшь `continue` — тест краснеет.

## Блокер раунда 1 (найден Adversarial-ревью, исправлен в раунде 2)

`preserve` выключал файл только из фазы apply. Патчеры пишут **после** apply, в обход
plan/apply, и о выборе пользователя не знали — поэтому `relation_patcher` дописывал регион
`:oneToManyMethods` в файл, который просили сохранить: молча, **без backup'а** (копии
снимаются только для подтверждённых конфликтов), при том что генератор печатал «эти файлы не
тронуты». Регрессия против TASK-042, где тот же сценарий был fail-closed.

Цели патчера — 7 из 23 файлов сущности (`*_dao`, `*_repository`, `*_usecases`, …), то есть
именно те, куда дописывают руками.

**Почему не поймали в раунде 1:** ни один из 22 тестов не поднимал патчер, а в E2E у сущности
было единственное relation-поле `customerId` — `RelationAnalyzer.manyToOneFields` его
отфильтровывает, и патчер выходил на первой строке. Ветка «preserve × патчер» не исполнялась
ни разу.

**Фикс:** гард `PreservedFiles` прокинут в три патчера, проверка стоит перед всеми записями
(`relation_patcher` 166 → записи 189/200/203; `orchestrator_patcher` 85 → 131;
`app_database_generator` 31 → 121 — проверено teamlead'ом). Отказ не молчаливый: пути
попадают в отчёт (`formatPatchSkipReport`) и в `GenerationResult.preservedFiles`.

**Красный тест до фикса** (написан ПЕРВЫМ, по правилу «сначала воспроизведение»):

```text
  1) БЛОКЕР R2-1: preserved-файл — цель relation_patcher'а — обязан остаться нетронутым
      AssertionError: патчер затёр код ВНУТРИ :oneToManyMethods в файле,
      который просили сохранить — молча и без backup'а
      + expected - actual
      -false
      +true
  26 passing, 1 failing
```

После фикса — 7 тестов suite зелёные.

## Прочие findings ревью, закрытые в раунде 2

- **Тихая эскалация флага.** Пробник на commander 14.0.3 показал: `--overwrite-existing a.dart --overwrite-existing` → `true`, то есть точечный выбор молча превращался в тотальную перезапись (реалистично для скрипта-обёртки, дописывающего флаг в конец); обратный порядок молча выбрасывал голый флаг. Различить формы можно только в потоке событий `option:` — `parseArg` для голого флага не вызывается вовсе. Теперь смешение форм → `ConflictingOverwriteFormsError` до чтения YAML.
- **Разрушительная подсказка.** После списка конфликтов печаталась готовая копипаст-строка `--overwrite-existing <ВСЕ пути>` — copy-paste возвращал ровно то all-or-nothing, которое задача устраняет. Заменено плейсхолдером.
- **VS Code:** повторный `generate()` был внутри `catch` без своего try — `UnknownOverwriteSelectionError` улетал сырым исключением. Обёрнут.
- **Тексты** «файлы не тронуты» приведены к проверяемым формулировкам во всех четырёх местах.
- **Покрытие:** добавлен preserve merge-файла с `:base` — в раунде 1 все конфликты в тестах имели ownership `generated`, то есть самый частый случай на живом проекте не проверялся.

## Тесты

- **Добавлено: 41** (22 в раунде 1 + 19 в раунде 2), файл `src/test/generators/per_file_preserve.test.ts`.
- **Все проходят: Да.** 418 baseline → **459 passing**, 0 failing.
- Как запустить:
  `node node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"`

### Реальный вывод команд

```text
[compile] npm run compile → tsc -p ./ (чисто)
[unit]    459 passing (161ms), 0 failing        [440 → +19 в раунде 2]
[lint]    ✖ 18 problems (0 errors, 18 warnings) [все pre-existing]

[E2E t212] create-project exit 0 (257121 ms); folder → note с folderId
  патчер подтверждённо отработал: getNotesByFolderId в note_dao.dart и note_repository_impl.dart
  regen без флага → exit 1, 3 конфликта, ноль записей
  regen с --overwrite-existing <только note_entity.dart> → exit 0:
    dao     файл: НЕ ИЗМЕНЁН (0d3f9455d3d42cb7 → 0d3f9455d3d42cb7) | ledger: НЕ ИЗМЕНЁН
    repo    файл: НЕ ИЗМЕНЁН (2dc45be3f1306e5e → 2dc45be3f1306e5e) | ledger: НЕ ИЗМЕНЁН
    entity  файл: ИЗМЕНЁН     (c5b5b8c4b2509a57 → 1f1f5cc34d3dff16) | ledger: НЕ ИЗМЕНЁН
    ручной код в DAO: true | ручной код в REPO: true | мусор в ENTITY: false
  backup содержит ровно один файл; git ls-files .codegen → только .gitignore + ledger.json
  следующий regen снова даёт ровно 2 конфликта

[verify] node out/adapters/cli/index.js verify --name t212 --human
→ PASS: verify t212
    ✓ flutterAnalyze — 16852ms (errors=0, warnings=1, infos=44)
    ✓ pubGet — 4767ms
    ✓ serverpodGenerate — 20309ms
    ✓ buildRunner — 14539ms
```

`errors=0, warnings=1, infos=44` побайтово совпадает с baseline TASK-042 (t209/t210) и с t211
раунда 1 — регрессии нет.

**Независимая перепроверка teamlead'ом:** compile clean; mocha → **459 passing, 0 failing**;
lint → 0 errors, 18 warnings; гард стоит перед всеми записями во всех трёх патчерах; форма
stdout-JSON не менялась (`git diff` по `cli_logger.ts` пуст).

## Повторная проверка фикса (teamlead, 2026-07-28)

Adversarial-субагент для подтверждения фикса **не отработал** — API-лимит аккаунта
(«monthly spend limit»), агент упал на первом шаге. Проверка проведена teamlead'ом вручную
в основном цикле; ниже — что именно проверено и чем.

| Направление | Как проверено | Результат |
| --- | --- | --- |
| Полнота гарда | `grep` по `createFile\|copyFile\|rename` во всём `src/features/generation` | Все писатели под гардом или не относятся к entity-regen: `python/*` — отдельный flow `add-microservice`; `replacing_file_processor.ts` — мёртвый код (не вызывается, проверено grep'ом) |
| Позиция `blocks()` | чтение кода | Перед всеми записями: `relation_patcher` 166 → 189/200/203; `orchestrator_patcher` 85 → 131; `app_database_generator` 31 → 121 |
| Нормализация путей | пробник-файл на скомпилированном `PreservedFiles` | `forward` / `backslash` / смешанные слэши / нижний регистр диска / root в POSIX- и Windows-форме — **все блокируются**. Ложноотрицательного срабатывания нет |
| Утечка состояния | чтение кода | `new PreservedFiles(...)` создаётся **внутри** `generate()` (строка 308) — на каждый вызов свой; VS Code делает два вызова подряд, накопитель не переиспользуется |
| `PreservedFiles.none()` | пробник | `blocks()` возвращает `false` немедленно (`paths.size === 0`) — существующие вызовы патчеров не меняют поведения |
| Обратная совместимость флага | чтение `resolveOverwriteFlag` | только голые вхождения → `true` (историческое «все»); только со значениями → массив; смешение → `ConflictingOverwriteFormsError`; пусто → `undefined` |
| Честность ключевого теста | чтение теста | Не тавтология: `assert.strictEqual(onDisk, edited)` — побайтовое сравнение с состоянием ДО генерации, плюс проверка custom-кода внутри региона. Есть контрольная группа («не-preserved цель патчера по-прежнему патчится») — она ловит случай «патчер вообще не запускался» |
| Согласованность после пропуска | E2E t212 | preserved-целями патчера были `note_dao.dart` и `note_repository_impl.dart` (в них реально появился `getNotesByFolderId`), их хеши не изменились, при этом `verify` → `errors=0` — пропуск патча не оставляет проект некомпилируемым |
| Регрессии TASK-042 | mocha | 459 passing, 0 failing — старые suite'ы (двухфазность, самовосстановление ledger'а, атомарность) зелёные |

**Оговорка о доверии:** это проверка одним человеком-агентом вместо независимого adversarial
прохода. Блокер раунда 1 был найден именно adversarial'ом и пропущен и исполнителем, и
Standard-ревьюером — поэтому текущий уровень уверенности ниже, чем на TASK-042. Если лимит
восстановится, повторный adversarial-проход по фиксу остаётся желательным.

## Обоснование места backup'а (требование критерия приёмки)

`<project>/.codegen/backup/<YYYYMMDD-HHmmss-SSS>/<относительный путь>`:

- каталог `.codegen/` уже принадлежит генератору и переезжает вместе с проектом; системный
  temp теряется при уборке, а `*.bak` рядом с исходником попал бы под `flutter analyze`;
- от git прячет **вложенный** `.codegen/.gitignore` со строкой `backup/` — игнорировать весь
  `.codegen/` нельзя, `ledger.json` обязан жить в git по ADR-0007. Корневой `.gitignore`
  проекта не трогается (он часть шаблона); существующий вложенный не затирается — строка
  дописывается;
- копия снимается из `plan.existing`, а не перечитыванием диска: между plan и apply файл мог
  бы измениться.

## Оценка по weight (требование критерия приёмки)

**Блокер первого прогона снят.** Конфликты разделяются по файлу; сохранённые не трогает никто,
включая патчеры; перезаписанное восстановимо из backup'а.

**Что остаётся знать до прогона:**

1. **BUG-030 открыт.** Правка внутри `:oneToManyMethods` сама по себе конфликта не даёт
   (baseline merge-файла хеширует только `:base`), поэтому при regen **без конфликта** она
   по-прежнему затирается молча. R2-1 закрыл лишь случай «файл уже в конфликте и выбран
   preserve».
2. **TASK-045** — `--feature-path` вне `--workspace` даёт ключи ledger'а `../../…` (в backup
   обезврежено, в ledger'е нет).
3. **TASK-046** — записи ledger'а для писателей вне plan протухают.
4. **TASK-044** — поля `conflicts` в stdout-JSON нет, обёртке придётся парсить stderr.
5. **VS Code QuickPick не проверялся runtime** (GUI, покрыт только типами) — первый прогон на
   weight надёжнее делать через CLI.

## Риски / Заметки

1. **Повтор той же команды неидемпотентен:** после успешной перезаписи файлы больше не
   конфликтуют, поэтому та же команда падает `UnknownOverwriteSelectionError`. Прямое следствие
   требования «не молчать про опечатку»; для CI/скриптов — ловушка, смягчение до warning
   решает владелец.
2. **Пустой список ≠ «перезаписать всё»** — подтверждено ноль файлов → fail-closed. Решение вне
   контракта, принято чтобы `--overwrite-existing "$FILES"` с пустой переменной не превращался
   в массовую перезапись.
3. **`.codegen/backup/` растёт неограниченно** — ретенции нет. Побочно `create-project`
   кладёт в новый проект копии скелета `serverpod create`/`flutter create`.
4. **Backup-копии попадают в `files_created` stdout-JSON** — формально верно (файлы созданы),
   но для скрипта-потребителя это шум.
5. **Сопоставление абсолютных путей регистрозависимо** — `g:\…` против `G:\…` даст fail-fast.
   Громко, не тихо.
6. Тест-проекты `t211`, `t212` оставлены на диске; следующий свободный номер — **t213**.

## Статус

Ready for review (раунд 2 после REQUEST CHANGES).
