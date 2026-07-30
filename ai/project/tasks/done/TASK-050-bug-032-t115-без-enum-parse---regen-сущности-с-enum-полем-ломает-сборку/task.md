---
# Читается и УПРАВЛЯЕТ поведением: status двигают `task.py move` / `pr --done`
# (руками папки между active/blocked/done не таскать), id сверяется с именем папки.
id: TASK-050
schema_version: 2
status: done
# ↓ ЗАРЕЗЕРВИРОВАНО. Всё ниже сейчас только ВАЛИДИРУЕТСЯ `task.py lint` — ни один
#   исполнитель этих полей не читает и поведение по ним не меняет. Это задел под
#   ночной драйвер (TASK-009), которого пока нет.
mode: interactive
zone: "generator-core"
verification_profile: "ts-generator"
checks: [compile, lint, unit]
max_attempts: 3
depends_on: []
---

# TASK-050: BUG-032 — в t115 нет `enum_parse.dart`, regen сущности с enum-полем ломает сборку

## Ветка

`feature/TASK-050-bug-032-enum-parse-parity`

## Цель

Закрыть [BUG-032](../../bug-reports/032-t115-missing-enum-parse-helper-parity-gap.md): привести
t115 к тому состоянию, которое TASK-027 уже реализовал в `simplified`.

Сегодня генератор эмитит `tryParseEnum(...)` для любого enum-поля (общий код
[relation_generation.ts:93-98](../../../../src/features/generation/generators/relation_generation.ts)),
но хелпер `lib/core/utils/enum_parse.dart` и статический импорт живут **только в simplified**.
В t115-проекте это даёт `undefined_method` — воспроизведено на копии weight: `errors=0 → 5`.

## Не-цели

- **НЕ трогать emit-сторону** — она общая для обоих шаблонов и работает правильно.
- **НЕ менять `simplified`** — он эталон, к нему и подтягиваемся.
- **НЕ переделывать дизайн на условную инъекцию импорта.** Безусловный импорт
  с `// ignore: unused_import` — осознанное решение TASK-027 («acceptable trade-off vs
  conditional emission complexity»). Пересмотр — отдельная дискуссия, не эта задача.
- НЕ добавлять enum-поле в фикстуру t115 без решения владельца (см. «Открытый вопрос»).

## Scope

Разрешено:

- `G:/Templates/flutter/t115/**` — **основная зона работы** (обычно STOP-gate; здесь это и есть задача)
- `src/test/**` — тест на целостность шаблона
- `ai/project/bug-reports/032-*.md` — закрытие

Запрещено:

- `src/features/generation/**` — emit-сторона не меняется
- `G:/Templates/flutter/simplified/**`
- ручные правки target-проектов ради зелёного verify

## Критерии приёмки

- [x] Тест **сначала красный** на текущем t115, зелёный после фикса — 5 падений на t115 / 4 прохода на simplified, после фикса 9 passing
- [x] `lib/core/utils/enum_parse.dart` есть в t115 с маркером `// manifest: startProject`
- [x] Импорт хелпера + `// ignore: unused_import` есть во всех трёх `*_entity_extension.dart` t115 (category / tag / task)
- [x] **E2E:** свежий `t213` + сущность **с enum-полем** → `verify` **errors=0, warnings=1, infos=44**
- [x] Замерено: безусловный импорт добавил **0 warnings** — контрольная сущность без enum дала те же errors=0, warnings=1, infos=44
- [x] Сущность **без** enum-полей (`Note`) генерируется без ошибок и без лишних предупреждений
- [x] BUG-032 переведён в RESOLVED со ссылкой на задачу
- [x] compile / lint / unit зелёные — 468 passing, 0 errors / 18 warnings

## План работы

