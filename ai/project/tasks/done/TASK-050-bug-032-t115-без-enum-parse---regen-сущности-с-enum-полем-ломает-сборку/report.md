# Отчёт TASK-050 — BUG-032: в t115 нет `enum_parse.dart`

## Резюме

**BUG-032 закрыт.** Генератор эмитил вызовы `tryParseEnum(...)`, а определение хелпера
поставлял только шаблон `simplified` — в t115 его не было ни в каком виде. Любая сущность
с enum-полем в t115-проекте не компилировалась.

Фикс — точный паритет с `simplified`, emit-сторона не тронута. Доказано на **свежем** `t213`:
`flutter analyze` → **errors=0**.

## Изменения

**Шаблон `G:/Templates/flutter/t115/` (вне репо, НЕ запушен — ждёт слова владельца):**

- `+ t115_flutter/lib/core/utils/enum_parse.dart` — 28 строк, `// manifest: startProject`,
  скопирован из simplified без правок (файл шаблоно-независим);
- `~ .../features/tasks/domain/entities/extensions/{category,tag,task}_entity_extension.dart` —
  добавлен блок из 6 строк: комментарий-обоснование + `// ignore: unused_import` + импорт
  `../../../../../core/utils/enum_parse.dart`.

**В репо:**

- `+ src/test/generators/enum_parse_template_parity.test.ts` — 9 тестов целостности шаблона;
- `~ ai/project/bug-reports/032-*.md` → RESOLVED.

`src/features/generation/**` не тронут — это было явное не-цель задачи, и диагноз подтвердился:
дефект чисто поставочный.

## Тесты

**Красный тест написан первым** (правило владельца) и был красным **по делу**:

```text
до фикса:  5 failing (t115: хелпер + 3 импорта + parity-сверка)
           4 passing (simplified — те же проверки проходят)
после:     9 passing
```

Разделение t115/simplified здесь принципиально: тест различает предмет, а не красит всё
подряд. Он же ловит разрыв **в обратную сторону**, если хелпер потеряет simplified.

**Почему прежних тестов не хватило.** `enum_parse_helper.test.ts` (TASK-027) проверяет чистую
функцию «модель → строка» и остаётся зелёным при полностью отсутствующем хелпере — эмиссия-то
корректна. Разрыв «эмитим вызов, но не поставляем определение» не виден ни одному unit-тесту
на генератор. Тест целостности ходит в **реальные шаблоны на диске**: предмет проверки —
комплектность поставки, её нельзя замокать.

**Полный прогон:**

```text
npm run compile   → tsc clean
mocha             → 468 passing (было 459), 0 failing
npm run lint      → 0 errors, 18 warnings (baseline не сдвинулся)
```

## E2E — DoD-гейт

Проект **создан с нуля**: `create-project --name t213` (295 с). Хелпер доехал автоматически —
`t213_flutter/lib/core/utils/enum_parse.dart` на месте сразу после bootstrap, без генерации
сущностей. То есть `manifest: startProject` отработал.

**Прогон 1 — сущность С enum-полями** (`Shipment`: `stage` обязательный, `priority` nullable —
обе ветки эмиссии):

```text
generate-entity --with-server → exit 0, 24 файла, конфликтов 0

в shipment_entity_extension.dart:
  10: // ignore: unused_import
  11: import '../../../../../core/utils/enum_parse.dart';
  43: stage: tryParseEnum(serverpod.ShipmentStage.values, stage, serverpod.ShipmentStage.values.first),
  44: priority: priority != null ? tryParseEnum(serverpod.ShipmentPriority.values, priority, ...) : null

verify --name t213 --human
  ✓ flutterAnalyze — 90486ms (errors=0, warnings=1, infos=44)
  ✓ serverpodGenerate — 20454ms
  ✓ buildRunner — 14638ms
```

**Прогон 2 — контрольная сущность БЕЗ enum** (`Note`), чтобы замерить цену безусловного импорта:

```text
verify --name t213 --human
  ✓ flutterAnalyze — 10817ms (errors=0, warnings=1, infos=44)
```

**Числа идентичны.** Безусловный импорт добавил **0 предупреждений** — `// ignore: unused_import`
работает. Это был открытый вопрос дизайна TASK-027, теперь он замерен, а не предположен.

## Риски / Заметки

**⚠ STOP-gate: шаблон t115 изменён, push НЕ делал.** В `G:/Templates/flutter/t115/` сейчас
5 незакоммиченных изменений: 4 моих (хелпер + 3 entity_extension) и **1 чужое** —
`task_tag_map_table.dart` с маркером `:driftTableImports`, оставшееся от TASK-039 (merged
PR #49) и никогда не закоммиченное. Его я не трогал. Владельцу решать: коммитить t115 вместе
с этим хвостом или разделять.

**⚠ Слепое пятно НЕ закрыто.** Тест целостности ловит отсутствие файла, но не поломку
генерации на enum-поле: в фикстуре t115 enum-полей нет, поэтому штатный `verify` на `t<N>`
этот класс дефектов по-прежнему не увидит. Ровно так BUG-032 и прожил месяцы незамеченным.
Варианты закрытия — в task.md, «Открытый вопрос владельцу»; рекомендация — отдельный
тест-YAML с enum, гоняемый в E2E задач, трогающих mapping-слой, без blast radius на все
будущие проекты.

**Наблюдение мимо scope:** `create-project` на t213 не создал feature `tasks` — в проекте есть
`auth`, `bluetooth`, `configuration`, `developer_tools`, `home`, `settings_definitions`, но
Task/Tag/Category/TaskTagMap не сгенерированы, хотя [CLAUDE.md](../../../../CLAUDE.md) обещает
их auto-gen «для compileable home_page». На `verify` это не сказалось (errors=0), но описание
в доках расходится с поведением. Отдельной задачей — проверить, что верно: доки или код.

## Статус

Готово. Осталось внешнее действие владельца: push шаблона t115.
