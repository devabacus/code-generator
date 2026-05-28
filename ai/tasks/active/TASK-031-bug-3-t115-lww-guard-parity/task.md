# TASK-031: Bug 3 t115 LWW guard parity

## Ветка

feature/TASK-031-bug-3-t115-lww-guard-parity

## Цель

Применить **identical LWW skip-stale guard pattern** (закрытый в TASK-028 для simplified) к **t115 template** в 4 `*_local_apply.dart` файлах. Закрывает Bug 3 (silent data corruption на cross-device pull: stale server event перезаписывает local unsynced fresher edit) **для t115 consumers** — включая будущую weight TASK-018 migration и любые existing проекты регенерируемые с t115 baseline.

**Обоснование:** ADR-0005 amendment 2026-05-04 классифицирует t115 как "supported template + bug-fix-as-needed" (не frozen в строгом смысле). Bug 3 = data-integrity bug fix → попадает под "as needed". TASK-028 adversarial Reviewer 2 H-1 finding явно рекомендовал отдельный TASK-031 для t115 parity (см. [TASK-028 report.md, findings table H-1](../../done/TASK-028-bug-3---lww-skip-stale-guard-default-on/report.md)).

## Не-цели

- **НЕ менять** generator logic (`src/`) — это template-only patch (как и TASK-028)
- **НЕ trogать** simplified template (уже закрыто TASK-028, не регрессить)
- **НЕ trogать** junction `task_tag_map_local_apply.dart` в t115 (manifest: manyToMany — opt-out, LWW неприменим к PK-pair UPSERT/DELETE)
- **НЕ trogать** Configuration legacy paths (`configuration_local_data_source.dart` `handleSyncEvent`/`insertOrUpdateFromServer`) — это scope TASK-032 (suggested), не TASK-031
- **НЕ менять** stack lock invariants (Riverpod / Drift / Clean directory / sync_core 0.3.0 / Serverpod / 13 markers)
- ~~**НЕ менять** package versions — это template patch, не version refresh~~ **AMENDED 2026-05-27 (User-approved scope expansion mid-task, Option A):** caret bump `custom_lint: 0.8.0 → ^0.8.0` в `t115_flutter/pubspec.yaml` legitimized как bug fix (analogous TASK-030 для simplified, closes BUG-021 для t115). ADR-0005 amendment 2026-05-04 классифицирует t115 как "supported template + bug-fix-as-needed" — pubGet drift = bug fix, не version refresh. Discovered как hard blocker для `create-project --template t115 → flutter pub get` на шаге 12. User confirmed Option A (extend scope) vs Option B (split TASK-033) перед фиксом. Sibling pubspec rotted comments (build_runner / json_serializable / freezed) — **deferred** в follow-up TASK (out-of-scope для текущего TASK-031, не блокирует verify-гейт).

## Scope

Разрешено:

- Правка 4 файлов в `G:/Templates/flutter/t115/t115_flutter/lib/features/`:
  - `tasks/data/adapters/category/category_local_apply.dart` (manifest: entity)
  - `tasks/data/adapters/task/task_local_apply.dart` (manifest: entity)
  - `tasks/data/adapters/tag/tag_local_apply.dart` (manifest: entity)
  - `configuration/data/adapters/configuration/configuration_local_apply.dart` (manifest: startProject, с partial protection docstring)
- Расширение [src/test/generators/local_apply_lww_guard.test.ts](../../../../src/test/generators/local_apply_lww_guard.test.ts) Live template regression suite — добавить параллельные t115 paths constants + parallel test cases (без рефакторинга existing simplified-paths suite)
- report.md финальный

Запрещено:

- Любой другой файл template t115 вне 4 указанных `*_local_apply.dart`
- `src/features/generation/` generator logic
- `src/adapters/cli/` CLI commands
- simplified template (TASK-028 territory)
- t115 junction `task_tag_map_local_apply.dart`
- Configuration `configuration_local_data_source.dart` (TASK-032 territory)
- Package versions (`pubspec.yaml`)
- Migrations / БД schema

## Критерии приёмки

