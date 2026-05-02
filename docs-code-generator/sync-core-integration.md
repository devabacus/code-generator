# sync_core 0.3.0 integration

Документ описывает что генерирует `code-generator` для `sync_core` 0.3.0 multi-entity sync, какие требования к YAML model, какие limitations, и references на upstream sync_core docs.

**Status:** validated cross-device runtime на Windows + Android через t115/TASK-001 acceptance (2026-05-02). Multi-entity (5 entities: Configuration + Category + Task + Tag + TaskTagMap) bidirectional sync working.

**TASK source:** [TASK-011 sync_core 0.3.0 templates integration](../ai/tasks/active/TASK-011-sync-core-0-3-0-templates-integration/).

## Что генерируется

### 1. `codegen create-project --name <X>` — sync infrastructure baseline

Создаёт фоlder `<X>_flutter/lib/core/sync/` с **5 source файлами** (manifest: startProject):

- `app_lifecycle_provider.dart` — foreground/resume hook через WidgetsBindingObserver
- `device_id_provider.dart` — UUID v7 в SharedPreferences
- `drift_sync_queue_store.dart` — `SyncQueueStore` impl (low-level CRUD + runInTransaction + afterCommit)
- `sync_orchestrator_provider.dart` — главный wire-up + 4 hooks (boot recovery / connectivity online → flushAll / app foreground → flushAll / scope change → deactivate prev + recover + activate new + flushAll)
- `sync_queue_table.dart` — Drift schema для outbox queue (19 полей)

Плюс **Configuration baseline** в `lib/features/configuration/` (singleton сущность, манifest: startProject):
- 5 adapter файлов в `data/adapters/configuration/`
- DAO + entity + repository

Orchestrator после `create-project` имеет:
- 1 entity registered (Configuration)
- 3 marker блока в orchestrator: `:syncImports`, `:syncEntityTypes`, `:syncRegistrations` — content только Configuration
- `flutter analyze` clean (errors=0)

### 2. `codegen generate-entity --yaml <X>.spy.yaml` — per-entity adapters + orchestrator patch

Создаёт **5 adapter файлов** в `lib/features/<feature>/data/adapters/<entity>/`:

- `<entity>_remote_adapter.dart` — `SyncRemoteWriteAdapter<XEntity>` (create/update/delete RPC, soft-delete via update)
- `<entity>_pull_adapter.dart` — `SyncRemotePullAdapter<XEntity>` (incremental pull via `getXSince(checkpoint)`)
- `<entity>_event_adapter.dart` — `SyncRemoteEventAdapter<XEntity>` (server-side event stream через `watchEvents`)
- `<entity>_payload_codec.dart` — JSON serialization (toJson/fromJson + idOf)
- `<entity>_local_apply.dart` — UPSERT через DAO (`insertOrReplace`)

Плюс **Repository** с mutation-first pattern (manifest: entity):
- `<entity>_repository_impl.dart` — `_db.transaction { dao.insert + orchestrator.enqueue }`

Плюс **3 marker блока** в `sync_orchestrator_provider.dart` патчатся **идемпотентно** через `OrchestratorPatcher`:

1. **`:syncImports`** — добавляет 7 import строк (5 adapter + 1 dao + 1 entity)
2. **`:syncEntityTypes`** — добавляет `'<entityType>',` строку в `const List<String>`
3. **`:syncRegistrations`** — добавляет `orchestrator.register<XEntity>(...)` блок (12 строк)

#### Junction entities (`*Map` className)

Если `model.className.endsWith('Map')` — например `TaskTagMap`, `UserPermissionMap` — patcher выбирает junction template:
- Snippet содержит docstring о junction-specific routing: `update()` → `createX` (idempotent create + resurrect), `delete()` → noop (Repository должен решать delete-flow)
- routing через `manifest: manyToMany` словарь
- Server endpoints: `createX`, `deleteXByABusinessKey` (НЕ `updateX` / `deleteX`)

Reference: t115/TASK-001 Phase 2d TaskTagMap pattern.

## YAML model requirements

**Обязательные поля entity YAML** (валидируется через `entity_yaml_validator`):

```yaml
class: Expense
table: expense
fields:
  id: UuidValue?, defaultPersist=random_v7
  userId: int                                                    # required
  customerId: UuidValue, relation(parent=customer, onDelete=Cascade)  # required
  createdAt: DateTime
  lastModified: DateTime
  isDeleted: bool, default=false                                 # required
  # ... user fields
indexes:
  expense_user_id_idx:
    fields: userId
  expense_customer_id_idx:
    fields: customerId
```

**Парный sync_event YAML** (обязателен для regular entities):

```yaml
# expense_sync_event.spy.yaml
class: ExpenseSyncEvent
fields:
  expense: Expense?
  isDeleted: bool, default=false
  scope: String
```

