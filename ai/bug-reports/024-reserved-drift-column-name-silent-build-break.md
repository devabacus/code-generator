# BUG-024: имя поля = Drift column-builder (`text`/`integer`/…) → self-referential getter → drift_dev падает, build_runner exit 0, stale `.g.dart`

**Статус:** RESOLVED (2026-06-05) — pre-flight guard в `EntityYamlValidator`. См. [Решение](#решение) ниже.
**Обнаружено:** 2026-06-05 (generator re-check sweep, t203 — entity `Memo` с полем `text`)
**Критичность:** High — **silent broken build**: генерация exit 0, `build_runner` exit 0, но `database.g.dart` остаётся stale → каскад из десятков `flutter analyze` errors в downstream-файлах. Ловится **только** на финальном `flutter analyze` (не на parse / validate / build_runner).

## Симптом

Поле с именем, совпадающим с методом Drift `ColumnBuilder`, генерирует self-referential getter. **Живая поверхность коллизии в этом генераторе — 5 типов, которые реально эмитятся** ([code_formatter.ts](../../src/features/generation/parsers/formatters/code_formatter.ts) typeMap): `text`, `integer`, `dateTime`, `boolean`, `real`. Denylist также включает forward-defense имена реальных Drift-builder'ов, которые генератор пока не эмитит (`int64`, `blob`, `customType`, `intEnum`, `textEnum`):

```dart
// memo_table.dart, поле `text: String`:
TextColumn get text => text()();   // text() резолвится в определяемый getter, не в Drift builder
```

`drift_dev` падает при анализе таблицы (`ColumnParser.parse`, column.dart:199 — `Could not analyze ... memo_table`). Но это **Warning** уровня build_runner → `dart run build_runner build` **exit 0**, `database.g.dart` не перегенерируется (остаётся без companions всех таблиц). Downstream: `MemoTableCompanion` / `memoTable` undefined → 92 analyze errors на t203.

## Repro

```bash
# entity YAML с полем `text: String` (или integer/boolean/dateTime/...)
codegen generate-entity --yaml memo.spy.yaml --feature-path .../features/memos --workspace ... --with-server
codegen verify --name <proj>   # serverpod generate + build_runner exit 0, flutter analyze = десятки errors
```

## Root cause

- [code_formatter.ts:155](../../src/features/generation/parsers/formatters/code_formatter.ts) (и FK-path :189) эмитит `${columnClass}Column get ${field.name} => ${columnType}()...` без проверки имени на коллизию с builder-методами.
- [entity_yaml_validator.ts](../../src/features/generation/parsers/entity_yaml_validator.ts) проверяет только 3 required-поля + sync-event — **нет denylist зарезервированных имён** (тот же класс gap, что BUG-018 для Serverpod class names).
- Усугубляется тем, что `build_runner` не пробрасывает non-zero exit при drift_dev error (verify-chain опирается на это: единственный нетто-страховщик = unconditional `flutter analyze`).

## Предлагаемое решение

1. Добавить `RESERVED_DRIFT_COLUMN_NAMES` set в `EntityYamlValidator`, fail pre-flight с понятным сообщением (mirror BUG-018 стиля). FK-поля (`*Id`) безопасны — guard для обычных полей.
2. (опц.) В `verify.ts` повышать severity если `build_runner` напечатал `SEVERE`/drift error в stdout даже при exit 0 — чтобы ловить раньше analyze.

## Связанные

- [BUG-018] reserved Serverpod class names (тот же класс — нет pre-flight guard).
- [BUG-010](010-code-formatter-field-name-includes-map-silent-data-loss.md) `Map` в имени поля → silent data loss (родственный validation gap).

## Решение

Pre-flight guard в [entity_yaml_validator.ts](../../src/features/generation/parsers/entity_yaml_validator.ts):

- `RESERVED_DRIFT_COLUMN_NAMES` set (`text`, `integer`, `int64`, `boolean`, `dateTime`, `real`, `blob`, `customType`, `intEnum`, `textEnum`) — 5 живых + 5 forward-defense.
- `validateReservedFieldNames` вызывается в начале `validate()`, **до** junction early-return (коллизия — на уровне Drift table generation, касается и junction). Новый error code `RESERVED_FIELD_NAME` с actionable сообщением (механизм коллизии + предложение rename).
- `formatErrors`: 6-field hint теперь conditional на `MISSING_FIELD` (не примешивается к чистой reserved-name ошибке).

**Verification (DoD):**
- Unit: **290 passing** (+5 BUG-024: single / multiple / junction / negative `body` / standard-clean). compile clean, lint 0 errors.
- CLI: `generate-entity` с полем `text` → **abort exit 1**, 0 файлов записано, понятное сообщение с rename-подсказкой (вместо silent broken build).
- Regression: `verify t203` (валидный проект) → **errors=0**, w=1, infos=67.
- Review: adversarial APPROVE (denylist покрывает всю живую поверхность; нет false-positives/bypass; junction ordering верный). Nits устранены (`bigInt`-неточность в доке, off-topic 6-field footer).

Scope: только Drift column-builder имена (silent класс). Dart keywords / Serverpod reserved (`Order`, BUG-018) — отдельно.
