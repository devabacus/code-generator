# BUG-015 — Cross-feature junction generation (parents в разных features)

**Severity:** High (codegen)
**Статус:** CONFIRMED → drift-table fix + **loud-guard (cross-feature отклоняется pre-flight)** (2026-07-22, TASK-039). Полный feature-aware резолвер — в backlog (спроса нет, проверено по weight 2026-07-22).
**Repro-проект:** `G:/Projects/Flutter/serverpod/t206/` (оставлен на диске как есть)

---

## Симптом

Junction, у которого parent-сущности живут в **разных** features (напр. `author` в
feature `authors`, `book` в feature `books`, junction `author_book_map` — в `authors`),
не компилируется. `codegen verify` падает на `build_runner`:

```
line 19, column 46 of .../authors/data/datasources/local/tables/author_book_map_table.dart:
  `BookTable` is not a class!
  19 │   TextColumn get bookId => text().references(BookTable, #id)();
```

плюс каскад `InvalidTypeException` в riverpod-провайдерах junction'а.

Причина: сгенерённые junction-файлы импортируют **второго** parent'а по путям,
захардкоженным в шаблоне как **same-feature relative** (`import 'book_table.dart';`,
`import '../../domain/entities/book/book_entity.dart';` и т.п.). Эти пути резолвятся
внутри feature junction'а (`authors`), где файлов второго parent'а нет — они в `books`.

Same-feature junction (оба parent + junction в одной feature — сценарий t201) работает,
потому что все relative-пути резолвятся локально.

---

## Prove-out (TASK-039, 2026-07-21) — cross vs same delta

Единый проект **t206**, два junction'а рядом:

| Junction | Parents | Feature junction'а | Результат |
|---|---|---|---|
| `author_book_map` (**cross**) | `author` (feature `authors`), `book` (feature `books`) | `authors` | **FAIL** |
| `product_vendor_map` (**same**, control) | `product`, `vendor` (оба feature `catalog`) | `catalog` | **PASS** (0 ошибок) |

`build_runner` (clean) на t206 с обоими junction'ами:

- `BookTable is not a class!` — **cross-feature** (author_book_map). Ошибок про
  `VendorTable`/`ProductTable`: **0**.
- 2× `InvalidTypeException` — только в `author_book_map` presentation-провайдерах.
- `configuration_table.dart` "Could not parse this table constraint" — **W**arning,
  pre-existing baseline-шум (UNIQUE с reserved `"group"`), не связан с junction'ами.

**Дельта однозначна: same-feature PASS + cross-feature FAIL → cross-feature broken,
не фоновый шум.** Диагноз «cross-feature» валиден по протоколу контракта.

**Замечание про `junction: [a, b]` директиву (TASK-037):** директива — codegen-input,
но Serverpod читает тот же физический `.spy.yaml` и валит `serverpod generate`:
`The "junction" property is not allowed for class type`. Директиву нельзя держать в
файле, который читает Serverpod. В prove-out она была снята из Serverpod-видимого
файла; корректная пара всё равно бралась из **parents-first** порядка FK (authorId,
bookId — до userId/customerId), результат от эвристики BUG-026 не зависел. Отдельный
край для будущей задачи (директива должна быть в codegen-only слое или стрипаться
перед serverpod generate).

---

## Root cause — многослойный, не единая точка

Cross-feature import второго parent'а захардкожен same-feature-relative в шаблоне
junction'а в **нескольких подсистемах**. Только drift-table слой имел готовый
динамический lookup (`findTableInFeatures` в `relation_generation.ts`).

**Broken cross-feature imports на t206 (8 импортов, 6 файлов, помимо table-слоя):**

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
как реальные лежат в `books/...`. Затрагиваются слои: **data/providers**,
**data/repositories**, **domain/repositories**, **domain/usecases**,
**presentation/providers**. Плюс **drift-table** (был 9-й импорт, теперь исправлен).

---

## Частичный фикс (TASK-039) — drift-table слой

**Что сделано:** junction table (`references(XTable, #id)`) больше не хардкодит
`import 'book_table.dart'` — шаблон переведён на маркер `:driftTableImports`, и
`generateDriftTableImports` резолвит cross-feature путь через существующий
sibling-features lookup.

Файлы:
- `G:/Templates/flutter/t115/.../tables/task_tag_map_table.dart` — маркер вместо хардкода.
- `G:/Templates/flutter/simplified/.../tables/task_tag_map_table.dart` — то же.
- `src/test/generators/relation_generation.test.ts` — +3 теста (cross-feature junction).

**Результат на t206 после фикса:** `BookTable is not a class!` **исчезла**; junction
table импортирует `import '../../../../../books/data/datasources/local/tables/book_table.dart';`
корректно. Same-feature (product_vendor_map) — плоские sibling'ы, без регрессии.

**⚠ Важно про `--workspace`:** cross-feature lookup работает только если
`--workspace` передан **полным путём** проекта (`.../serverpod/t206`), а не голым
именем (`t206`). При голом имени `config.featuresPath` резолвится в несуществующий
относительный путь → lookup возвращает null → плоский fallback (тот же баг). Это
историческая usage-конвенция вызова CLI, не код-баг, но её надо соблюдать (или
починить отдельно — резолвить workspace через projectsPath).

---

## Принятое решение (2026-07-22, владелец): loud-guard (вариант 2)