- [ ] 4 t115 файла `*_local_apply.dart` содержат LWW guard, **literally identical** simplified patch pattern (см. "Guard pattern" в [TASK-028 report.md](../../done/TASK-028-bug-3---lww-skip-stale-guard-default-on/report.md))
- [ ] Configuration docstring документирует partial protection (composite group+key business-key) — identical wording с simplified
- [ ] Junction `task_tag_map_local_apply.dart` НЕ trогнут, guard отсутствует
- [ ] `tsc -p ./` clean (0 errors)
- [ ] `npm run lint` 0 errors (warnings allowed pre-existing baseline)
- [ ] mocha workaround: **253 + N passing** (baseline 253 + extension Live regression t115 cases), 0 failing
- [ ] Live regression suite extended: t115 paths constant defined, parallel `hasLwwGuard` + `countGuards == 1` assertions для 4 non-junction t115 files + 0 guards для t115 junction
- [ ] `codegen verify --name t<N+1>` PASS errors=0 (для **t115** — `--template t115` opt-in; default = t115 post Discussion #12 pivot, проверить explicit flag для clarity)
- [ ] `report.md` с реальными числами `errors=N, warnings=M, infos=K`
- [ ] Multi-agent review pre-commit: **3 adversarial** (data-integrity, per Q5 User decision), Standard optional

## Заметки по реализации

### Pattern reference (identical с simplified, TASK-028)

**Guard block** (вставляется перед существующим UPSERT в `applyServerEcho`):

```dart
// LWW skip-stale guard (TASK-028): см. docstring выше.
// serverEntity.lastModified — hard-required field (always non-null) vs
// ctx.sourceTimestamp (nullable, NULL если backend не возвращает).
if (ctx is SyncPullApplyContext) {
  final local = await _dao.get<Entity>ById(
    serverEntity.id,
    userId: serverEntity.userId,
    customerId: serverEntity.customerId,
  );
  if (local != null &&
      local.syncStatus == SyncStatus.local &&
      local.lastModified.isAfter(serverEntity.lastModified)) {
    return; // локальная несинхронизированная версия новее — skip
  }
}
```

**Docstring update** (entity-уровень, добавить в class docstring):

```text
**LWW skip-stale guard (TASK-028, Bug 3):** на pull-apply пропускаем
server-data если локально syncStatus=local + lastModified свежее.
Защищает от silent data corruption на cross-device pull: stale server
event не затирает local unsynced fresher edit. Own-write echo
(SyncEchoContext) применяем всегда — server-assigned timestamps
канонизируются в local DB. Junction-сущности (M2M, manifest:
manyToMany) — opt-out (PK-pair UPSERT/DELETE, LWW неприменим).
```

**Configuration docstring — partial protection caveat** (identical wording с simplified Configuration, см. [simplified/configuration_local_apply.dart:23-34](file:///G:/Templates/flutter/simplified/simplified_flutter/lib/features/configuration/data/adapters/configuration/configuration_local_apply.dart)):

```text
**Configuration — partial protection (known limitation):** Configuration
имеет UUID `id` + lookup в product code через `getConfigurationByGroupAndKey`
(composite business-key group+key). Этот guard работает по `id` lookup —
защищает scenario когда server pull привозит изменение существующей
(по id) Configuration. **НЕ защищает** scenario когда два устройства offline
создали Configuration с одинаковым (group, key) но разными UUID — pull
привезёт server entity с unknown id → fallthrough → duplicate row по
(group, key). Full conflict resolution для Configuration реализован в
`configuration_local_data_source.dart` (reconcileServerChanges, lookup по
business-key); guard здесь = defense-in-depth для sync_core 0.3.0
`applyServerEcho` path. Junction-сущности (M2M) — opt-out (PK-pair
UPSERT/DELETE, LWW неприменим).
```

### Deviation от sourceTimestamp — обосновано (унаследовано от TASK-028)

Использовать `serverEntity.lastModified` (hard-required, non-null), **не** `ctx.sourceTimestamp` (nullable, batch watermark в `sync_orchestrator.dart:814`). Identical rationale документирован в [TASK-028 report.md "Deviation от task.md acceptance"](../../done/TASK-028-bug-3---lww-skip-stale-guard-default-on/report.md). Не пере-обсуждать — accepted contract post-TASK-028.

### DAO method dependencies (verify before patching)

Каждая t115 entity DAO должна иметь `get<Entity>ById(id, {userId, customerId})` метод. Проверить grep'ом перед патчем — если signature отличается от simplified (3-arg userId/customerId named), нужна адаптация call site (или fail-fast блокер с расписанным mismatch в report.md, **не workaround**).

### Stack lock compliance (Discussion #11)

- ✅ Marker scheme preserved (manifest: entity / manifest: startProject / manifest: manyToMany — invariant)
- ✅ Clean directory layout preserved (`lib/features/<feature>/data/adapters/<entity>/`)
- ✅ sync_core 0.3.0 contract preserved (`SyncApplyContext` sealed hierarchy, documented API)
- ✅ Drift conventions preserved (`insertOrReplace` UPSERT pattern)
- ✅ 0 package version changes
- ✅ 0 generator logic changes (template-only patch)

## Релевантный контекст

Файлы для прочтения перед началом:

- [ai/tasks/done/TASK-028-bug-3---lww-skip-stale-guard-default-on/report.md](../../done/TASK-028-bug-3---lww-skip-stale-guard-default-on/report.md) — pattern reference, обоснование `serverEntity.lastModified` vs `sourceTimestamp`, adversarial findings table (H-1 явно рекомендовал TASK-031)
- [ai/tasks/done/TASK-028-bug-3---lww-skip-stale-guard-default-on/task.md](../../done/TASK-028-bug-3---lww-skip-stale-guard-default-on/task.md) — acceptance criteria precedent
- [src/test/generators/local_apply_lww_guard.test.ts](../../../../src/test/generators/local_apply_lww_guard.test.ts) — Live template regression suite (lines 450-492), test file для extension
- `G:/Templates/flutter/simplified/simplified_flutter/lib/features/tasks/data/adapters/category/category_local_apply.dart` — post-TASK-028 reference (identical pattern для copy)
- `G:/Templates/flutter/simplified/simplified_flutter/lib/features/configuration/data/adapters/configuration/configuration_local_apply.dart` — partial protection docstring reference
- `G:/Templates/flutter/t115/t115_flutter/lib/features/tasks/data/adapters/category/category_local_apply.dart` — t115 pre-state baseline (диff target)
- `ai/docs/decisions/adr-0005-multi-template-plurality.md` — Section 7 stack lock + amendment 2026-05-04 (t115 = supported, bug-fix-as-needed)
- `ai/docs/agent_memory.md` — gotchas + `.test.ts` filename convention + stack lock

## План работы

1. [ ] **Audit** DAO method signatures в t115 — grep `getCategoryById`/`getTaskById`/`getTagById`/`getConfigurationById` в `t115_flutter/lib/features/<feature>/data/datasources/local/daos/<entity>/<entity>_dao.dart`, verify identical 3-arg signature `(id, {userId, customerId})` с simplified. Если mismatch — `## BLOCKED` в report.md, не пытаться workaround.
2. [ ] Patch `t115_flutter/lib/features/tasks/data/adapters/category/category_local_apply.dart` — docstring update + guard block (identical с simplified)
3. [ ] Patch `t115_flutter/lib/features/tasks/data/adapters/task/task_local_apply.dart` — same pattern
4. [ ] Patch `t115_flutter/lib/features/tasks/data/adapters/tag/tag_local_apply.dart` — same pattern
5. [ ] Patch `t115_flutter/lib/features/configuration/data/adapters/configuration/configuration_local_apply.dart` — docstring (с partial protection caveat) + guard block
6. [ ] Verify junction `t115_flutter/lib/features/tasks/data/adapters/task_tag_map/task_tag_map_local_apply.dart` НЕ trогнут (читать post-patch, убедиться identical с pre-state)
7. [ ] Extend [src/test/generators/local_apply_lww_guard.test.ts](../../../../src/test/generators/local_apply_lww_guard.test.ts):
   - Добавить `T115_TEMPLATE_ROOT` constant
   - Добавить `LIVE_T115_NON_JUNCTION_PATHS` (4 entries: category/task/tag/configuration)
   - Добавить `LIVE_T115_JUNCTION_PATH` (task_tag_map)
   - Добавить parallel suite "Live template regression t115 (disk-dependent, optional)" — copy structure из existing simplified suite, identical assertions
8. [ ] `npm run compile` clean
9. [ ] `npm run lint` 0 errors
10. [ ] mocha workaround → **253 + N passing**, 0 failing. Зафиксировать число.
11. [ ] **STOP-gate:** запросить User confirmation перед `create-project` (~3 мин + verify ~30s)
12. [ ] `codegen create-project --name t<N+1> --template t115` (явный t115 opt-in, **N = highest used + 1**, последний known t194; lookup через `ls G:/Projects/Flutter/serverpod/`)
13. [ ] `codegen verify --name t<N+1> --human` → PASS errors=0. Зафиксировать `errors/warnings/infos`.
14. [ ] **STOP-gate:** запросить User confirmation на multi-agent review (spawn 3 adversarial parallel через Agent tool)
15. [ ] Spawn 3 adversarial reviewers (parallel) с promптом фокусом на: docstring accuracy / guard pattern fidelity / DAO method consistency / test coverage adequacy / stack lock compliance
16. [ ] Применить HIGH+ findings inline (если есть), defer LOW в report.md findings table
17. [ ] Финализировать report.md с реальными числами
18. [ ] **STOP-gate:** ЖДУ User "коммить" перед `task.py pr`

## STOP-gates (требуется явное "ok" User'а)

- **Перед `create-project --name t<N+1> --template t115`** — создаст новую директорию ~50MB на диск в `G:/Projects/Flutter/serverpod/t<N+1>/`. Sandbox не позволит удалить — это hard rule.
- **Перед spawn 3 adversarial reviewers** — multi-agent review consumes context budget; подтвердить что multi-agent pattern (per Q5 data-integrity bar) применим.
- **Перед `task.py pr` (создание PR)** — push в remote, видимо публично.
- **Перед `task.py merge -y`** — merge в master, blast radius на все будущие `create-project --template t115`.

При DAO signature mismatch на шаге 1 — **`## BLOCKED` в report.md**, не workaround (per "Без костылей" hard rule).

## План тестирования

**Unit (обязательно):**

- Extend [local_apply_lww_guard.test.ts](../../../../src/test/generators/local_apply_lww_guard.test.ts) Live template regression suite parallel для t115:
  - 4 t115 non-junction `*_local_apply.dart` → `hasLwwGuard(content) == true` + `countGuards(content) == 1`
  - t115 junction `task_tag_map_local_apply.dart` → `hasLwwGuard(content) == false` + `countGuards(content) == 0`
- Skip gracefully на CI (t115 disk paths недоступны в CI environment) — pattern идентичен simplified suite (lines 456-459)
- **НЕ изменять** existing simplified suite assertions (regression risk)

**Verify (обязательно — DoD-гейт):**

- `codegen create-project --name t<N+1> --template t115` (~3 мин)
- `codegen verify --name t<N+1> --human` → PASS errors=0
- Цитировать `errors=N, warnings=M, infos=K` в report.md
- Live grep на t<N+1> подтверждает guard literally present (4 файла) + junction отсутствует guard

**Runtime (skip — Option B precedent, TASK-028):**

- Identity pattern с simplified post-TASK-028 (compile-time gate purpose)
- Weight production-equivalent reference impl уже validates Dart semantics
- Trivial Dart `if (A && B && C) return;` — no novel runtime logic
- Cite TASK-028 precedent в report.md "Runtime smoke" section

**Smoke (вне scope):**

- VS Code расширение не trогaет UI/CLI surface, smoke не нужен
- Multi-client real-time sync — зона user'а после merge

**Команды:**

```bash
# Build + tests
npm run compile
node node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"
npm run lint

# Verify gate (после STOP-gate ok от User'а)
# Lookup highest used t<N>: ls G:/Projects/Flutter/serverpod/
node out/adapters/cli/index.js create-project --name t<N+1> --template t115
node out/adapters/cli/index.js verify --name t<N+1> --human
```

## Результаты

**Ожидаемые изменения:**

- 4 файла в `G:/Templates/flutter/t115/t115_flutter/` (template patch, **outside repo**)
- 1 файл в `src/test/generators/local_apply_lww_guard.test.ts` (test extension)
- `ai/tasks/active/TASK-031-.../report.md` (final report с числами)
- `ai/docs/status.md` (update: TASK-031 closed, suggested follow-up TASK-032 remains)
- `ai/docs/roadmap.md` (минор: t115 LWW parity closure note)
- `ai/docs/agent_memory.md` (минор: t115 LWW guard parity note в gotchas если применимо)

**0 src/ generator logic changes** — template + test only patch.

**Master state expected post-merge:** `master <new-sha>`, **253 + N tests** passing, **30 PRs total**.

**Cross-repo impact:**

- `devabacus/t115` template repo получает 4 file changes (commit отдельно в t115 repo — это не tracked этим репо, фиксируется в report.md "Template repo changes")
- Будущая weight TASK-018 migration на t115 получает Bug 3 protection autoматически
- Существующие consumers t115 — protection активируется на следующем `create-project --template t115` или manual template sync
