# Отчёт TASK-034 — BUG-027 fix (one-to-many back-relation leak)

## Резюме

Закрыт BUG-027: collection back-relation (`<x>: List<Y>?, relation`) на parent-entity протекал в flutter freezed entity/model без импорта типа → `json_serializable InvalidType` → build_runner FAIL; параллельно эмитилась silent-wrong drift-колонка `TextColumn get <x> => text()`.

**Первичный root-cause в bug-report оказался неверным** (предполагал `relationType='oneToMany'`). Эмпирическая проверка на t205: парсер ставит `isRelation=false` на bare `relation` (regex `/\brelation\s*\(/` требует скобок) → `relationType=undefined` → существующие `relationType==='oneToMany'` проверки бесполезны. Реальный дискриминатор — **тип `List<...>`**.

## Изменения

- [src/features/generation/parsers/formatters/code_formatter.ts](../../../../src/features/generation/parsers/formatters/code_formatter.ts):
  - `fieldsFilter()` — добавлено `!field.type.startsWith('List<')` (исключает collection-поля из entity/model/mappings/value-wrapped/insert-companion/serverpod↔model emit — все идут через этот фильтр).
  - `shouldSkipServerpodField()` — добавлено `if (field.type.startsWith('List<')) return true` (исключает collection-поля из drift column emit; чистит silent-wrong drift-колонки junction back-relations).
- [src/test/generators/code_formatter_fields_filter.test.ts](../../../../src/test/generators/code_formatter_fields_filter.test.ts) — новый, 6 тестов через **реальный парсер**.
- [ai/bug-reports/027-...md](../../../bug-reports/027-one-to-many-back-relation-regular-entity-leaks-into-flutter-entity.md) — исправлен root cause + RESOLVED.

## Тесты

- Добавлено тестов: 6 (через `ServerpodYamlParser.parse` — намеренно не ручные фикстуры, чтобы не повторить ошибку первичного анализа). Покрытие: `isRelation=false` на bare relation (закрепляет root cause), strip regular one-to-many + junction back-relation в entity, отсутствие в freezed-конструкторе, отсутствие drift-колонки (regular + junction), survival many-to-one FK.
- Все проходят: **Да** — 299 passing (293 baseline + 6), 0 failing.
- Как запустить:
  ```bash
  npm run compile
  node node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"
  ```

## Definition of Done

- **verify t205 PASS errors=0**, warnings=1 (`unused_local_variable` в `developer_tools_page.dart` — pre-existing baseline template-файл, не связан с фиксом), infos=44.
- Сценарий: `create-project t205` + `generate-entity` Project (с `projectTasks: List<ProjectTask>?, relation`) + ProjectTask, оба `--with-server`. До фикса — build_runner FAIL (InvalidType). После — errors=0.
- Leak подтверждён отсутствующим в `project_entity.dart` (только `name` в freezedConstructor) и `project_table.dart` (только колонка `name`). Server YAML поле сохраняет.
- lint: 0 errors, 18 pre-existing warnings.

## Multi-agent review

Standard + Adversarial (parallel) → оба **APPROVE**, deal-breaker не найден. Подтверждено: `List<scalar>` DTO (user_session_data/role_details/super_admin_dashboard) — все `manifest: startProject`, copied verbatim, entity-gen фильтры их не достигают → регрессии нет; junction не регрессирует (удалённая drift-колонка была на parent, уже была silent-wrong/unused); все live emit-пути покрыты; server-side эмпирически ок.

## Риски / Заметки (non-blocking follow-ups — НЕ входят в этот TASK)

1. `List<scalar>` на synced-entity теперь молча стрипается (вместо silent-wrong раньше). Loud pre-flight reject в `EntityYamlValidator` (как BUG-024) был бы честнее. Inert сегодня — такой сущности нет.
2. `!field.name.includes('Map')` (+ `'Map'` в `staticFields`) стали избыточны после type-check; latent false-positive для `mapUrl`/`bitmapData`. Отдельный test-backed cleanup.
3. Dead `formatClassFields`/`FREEZED_FIELDS` path (нет маркера в t115) — unfiltered footgun на будущее.

## Статус

Ready for review. Коммит/PR — по явному указанию User.
