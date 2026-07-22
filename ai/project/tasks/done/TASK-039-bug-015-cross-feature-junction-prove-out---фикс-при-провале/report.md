# Отчёт TASK-039 — BUG-015 cross-feature junction prove-out + partial fix

**Статус:** Ready for review
**Ветка:** `feature/TASK-039-cross-feature-junction`
**Коммит:** `c500058`

> Примечание teamlead: текст отчёта подготовлен executor'ом (Opus); файл записан из
> основного цикла сессии — harness блокировал прямую запись report.md субагентом.

## TL;DR (вердикт)

BUG-015 **переведён из «untested» в CONFIRMED**: cross-feature junction (parents в
разных features) действительно сломан — воспроизведён на t206 с обязательной
control-дельтой (same-feature PASS + cross-feature FAIL).

Провал **многослойный**. Одна его часть — **drift-table слой** — локальна и
исправлена (шаблон junction table переведён на маркер `:driftTableImports`, +3 теста).
Оставшаяся часть (repository / data-providers / domain / presentation — 8 broken
импортов в 5 подсистемах, без reuse-механизма резолюции) — **архитектурная → BLOCKED**,
3 варианта решения зафиксированы, решение за владельцем.

Итог: cross-feature junction в целом **НЕ работает end-to-end** до архитектурного
решения по остатку; drift-фикс — необходимый, но не достаточный шаг.

## Хронология (реальные CLI-выводы)

### Setup

- Ветка `feature/TASK-039-cross-feature-junction`, `npm run compile` → exit 0.
- `create-project --name t206` → SUCCESS, Duration **253445ms** (~4 мин). Последний
  существовавший проект был t205 → взят t206 (incremental numbering, ничего не удалялось).

### Фаза 1 — cross-feature сценарий (2 features + junction)

YAML (обязательные поля userId/customerId/isDeleted + парные `*_sync_event.spy.yaml`):

- `models/authors/author.spy.yaml` (feature **authors**)
- `models/books/book.spy.yaml` (feature **books**)
- `models/authors/author_book_map.spy.yaml` — junction, **parents-first** FK
  (authorId, bookId ДО userId/customerId), директива `junction: [author, book]`.

Генерация (parents-first порядок вызовов):

```
generate-entity author           --feature-path .../features/authors --with-server → SUCCESS (24 created)
generate-entity book             --feature-path .../features/books   --with-server → SUCCESS (24 created)
generate-entity author_book_map  --feature-path .../features/authors --with-server → SUCCESS (24 created)
```

**verify t206 (первый прогон, директива `junction:` в файле):**

```
✗ verify t206
  ✓ pubGet — 4106ms
  ✗ serverpodGenerate — 20025ms
    error: ERROR: Found 1 issue.
      Error on line 3, column 1 of lib\src\models\authors\author_book_map.spy.yaml:
        The "junction" property is not allowed for class type.
        Valid keys are {class, sealed, extends, immutable, table, managedMigration,
        serverOnly, fields, indexes}.
      3 │ junction: [author, book]
        │ ^^^^^^^^
  ✗ flutterAnalyze — 0ms
```

→ `junction: [a, b]` (TASK-037) — codegen-input, но Serverpod читает тот же физический
`.spy.yaml` и падает. Директива снята из Serverpod-видимого файла; корректная
junction-пара всё равно детектится **parents-first** порядком FK (результат не зависит
от BUG-026 эвристики). Зафиксировано как отдельный неисправленный край.

**verify t206 (директива снята):**

```
✗ verify t206
  ✓ pubGet — 4283ms
  ✓ serverpodGenerate — 20018ms
  ✗ buildRunner — 12628ms
  ✗ flutterAnalyze — 0ms
```

`build_runner` (clean) — root cause:

```
line 19, column 46 of package:t206/features/authors/data/datasources/local/tables/author_book_map_table.dart:
  `BookTable` is not a class!
  19 │   TextColumn get bookId => text().references(BookTable, #id)();
```

