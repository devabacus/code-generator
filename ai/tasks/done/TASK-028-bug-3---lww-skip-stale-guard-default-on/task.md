# TASK-028: Bug 3 — LWW skip-stale guard default ON, opt-out для junction

> Часть пакета 5 фиксов из TASK-019 weight ревью (Сессия 2). Порядок: 4→1→2 → **этот четвёртый** → 5.
> Tracking origin: [weight TASK-021 handoff](../../../../../Flutter/serverpod/weight/ai/tasks/active/TASK-021-generator-root-followup/task.md) → Bug 3 / A1 / C1.
> Stack-lock invariant (Discussion #11) applies.
> **⚠ Самый critical fix из 5** — без него любой реген operational/reference сущности → silent data corruption на cross-device pull (server stale overwrites local fresh). Plan adversarial review **3 reviewers** (User decision Q5).

## Ветка

`feature/TASK-028-bug-3-lww-guard-default-on`

## Цель

В сгенерированный `*_local_apply.dart` для **всех reference + operational сущностей** (default ON) добавить LWW skip-stale guard на `SyncPullApplyContext`. Junction (M2M) — **opt-out через [JunctionDetector.isJunctionEntity()](../../../../src/features/generation/parsers/junction_detector.ts)**, для них guard НЕ генерируется (там conflict resolution не применим, UPSERT/DELETE only по PK pair).

**Guard pattern** (referencing [weight weighing_local_apply.dart](../../../../../Flutter/serverpod/weight/weight_flutter/lib/features/weighing/data/adapters/weighing/weighing_local_apply.dart)):

```dart
if (ctx is SyncPullApplyContext) {
  final localRow = await _dao.get<X>ById(
    serverEntity.id,
    userId: userId,
    customerId: customerId,
  );
  if (localRow != null &&
      localRow.syncStatus == SyncStatus.local &&
      localRow.lastModified.isAfter(ctx.sourceTimestamp)) {
    return; // skip stale server data — local has unsynced fresher edit (LWW)
  }
}
// SyncEchoContext — apply always (own write echo): server-assigned id/timestamps
// canonicalized в local DB.
```

**Корень бага:** sync_core orchestrator pull применяет server-changes **безусловным UPSERT** ([sync_orchestrator.dart:803-817](../../../../../Flutter/Packages/sync_core/lib/src/sync_orchestrator.dart)); LWW делегирован LocalApply через `SyncPullApplyContext.sourceTimestamp`. Vanilla-реген LocalApply'а игнорил это → терял C1 (double-weighing: устаревший tara-event с сервера затирал свежий брутто локально). В weight ручной guard добавлен **во всех 13 сущностях после миграции на sync_core** (помечен `// ⚠ CUSTOM (TASK-019, A1)`). **При каждом регене теряется → бесконечная боль.**

User decision (Q3): default ВКЛ, opt-out для junction. Это совпадает с реальностью weight (13/13 reference + operational), differs только для junction'ов.

## Не-цели

- НЕ менять sync_core (frozen 0.3.0).
- НЕ trogать junction (`task_tag_map_local_apply.dart` / любой `*_local_apply.dart` с `manifest: manyToMany`) — guard НЕ генерируется.
- НЕ trogать t115 шаблон (frozen).
- НЕ делать opt-in через YAML field `operationalEntity: true` — User отверг этот подход в Q3 (та же ручная работа).
- НЕ добавлять conflict UI / merge prompts / etc. — это LWW (last-writer-wins by timestamp), не interactive resolution.
- НЕ менять `applyServerEcho` signature.

## Scope

**Разрешено редактировать:**

- `G:/Templates/flutter/simplified/simplified_flutter/lib/features/tasks/data/adapters/category/category_local_apply.dart`
- `G:/Templates/flutter/simplified/simplified_flutter/lib/features/tasks/data/adapters/task/task_local_apply.dart`
- `G:/Templates/flutter/simplified/simplified_flutter/lib/features/tasks/data/adapters/tag/tag_local_apply.dart`
- (НЕ trogать `task_tag_map_local_apply.dart` — junction)
- `G:/Templates/flutter/simplified/simplified_flutter/lib/features/configuration/data/adapters/configuration/configuration_local_apply.dart` (если applicable — Configuration baseline нужно проверить)
- `src/test/generators/` — golden test (3 кейса: non-junction with guard, junction without guard, default OFF не возникает)
- `src/features/generation/` — если требуется wire-in JunctionDetector в section-replacer / generation_service (зависит от подхода — см. шаги)

**Запрещено:**

- `task_tag_map_local_apply.dart` или любой `manifest: manyToMany` шаблон
- t115 шаблон
- sync_core
- Любой другой template-файл вне `*_local_apply.dart`

## Критерии приёмки

- [ ] В non-junction LocalApply (Category/Task/Tag/Configuration) шаблоны содержат LWW guard перед `_dao.into(...).insert(...)`:
  ```dart
  if (ctx is SyncPullApplyContext) {
    final localRow = await _dao.get<X>ById(serverEntity.id, userId: ..., customerId: ...);
    if (localRow != null && localRow.syncStatus == SyncStatus.local && localRow.lastModified.isAfter(ctx.sourceTimestamp)) {
      return;
    }
  }
  ```
- [ ] В junction LocalApply (`task_tag_map_local_apply.dart`) — guard **отсутствует** (UPSERT/DELETE по PK pair, без LWW).
- [ ] Если генератор использует один template для всех `*_local_apply.dart` (через section-template) — добавлен switch по junction-flag, гарантирующий что guard вставляется только для non-junction. Если шаблоны раздельные (entity vs manyToMany manifest) — фикс только в `entity`-manifest файлах.
- [ ] Все референсы на DAO-методы (`get<X>ById`) должны существовать в сгенерированном DAO. Если нет — escalate (это требует расширения DAO template).
- [ ] Unit test `src/test/generators/local_apply_lww_guard_test.ts`:
  - Test 1: non-junction entity → сгенерированный `*_local_apply.dart` содержит `is SyncPullApplyContext` + `localRow.lastModified.isAfter(ctx.sourceTimestamp)` + `return;` в нужном порядке.
  - Test 2: junction entity (`isRelation: true` per JunctionDetector) → сгенерированный `task_tag_map_local_apply.dart` НЕ содержит guard, остаётся pure UPSERT.
  - Test 3: regression — non-FK 2-relation entity ошибочно classify'ится как junction? Cross-проверить через JunctionDetector.analyze() в тесте.
- [ ] `npm run compile` + `npm run lint` clean, mocha workaround passing.
- [ ] `codegen verify --name t183 --human` PASS, цитировать `errors=N, warnings=M`.
- [ ] На t183:
  - Прогнать `generate-entity` для (a) обычной reference сущности, (b) junction сущности (2 FK + base only).
  - `grep "SyncPullApplyContext" t183/.../adapters/.../local_apply.dart`: present для (a), absent для (b).
  - `grep "lastModified.isAfter(ctx.sourceTimestamp)" ...`: same pattern.
- [ ] **Runtime smoke**: minimal Dart test в t183 (либо в `src/test/generators/`) с двумя scenarios:
  - Scenario A (LWW protected): local entity `syncStatus=local`, `lastModified = now`. Pull server entity `lastModified = now - 1h`. Apply через LocalApply → local row **не затёрт**.
  - Scenario B (own echo applies): local entity `syncStatus=local`, `lastModified = now`. Apply through `SyncEchoContext` (not pull) → local row **обновлён** (own write echo always applies).
  - Scenario C (junction passes): junction entity → no guard → unconditional UPSERT.
- [ ] `report.md` с CLI-выводом + grep evidence + runtime scenario evidence.
- [ ] **3 adversarial reviewers** (User decision Q5) до commit'а.

## План работы

1. [ ] Прочитать `CLAUDE.md`, `AGENTS.md`, agent_memory, [handoff TASK-021](../../../../../Flutter/serverpod/weight/ai/tasks/active/TASK-021-generator-root-followup/task.md) → Bug 3 / A1 / C1, [weight TASK-019 Сессия 2 → 🔴 A1](../../../../../Flutter/serverpod/weight/ai/tasks/done/TASK-019-phase-weight-2-sync-core-wire-up/task.md) полностью, [weight weighing_local_apply.dart](../../../../../Flutter/serverpod/weight/weight_flutter/lib/features/weighing/data/adapters/weighing/weighing_local_apply.dart) — reference impl.
2. [ ] Прочитать существующие `category_local_apply.dart`, `task_local_apply.dart`, `tag_local_apply.dart`, `task_tag_map_local_apply.dart`, `configuration_local_apply.dart` в simplified template — current shape.
3. [ ] Прочитать [src/features/generation/parsers/junction_detector.ts](../../../../src/features/generation/parsers/junction_detector.ts) — понять public API (`isJunctionEntity`, `analyze`).
4. [ ] **Design decision:** какой механизм опт-аута выбрать.
   - **Подход A (рекомендация):** разделить через manifest tag — non-junction local_apply имеет `manifest: entity`, junction `manifest: manyToMany`. Patch применяется только к `entity` manifest. Если current разделение уже такое (verify через [manifests.ts](../../../../src/features/generation/generators/manifests.ts)) — фикс просто правкой template-файлов `category_local_apply.dart` (+ task / tag / configuration).
   - **Подход B:** если шаблоны общие (один файл `*_local_apply.dart` под обе семантики) — нужно section-marker типа `// === generated_start:lwwGuard === ... === generated_end:lwwGuard ===` + skip section в section-replacer когда `model.isRelation === true`.
   Executor выбирает с обоснованием в `report.md`.
5. [ ] Реализовать выбранный подход:
   - **Если A:** в `category_local_apply.dart`, `task_local_apply.dart`, `tag_local_apply.dart`, `configuration_local_apply.dart` (если applicable) добавить guard перед `_dao.into(_dao.<x>Table).insert(...)`. Использовать существующий метод DAO `get<X>ById(id, userId:, customerId:)`. Проверить что метод сгенерирован для всех 4 сущностей в template — если нет, escalate.
   - **Если B:** добавить section marker + section-replacer logic.
6. [ ] Junction guard (`task_tag_map_local_apply.dart`) — verify что guard **НЕ добавлен**. Это требование acceptance.
7. [ ] Unit test `src/test/generators/local_apply_lww_guard_test.ts` (3 кейса выше).
8. [ ] `npm run compile` clean.
9. [ ] mocha workaround — passing.
10. [ ] `npm run lint` clean.
11. [ ] **STOP-gate:** перед verify — show design decision + diff template'ов + diff src/ (если B) + опт-аут механизм для junction'ов.
12. [ ] `codegen create-project --name t183 --human`.
13. [ ] Подготовить два YAML: (a) reference сущность Example1, (b) junction сущность ExampleMap (2 FK + base only).
14. [ ] `generate-entity` для обеих на t183.
15. [ ] Grep: SyncPullApplyContext present в (a), absent в (b).
16. [ ] `verify --name t183 --human` PASS.
17. [ ] **Runtime scenario test** (см. acceptance) — Dart unit test в t183 либо в src/test/.
18. [ ] **3 adversarial reviewers** до commit'а (User decision Q5 для high-stakes fix).
19. [ ] `report.md` с CLI + grep + runtime evidence + дизайн-решение.

## STOP-gates

- [ ] **После design decision** (шаг 4) — show user'у выбор A vs B + почему. Если требуется section-engine изменения (B) — отдельно подтвердить scope.
- [ ] **Если генерация требует new DAO methods** (`get<X>ById` отсутствует у какой-то сущности) — escalate, это **расширение DAO template** out-of-scope этой задачи.
- [ ] **Перед verify** (шаг 11) — show diff template + src.
- [ ] **Перед runtime scenario test** (шаг 17) — show test code user'у.
- [ ] **Перед commit** (шаг 18) — 3 review результата показаны user'у.

**Destructive ops:** ожидаемо отсутствуют. Изменения template (3-4 файла) — это template-level change с blast radius **на все будущие** simplified entity-gen. Учесть в STOP-gate шага 11.

## План тестирования

### Unit (обязательно)

`src/test/generators/local_apply_lww_guard_test.ts` — 3 кейса. Плюс расширить existing junction_detector test-suite если применимо.

### Verify (обязательно, DoD-гейт)

```bash
codegen create-project --name t183
codegen generate-entity --yaml <reference_entity.spy.yaml> ... --template simplified
codegen generate-entity --yaml <junction.spy.yaml> ... --template simplified
codegen verify --name t183
```

Plus grep evidence + manual diff inspection.

### Runtime (обязательно — bug 3 critical)

Dart scenario tests:

- Scenario A: local `syncStatus=local` + `lastModified=now` → pull stale (now-1h) → local **preserved**.
- Scenario B: own echo via `SyncEchoContext` → local **updated** regardless of timestamp.
- Scenario C: junction LocalApply on stale pull → still UPSERT (no guard).

Можно реализовать как Dart test либо integration-test в t183 либо TypeScript mock-based в src/test/. **Executor выбирает с обоснованием** — критерий: должен дать evidence что guard работает как заявлено.

## Релевантный контекст

- [src/features/generation/parsers/junction_detector.ts](../../../../src/features/generation/parsers/junction_detector.ts) — single source of truth для junction detection
- [src/features/generation/generators/manifests.ts](../../../../src/features/generation/generators/manifests.ts) — manifest table (entity vs manyToMany)
- [G:/Templates/flutter/simplified/simplified_flutter/lib/features/tasks/data/adapters/<entity>/<entity>_local_apply.dart](../../../../../Templates/flutter/simplified/simplified_flutter/lib/features/tasks/data/adapters/) — 4 шаблона
- [weight weighing_local_apply.dart](../../../../../Flutter/serverpod/weight/weight_flutter/lib/features/weighing/data/adapters/weighing/weighing_local_apply.dart) — **reference implementation** ручного guard
- [weight TASK-019 task.md Сессия 2 → 🔴 A1](../../../../../Flutter/serverpod/weight/ai/tasks/done/TASK-019-phase-weight-2-sync-core-wire-up/task.md) — original incident
- [handoff TASK-021](../../../../../Flutter/serverpod/weight/ai/tasks/active/TASK-021-generator-root-followup/task.md) → Bug 3 секция

## Заметки по реализации

- **Проверить что `syncStatus` поле существует в стандартной 6-field invariant.** Из YAML invariant'а (`userId, customerId, isDeleted, createdAt, lastModified, id`) — `syncStatus` НЕ входит. Это **колонка добавляемая sync_core staging** автоматически через `SyncStatusColumnAddon` либо аналог. Проверить через [database_types.dart simplified](../../../../../Templates/flutter/simplified/simplified_flutter/lib/core/data/datasources/local/database_types.dart). Если колонка существует у всех — фикс straightforward. Если нет — escalate.
- DAO-метод `get<X>ById(id, userId:, customerId:)` нужен для guard'а. Verify что он генерируется для всех 4 сущностей. Если нет — guard не скомпилируется, фикс заблокирован.
- Если configuration_local_apply.dart использует non-id PK (group + key composite) — нужен другой lookup. Executor flag'ит в журнале если так.
- 3 ревьюера (User decision Q5) — это **больше** baseline 2 (Bug 4 / Bug 1 / Bug 2). Обоснование: silent data corruption — critical bug class, 3 ревьюера = lessons learned из TASK-019 Session 2 (каждый из 3 ревьюеров поймал ровно один уникальный блокер).

## Результаты

- 3-4 modified `*_local_apply.dart` в simplified template (non-junction)
- 0 modified junction `*_local_apply.dart`
- Возможно изменения в `src/features/generation/` (если выбран подход B)
- 1 new test file (unit)
- 1 runtime scenario evidence (Dart test или mock-based)
- 1 new test project `t183/`
- `report.md` с дизайн-решением + reproduction + reviews

## Журнал исполнения

*Только executor. Teamlead не редактирует.*
