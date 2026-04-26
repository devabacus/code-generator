# BUG-006: AppDatabaseGenerator prepend'ит новую migration-ветку — обратный порядок выполнения

**Статус:** Resolved (2026-04-26, ветка `feature/TASK-015-drift-migration-order`)
**Обнаружено:** 2026-04-26 (TASK-015, продакшн-блокер на Android-эмуляторе с `schemaVersion < 12`)
**Источник:** `database.dart` сгенерированный для weight-system проекта — ветки `if (from < N)` идут в обратном порядке (от `< 15` к `< 2`).
**Критичность:** High — поломанные миграции при обновлении приложения с устройств с устаревшей БД, краш на старте.

## Resolution

В `AppDatabaseGenerator.updateMigration()` ([`src/features/generation/generators/app_database_generator.ts`](../../src/features/generation/generators/app_database_generator.ts)) строка 184 заменена с **prepend** на **append**:

**Было (BUG):**
```ts
const replacement = `${migrationMarker}${newMigrationBlock}${existingMigrations}${migrationEndMarker}`;
```

**Стало (фикс):**
```ts
const trimmedExisting = existingMigrations.replace(/\s+$/, '');
const replacement = `${migrationMarker}${trimmedExisting}${newMigrationBlock}\n        ${migrationEndMarker}`;
```

Новый regression-тест: `migration: новые ветки append в КОНЕЦ блока (BUG-006)` в `src/test/generators/app_database_generator.test.ts` — проверяет что после добавления новой фичи к существующей БД с двумя ветками `< 2`, `< 3` ветка `< 4` появляется В КОНЦЕ блока, а не перед `< 2`. Все 62 теста проходят.

## Симптом

В weight-system на устройстве Android-эмулятора с предыдущей сборкой (drift `schemaVersion = 11`) после обновления приложения до `schemaVersion = 15` приложение падает на старте:

```
SqliteException(1): while executing, no such column: terminal_set_id, SQL logic error
  Causing statement: DELETE FROM weighing_table WHERE terminal_set_id IN (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-4000-8000-000000000002'
  )
  at weight_flutter/lib/core/data/datasources/local/database.dart:63
  in onUpgrade callback
```

После этого `getLastSyncTimestamp` падает с тем же исключением — БД не открылась корректно, sync-pipeline нерабочий.

## Корень проблемы

Drift-миграции выполняются **последовательно сверху вниз** в `onUpgrade` callback'е. Каждая ветка `if (from < N)` срабатывает только если устройство ещё не достигло версии N. Старая БД должна последовательно пройти все нужные ветки от своей текущей версии до целевой.

Генератор при добавлении новой ветки `if (from < N+1)` **prepend**'ил её в начало блока:

```ts
// Было: новая ветка ПЕРЕД существующими
const replacement = `${migrationMarker}${newMigrationBlock}${existingMigrations}${migrationEndMarker}`;
```

Это давало такой порядок в `database.dart`:

```dart
onUpgrade: (Migrator m, int from, int to) async {
  // === GENERATED_MIGRATION_START ===
  if (from < 15) { ... }  // последняя добавленная — выполняется первой
  if (from < 14) { ... }
  if (from < 13) { ... }
  if (from < 12) {
      await m.addColumn(weighingTable, weighingTable.terminalSetId);  // создание колонки
  }
  // ...
  // === GENERATED_MIGRATION_END ===
}
```

При `from = 11` сначала срабатывает `if (from < 15)` — она пытается `DELETE FROM weighing_table WHERE terminal_set_id IN (...)` — но колонка `terminal_set_id` ещё не создана (создаётся в `< 12`, ниже по списку) → `SqliteException`.

## Воспроизведение

1. Создать проект: `codegen create-project --name <X>` (initial schemaVersion=1).
2. Добавить фичу A через `generate-entity`: schemaVersion бампается до 2, добавляется ветка `if (from < 2)`.
3. Добавить фичу B через `generate-entity`: schemaVersion=3, новая ветка `if (from < 3)` **prepend**'ится в начало (перед `< 2`).
4. Если добавить какую-то custom миграцию (например `addColumn`) внутри `if (from < 4)` куда-нибудь дальше + позже custom statement в `if (from < 5)` ссылающийся на эту колонку — после следующего bump версия `< 5` окажется ВЫШЕ `< 4` и упадёт.

В weight-system это случилось так: миграция `< 12` добавляла `terminal_set_id` колонку через `addColumn`, потом миграция `< 15` делала `DELETE FROM weighing_table WHERE terminal_set_id IN (...)` для cleanup placeholder UUID. Из-за prepend `< 15` оказалась физически ВЫШЕ `< 12` — при `from = 11` ссылка на ещё несозданную колонку.

## Правильная семантика

Drift migration — **append-only по версиям**. Новые ветки добавляются в КОНЕЦ блока. Это гарантирует что устройство, обновляющееся с любой версии `from`, проходит ветки **в порядке возрастания N** — каждая ветка модифицирует БД, опираясь только на состояние, гарантированное предыдущими ветками.

Документация Drift подтверждает: [drift.simonbinder.eu/migrations/#general-tips](https://drift.simonbinder.eu/migrations/) — "Always run migration steps in order from older to newer versions."

## Затронуто

- [`src/features/generation/generators/app_database_generator.ts`](../../src/features/generation/generators/app_database_generator.ts) — `updateMigration()` строка 184 (prepend → append + trim trailing whitespace).
- [`src/test/generators/app_database_generator.test.ts`](../../src/test/generators/app_database_generator.test.ts) — добавлен тест `migration: новые ветки append в КОНЕЦ блока (BUG-006)`.

## Влияние на проекты с уже сломанным `database.dart`

Существующие проекты, которые уже накопили обратный порядок веток в `database.dart`, **нужно поправить вручную** — перенести ветки в возрастающий порядок (`< 2 → < 3 → ... → < N`). После регенерации новой фичи (после фикса) новая ветка пойдёт в конец, корректно.

В weight-system это сделано в TASK-015: [feature/TASK-015-drift-migration-order](https://github.com/.../weight) — `weight_flutter/lib/core/data/datasources/local/database.dart` переписан, ветки в возрастающем порядке.

## Не входит в фикс

- Изменение существующих миграций в реальных проектах — это runtime/data ответственность каждого проекта, генератор только обеспечивает корректную структуру для **новых** добавлений.
- Понижение `schemaVersion` — миграции append-only.

## Связанные баги

- **BUG-005** (AppDatabaseGenerator scan-based) — общий рефакторинг генератора. BUG-006 — независимый дефект в `updateMigration` помимо BUG-005.

## Приоритет

**High.** Каждый проект, использующий генератор и накопивший 2+ migration-веток, гарантированно сталкивается с этим багом при обновлении приложения с устройств с устаревшей схемой. Симптом — краш на старте, не очевидный для пользователя.