Junction (`*Map`) **пропускают** sync_event валидацию (per Discussion #1 решение, robust junction detection — TASK-013 backlog).

## Limitations

### 1. Junction detection — `endsWith('Map')` heuristic

Текущий patcher использует `model.className.endsWith('Map')` для определения junction.

**False-negatives potential:**
- Regular entity `Roadmap`, `Sitemap` будут treated как junction (regex match)
- Workaround: переименовать или добавить `junction: false` flag (TASK-013)

**False-positives potential:**
- Junction без `Map` suffix (e.g., `UserRoleAssignment`) не будет detected
- Workaround: переименовать в `UserRoleAssignmentMap` или ждать TASK-013

**Trigger для priority bump:** weight TASK-018 production migration discoverит false-negatives на 13 entities → robust solution через YAML field analysis или explicit `junction: true` flag (см. [TASK-013 backlog](../ai/tasks/backlog/) или [roadmap.md](../ai/docs/roadmap.md)).

### 2. Soft-delete via update pattern

Sync_core 0.3.0 не имеет dedicated `delete()` RPC на server side для большинства entities — soft-delete делается через `update()` с `isDeleted=true`.

**Server endpoints expected:**
- `createX(X x)` — creates entity (idempotent, resurrect if soft-deleted)
- `updateX(X x)` — updates including `isDeleted=true` для soft-delete
- `getXSince(DateTime since, scope)` — incremental pull
- `watchEvents(scope) -> Stream<XSyncEvent>` — server-side events

Junction entities (`*Map`) — **отсутствует `updateX`**, есть `deleteXByBusinessKey` (через FK pair).

### 3. Patcher работает только если orchestrator pre-prepared с marker блоками

`OrchestratorPatcher.patch()` — **no-op** если `sync_orchestrator_provider.dart` не существует или не содержит marker pairs (`:syncImports` / `:syncEntityTypes` / `:syncRegistrations`).

В свежих проектах через `create-project` markers подготовлены автоматически (Configuration baseline + 3 empty marker pairs ready for entities).

### 4. `patchPubspecPackagePaths` regex extension (Phase D, TASK-011)

sync_core path-dep живёт **вне** Packages/ monorepo (в `Projects/Flutter/Packages/sync_core`). Regex extended для покрытия `(?:\.\.\/){4,}Projects\/...` patterns. См. `src/core/services/project_bootstrapper.ts`.

**Edge case:** patcher **non-idempotent** для out-of-monorepo paths (каждый run углубляет на 1 уровень). Acceptable потому что вызывается 1 раз в `create-project` bootstrap.

## References

### Codegen src

- `src/features/generation/generators/orchestrator_patcher.ts` — patcher implementation
- `src/test/generators/orchestrator_patcher.test.ts` — 7 unit-tests (empty/single/idempotent/junction/multi-sequential/recovery-duplicates/commutative)
- `src/test/generators/section_replacer.test.ts` — 5 unit-tests (B6/B7 — SectionReplacer не трогает sync markers)
- `src/test/services/project_bootstrapper.test.ts` — 6 unit-tests для patchPubspecPackagePaths
- `src/core/services/project_bootstrapper.ts` — `patchPubspecPackagePaths` (sync_core path-dep coverage)

### sync_core upstream

- [sync_core/ai/docs/conventions.md](../../../Projects/Flutter/Packages/sync_core/ai/docs/conventions.md) — Patterns 1-7 (Pattern 6: multi-entity registration + FK ordering, Pattern 7: junction entities + soft-delete + late-register)
- [sync_core/ai/docs/contracts.md](../../../Projects/Flutter/Packages/sync_core/ai/docs/contracts.md) — public API spec
- [sync_core/ai/docs/decisions/adr-0004-multi-entity-runtime-guidance.md](../../../Projects/Flutter/Packages/sync_core/ai/docs/decisions/adr-0004-multi-entity-runtime-guidance.md) — multi-entity runtime guidance (no lib/ changes для consumers, всё через consumer responsibility patterns)
- [sync_core/ai/docs/architecture.md](../../../Projects/Flutter/Packages/sync_core/ai/docs/architecture.md) — state machine + R3 pull flow + checkpoint semantics

### Reference consumers

- [t115 template](../../../Templates/flutter/t115) — multi-entity reference (5 entities, validated через t115/TASK-001 acceptance)
- [serverpod/sync/sync_flutter](../../../Projects/Flutter/serverpod/sync/sync_flutter) — single-entity reference (1 Configuration entity)
- weight production (13 entities) — мигрируется в weight TASK-018 после TASK-012 acceptance

## Related TASK history

- **TASK-011** (this task) — sync_core 0.3.0 templates integration (orchestrator_patcher + pubspec path-dep fix + docs)
- **TASK-012** (next) — codegen → todo real app generation + smoke (cross-device runtime validation)
- **weight TASK-018** (after TASK-012) — 13 entities production migration

## TASK-013 backlog (deferred)

Robust junction detection: вместо `endsWith('Map')` heuristic — анализ YAML fields (foreign-key only entity = junction) или explicit `junction: true` flag.

**Trigger:** weight TASK-018 false-negatives на 13 entities. До этого keep heuristic.

См. [ai/docs/roadmap.md](../ai/docs/roadmap.md) или [ai/tasks/backlog/](../ai/tasks/backlog/).
