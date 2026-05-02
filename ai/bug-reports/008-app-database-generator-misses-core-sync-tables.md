# BUG-008: AppDatabaseGenerator scan игнорирует tables вне `features/*/data/datasources/local/tables/`

**Статус:** Open (in progress, fixed в TASK-011 Phase D5)
**Обнаружено:** 2026-05-02 (TASK-011 Phase F2/F3 verify FAIL errors=170 на t151)
**Источник:** TASK-011 executor, sync_core 0.3.0 integration
**Критичность:** High (фундаментальный блокер create-project — генерирует broken database.dart без sync_core tables)

## Симптом

`codegen create-project --name t<N>` создаёт `t<N>_flutter/lib/core/data/datasources/local/database.dart` **без** жёстко прописанных в template (вне markers):
- `import '../../../../core/sync/sync_queue_table.dart';`
- `SyncQueueTable` в `@DriftDatabase(tables: [...])`

В результате `flutter analyze` валится каскадом 170+ errors про unresolved `SyncQueueTable` references из `drift_sync_queue_store.dart` и других sync infra файлов.

## Корневая причина

`AppDatabaseGenerator` (`src/features/generation/generators/app_database_generator.ts`) после BUG-005 fix (2026-04-26) **scan-based** — на каждом вызове сканирует:
```
<flutterLib>/features/*/data/datasources/local/tables/*_table.dart
```
и пересобирает `database.dart` (imports + tables list) с нуля.

Hardcoded assumption: **единственный источник Drift tables — `features/*/tables/`**. Это было верно когда писалось (sync_core ещё не было), но не documented как hard contract в коде.

После t115/TASK-001 (sync_core 0.3.0 migration) template добавил `lib/core/sync/sync_queue_table.dart` — путь **вне** scan whitelist'а. Scan его игнорирует → не попадает в `imports`/`tables` collection → AppDatabaseGenerator перезаписывает `database.dart` без SyncQueueTable refs (при этом fixed Configuration/SyncMetadata строки тоже могут быть стёрты по тому же механизму, если они были вне markers).

## Почему до sync_core работало

До sync_core integration все Drift tables были внутри `features/`:
- `features/configuration/data/datasources/local/tables/configuration_table.dart`
- `features/tasks/data/datasources/local/tables/{category,task,tag,task_tag_map}_table.dart`

Scan находил всё, ничего не терялось. Configuration / SyncMetadata fixed-line imports в template `database.dart` тоже были **внутри scan paths** (через `features/configuration/`).

`sync_queue_table.dart` — первый случай когда Drift table легитимно находится **вне** `features/` (в shared `core/sync/` infrastructure).

## Воспроизведение

```bash
cd G:/Projects/vs_code_extensions/code-generator
node out/adapters/cli/index.js create-project --name t152 --human
node out/adapters/cli/index.js verify --name t152 --human
# → flutterAnalyze errors=170+, все каскадируют от unresolved SyncQueueTable
```

## Fix (TASK-011 Phase D5)

Расширить scan paths в `AppDatabaseGenerator`:

**Вариант A (минимальный):** добавить hardcoded дополнительный путь:
```typescript
const SYNC_INFRA_TABLES = ['lib/core/sync/sync_queue_table.dart', 'lib/core/sync/sync_metadata_table.dart'];
const featureTables = scanGlob(`${flutterLib}/features/*/data/datasources/local/tables/*_table.dart`);
const syncInfraTables = SYNC_INFRA_TABLES
  .map(p => path.join(flutterLib, p))
  .filter(p => fs.existsSync(p));
const allTables = [...featureTables, ...syncInfraTables];
```

**Вариант B (generic):** второй scan glob:
```typescript
const featureTables = scanGlob(`${flutterLib}/features/*/data/datasources/local/tables/*_table.dart`);
const coreTables = scanGlob(`${flutterLib}/core/**/*_table.dart`);
const allTables = [...featureTables, ...coreTables];
```

**Рекомендую Вариант B** — generic, покроет любые будущие core-уровневые tables (не только sync). Plus защищает от той же ловушки если developer добавит `core/auth/session_table.dart` или подобное.

## Tests

В `src/test/generators/app_database_generator.test.ts` добавить regression:

1. MockFileSystem с table в `features/category/data/datasources/local/tables/category_table.dart` + table в `core/sync/sync_queue_table.dart`
2. Generator → `database.dart` имеет **оба** imports + **оба** в `@DriftDatabase(tables:[...])`
3. Regression: повторный run → idempotent

## Acceptance criterion для TASK-011

После Phase D5 fix:
- `npm test` PASS (62 baseline + 18 new + 1+ regression = 81+)
- `create-project --name t152` + `verify --name t152` → errors=0 (бывшие 170 errors → 0)

## Lesson learned

**Add в `ai/docs/agent_memory.md`:** scan paths hardcoded на `features/*/data/datasources/local/tables/`. Любой `*_table.dart` ВНЕ этой папки невидим для AppDatabaseGenerator. Если template добавляет fixed-line table import вне markers — расширь scan paths или используй markers.

## Связанные документы

- [TASK-011 task.md](../tasks/active/TASK-011-sync-core-0-3-0-templates-integration/task.md) — Phase D5 fix
- [BUG-005](005-app-database-generator-incremental-only.md) — closed, related (scan-based introduced)
- [t115/TASK-001 report](../../../../../Templates/flutter/t115/ai/tasks/done/TASK-001-migrate-t115-sync-layer-to-sync-core-0-3-0--multi-entity-validation-gate/report.md) — где `core/sync/sync_queue_table.dart` был добавлен
