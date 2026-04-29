# BUG-005: AppDatabaseGenerator работает только инкрементально — пустые секции при «холодном» запуске

**Статус:** Resolved (2026-04-26, ветка `feature--fix-codegen-regen-bugs`)
**Обнаружено:** 2026-04-26 (TASK-008/009 follow-up, t140 verify run)
**Источник:** `codegen verify --name t140` — 347 errors; повторно проявился на свежем `create-project --name t141` — 327 errors
**Критичность:** High — на свежем проекте остаётся неподключённой фича → drift не сгенерит `*TableData`/`*Companion` → весь `dart analyze` красный

## Resolution

`AppDatabaseGenerator.generate()` переписан на **scan-based** вместо инкрементального дополнения existing-секций. Теперь сканирует `<flutterLib>/features/*/data/datasources/local/tables/*_table.dart` (исключая `.g.dart`, `.freezed.dart`, не-`*_table.dart`) и собирает imports/tables-list **с нуля** на каждом вызове. Migration остаётся append-only, schemaVersion не понижается.

Фикс убрал зависимость от порядка вызовов `generate-entity` / `AppDatabaseGenerator.generate()`. Раньше можно было получить пустые секции если последний вызов был с config'ом без entity (например финальный шаг в `create-project`); теперь scan находит все живые таблицы независимо от config.

**Тесты** (5 в [`src/test/generators/app_database_generator.test.ts`](../../src/test/generators/app_database_generator.test.ts)):
1. `cold start: scan-based — подключает все таблицы из всех фич сразу` — corner case BUG-005.
2. `drops imports + tables + migration lines for DELETED features` — фича удалена → исчезает из database.dart.
3. `rejects camelCase legacy imports` — BUG-002 cleanup сохраняется.
4. `idempotent: повторный gen на одном состоянии даёт identical content`.
5. `игнорирует .g.dart, .freezed.dart, и файлы не *_table.dart` — фильтр scan'а.

## Симптом

После `create-project` + регенерации одной фичи (например `generate-entity --yaml gadget.spy.yaml`) секции `// === GENERATED_IMPORTS_START ===` и `// === GENERATED_TABLES_START ===` в `<name>_flutter/lib/core/data/datasources/local/database.dart` могут оказаться **пустыми** — даже если на диске есть валидно сгенерированные `features/*/data/datasources/local/tables/*_table.dart` файлы.

Drift codegen не находит `CategoryTable`/`TaskTable`/`CorrectionButtonTable` в `@DriftDatabase(tables: [...])` → `database.g.dart` НЕ содержит `*TableData`/`*TableCompanion` классов → DAO ссылающиеся на эти типы выдают:

```
error - The name 'CorrectionButtonTableData' isn't a type, so it can't be used as a type argument
error - The getter 'isDeleted' isn't defined for the type 'HasResultSet'
error - The getter 'userId' isn't defined for the type 'HasResultSet'
error - Undefined class 'CorrectionButtonTableCompanion'
...
```

Реальный прогон на t140 — **347 errors** в `flutter analyze` именно по этой причине.

## Воспроизведение

1. `codegen create-project --name <X>` (с авто-генерацией tasks-фичи).
2. Промежуточный шаг, при котором AppDatabaseGenerator вызывается с конфигом фичи, файлы которой временно не существуют (или существовали ранее, но были удалены) — секции `:GENERATED_IMPORTS:`/`:GENERATED_TABLES:` обрезаются stale-cleanup'ом BUG-002 fix.
3. Любой следующий вызов `generate-entity` подключит **только текущую фичу** — остальные таблицы остаются вне `@DriftDatabase`.
4. `serverpod generate` ✓, `dart run build_runner build` ✓ (drift отрабатывает на текущем составе), `flutter analyze` → сотни ошибок.

## Корень проблемы

Текущая реализация [`AppDatabaseGenerator.generate()`](../../src/features/generation/generators/app_database_generator.ts) работает **инкрементально**:

```ts
let featureTableFiles = (await fs.readDirectory(featureTablesDir)).filter(...);  // только current feature
const newFeatureImports = featureTableFiles.map(...);                            // только current feature
const allImports = new Set([...filteredExisting, ...newFeatureImports]);          // existing + current
```

Где `filteredExisting` — это уже бывшие в `database.dart` импорты, прошедшие `isImportLive` фильтр (BUG-002 fix против stale-импортов от удалённых фич).