- [x] 1. Красный тест на целостность шаблона: для **обоих** шаблонов проверить, что хелпер существует и что `*_entity_extension.dart` его импортирует. На t115 обязан упасть
- [x] 2. Убедиться, что он падает именно на t115 и проходит на simplified (иначе тест проверяет не то)
- [x] 3. Скопировать `enum_parse.dart` из simplified в t115 (`manifest: startProject`), пути в комментариях выправить под t115
- [x] 4. Добавить импорт + `// ignore: unused_import` в три `*_entity_extension.dart` t115
- [x] 5. Тест зелёный; `npm run compile` + mocha + `npm run lint`
- [x] 6. E2E: `create-project --name t213`, добавить enum-YAML + сущность с enum-полем, `generate-entity --with-server`, `verify --name t213 --human`
- [x] 7. Контрольный прогон: сущность **без** enum на том же t213 — убедиться, что вывод не испортился
- [x] 8. BUG-032 → Resolved, `report.md`, обновить `status.md` / `agent_memory.md`

## STOP-gates

- **Правка шаблона `G:/Templates/flutter/t115/`** — это ядро задачи, разрешено её scope'ом. Но: **push в репо t115 — только по явному слову владельца.**
- Удаление тест-проектов `t<N>` — **запрещено** (политика владельца, обходные пути тоже).
- Если фикс потребует трогать `src/features/generation/**` — остановиться: значит диагноз неверен, дело не в parity.

## Заметки по реализации

- Эталон для копирования — `simplified_flutter/lib/core/utils/enum_parse.dart` (28 строк) и
  блок импорта в `simplified_flutter/.../category_entity_extension.dart` (строки 5-10).
- Глубина относительного пути в t115 может отличаться — сверять по факту, не копировать вслепую.
- `task_tag_map_entity_extension.dart` импорта **не имеет** и в simplified — junction без enum-полей,
  паритет тут не нужен.
- E2E требует Serverpod-enum в моделях проекта: отдельный `*.spy.yaml` вида
  `enum: <Name>` + `values:`, затем сущность со ссылкой на него.

## Релевантный контекст

- [032-t115-missing-enum-parse-helper-parity-gap.md](../../bug-reports/032-t115-missing-enum-parse-helper-parity-gap.md) — воспроизведение и числа
- [src/test/generators/enum_parse_helper.test.ts](../../../../src/test/generators/enum_parse_helper.test.ts) — тесты TASK-027: покрывают **только** emit-сторону, дыра именно здесь
- [src/features/generation/generators/relation_generation.ts](../../../../src/features/generation/generators/relation_generation.ts) — emit `tryParseEnum`, менять не нужно

## План тестирования

**Unit:** тест целостности шаблона (хелпер + импорт) — красный до фикса, зелёный после.
Гоняется по обоим шаблонам, чтобы parity-разрыв ловился в любую сторону.

**E2E (DoD-гейт):** `verify --name t213 --human` → **errors=0**, числа в отчёте.
Обязательно на сущности **с enum-полем** — без неё прогон ничего не доказывает.

## Открытый вопрос владельцу (не блокирует старт)

Тест целостности шаблона ловит **отсутствие файла**, но не ловит **поломку генерации** на
enum-поле — в фикстуре t115 (`task`/`tag`/`category`) enum-полей нет, поэтому штатный
`verify` останется слеп к этому классу, как и был. Родня BUG-024/BUG-025.

Варианты: (а) добавить enum-поле в фикстуру t115 — покрывает навсегда, но меняет вывод
**каждого** будущего `create-project`; (б) держать отдельный тест-YAML с enum и гонять его
в E2E задач, которые трогают mapping-слой; (в) оставить как есть — надеяться на unit-тест.
Рекомендация: **(б)**, без blast radius на все проекты.

## Журнал исполнения

- (2026-07-30) задача заведена по итогам BUG-032, найденного при разборе TASK-049 — сделано
- (2026-07-30) красный тест целостности шаблона: 5 падений на t115, 4 прохода на simplified — сделано
- (2026-07-30) фикс-паритет: хелпер + импорт в три entity_extension t115 — сделано
- (2026-07-30) E2E на свежем t213 (Shipment с enum) → verify errors=0 — сделано
- (2026-07-30) контрольная сущность Note без enum → warnings не выросли (0 добавленных) — сделано
- (2026-07-30) STOP-gate: шаблон t115 изменён, **push НЕ делал** — жду слова владельца — BLOCKED (ожидаемо, по контракту)
