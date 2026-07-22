# Reviewer report — TASK-039 (BUG-015 cross-feature junction prove-out + partial fix)

**Date:** 2026-07-22
**Reviewer:** independent reviewer (Opus, read-only)
**Verdict:** **APPROVE**

## Summary

Вердикт BUG-015 (**CONFIRMED + partial fix (drift-table) + остаток BLOCKED**) — честный
и подтверждается артефактом t206 на диске, не только текстом отчёта. Ключевую дельту
(same-feature PASS + cross-feature FAIL) я перепроверил механистически: обе junction-таблицы
имеют идентичную структуру импортов из шаблона, но same-feature-относительные пути в
`catalog` резолвятся в существующие файлы, а в `authors` — в отсутствующие (реальные лежат
в `books`). Это доказывает cross-feature-природу бага, а не build-order/недосмотр. Частичный
фикс (drift-table через маркер `:driftTableImports`) корректен, same-feature не регрессирует.
Объём BLOCKED-остатка (8 импортов / 5 подсистем) — точный, не преувеличен и не преуменьшен.
Три checks зелёные. Scope контракта соблюдён.

Findings: **critical 0, major 0, minor 3**.

## Итоги трёх checks (реальные выводы, прогнал сам)

```
compile → npm run compile
  exit = 0

lint → npm run lint
  ✖ 18 problems (0 errors, 18 warnings)      ← совпадает с baseline (0 errors, новый код не добавил)

unit → node node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"
  318 passing (224ms), 0 failing            ← 315 baseline + 3 новых
```

Все три соответствуют ожиданиям контракта. verify t206 заново не гонял (вне reviewer-scope,
дорого) — проверял артефакт t206 чтением файлов на диске.

## Оценка честности вердикта BUG-015 — СОГЛАСЕН

**Согласен с классификацией CONFIRMED + partial fix (drift-table) + остаток BLOCKED.**

Проверено независимо (не по отчёту, а по коду/диску):

1. **Дельта cross vs same доказана механистически (ядро вывода).**
   - `authors/.../author_book_map_table.dart`: `import '../../../../../books/data/datasources/local/tables/book_table.dart';` (cross-feature путь, post-fix), `author_table.dart` — плоский sibling.
   - `catalog/.../product_vendor_map_table.dart`: `product_table.dart` + `vendor_table.dart` — оба плоские sibling'ы.
   - **Решающая проверка:** non-table слои (`repository_impl`, presentation providers и т.д.) у ОБОИХ junction'ов имеют идентичную структуру импортов из шаблона (напр. `../../domain/entities/<parent>/<parent>_entity.dart`, `../<parent>/<parent>_state_providers.dart`). Разница только в том, резолвятся ли эти пути в существующие файлы: `catalog/domain/entities/vendor/vendor_entity.dart` СУЩЕСТВУЕТ (same-feature PASS), а `authors/domain/entities/book/book_entity.dart` НЕ существует — реальный лежит в `books/domain/entities/book/` (cross-feature FAIL). Это исключает build-order как причину: пути статические, указывают в неправильную feature.

2. **`BookTable is not a class` — именно cross-feature import, не общий build-order.** Root cause — плоский `import 'book_table.dart'`, резолвящийся в `authors/` (где файла нет). После фикса путь стал корректным cross-feature → ошибка исчезла (подтверждено артефактом: строка 7 таблицы теперь `../../../../../books/.../book_table.dart`). Same-feature control (`vendor_table.dart` в `catalog`) — плоский sibling резолвится локально, ошибки 0.

3. **Same-feature control реально PASS, не «другие ошибки».** `vendor_entity.dart` существует в `catalog`, все 8 аналогичных import-точек резолвятся локально. Единственный оставшийся шум — `configuration_table.dart` "Could not parse this table constraint" — это **Warning** pre-existing baseline (UNIQUE с reserved `group`), к junction'ам не относится. Executor корректно отделил его в findings.

4. **Остаток НЕ преуменьшен и НЕ преувеличен.** Прогнал `grep` по всем файлам `author_book_map` в feature `authors`: ровно 6 файлов / 8 broken импортов / 5 подсистем (data/providers, data/repositories, domain/repositories, domain/usecases, presentation/providers). Ни одного пропущенного слоя. Датасорс-слои (dao/local/remote) НЕ импортируют book cross-feature — согласуется с CLAUDE.md (там MANY_TO_MANY substitution/hardcoded inheritance, не cross-parent import). Вариант «drift-фикс закрывает BUG-015 целиком» нигде не заявлен — наоборот, TL;DR и «Риски» явно говорят «не работает end-to-end до архитектурного решения».

5. **Частичный фикс корректен + без регрессии.** Маркер `:driftTableImports` реально wired на `generateDriftTableImports` (`section_generators.ts:56-58`), который резолвит cross-feature путь через `findTableInFeatures` (sibling-lookup, `relation_generation.ts:31-55`). Same-feature — плоский sibling сохранён (подтверждено t206 catalog + unit-тестом «control»). Важно: сам `relation_generation.ts` в этой задаче **НЕ менялся** (логика `findTableInFeatures` существовала в master) — фикс = переключение out-of-repo шаблонов с хардкода на маркер + 3 теста. Отчёт это точно отражает («только drift-table слой имел готовый динамический lookup»).

