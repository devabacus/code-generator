# BUG-009: orchestrator_patcher вставляет imports с `templ-feature` вместо `feature-path`

**Статус:** ✅ Resolved (TASK-013 D6 round 2 fix, closed 2026-05-02, commit a299f52)
**Evidence закрытия:** `_substitutePlaceholders` добавил feature segment substitution (`tplFeatureSnake` / `targetFeatureSnake`); 2 регрессионных теста (BUG-009 feature segment substitution для non-tasks feature + junction entity также получает правильный feature segment) — passing. TASK-014 E2E на t157: ProjectMember generate-entity → orchestrator imports `features/projects/data/adapters/project_member/...` (НЕ `features/tasks/...`).
**Обнаружено:** 2026-05-02 (TASK-011 Phase F4 E2E проверка на t152)
**Источник:** TASK-011 executor, generate-entity ad-hoc test
**Критичность:** High (любой generate-entity --feature-path != tasks ломает orchestrator → каскад errors)

## Симптом

`codegen generate-entity --yaml expense.spy.yaml --feature-path <flutter>/lib/features/expense --workspace t152`

Файлы создаются по правильному пути `t152_flutter/lib/features/expense/...`, НО `sync_orchestrator_provider.dart` patched с imports вида:

```dart
import '../../features/tasks/data/adapters/expense/expense_event_adapter.dart';
import '../../features/tasks/data/adapters/expense/expense_local_apply.dart';
// ... ещё 5 imports того же вида ...
```

Все 7 imports указывают на несуществующие пути → 7 `uri_does_not_exist` errors → каскад 8 `undefined_function` / `non_type_as_type_argument` (на ExpenseRemoteAdapter, ExpensePayloadCodec и т.д.). Итого 15 errors на чистом fresh project + 1 generate-entity.

## Воспроизведение

```bash
node out/adapters/cli/index.js create-project --name t152 --human
# создай минимальный expense.spy.yaml + expense_sync_event.spy.yaml в t152_server
node out/adapters/cli/index.js generate-entity \
  --yaml G:/Projects/Flutter/serverpod/t152/t152_server/lib/src/models/expense/expense.spy.yaml \
  --feature-path G:/Projects/Flutter/serverpod/t152/t152_flutter/lib/features/expense \
  --workspace G:/Projects/Flutter/serverpod/t152 \
  --human
node out/adapters/cli/index.js verify --name t152 --human
# → flutterAnalyze errors=15 (7 uri_does_not_exist + 8 cascade)
```

## Корневая причина (предположение)

`orchestrator_patcher` (`src/features/generation/generators/orchestrator_patcher.ts`) при сборке import path использует `--templ-feature` (default `tasks`) вместо feature name из `--feature-path`. Скорее всего hardcoded substitution от template's `tasks` placeholder, который не resolved'ится правильно для нового feature.

## Lesson

Patcher должен использовать basename (`path.basename(featurePath)` → `'expense'`) для построения relative import path, а не `templ-feature` (тот для replacement dictionary, не для path resolution).

## Acceptance criterion (для отдельной задачи)

После fix:
- `verify --name <project>` после `generate-entity --feature-path <X>/features/expense` → errors=0
- В orchestrator imports используют тот же feature name что в `--feature-path`

## Связанные документы

- TASK-011 report.md — Phase F4 E2E demonstration, где bug всплыл
- BUG-007 (relation_patcher) — соседний gap в patcher infrastructure