Причина: junction table импортирует `import 'book_table.dart';` как плоский sibling →
резолвится в feature junction'а (`authors`), где `book_table.dart` нет (он в `books`).

### Обязательный control-прогон (same-feature junction, тот же t206)

Аналог t201: `product` / `vendor` / `product_vendor_map` — все три в **одной** feature
`catalog`. Генерация — 3× SUCCESS. Junction table импортирует `product_table.dart` +
`vendor_table.dart` как плоские sibling'ы — **резолвятся локально**.

**verify t206 (оба junction'а рядом):** `build_runner` FAIL. Дельта (clean build):

```
BookTable errors:            2   (cross-feature author_book_map)
Vendor/ProductTable errors:  0   (same-feature product_vendor_map — PASS)
```

Полный список ошибок clean-build (оба junction'а):

```
E riverpod_generator on .../authors/presentation/providers/author_book_map/author_book_map_filter_providers.dart:
  InvalidTypeException: The type is invalid and cannot be converted to code.
E riverpod_generator on .../authors/presentation/providers/author_book_map/author_book_map_state_providers.dart:
  InvalidTypeException: The type is invalid and cannot be converted to code.
W drift_dev on .../authors/data/datasources/local/tables/author_book_map_table.dart:
  line 19 ...: `BookTable` is not a class!
W drift_dev on .../configuration/data/datasources/local/tables/configuration_table.dart:
  line 29 ...: Could not parse this table constraint      ← Warning, pre-existing baseline
```

**Дельта однозначна: same-feature PASS + cross-feature FAIL → cross-feature broken,
не фоновый шум.** `configuration_table.dart` "Could not parse this table constraint" —
**Warning** (pre-existing baseline: UNIQUE с reserved `"group"`), к junction'ам не относится.

### Фаза 2 — диагноз локальности и фикс

Root cause многослойный: cross-feature импорт второго parent'а захардкожен
same-feature-relative в шаблоне junction'а в **нескольких подсистемах**. Только
drift-table слой имел готовый динамический lookup (`findTableInFeatures` в
`relation_generation.ts:31-55` — точка входа из контракта).

**Проверено на t206 (8 broken импортов, 6 файлов, помимо table-слоя):**

```
data/providers/author_book_map/author_book_map_data_providers.dart : ../book/book_data_providers.dart
data/repositories/author_book_map_repository_impl.dart             : ../../domain/entities/book/book_entity.dart
data/repositories/author_book_map_repository_impl.dart             : ../../domain/repositories/book_repository.dart
domain/repositories/author_book_map_repository.dart                : ../entities/book/book_entity.dart
domain/usecases/author_book_map_usecases.dart                      : ../entities/book/book_entity.dart
presentation/providers/.../author_book_map_filter_providers.dart   : ../../../domain/entities/book/book_entity.dart
presentation/providers/.../author_book_map_filter_providers.dart   : ../book/book_state_providers.dart
presentation/providers/.../author_book_map_state_providers.dart    : ../../../domain/entities/book/book_entity.dart
```

Все резолвятся в отсутствующие файлы внутри feature junction'а (`authors/...`), тогда
как реальные лежат в `books/...` (проверено: `book_entity.dart` найден только в
`features/books/domain/entities/book/`). Слои: **data/providers**, **data/repositories**,
**domain/repositories**, **domain/usecases**, **presentation/providers**.

**Локальная часть (drift-table) — исправлена:**

- Шаблон junction table `task_tag_map_table.dart` (t115 + simplified) переведён с
  хардкода `import 'task_table.dart'; import 'tag_table.dart';` на маркер
  `:driftTableImports`. Теперь `sectionReplacer` → `generateDriftTableImports` резолвит
  cross-feature путь через существующий sibling-lookup.
- TDD: `src/test/generators/relation_generation.test.ts` +3 теста (cross-feature: чужая
  feature → относительный путь; оба parent в чужих features; same-feature control →
  плоский sibling). Использована реальная temp-структура на диске, т.к.
  `generateDriftTableImports` ходит в `fs` напрямую. Тесты зелёные.

**Результат на t206 после фикса** (регенерация junction с ПОЛНЫМ `--workspace`):

```
author_book_map_table.dart:
  import 'author_table.dart';                                                  // same feature
  import '../../../../../books/data/datasources/local/tables/book_table.dart'; // cross-feature ✓
```

**verify t206 после drift-фикса:**

```
✗ verify t206
  ✓ pubGet — 4439ms
  ✓ serverpodGenerate — 20143ms
  ✗ buildRunner — 13449ms
  ✗ flutterAnalyze — 0ms
```

`build_runner` clean после фикса — `BookTable is not a class!` **ИСЧЕЗЛА**. Остаётся
2× `InvalidTypeException` из `author_book_map` presentation-провайдеров (тот же класс
бага, другие подсистемы — остаток BLOCKED). Same-feature (product_vendor_map) —
плоские sibling'ы, без регрессии.

### Остаток → BLOCKED

8 broken-импортов в 5 подсистемах без reuse-механизма резолюции. Корректный фикс —
архитектурное решение, а не точечная правка шаблона. Не чиню в этой задаче (контракт:
архитектурный провал → BLOCKED, не хак).

## Root cause

Cross-feature импорт **второго** parent'а захардкожен в шаблоне junction'а как
same-feature-relative во множестве слоёв. Same-feature junction (t201-сценарий) работает,
т.к. все relative-пути резолвятся локально; cross-feature — второй parent в чужой feature,
пути указывают в feature junction'а, где файлов нет. Только drift-table слой имел
динамический sibling-lookup (`findTableInFeatures`) — остальные слои резолвят пути
статически из шаблона.

## Что пофикшено / что BLOCKED

**Пофикшено (drift-table слой):** junction table больше не хардкодит парент-импорты —
маркер `:driftTableImports` + `generateDriftTableImports` резолвит cross-feature путь.
Устраняет `BookTable is not a class!`. +3 unit-теста. Без регрессии same-feature.

**BLOCKED (остаток, 5 подсистем):** repository_impl / data_providers / domain repositories
/ domain usecases / presentation filter+state providers — 8 broken импортов. Варианты
(решение за владельцем):

1. **Feature-aware import resolution в шаблоне junction'а** — для КАЖДОГО импорта
   второго parent'а маркер/секция, резолвящая feature по имени parent'а (обобщение
   `findTableInFeatures` на entity/repository/providers). Плюс: полностью снимает
   ограничение. Минус: ~8 новых точек генерации, риск рассинхрона, много кода.
2. **Ограничение-конвенция «junction + оба parent в одной feature»** — pre-flight guard
   в `entity_yaml_validator`, loud-fail на cross-feature junction с понятным сообщением.
   Плюс: дёшево, честно, соответствует t201-доказанному сценарию. Минус: не поддерживает
   cross-feature junction как фичу.
3. **CLI-флаг `--junction-parent-feature <e1>=<f1>,<e2>=<f2>`** — явное указание feature
   каждого parent'а, шаблон резолвит из него. Плюс: гибко. Минус: ceremony на вызове;
   всё равно нужен резолвер путей во всех слоях.

Рекомендация executor'а: если у weight нет реальных cross-feature junction'ов — дешевле
**вариант 2** (loud guard) сейчас + **вариант 1** позже под конкретный спрос (table-слой
уже готов к варианту 1 как референс-механизм).

## Дополнительные находки

1. **Директива `junction: [a, b]` (TASK-037) несовместима с `serverpod generate`.**
   Директива — codegen-input, но Serverpod читает тот же физический `.spy.yaml` и падает:
   `Error on line 3 ...: The "junction" property is not allowed for class type. Valid keys
   are {class, sealed, extends, immutable, table, managedMigration, serverOnly, fields,
   indexes}.` Директиву нельзя держать в Serverpod-видимом файле. В prove-out она снята,
   корректная пара бралась из parents-first порядка FK. Нужен codegen-only слой директивы
   либо strip перед serverpod generate — **отдельный неисправленный край**.

2. **`--workspace` для cross-feature обязан быть ПОЛНЫМ путём проекта, не голым именем.**
   `config.featuresPath = join(workspacesPath, '<project>_flutter/lib/features')`. При
   `--workspace t206` (голое имя) путь резолвится в несуществующий относительный →
   `findTableInFeatures` возвращает null → плоский fallback (тот же баг). Корректно:
   `--workspace G:/Projects/Flutter/serverpod/t206`. Это usage-конвенция вызова CLI
   (историческая), не код-баг; но её надо соблюдать (или отдельно чинить — резолвить
   workspace через projectsPath).

## Границы доказательства

Подробно — в [bug-report 015](../../bug-reports/015-cross-feature-junction.md), раздел
«Границы доказательства». Кратко:

**Проверено (t206):** 2 features (`authors`/`books`) + 1 cross-feature junction, parents-first
FK, junction в feature одного из parent'ов; same-feature control (`catalog`) PASS;
serverpod generate PASS (после снятия директивы); build_runner FAIL до/после фикса;
drift-table фикс PASS + 3 unit-теста.

**НЕ проверено:** 3+ features / несколько junction'ов; junction в третьей feature
(полный verify такого layout — unit-тест есть, verify нет); cross-feature без parents-first
порядка; runtime (миграции/serve); директива при cross-feature + serverpod generate
(заблокирована Serverpod'ом); **остаток BLOCKED (5 слоёв) не исправлен → cross-feature
junction end-to-end не работает.**

## Изменённые файлы

- `src/test/generators/relation_generation.test.ts` — +3 теста cross-feature junction.
- `ai/project/bug-reports/015-cross-feature-junction.md` — новый (CONFIRMED + partial + BLOCKED).
- `ai/project/docs/status.md`, `ai/project/docs/roadmap.md` — строка BUG-015 обновлена.
- `G:/Templates/flutter/t115/.../tables/task_tag_map_table.dart` — маркер вместо хардкода (вне репо).
- `G:/Templates/flutter/simplified/.../tables/task_tag_map_table.dart` — то же (вне репо).

t206 оставлен на диске как есть (включая частично-broken генерацию). Никаких ручных
правок сгенерённого кода не вносилось.

## Checks (профиль ts-generator, реальные выводы)

```
compile → npm run compile
  exit=0

lint → npm run lint
  ✖ 18 problems (0 errors, 18 warnings)      ← baseline (0 errors)

unit → node node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"
  318 passing                                 ← 315 baseline + 3 новых, 0 failing
```

verify t206 (cross-feature): serverpodGenerate PASS, buildRunner FAIL (остаток BLOCKED).
Числа скопированы выше.

## Коммиты

- `c500058` — `fix(generation): BUG-015 cross-feature junction — drift-table слой (TASK-039)`
  (test + bug-report 015 + status.md + roadmap.md).

Push / PR / merge не выполнялись (по контракту).

## Риски / заметки

- Drift-table фикс не закрывает BUG-015 сам по себе — cross-feature junction в целом
  не работает end-to-end до архитектурного решения по остатку.
- Same-feature junction (t201/t206 control) — не тронут, byte-identical, PASS.
- Директива `junction:` + Serverpod — отдельный неисправленный край.
- Шаблонные правки (t115/simplified `task_tag_map_table.dart`) лежат в СВОИХ репо
  на диске, НЕ закоммичены — коммит за владельцем.
- Markdown-lint warnings (MD032/MD060) в status/roadmap — pre-existing, вне профиля ts-generator.

## Статус

Ready for review. Вердикт BUG-015: **CONFIRMED + partial fix (drift-table) + остаток BLOCKED**.