Проверка weight (2026-07-22): cross-feature junction'ов НЕТ ни в одном проекте
(`role_permission`, `customer_user` и все прочие держат parents в одной feature) →
реального спроса на полный резолвер (вариант 1) нет. **Выбран вариант 2 — loud-guard.**

**Реализовано (TASK-039, коммит на этой же ветке):**
- `EntityYamlValidator.validateJunctionColocation(model, featuresPath)` — pre-flight
  проверка: если оба junction-parent (`model.entity1`/`entity2`) найдены в РАЗНЫХ
  features → ошибка `CROSS_FEATURE_JUNCTION` с внятным сообщением («перенесите оба
  parent'а в одну feature»). Вызывается из `generate_entity.ts` после сборки config
  (нужен `featuresPath`), до генерации; уважает `--skip-validation`.
- Feature parent'а определяется по `<featuresPath>/<feature>/domain/entities/<entity>/<entity>_entity.dart`.
- Guard срабатывает ТОЛЬКО при доказуемо-broken layout (оба найдены, features разные);
  если parent не найден — молчит (co-location недоказуема, не его зона).
- +4 unit-теста (`entity_yaml_validator.test.ts`), checks зелёные, 322 passing.

**Итог:** silent misgeneration cross-feature junction'а заменён громким pre-flight
отказом. Поддержанный end-to-end layout — оба parent в одной feature (t201/t206 control).

Полный feature-aware резолвер (вариант 1) — **в backlog**, под конкретный спрос
(сейчас спроса нет). Table-слой уже готов к нему как референс-механизм.

---

## Почему остаток не чинился полным резолвером в TASK-039 (варианты, рассмотренные до решения)

Оставшиеся 8 broken-импортов — в 5 подсистемах, **без** переиспользуемого механизма
резолюции (в отличие от table-слоя). Полный фикс требует архитектурного решения,
а не точечной правки шаблона:

**Варианты (владелец выбрал №2, см. выше):**

1. **Feature-aware import resolution в шаблоне junction'а** — для КАЖДОГО импорта
   второго parent'а вводить маркер/секцию, резолвящую feature по имени parent'а
   (аналог `findTableInFeatures`, обобщённый на entity/repository/providers).
   Плюс: полностью снимает ограничение. Минус: ~8 новых точек генерации в шаблоне +
   каждая — свой генератор пути; риск рассинхрона; много кода.
2. **Ограничение-конвенция «junction + оба parent в одной feature»** — pre-flight
   guard в `entity_yaml_validator`, который loud-fail'ит cross-feature junction с
   понятным сообщением («перенесите оба parent'а в feature junction'а либо junction
   к parent'ам»). Плюс: дёшево, честно, соответствует t201-доказанному сценарию.
   Минус: не поддерживает cross-feature junction как фичу.
3. **CLI-флаг `--junction-parent-feature <e1>=<f1>,<e2>=<f2>`** — явное указание
   feature каждого parent'а, шаблон резолвит пути из него. Плюс: гибко. Минус:
   ceremony на вызове; всё равно нужен резолвер путей во всех слоях.

Рекомендация executor'а: если у weight нет реальных cross-feature junction'ов —
дешевле **вариант 2** (loud guard) сейчас + **вариант 1** позже под конкретный спрос.
Table-слой уже готов к варианту 1 (референс-механизм).

---

## Границы доказательства (что проверено / что НЕТ)

**Проверено (t206, TASK-039):**
- Конфигурация: **2 features** (`authors`, `books`), **1 cross-feature junction**
  (`author_book_map`), parents-first порядок FK, junction в feature одного из parent'ов.
- Control: **same-feature junction** (`product_vendor_map`, feature `catalog`) — PASS.
- `serverpod generate` — PASS (после снятия `junction:`-директивы из Serverpod-файла).
- `build_runner` — FAIL до фикса (BookTable) / FAIL после фикса (остаток в 5 слоях).
- Drift-table слой фикса — PASS (cross-feature путь резолвится), +3 unit-теста, 318 tests.

**НЕ проверено (осталось «untested» для этой ширины):**
- **3+ features** / несколько junction'ов между разными парами features.
- Junction в **третьей** feature (не совпадающей ни с одним parent'ом) — на t206
  тестировался junction в feature первого parent'а; unit-тест на «оба parent в чужих
  features» есть, но полный verify такого layout — нет.
- Cross-feature junction **без** parents-first порядка (зависимость от BUG-026
  эвристики при cross-feature) — не изолировалось.
- Runtime (миграции/serve) cross-feature junction — только compile-контур.
- `junction: [a, b]` директива при cross-feature + serverpod generate — заблокирована
  Serverpod'ом (отдельный край, см. выше; вынесен в TASK-040).

**Принятое ограничение (loud-guard, 2026-07-22):** cross-feature junction (оба parent в
разных features) в целом **не поддержан end-to-end** и теперь **отклоняется pre-flight
guard'ом** `validateJunctionColocation` (ошибка `CROSS_FEATURE_JUNCTION`) — вместо
silent broken build. Поддержанный layout — оба parent в ОДНОЙ feature (доказан t201/t206).
Полный резолвер (5 слоёв) — в backlog под спрос; пока попытка cross-feature = громкий отказ.

---

## История

- 2026-05-28 (t201): same-feature junction prove-out PASS. Cross-feature — untested.
- 2026-07-21 (TASK-039, t206): cross-feature **воспроизведён** как конкретный баг
  (repro + числа). Drift-table слой исправлен + тесты. Остаток — BLOCKED (архитектурный).