**Уязвимое место:** если в момент вызова `database.dart` уже был очищен (или ещё не наполнен), `filteredExisting` пуст, и в результирующих секциях окажется только `current feature`. Все остальные фичи, физически существующие на диске, **не подключаются** — генератор о них не знает.

## Workaround (применён сейчас)

Прогнать `generate-entity` **на каждой существующей фиче** последовательно — каждый запуск добавит свою таблицу + сохранит уже подключённые. После 5 прогонов (4 tasks + correction_button) `database.dart` восстановился, verify PASS, errors=0.

Это рабочий обходной путь, но требует ручного знания "какие фичи есть в проекте" и порядка прогонов.

## Правильное решение

`AppDatabaseGenerator` должен **сканировать все feature-директории** проекта и собирать список таблиц с нуля, а не полагаться на инкрементальные правки existing-секций.

Псевдокод:

```ts
// Вместо: featureTablesDir = config.featureTablesPath  (одна фича)
// Сделать: scan(targetFlutterLibPath/features/*/data/datasources/local/tables/*_table.dart)

const allFeaturesDir = path.join(config.targetFlutterLibPath, 'features');
const featureDirs = await fs.readDirectory(allFeaturesDir);  // [tasks, correction_button, gadget, ...]

const allTableFiles: { feature: string; file: string }[] = [];
for (const featureDir of featureDirs) {
    const tablesDir = path.join(allFeaturesDir, featureDir, 'data/datasources/local/tables');
    if (!await fs.exists(tablesDir)) continue;
    const files = (await fs.readDirectory(tablesDir)).filter(f => f.endsWith('_table.dart') && !f.endsWith('.g.dart'));
    for (const file of files) {
        allTableFiles.push({ feature: featureDir, file });
    }
}

// Дальше — собрать imports/tables/migration из allTableFiles
// existingImports фильтр становится не нужен для общего случая —
// сканирование filesystem уже даёт truth. existingImports нужен ТОЛЬКО для миграций
// (schemaVersion бамп, append-only).
```

Дополнительно:
- `migration` блок остаётся **append-only** (BUG-002 fix уже корректен): сравнивать новые `tableClasses` с уже добавленными в migration, добавлять только новые в `if (from < N+1) {}`.
- `schemaVersion` инкрементировать только если есть actually new tables (по diff с migration).

## Затронуто

- [`src/features/generation/generators/app_database_generator.ts`](../../src/features/generation/generators/app_database_generator.ts) — переписать на полное сканирование `features/`.
- Тесты: новые сценарии в [`src/test/generators/app_database_generator.test.ts`](../../src/test/generators/app_database_generator.test.ts):
  - cold start: пустой `database.dart` + 3 features на диске → подключаются все 3.
  - стабильность: повторный вызов после удаления одной фичи (физически: rm -rf features/X) → её table уходит из `@DriftDatabase`, но schemaVersion не понижается, migration не теряется.
  - идемпотентность: 2 последовательных прогона на одинаковом состоянии → identical content.

## Не входит в фикс

- Cleanup миграций (понижение schemaVersion) — миграции `append-only`, никогда не удаляются.
- Per-entity скрытые таблицы (если у фичи несколько `*_table.dart` файлов — например для junction внутри feature) — текущее scan-логика их подхватит автоматически.

## Workaround для агентов до фикса

Если после `create-project` или после правок в `core/data/.../database.dart` секции `:GENERATED_IMPORTS:`/`:GENERATED_TABLES:` оказались пустыми или неполными:

```bash
# Прогнать generate-entity на каждой фиче
for entity in tasks/category tasks/tag tasks/task tasks/task_tag_map; do
  feature=$(echo "$entity" | sed 's|/.*||')
  codegen generate-entity \
    --yaml <project_root>/<server>/lib/src/models/${entity}.spy.yaml \
    --feature-path <project_root>/<flutter>/lib/features/${feature} \
    --workspace <project_root>
done

# Затем codegen verify --name <project>
```

## Связанные изменения

- BUG-002 fix (`isImportLive` filter) — необходим, но недостаточен. Он защищает от stale-импортов на удалённые фичи, но не гарантирует что все живые фичи подключены.
- TASK-008 (`relation_patcher`), TASK-009 (`entity_yaml_validator`) — не связаны.

## Приоритет

**High.** На свежем проекте после `create-project` пользователь не должен прогонять `generate-entity` руками 5-10 раз чтобы `database.dart` стал валидным. Это первое впечатление от инструмента.
