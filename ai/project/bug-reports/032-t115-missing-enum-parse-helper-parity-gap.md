# BUG-032: в шаблоне t115 нет `enum_parse.dart` — regen сущности с enum-полем ломает сборку

**Статус:** OPEN (2026-07-30) → **RESOLVED (2026-07-30, TASK-050)**
**Severity:** **High** — молчаливая поломка компиляции на живом проекте при штатном regen
**Нашёл:** TASK-049, разбор правок weight. Воспроизведено на копии weight, errors 0 → 5.

## Решение (TASK-050)

Паритет с `simplified`, без изменения emit-стороны:

- `lib/core/utils/enum_parse.dart` (28 строк, `manifest: startProject`) скопирован в t115;
- импорт хелпера + `// ignore: unused_import` добавлен в три `*_entity_extension.dart`
  фикстуры t115 (`category` / `tag` / `task`).

**Регрессионный тест —** [enum_parse_template_parity.test.ts](../../../src/test/generators/enum_parse_template_parity.test.ts).
Он проверяет **комплектность поставки**, а не эмиссию: хелпер существует, помечен
`manifest: startProject`, импортируется, импорт снабжён `ignore`. Гоняется по **обоим**
шаблонам, поэтому ловит разрыв в любую сторону. До фикса: **5 падений на t115 при 4 проходах
на simplified** — тест различал предмет, а не красил всё подряд.

**Почему прежних тестов не хватило:** `enum_parse_helper.test.ts` (TASK-027) проверяет чистую
функцию «модель → строка». Он зелёный и при полностью отсутствующем хелпере — эмиссия-то
корректна. Разрыв «эмитим вызов, но не поставляем определение» не виден ни одному unit-тесту
на генератор.

**E2E на свежем `t213`** (проект создан с нуля, `create-project` 295с):

```text
сущность Shipment: enum-поле обязательное (stage) + nullable (priority)
  → сгенерировано, импорт хелпера на месте, обе ветки эмиссии корректны:
      stage: tryParseEnum(serverpod.ShipmentStage.values, stage, ...values.first)
      priority: priority != null ? tryParseEnum(...) : null

verify --name t213 --human
  ✓ flutterAnalyze — 90486ms (errors=0, warnings=1, infos=44)
  ✓ serverpodGenerate — 20454ms
  ✓ buildRunner — 14638ms
```

Хелпер доезжает в создаваемый проект автоматически (`manifest: startProject` отработал —
`t213_flutter/lib/core/utils/enum_parse.dart` на месте сразу после `create-project`).

⚠ **Слепое пятно НЕ закрыто.** В фикстуре t115 (`task`/`tag`/`category`) enum-полей по-прежнему
нет, значит штатный `verify` на `t<N>` этот класс дефектов не увидит и в будущем — как не видел
сейчас. Тест целостности шаблона ловит **отсутствие файла**, но не поломку генерации на
enum-поле. Вариант закрытия (решение за владельцем) — держать отдельный тест-YAML с enum и
гонять его в E2E задач, трогающих mapping-слой. Родня [BUG-024](024-reserved-drift-column-name-silent-build-break.md)
и [BUG-025](025-orchestrator-register-noop-when-markers-absent.md).

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
