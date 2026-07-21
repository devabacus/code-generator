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

#### Junction entities (FK field analysis)

Junction (many-to-many) entities определяются через **`JunctionDetector.isJunctionEntity()`** — shared utility из `src/features/generation/parsers/junction_detector.ts` (single source of truth с TASK-013, 2026-05-02). Suffix `*Map` больше не используется для detection.

**Detection rules** (per [Discussion #2](../ai/discussions/archive/2-task-013-junction-detection-robust-yaml/) Q1=C / Q2=A / Q3=A unanimous consensus):

- **Structural (default):** entity = junction если **2+ FK relations** (поля с `relation(parent=...)` syntax) + 0 non-FK fields outside base whitelist (`id, userId, customerId, createdAt, lastModified, isDeleted`). Nullable FK = FK.
- **Explicit override:** YAML top-level `junction: true` field принудительно классифицирует entity как junction независимо от extra fields. Use case: junction с metadata (e.g. `UserPermission(userId, permissionId, assignedAt)`). Negative override (`junction: false`) НЕ supported — risk скрыть structural junction.
- **Validation:** `junction: true` + FK<2 → throws `JunctionValidationError` (fail-fast).

**Examples:**

```yaml
# Structural junction (no Map suffix needed — detection через FK analysis)
class: RolePermission
table: role_permission
fields:
  id: UuidValue?, defaultPersist=random_v7
  roleId: UuidValue, relation(parent=role, onDelete=Cascade)
  permissionId: UuidValue, relation(parent=permission, onDelete=Cascade)
```

```yaml
# Junction with metadata — requires explicit override
class: UserPermission
table: user_permission
junction: true                                                       # explicit override
fields:
  id: UuidValue?, defaultPersist=random_v7
  userId: UuidValue, relation(parent=user, onDelete=Cascade)
  permissionId: UuidValue, relation(parent=permission, onDelete=Cascade)
  assignedAt: DateTime                                               # business field
```

**Junction template snippet** (выбирается через `_JUNCTION_*` templates):
- Docstring о junction-specific routing: `update()` → `createX` (idempotent create + resurrect), `delete()` → noop (Repository должен решать delete-flow)
- Routing через `manifest: manyToMany` словарь
- Server endpoints: `createX`, `deleteXByBusinessKey` (НЕ `updateX` / `deleteX`)

#### Junction FK extraction — explicit-parents directive (TASK-037) + heuristic fallback

**Explicit directive (рекомендуется, TASK-037 / BUG-026 fix):** junction `*_map.spy.yaml` может
объявить junction-родителей явно через файловую директиву `junction: [a, b]`. Порядок
авторитетен: `entity1 = a`, `entity2 = b`. Директива читается **всеми тремя** junction-кодопутями
(`JunctionDetector` классификация, `ServerpodYamlParser.extractManyToManyEntities`,
`OrchestratorPatcher` FK-выбор) из **единого источника** — `model.entity1`/`model.entity2`,
populated парсером. Это устраняет silent misgeneration (BUG-026), когда ownership-поле
`customerId` объявлено раньше настоящих junction-FK.

```yaml
class: TaskTagMap
table: task_tag_map
junction: [task, tag]                                     # ← explicit parents (авторитетно)
fields:
  id: UuidValue?, defaultPersist=random_v7
  customerId: UuidValue, relation(parent=customer)        # ownership, НЕ junction-родитель
  taskId: UuidValue, relation(parent=task)                # junction FK
  tagId: UuidValue, relation(parent=tag)                  # junction FK
```

Маппинг элемента директивы на relation-поле: по имени поля `<element>Id` (`task` → `taskId`)
**или** по `relatedModel` (`terminal_set` → поле с `parent=terminal_set`, покрывает FK-alias).
Резолвнутое имя = `relatedModel` найденного поля (canonical lowerCamel, консистентно с
downstream substitution). Array-форма также подразумевает junction-классификацию (как
`junction: true`).

**Валидация:** элемент директивы, не сопоставимый ни с одним relation-полем, →
внятная ошибка (`... references "X", but no relation field matches it ...`), не silent.
Массив не из 2 непустых строк → ошибка формы (fail-fast).

**Heuristic fallback (без директивы — поведение байт-в-байт как раньше):** generator берёт
`entity1`/`entity2` из **первых 2 FK fields** в YAML declaration order (Option A). Это правильно
для clean junctions (`RolePermission(roleId, permissionId)`, `TaskTagMap(taskId, tagId)`), где
junction-FK объявлены до ownership `customerId`.

**Ограничение эвристики (когда директива не задана):**

Если junction имеет business key включающий non-FK поле (e.g. `userId: int` без
`relation(parent=user)`) или ownership `customerId: relation(parent=customer)` объявлен раньше
настоящих junction-FK — эвристика выберет неверную пару. Example из weight repo
(`weight_server/lib/src/models/user/customer_user.spy.yaml`):

```yaml
class: CustomerUser
fields:
  customerId: UuidValue, relation(parent=customer)        # FK (здесь — настоящий родитель)
  userId: int                                              # NOT a relation declaration
  roleId: UuidValue, relation(parent=role)                 # FK
  defaultTerminalSetId: UuidValue?, relation(parent=terminal_set)  # FK nullable
```

Без директивы generated method будет `deleteCustomerUserByCustomerAndRole` (берёт
`customerId`+`roleId`) — это корректно для CustomerUser (customer — настоящий junction-родитель),
но неверно для TaskTagMap с customerId-first ordering. `serverpod generate` PASS,
`flutter analyze` PASS, `verify` PASS (syntactically valid); ломается только на runtime
soft-delete by-key path.

**Workaround / рекомендация:**

1. **Задать `junction: [a, b]` директиву** — авторитетный, self-documenting сигнал (предпочтительно).
2. Соблюдать mitigation-конвенцию «объявляй junction-родительские FK ПЕРЕД ownership `customerId`»
   (эвристика тогда даёт корректную пару). Её соблюдает шаблон t115 (`task_tag_map`).

**⚠ Взаимодействие с BUG-012 (FK-alias):** маппинг директивы использует `relatedModel`
(уже резолвленный парсером из `parent=X`). Если `parent=` directive присутствует — маппинг по
alias работает (`terminal_set` → `terminalSet`). Директива **не** чинит и **не** ломает BUG-012 —
она полагается на уже-исправленный (TASK-016/017) `relatedModel`.

Pre-existing `server_yaml_parser` limitation (`relationFields[0]/[1]` для entity1/entity2),
expanded blast radius via TASK-014 FK extraction в `orchestrator_patcher._substituteJunctionFKs`.
TASK-037 unified оба места на `model.entity1`/`model.entity2` single source (2026-07-21).

References:
- t115/TASK-001 Phase 2d TaskTagMap pattern (multi-entity validated)
- [TASK-013 task.md](../ai/tasks/active/TASK-013-junction-detection-robust-yaml-field-analysis/task.md) — robust detection acceptance
- [ai/bug-reports/junction-detection-audit.md](../ai/bug-reports/junction-detection-audit.md) — false-negative audit + re-audit (2026-05-02 verified RolePermission + CustomerUser correctly classified)

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

Junction entities **пропускают** sync_event валидацию (detected через `JunctionDetector.isJunctionEntity()` — TASK-013, 2026-05-02).

## Limitations

### 1. Soft-delete via update pattern

Sync_core 0.3.0 не имеет dedicated `delete()` RPC на server side для большинства entities — soft-delete делается через `update()` с `isDeleted=true`.

**Server endpoints expected:**
- `createX(X x)` — creates entity (idempotent, resurrect if soft-deleted)
- `updateX(X x)` — updates including `isDeleted=true` для soft-delete
- `getXSince(DateTime since, scope)` — incremental pull
- `watchEvents(scope) -> Stream<XSyncEvent>` — server-side events

Junction entities — **отсутствует `updateX`**, есть `deleteXByBusinessKey` (через FK pair).

### 2. Patcher работает только если orchestrator pre-prepared с marker блоками

`OrchestratorPatcher.patch()` — **no-op** если `sync_orchestrator_provider.dart` не существует или не содержит marker pairs (`:syncImports` / `:syncEntityTypes` / `:syncRegistrations`).

В свежих проектах через `create-project` markers подготовлены автоматически (Configuration baseline + 3 empty marker pairs ready for entities).

### 3. `patchPubspecPackagePaths` regex extension (Phase D, TASK-011)

sync_core path-dep живёт **вне** Packages/ monorepo (в `Projects/Flutter/Packages/sync_core`). Regex extended для покрытия `(?:\.\.\/){4,}Projects\/...` patterns. См. `src/core/services/project_bootstrapper.ts`.

**Edge case:** patcher **non-idempotent** для out-of-monorepo paths (каждый run углубляет на 1 уровень). Acceptable потому что вызывается 1 раз в `create-project` bootstrap.

## References

### Codegen src

- `src/features/generation/generators/orchestrator_patcher.ts` — patcher implementation
- `src/features/generation/parsers/junction_detector.ts` — junction detection (TASK-013)
- `src/test/generators/orchestrator_patcher.test.ts` — unit-tests (empty/single/idempotent/junction/multi-sequential/recovery-duplicates/commutative + TASK-013 regression)
- `src/test/parsers/junction_detector.test.ts` — JunctionDetector unit-tests (structural / negative / dynamic regression / integration)
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

## TASK-013 — Resolved (2026-05-02)

Robust junction detection ✅ shipped. `endsWith('Map')` / `includes('Map')` heuristic заменены на shared `JunctionDetector.isJunctionEntity()` utility (3 production decision-paths). Detection через YAML field analysis (2+ FK + base-only fields = structural junction) + explicit `junction: true` override для junction-with-metadata cases. См. [ai/tasks/active/TASK-013-junction-detection-robust-yaml-field-analysis/task.md](../ai/tasks/active/TASK-013-junction-detection-robust-yaml-field-analysis/task.md).

Re-audit weight (37 YAML files) confirmed: RolePermission + CustomerUser correctly classified as junction; нет new false-negatives; нет false-positives. Hard gate ✅ closed для weight TASK-018.
