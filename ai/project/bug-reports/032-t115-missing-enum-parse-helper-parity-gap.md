# BUG-032: в шаблоне t115 нет `enum_parse.dart` — regen сущности с enum-полем ломает сборку

**Статус:** OPEN (с 2026-07-30)
**Severity:** **High** — молчаливая поломка компиляции на живом проекте при штатном regen
**Нашёл:** TASK-049, разбор правок weight. Воспроизведено на копии weight, errors 0 → 5.

## Симптом

`generate-entity` для сущности с enum-полем эмитит вызовы `tryParseEnum(...)` в
`<entity>_entity_extension.dart`, но **не эмитит ни импорт хелпера, ни сам хелпер**.
В t115-проектах файла `lib/core/utils/enum_parse.dart` нет → `undefined_method`.

```text
dart analyze lib/features/weighing/domain/entities/extensions/weighing_entity_extension.dart

error - :61:40 - The method 'tryParseEnum' isn't defined for the type 'WeighingEntity'. - undefined_method
error - :68:42 - The method 'tryParseEnum' isn't defined for the type 'WeighingEntity'. - undefined_method
error - :71:17 - The method 'tryParseEnum' isn't defined for the type 'WeighingEntity'. - undefined_method
```

`verify` на копии weight: **было errors=0 → стало errors=5** после регенерации **одного**
файла.

## Причина — parity gap TASK-027

TASK-027 (BUG-022, «enum `byName` → graceful `tryParseEnum`») сделал две вещи:

1. **emit-сторона** — [relation_generation.ts:87-97](../../src/features/generation/generators/relation_generation.ts)
   генерирует `tryParseEnum(EnumType.values, raw, EnumType.values.first)` вместо
   `EnumType.values.byName(raw)`. Это общий код, работает для **любого** шаблона;
2. **helper** — `lib/core/utils/enum_parse.dart` (`manifest: startProject`) + инъекция
   импорта в entity_extension шаблоны.

Пункт 2 доехал **только до `simplified`**. Проверено на диске 2026-07-30:

```text
G:/Templates/flutter/simplified/simplified_flutter/lib/core/utils/enum_parse.dart   ЕСТЬ
G:/Templates/flutter/t115/t115_flutter/lib/core/utils/enum_parse.dart               НЕТ

grep -rl "tryParseEnum" G:/Templates/flutter/t115   → только артефакты build/, кода нет
```

И ни в одном t115-проекте хелпера тоже нет:

```text
weight_flutter   НЕТ
t212_flutter     НЕТ
t115_flutter     НЕТ
```

## Почему не всплыло раньше

- **В фикстуре t115 нет enum-полей.** У `task`/`tag`/`category` enum'ов нет, поэтому
  `byName`/`tryParseEnum` в шаблонных entity_extension не появляется вовсе, и
  `create-project` + `verify` на `t<N>` проходят чисто. Класс дефекта структурно невидим
  для текущего DoD-гейта.
- **TASK-047 мимо:** тестовая сущность `probe_item` — 7 скалярных полей, enum'ов нет.
- **В weight файл компилируется** потому, что там руками добавлен **локальный** приватный
  хелпер `_tryParseEnum` (коммит `cb5c3751`, «печать талона взвешивания»). Ровно этот
  локальный хелпер regen и стирает — вместе с ним уходит единственное определение.

Родственный класс: parity-долг TASK-025→TASK-032 (ref.mounted) и TASK-028→TASK-031 (LWW)
закрывались отдельными задачами; для TASK-027 такой задачи не было.

## Как воспроизвести

```bash
# в t115-проекте с enum-полем (например копия weight)
node out/adapters/cli/index.js generate-entity \
  --yaml "<p>/weight_server/lib/src/models/weighing/weighing.spy.yaml" \
  --feature-path "<p>/weight_flutter/lib/features/weighing" \
  --workspace "<p>" \
  --overwrite-existing "weight_flutter/lib/features/weighing/domain/entities/extensions/weighing_entity_extension.dart" \
  --human

node out/adapters/cli/index.js verify --name weight --projects-path <base> \
  --skip-pub-get --skip-serverpod --skip-build-runner --human    # → errors=5
```

## Предлагаемое решение

1. **Перенести `enum_parse.dart` в t115** как `manifest: startProject` — прямая parity
   с simplified (файл готов, копировать один в один).
2. **Проверить инъекцию импорта** в t115-шаблонах entity_extension: в simplified она есть,
   в t115 её нет; без импорта хелпер не виден даже когда файл на месте.
3. **Закрыть слепое пятно DoD:** добавить в фикстуру t115 (или в отдельный тест-YAML)
   сущность с **enum-полем**, иначе `verify` продолжит пропускать этот класс. Без этого
   пункта фикс не проверяется — сегодня `verify` зелёный при сломанном шаблоне.
4. Unit-тест на emit: enum-поле → есть и вызов `tryParseEnum`, и импорт хелпера.

## Обходной путь до фикса

Не регенерировать `*_entity_extension.dart` у сущностей с enum-полями (в weight это
`weighing`), либо после regen руками возвращать импорт/локальный хелпер. В карте риска
[TASK-048](../tasks/done/) этот файл уже помечен как требующий ручного разбора.

## Связанное

- [BUG-022](022-enum-byname-state-error.md) — исходный дефект, закрыт TASK-027 для simplified
- [TASK-048](../tasks/done/) — карта риска, где `weighing_entity_extension` числится под угрозой
- **Урок класса «verify-blind»** — см. [BUG-025](025-orchestrator-register-noop-when-markers-absent.md)
  и [BUG-024](024-reserved-drift-column-name-silent-build-break.md): `verify` ловит только то,
  что попадает в фикстуру. Фикстура без enum → дефект не виден.
