# BUG-027: one-to-many back-relation на regular entity протекает в flutter entity (unstripped + unimported) → drift/json_serializable InvalidType

**Статус:** RESOLVED (2026-06-05, TASK-034, master pending commit)
**Обнаружено:** 2026-06-05 (full pipeline t204 — Project с `projectTasks: List<ProjectTask>?, relation`)
**Критичность:** Medium — **build_runner FAIL (loud)**, не silent. Но останавливает генерацию валидной по Serverpod-меркам схемы (one-to-many back-relation — стандартный Serverpod паттерн).

> ⚠ **Первичный root-cause анализ (ниже, раздел «Root cause CONFIRMED — adversarial review») оказался НЕВЕРНЫМ.** Он предполагал, что у поля выставлен `relationType='oneToMany'`. Эмпирическая проверка на t205 (TASK-034) показала иное — см. раздел **«Фактический root cause (TASK-034)»** и **«Решение»** ниже. Раздел оставлен как трасса диагностики (правило записи: не удалять тупиковые ветки).

## Симптом

Parent entity с back-relation на **regular** (не-junction) entity:

```yaml
# project.spy.yaml
fields:
  ...
  projectTasks: List<ProjectTask>?, relation
```

→ генерируется `project_entity.dart`:

```dart
// project_entity.dart:19
List<ProjectTask>? projectTasks,   // ← тип ProjectTask, НО импорта нет
```

`ProjectTask` не импортирован → `InvalidTypeImpl` → `json_serializable` падает:

```
E json_serializable on lib/features/projects/data/models/project/project_model.dart:
  UnimplementedError: (InvalidTypeImpl) InvalidType
  #0  typeToCode (package:json_serializable/src/utils.dart:226)
```

build_runner FAIL (в отличие от BUG-024 — здесь loud, exit non-zero).

## Root cause (CONFIRMED — adversarial review 2026-06-05)

Точный источник — **`code_formatter.ts:76-82 fieldsFilter()`**:

```ts
fieldsFilter(fields: ServerpodField[]): ServerpodField[] {
    const exactExcludes = ['isDeleted','id','userId','lastModified','syncStatus','createdAt','customerId'];
    return fields.filter(field =>
        !exactExcludes.includes(field.name) &&
        !field.name.includes('Map') && !field.scope?.includes('serverOnly'));
}
```

Фильтр исключает back-relation по **name-эвристике `!field.name.includes('Map')`**, а НЕ по `relationType`:
- Junction back-relation `authorBookMaps` дропается **случайно** — имя содержит подстроку `Map` (генератор НЕ понимает что это back-relation).
- Regular one-to-many `projectTasks` (`relationType='oneToMany'`, нет `Map`, нет serverOnly) → **проходит фильтр** → эмитится `List<ProjectTask>? projectTasks` в freezed entity/model.

**«Нет импорта»:** `relation_generation.ts:9-12 generateDriftTableImports` импортирует только `relationType==='manyToOne'` → для `oneToMany` импорт не эмитится нигде → leaked field → unimported → `InvalidType`.

**Это явная внутренняя асимметрия, не дизайн:** генератор УЖЕ умеет скипать oneToMany — `shouldSkipServerpodField()` (`code_formatter.ts:171-181`) возвращает `true` для `relationType==='oneToMany'`, поэтому **drift table** колонку корректно опускает. Freezed/entity путь (`fieldsFilter`) просто забыл ту же проверку. Drift-слой прав, entity/model-слой — нет.

⚠ Бонус-риск `includes('Map')`: false-positive для легитимных полей с `Map` в имени (`mapUrl`, `bitmapData`) — они тоже молча дропнутся.

`fieldsFilter` питает все flutter entity/model emitters: `formatRequiredTypeFields` (FREEZED_CONSTRUCTOR), `formatSimpleFields`, `formatValueWrappedFields`, `formatInsertCompanionParams`, `generateServerpodToModelParams`/`generateEntityToServerpodParams` (relation_generation.ts).

## Repro (t204)

1. `Project` (parent) + поле `projectTasks: List<ProjectTask>?, relation`.
2. `ProjectTask` (child) + `projectId: relation(parent=project)`.
3. `generate-entity` обоих → SUCCESS, но `verify` → build_runner FAIL (InvalidType в project_model/project_entity).
4. **Workaround/correct modeling:** убрать `projectTasks` back-relation с parent (child FK `projectId` достаточно — паттерн t115 `task`→`category`: parent без flutter back-relation). После удаления → `verify errors=0`.

## Фактический root cause (TASK-034, эмпирически на t205)

Первичный анализ ошибся, потому что строил вывод на ручной фикстуре с `relationType='oneToMany'`. Реальный парсер так поле НЕ размечает.

