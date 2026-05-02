# BUG-007: relation_patcher не покрывает usecases generation от template без `:oneToManyMethods` markers

**Статус:** Open (backlog, не TASK-011 scope)
**Обнаружено:** 2026-05-02 (TASK-011 Phase F0 E2E patcher validation)
**Источник:** TASK-011 executor, t115 template post-F0 re-add tasks через `generate-entity`
**Критичность:** Medium (компиляция t115 ломается с 12 errors после re-add, но ТОЛЬКО на template directory; свежие проекты не затронуты)

## Симптом

После `codegen generate-entity --yaml category.spy.yaml --workspace t115` на `t115/t115_flutter/` template (где `category_usecases.dart` существует, но **БЕЗ** `// === generated_start:oneToManyMethods ===` markers) — `relation_patcher` не вставляет `GetTasksByCategoryIdUseCase` use case класс. После re-add 4 tasks (Phase F0) `flutter analyze` показывает 12 errors:

```
error: The function 'GetTasksByCategoryIdUseCase' isn't defined
error: Undefined name 'GetTasksByTagIdUseCase'
... (×12)
```

## Корневая причина

`relation_patcher.ts` ищет marker pair `// === generated_start:oneToManyMethods ===` / `// === generated_end:oneToManyMethods ===` в target файле. Если markers отсутствуют — patcher **silent no-op** (не вставляет код, не выдаёт warning).

В t115 template:
- `category_usecases.dart` (после TASK-001 t115 migration) содержит usecases как hardcoded code БЕЗ markers
- Когда Phase F0 запускает `generate-entity --workspace t115`, patcher ничего не вставляет → `category_repository.dart` (где есть markers и они получили `getTasksByCategoryId(...)` метод) ссылается на несуществующий `GetTasksByCategoryIdUseCase` класс

## Почему это НЕ TASK-011 регрессия

Проблема существовала до TASK-011 — это **pre-existing limitation** `relation_patcher` для **regen на template directory без полного markers coverage**.

В normal flow (codegen-generated проекты типа t143/t150) — `category_usecases.dart` создаётся через template **с markers**, поэтому regen работает. Но если template directory сам не имеет markers (как t115_flutter после ручной TASK-001 миграции) — regen ломается.

TASK-011 Phase F0 — первый случай когда Phase F0 явно тестирует patcher на template directory как E2E validation. Раньше такого use case не было.

## Воспроизведение

```bash
cd G:/Projects/vs_code_extensions/code-generator
node out/adapters/cli/index.js generate-entity \
  --yaml G:/Templates/flutter/t115/t115_server/lib/src/models/tasks/category.spy.yaml \
  --feature-path G:/Templates/flutter/t115/t115_flutter/lib/features/tasks \
  --workspace t115 \
  --projects-path G:/Templates/flutter
```

Затем:
```bash
flutter analyze G:/Templates/flutter/t115/t115_flutter/lib/features/tasks/
```

→ 12 errors про undefined `Get<X>By<Y>IdUseCase` классы.

## Workarounds

1. **Manual fix template** — добавить `// === generated_start:oneToManyMethods ===` / `// === generated_end:oneToManyMethods ===` markers в `category_usecases.dart` / `task_usecases.dart` / `tag_usecases.dart` / `task_tag_map_usecases.dart` template файлы, обернуть существующие use case классы. После этого regen будет работать.

2. **Skip Phase F0 на t115** — fresh `create-project --name t<N+1>` test'ы не имеют этой проблемы (markers создаются при initial generation, не отсутствуют).

3. **Patcher warning при отсутствии markers** — `relation_patcher` мог бы выдавать `console.warn(...)` при detected relations но missing marker pair → developer бы понимал что patcher silent no-op'ит.

## Acceptance criterion adjustment для TASK-011

User decision 2026-05-02 (вариант A): **accept как pre-existing baseline issue**, F1 ("DoD t115 regression PASS errors=0") modify → "PASS errors=0 на свежем t<N+1> проекте; t115 после F0 documented relation_patcher gap (BUG-007)".

Reviewer проверит что 12 errors действительно про `Get<X>By<Y>IdUseCase` (relation_patcher gap), не TASK-011 артефакт.

## Resolution priority

**Low** — не блокирует TASK-012 / weight TASK-018. Trigger для priority bump:
- Если developer в weight TASK-018 столкнётся с manual usecases без markers
- Если TASK-013 (robust junction detection) обнаружит related issue в usecases generation

**Possible scope для resolution:**
1. Audit всех template `*_usecases.dart` файлов на наличие `:oneToManyMethods` markers
2. `relation_patcher.ts` — добавить warning при relations есть в model + markers absent в target
3. Или generic `marker_inserter.ts` — auto-insert markers вокруг heuristically-detected use case classes (рискованно, можно сломать custom code)

## Связанные документы

- [TASK-011 task.md](../tasks/active/TASK-011-sync-core-0-3-0-templates-integration/task.md) — TASK где обнаружено
- [TASK-011 report.md](../tasks/active/TASK-011-sync-core-0-3-0-templates-integration/report.md) — § Phase F0 evidence
- [BUG-003](003-new-relation-not-patched-in-existing-feature.md) — closed, related (relation_patcher idempotency)