6. **«Границы доказательства» точны.** Список «НЕ проверено» (3+ features, несколько junction'ов, junction в третьей feature — только unit, без verify; без parents-first; runtime; директива при cross-feature) соответствует реально прогнанному сценарию. Untested-край не выдаётся за проверенный — в частности, «junction в третьей feature» честно помечен как «unit-тест есть, полный verify — нет» (я подтвердил: тест `оба parent в чужих features` покрывает генератор, но verify такого layout на диске нет).

## Проверка шаблонных правок (out-of-repo, по контракту требовали обоснования)

Обе правки на диске проверены напрямую (Read):
- `G:/Templates/flutter/t115/t115_flutter/lib/features/tasks/data/datasources/local/tables/task_tag_map_table.dart`
- `G:/Templates/flutter/simplified/simplified_flutter/lib/features/tasks/data/datasources/local/tables/task_tag_map_table.dart`

Обе теперь содержат блок `// === generated_start:driftTableImports === ... generated_end`
вместо хардкодных `import 'task_table.dart'; import 'tag_table.dart';`. Правка = именно
маркер вместо хардкода (как заявлено), обоснована (шаблон — часть генерационного контура
BUG-015, контракт это допускает для junction-файлов t115/simplified). В git diff репо их
нет — ожидаемо, файлы вне репозитория. Не закоммичены — согласно контракту (коммит за
владельцем).

## Дополнительные находки — обе правдоподобны

1. **`junction:` директива несовместима с `serverpod generate` — ПОДТВЕРЖДЕНО.** Codegen-парсер
   читает top-level `junction` как директиву (`server_yaml_parser.ts:23-56`), но Serverpod
   валидирует тот же физический `.spy.yaml` и разрешает только `{class, sealed, extends,
   immutable, table, managedMigration, serverOnly, fields, indexes}`. Extra-ключ → падение.
   Механизм реален (оба тула читают один файл). Корректно вынесено в отдельный край.

2. **`--workspace` полным путём — ПОДТВЕРЖДЕНО кодом.** `config.featuresPath =
   join(workspacesPath, '<project>_flutter/lib/features')` (`generation_config.ts:153-155`).
   При голом `--workspace t206` путь резолвится в несуществующий → `findTableInFeatures`
   вернёт null → плоский fallback (тот же баг). Классификация «usage-конвенция, не код-баг»
   корректна.

## Critical issues

Нет.

## Major issues

Нет.

## Minor / nitpicks (не блокеры)

1. **Тесты покрывают генератор, но не template-wiring.** 3 новых теста вызывают
   `generateDriftTableImports` напрямую — доказывают, что генератор резолвит cross-feature
   путь. Что именно шаблонный маркер `:driftTableImports` инвокает этот генератор,
   доказано только артефактом t206, не unit-тестом. Приемлемо (section-replacer wiring
   pre-existing), но end-to-end template→generator связка для junction-таблицы юнит-тестом
   не закрыта. — `src/test/generators/relation_generation.test.ts`.

2. **Фикс оставляет проект в компилируемо-broken состоянии (by design, BLOCKED).** drift-фикс
   устраняет `BookTable is not a class`, но 2× `InvalidTypeException` из presentation-провайдеров
   остаются → cross-feature junction всё ещё не собирается end-to-end. Это честно
   зафиксировано и соответствует контракту (архитектурный остаток → BLOCKED, не хак).
   Отмечаю как факт состояния, не как дефект работы.

3. **Рекомендация «вариант 2 (loud guard) сейчас» не реализована** — и не должна быть в этой
   задаче (контракт: не чинить архитектурный остаток). Замечание только чтобы владелец не
   принял отсутствие guard'а за упущение: сейчас cross-feature junction сгенерируется молча
   в broken-виде до принятия решения. Это ожидаемо, но стоит держать в голове при weight regen.

## Что хорошо сделано

- **Механистически чистая дельта.** Control-прогон (same-feature рядом с cross-feature в
  одном t206) — образцовый способ отделить cross-feature-баг от фонового шума. Идентичная
  структура импортов у обоих junction'ов + разница только в существовании целевых файлов —
  неопровержимый аргумент.
- **Точная инвентаризация остатка** (файл→путь), позволившая мне за минуту перепроверить
  grep'ом на диске. Ни преувеличения, ни преуменьшения.
- **Честные «Границы доказательства»** без выдачи untested-края за проверенный; варианты
  решения остатка осмысленны, «drift закрывает всё» не заявлено.
- **Scope дисциплина:** правки только в шаблонах (out-of-repo, обоснованно) + тесты + docs;
  production-код `src/` не тронут; t206 без ручных правок.