`projectTasks: List<ProjectTask>?, relation` — ключевой нюанс: **`relation` записан БЕЗ скобок**. `server_yaml_parser.ts:125` определяет relation через `isRelation = /\brelation\s*\(/.test(...)` — regex **требует `relation(`**. Для bare `relation`:

- `isRelation = false`
- `relationType = undefined` (выставляется только внутри `if (isRelation)`)
- `relatedModel = undefined`

Поэтому проверки `relationType === 'oneToMany'` в `fieldsFilter` И в `shouldSkipServerpodField` поле **не ловят**. Дискриминатор должен быть по **типу `List<...>`**, а не по `relationType`.

**Протекает в ОБА слоя (не только entity, вопреки первичному анализу):**

- flutter entity/model (`fieldsFilter`) → `List<ProjectTask>? projectTasks` без импорта → `InvalidType` → build FAIL (loud).
- drift-таблица (`shouldSkipServerpodField`) → `TextColumn get projectTasks => text().nullable()()` — silent-wrong (компилируется как text-колонка). Именно поэтому junction back-relation `authorBookMaps` в t204 «проходил» verify: его drift-колонка тоже текла, но silent-compiles, а entity-leak стрипался случайно через `!name.includes('Map')`.

## Решение (RESOLVED — TASK-034, 2026-06-05)

Type-based дискриминатор `field.type.startsWith('List<')` в **двух** точках [code_formatter.ts](../../src/features/generation/parsers/formatters/code_formatter.ts):

1. `fieldsFilter()` — `+ !field.type.startsWith('List<')` (entity/model/mappings/value-wrapped/insert-companion/serverpod↔model params — все идут через этот фильтр).
2. `shouldSkipServerpodField()` — `+ if (field.type.startsWith('List<')) return true` (drift column emit). Заодно убирает silent-wrong drift-колонки junction back-relations.

**Тесты:** `src/test/generators/code_formatter_fields_filter.test.ts` (6 тестов через **реальный парсер** — намеренно не ручные фикстуры, чтобы не повторить ошибку первичного анализа): закрепляет `isRelation=false` на bare relation, strip regular + junction back-relation в entity и drift, survival many-to-one FK.

**Верификация (DoD):** t205 (create-project + Project с back-relation + ProjectTask, `--with-server`) → **verify PASS errors=0**, warnings=1 (`unused_local_variable` в `developer_tools_page.dart` — pre-existing baseline template, не связан), infos=44. Leak отсутствует в `project_entity.dart` + `project_table.dart`. 299 unit tests passing (293+6), lint 0 errors. Standard + Adversarial review → APPROVE (deal-breaker не найден; `List<scalar>` DTO — все `manifest: startProject`, verbatim copy, entity-gen фильтры их не достигают).

**Non-blocking follow-ups (оба ревьюера, не входят в TASK-034):**

1. Pre-flight reject/warn для `List<scalar>` на synced-entity (вариант 2 ниже) — сейчас такое поле молча стрипается; loud-fail был бы честнее. Inert (такой сущности нет ни в шаблоне, ни в тестах).
2. `!field.name.includes('Map')` (+ `'Map'` в `staticFields` `shouldSkipServerpodField`) стали избыточны после type-check; несут latent false-positive риск для scalar-полей `mapUrl`/`bitmapData`/`heatMapId`. Отдельный test-backed cleanup.
3. Dead `formatClassFields`/`FREEZED_FIELDS` path (нет маркера в t115) — unfiltered, latent footgun если будущий шаблон его подключит.

## Предлагаемое решение (на выбор генератор-тимлида) — историческое, до TASK-034

1. **Стрипать regular one-to-many back-relations** из flutter entity/model так же, как junction back-relations (back-relation = server-side concern, не flutter data). Унифицировать strip-логику на все `List<X>, relation` поля, не только junction-таргеты.
2. **Pre-flight reject/warn** (как BUG-024): если parent имеет `List<RegularEntity>, relation` back-relation → понятное сообщение «one-to-many back-relation не поддерживается на flutter side, убери поле / используй child FK».

Вариант 1 предпочтительнее (back-relation на junction уже стрипается — сделать симметрично).

## Что НЕ относится

- Child FK many-to-one (`projectId: relation(parent=project)` + `project: Project?, scope=serverOnly`) — **работает** (t204 verify errors=0 после удаления back-relation). relation_patcher корректно патчит parent.
- Junction back-relation (`authorBookMaps: List<AuthorBookMap>`) — **работает** (стрипается).

## Связанные

- [BUG-024](024-reserved-drift-column-name-silent-build-break.md) — родственный класс «validation gap / unsupported pattern не пойман pre-flight».
- [BUG-013](013-template-markers-gap-repository-impl-usecases.md) — relation layer coverage (closed).
