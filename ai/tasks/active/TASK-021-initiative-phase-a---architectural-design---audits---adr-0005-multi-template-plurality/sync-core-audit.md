# Sync_core dual-running audit (TASK-021 / Sub-A3)

**Status:** ✅ Complete
**Date:** 2026-05-03
**Author:** Sub-A3 executor (read-only audit, no code changes)
**Scope of review:** sync_core 0.3.0 master (path-dep `G:/Projects/Flutter/Packages/sync_core/`)
**Audit type:** Theoretical analysis (read-only); no runtime spike (per Discussion #10 Q3=a default)

---

## Executive summary

**Recommendation: Option C (Phase A proceeds with dedicated v2 testing scope as default mitigation; HIGH risk requires Option B fallback if mitigation cannot be applied at production cutover).**

Per Sub-A0.5 finding, weight v1 does **NOT** use sync_core — it operates a **custom** sync layer (`base_sync_repository.dart` + inline `syncStatus` column + custom Riverpod registry) speaking its own protocol to the **same** Serverpod backend. Weight v2 will be the **first** sync_core 0.3.0 client against this backend.

This audit therefore evaluates **dual-protocol** (v1 custom protocol + v2 sync_core protocol) on **same backend + same logical scope (customer)** rather than dual-`sync_core` deployment. The scenarios differ materially from a "two sync_core instances" framing.

| Risk | Severity | Affects | Mitigation |
|------|----------|---------|------------|
| Backend event stream contract gap (v1 mutations invisible to v2's `SyncRemoteEventAdapter`) | **HIGH** | Cross-device consistency v2 ↔ v1 | Server emit unified `SyncRemoteEvent` per entity mutation regardless of write source (v1 OR v2); OR Option C dedicated v2 testing scope until cutover |
| LWW timestamp skew between v1 client clock and v2 client clock | **MEDIUM** | Last-write-wins correctness when v1 + v2 mutate same entity | Server stamps `lastModified = serverNow()` on accept; client `lastModified` becomes proposal only |
| Outbox-coalescing per `(scope, entityType, entityId, deviceId)` does not see v1 mutations on the same entity | **MEDIUM** | v2 client may coalesce a stale local op while v1 already won server-side | Pull-on-event picks up server state; LWW resolves stale local override |
| v2 scope subscription lifecycle on logout/login in mixed v1+v2 install (same device) | **LOW** | Edge case if user has both apps installed concurrently | `_scopeGen` race protection (R3.5) handles re-subscribe; install policy decision |
| Resurrect attempt (delete + create) interleaved across v1 and v2 | **LOW** | Edge case requiring LWW + ConflictPolicy | Default `allowResurrect=false` throws `ResurrectAttemptException`; consumer handles via `enqueueResolved` |

**Phase A Closure verdict:** Phase A may proceed; ADR-0005 must reference this audit and codify dedicated v2 testing scope as default mitigation. **HIGH risk does not block Phase A** but **does block weight v2 production cutover** until either (a) backend event-emission contract is verified or (b) dedicated scope strategy is in place.

---

## Scope subscription lifecycle при v1+v2 на same backend

### ADR-0001/0002/0003/0004 review findings

#### [ADR-0001 § 1 Mutation-first] — status: **partial gap for dual-protocol**

ADR-0001 §1 specifies that each mutation atomically writes (a) domain row + (b) outbox operation in a **consumer-side** transaction. This guarantee is **per sync_core consumer**. In dual-protocol scenarios:

- v2 consumer holds the contract: `weight_v2.repository.update<T>` → `db.transaction { dao.update + orchestrator.enqueue }`
- v1 consumer is **outside** sync_core entirely — its `base_sync_repository.dart` writes to its own `syncStatus` inline column, then ships changes via custom Riverpod controller
- Both writes hit the **same Serverpod backend** server-side

**Implication:** ADR-0001 mutation-first invariant is **not violated** because each consumer is internally consistent. The cross-consumer race (v1 + v2 mutating same entity) collapses to a server-side problem (Serverpod RPC ordering / DB transaction semantics) — solvable, but **outside sync_core's contract surface**.

#### [ADR-0001 § 2 Push ≠ Pull] — status: **covered**

The push pipeline (outbox flush) and pull pipeline (`getChangesSince`) operate independently per ADR §2. v2 client push is unaffected by v1 client push (each ships its own RPCs to backend). v2 client pull (`getChangesSince(checkpoint)`) reads server state — which **does include** v1-applied changes by virtue of same backend. **No gap.**

#### [ADR-0001 § 3 Outbox state machine] — status: **covered**

State machine (`pending → inFlight → completed | retryable | dead`) is purely client-local per outbox row. v1 mutations don't write to v2's outbox. **No gap.**

#### [ADR-0001 § 4 Persistent backoff] — status: **covered**

Persistent `nextAttemptAt` is per outbox row, client-local. **No gap.**

#### [ADR-0001 § 5 Coalescing] — status: **gap requires acknowledgement**

Coalescing is per `(scope, entityType, entityId, deviceId)` — see [`outbox_coalescer.dart:28-39`](#outbox_coalescer.dart). The `deviceId` partition is critical: different devices are never coalesced. In dual-protocol on **same physical device**:

- v1 + v2 installed on same phone → presumably **different** `deviceId`s (each app generates its own via persisted UUID at first run)
- Coalescing in v2's outbox is unaware of any v1 mutation in flight via custom protocol

**Implication:** v2's coalescer can collapse a `create+update` into a single `create(latest payload)` as designed, but cannot account for a v1-side mutation that already hit the server. Pull-on-event flow (ADR-0003 §4) is the recovery mechanism.

#### [ADR-0001 § 6 Pure Dart + ADR-0002 Split adapters] — status: **covered**

Adapter pattern (`SyncRemoteWriteAdapter / SyncRemotePullAdapter / SyncRemoteEventAdapter`) is consumer-injected. v2 consumer implements all three against Serverpod RPC. v1 protocol is opaque to sync_core.

#### [ADR-0002 § serverEcho] — status: **covered with caveat**

`RemoteWriteResult.serverEcho` returns server-version with server-assigned timestamps after successful write. If server stamps `lastModified = serverNow()`, then v2 client's local row gets server timestamp via `applyServerEcho`. **This is the lever for solving LWW skew (MEDIUM risk below).**

#### [ADR-0003 § 1 Pull pagination + checkpoint] — status: **covered**

Pull cycle is client-local: `getChangesSince(checkpoint)` → page loop OUTSIDE `runInTransaction` → apply + advance checkpoint INSIDE single tx. Watermark = `lastPage.serverTime` per ADR §1 hard rule 2. v1 mutations land in server DB; v2 picks them up on next pull as part of `allChanges`. **No structural gap.**

#### [ADR-0003 § 3 AdapterBundle.eventAdapter] — status: **HIGH RISK gap**

`SyncRemoteEventAdapter.watchEvents(scope)` returns `Stream<SyncRemoteEvent>` from backend. The orchestrator calls this on `activateScope` (see [`sync_orchestrator.dart:335`](#sync_orchestrator.dart-335)) and triggers a pull on each event. **This depends entirely on the backend emitting events for ALL mutations regardless of source.**

If the Serverpod backend emits events only when `sync_core`'s server-side bundle method is invoked (per the `sync_event` YAML pattern in weight v1 server) and **does not** emit on v1's custom-protocol writes, then:

- v1 client mutates entity X via custom RPC → server applies change → **no event emitted**
- v2 client never receives `SyncRemoteEvent` for X → never triggers pull cycle → v2 sees stale data until manual `requestPull` or app restart

**Severity HIGH.** Depends on backend event emission contract. Sub-A0.5 audit documents that weight v1 server has paired `<entity>_sync_event.spy.yaml` per entity (sync_core 0.2.x semantic) — this strongly suggests events fire from a server-side hook tied to sync_core's RPC bundle, NOT from a generic database trigger. Verification required during weight v2 build / staging.

#### [ADR-0003 § 4 Scope lifecycle] — status: **covered for single-app; dual-app install edge case is LOW risk**

`activateScope(scope)` subscribes per-bundle to `eventAdapter.watchEvents(scope)`. `_scopeGen` (R3.5 Fix 3, [`sync_orchestrator.dart:72`](#sync_orchestrator.dart-72)) protects against concurrent activate/deactivate races. `deactivateScope` cancels subscriptions. `dispose()` auto-deactivates all scopes.

In dual-app install (v1 + v2 on same device, same user logged into both): each app holds its own orchestrator instance with its own scope subscriptions. They do not share state. **No structural gap** — just a question of whether dual-install is a supported user workflow.

#### [ADR-0004 § Q1 Cross-entity FK ordering] — status: **covered**

Sync_core does not order across entities; consumer's UI/Repository layer guarantees parent-before-child enqueue. In dual-protocol scenario the question reframes: v2 may enqueue `Task(categoryId=X)` while v1 has already created `Category(X)` server-side. Pull-on-event delivers `Category(X)` to v2 before its `Task(...)` flushes — **safe** assuming ADR-0003 §3 event emission is honored.

#### [ADR-0004 § Q2 FK violation handling] — status: **covered**

Server FK validation → 4xx → `RetryableSyncException` → backoff → eventually `dead`. `deadCount` monitoring per `SyncMetrics` is mandatory for production reliability per ADR-0004. **Applies to dual-protocol unchanged.**

#### [ADR-0004 § Q3-Q5 multi-entity scope] — status: **covered**

Per-scope granularity sufficient; subscription leak prevention validated; late `register` after `start()` supported. Dual-protocol scenario does not introduce new questions in this dimension.

---

### Scope code review (sync_core repo)

#### `lib/src/sync_orchestrator.dart`

- **`_bundles: Map<String, AdapterBundle<dynamic>>` (line 37)** — registry is process-local; each `SyncOrchestrator` instance has its own bundle map. **Behavior in dual-app:** safe (each app's orchestrator independent).
- **`_scopeSubscriptions: Map<SyncScope, Map<String, StreamSubscription>>` (line 60)** — subscriptions indexed by `SyncScope` and `entityType`. Per-scope lifecycle management. **Behavior in dual-protocol:** v2's subscription is local; cannot detect that v1 client is also subscribed against same backend (different physical orchestrator). **Safe** by isolation, but the audit's HIGH risk remains: backend must emit events to BOTH subscriptions.
- **`activateScope` (line 247-273)** — idempotent guard via `_scopeSubscriptions.containsKey(scope)` early-return. `_scopeGen` increment (R3.5 Fix 3) protects concurrent activate/deactivate. **Behavior in dual-app same scope:** if v1 and v2 both call `activateScope(SyncScope.userAndCustomer(42, 'abc'))`, each has its own orchestrator and own gen counter — no interference. **Safe.**
- **`_subscribeBundleForScope` (line 292-401)** — multiple guards: `_disposed`, `_scopeGen` mismatch, bundle unregistered mid-flight, final subscription replacement (`unawaited(existing.cancel())`). **Behavior in dual-protocol:** robust per single-app; cannot prevent backend from missing events for v1-source mutations.
- **`_onRemoteEvent` (line 549-578)** — early validation: bundle registered? `pullAdapter != null`? `localApply != null`? Then delegates to `_runPullCycle`. **Behavior in dual-protocol:** if event arrives, pull is triggered correctly. If event does not arrive (HIGH risk), this code is never invoked.
- **`_runPullCycle` + `_doPullCycle` (line 658-838)** — per-key serialization via `_pullInFlight: Map<({scope, entityType}), Future<PullResult>>` (R3.5 Fix 5, M2). Network OUTSIDE `runInTransaction`, apply + checkpoint INSIDE. **Behavior in dual-protocol:** v2's pull picks up v1's server-applied state correctly when triggered. The full server-state delta is included in `getChangesSince(checkpoint)` regardless of write source. **Safe** assuming pull is triggered (event-driven OR explicit `requestPull`).
- **`enqueue` (line 877-986)** — coalescing via `_store.runInTransaction { getCoalesceTarget → applyTransition → effect }`. `afterCommit` (R3.5 Bomb #4) defers debounced flush. **Behavior in dual-protocol:** v2's coalescer cannot see v1's outbox (it's in v1's own custom storage, not v2's `sync_queue` table). Coalescing decisions for v2 are made on v2-local outbox state only. Relies on pull-on-event recovery when v2's outbox decision is invalidated by v1 having already shipped a change.

#### `lib/src/contracts/sync_scope.dart`

- `SyncScope` is a value-equality wrapper around a string `key` (line 8-32). Factory constructors: `userAndCustomer(int, String)`, `userOnly(int)`, `global()`, `custom(String)`. **Behavior in dual-protocol:** scope key is just an identifier. v1 and v2 generating the same `key` for the same `(user, customer)` is the **expected** behavior — that's how they share data. **Safe.**

#### `lib/src/contracts/adapter_bundle.dart`

- `AdapterBundle<T>` is immutable, holds `writeAdapter` + `codec` + optional `localApply` + `pullAdapter` + `eventAdapter` (line 12-52). Single-typed per ADR-0003 §3 (no `<TEvent>` viral typing). **Behavior in dual-protocol:** consumer-defined; unaffected.

#### `lib/src/contracts/sync_orchestrator_config.dart`

- Config holds retention, retry, debounce, batch parameters + R3.5 event stream re-subscribe knobs (`eventStreamRetryBaseDelay`, `eventStreamRetryMaxAttempts`). **Behavior in dual-protocol:** config is per-orchestrator instance; v1 and v2 have independent configs. **Safe.**

#### `lib/src/contracts/sync_remote_event.dart`

- `SyncRemoteEvent` is a value object: `entityType` + optional `entityId` + optional `serverTime` (line 17-47). Consumer maps backend-specific event format to this normalized DTO inside its `SyncRemoteEventAdapter` impl. **Behavior in dual-protocol:** the contract is fine; the question is **which backend events get mapped**. If v1 server-side custom-protocol writes do not produce events on the streaming endpoint v2 subscribes to, v2's adapter never emits them.

#### `lib/src/outbox/outbox_state_machine.dart`

- Pure state machine: `onAdapterSuccess`, `onAdapterError` (with classification → `dead` for `DeadSyncException`, `retryable` with backoff for `RetryableSyncException`, `dead` after `maxRetry` exceeded), `onRecover`, `onResurrect`. No I/O, no storage. **Behavior in dual-protocol:** state machine is per outbox row, not per scope or entity — fully isolated to v2's outbox. **Safe.**

#### `lib/src/outbox/outbox_coalescer.dart`

- Pure coalesce table per `(scope, entityType, entityId, deviceId)`. `assert(existing.deviceId == newOp.deviceId)` (line 29) enforces deviceId partition. Returns `CoalesceAction` sealed class. **Behavior in dual-protocol:** coalesces only v2-local mutations within v2's outbox. Cannot account for v1 mutations on the same entityId — but this is **by design**, since the deviceId of v1 client (different from v2's deviceId on the same physical device, since each app generates its own UUID) would not match anyway. The recovery mechanism is pull-on-event LWW.

#### `lib/src/outbox/outbox_flusher.dart`

- Bounded one-shot flush, `due` query (status pending/retryable, nextAttemptAt due), `markInFlight → adapter.create/update/delete → markCompleted | classify error → markRetryable | markDead`. `_DynamicBundleInvoker.invokeWrite` decodes payload and calls `writeAdapter.create/update`, then `localApply.applyServerEcho(serverEcho)` if non-null. **Behavior in dual-protocol:** v2's flush is per v2-outbox; sends to backend. If backend rejects with FK or conflict (because v1 raced ahead) → `RetryableSyncException` → backoff retry. After v1's data has propagated to server, retry succeeds. **Safe.**

#### `lib/src/conflict/lww_resolver.dart` and `conflict_policy.dart`

- LWW comparator: later `lastModified` wins → tie-break by `deviceId` ascending → tie-break by `operationId` ascending (UUID v7 temporal ordering). **Behavior in dual-protocol:** compares v2-local `lastModified` against server-returned `lastModified`. **CRITICAL DEPENDENCY:** if v1 client computes `lastModified = millisecondsSinceEpoch` from its local clock, and v2 client computes `lastModified` from its local clock, **clock skew between two devices** can cause LWW to favor the wrong winner. This is the MEDIUM risk #2 below.

---

### Mutation race scenarios (theoretical analysis)

#### Scenario 1: v1 + v2 одновременно mutate same entity

**Setup:** User has `Configuration(id=42)` on backend. v1 app on Phone A and v2 app on Phone B (or same phone, dual install). Both apps logged into same `(user, customer)`. Within ~1 second:

- v1 user toggles `darkMode = true` → v1's custom protocol ships `update(Configuration(id=42, darkMode=true, lastModified=t1))` → server applies, sets `lastModified = serverT1` (assuming server-stamps timestamps; if v1 protocol relies on client `lastModified` directly, then `lastModified = t1`)
- v2 user toggles `language = 'ru'` → v2's `repository.update` → outbox enqueues `update(Configuration(id=42, language='ru', lastModified=t2))` → orchestrator flushes → server applies

**Server-side outcome:** depends on server logic. Assuming standard "last write wins on the row":
- If v2's update arrives second and **overwrites** the entire row, it loses v1's `darkMode = true` change (v2 sent the whole entity including stale `darkMode=false`)
- If server does column-level merge (unlikely without explicit support), both changes preserved

**v2 client outcome:** server returns `serverEcho` for v2's write. `applyServerEcho` writes server's response to v2 local DB. If event emission honored (HIGH risk above), v2 receives `SyncRemoteEvent(Configuration, id=42)` for v1's earlier write → triggers pull → `getChangesSince` returns server's current state → `applyServerEcho` overwrites v2's local row with server's authoritative state → **safe** assuming server-side serialization gives correct final state.

**Failure mode if HIGH risk materializes:** v2 never gets event for v1's write → v2's `serverEcho` from its own write contains the column values it sent (including `darkMode = false` it overwrote without realizing) → v2 displays inconsistent state until next manual pull / app restart.

**Coalescing impact:** v2's outbox coalescer only sees v2-local ops. If v2 user toggles language twice in succession, coalescer collapses to one `update(latest)`. Cannot account for v1's interleaved write — relies on pull-on-event recovery.

**Verdict:** Race correctness depends on (a) backend event emission for v1-source writes (HIGH), and (b) server-side write ordering semantics (out of sync_core scope, server design responsibility).

#### Scenario 2: v1 + v2 одновременно subscribe same scope

**Setup:** Both apps logged in. Both call `activateScope(SyncScope.userAndCustomer(42, 'abc'))` (or v1's equivalent custom subscription).

**v2 side (sync_core 0.3.0):** see [`sync_orchestrator.dart:247-273`](#sync_orchestrator.dart-247). Idempotent guard early-returns if `_scopeSubscriptions.containsKey(scope)`. `_scopeGen[scope]` incremented. For each registered bundle with `eventAdapter != null`, calls `_subscribeBundleForScope`, which creates a `StreamSubscription` to `eventAdapter.watchEvents(scope)`.

**v1 side:** uses custom Riverpod controller — opaque to sync_core, but logically subscribes to **the same backend stream endpoint** (assuming weight v1 ↔ weight v2 share the streaming RPC).

**Backend behavior:** Serverpod streaming RPC fan-out — N subscribers per scope all receive each event. Both apps receive their own copy. **No structural conflict** at sync_core layer; concurrency is fully on the server stream broker.

**Edge case (LOW):** if backend uses connection-affinity load balancing or one-of-N delivery (NOT a fan-out broker), only one app receives each event. This is a **server design choice** — Serverpod default streaming endpoints fan-out per-subscriber. Verification trivially possible during staging.

**Verdict:** v2 subscription mechanics correct; v1 subscription is opaque but parallel; safe assuming backend fan-out semantics.

#### Scenario 3: v1 + v2 mutate different entities в same scope (typical case)

**Setup:** v1 mutates `Vehicle(id=A)`, v2 mutates `Driver(id=B)`. Same `(user, customer)` scope.

**v2 outbox:** holds only `Driver(id=B)` mutation. Coalescer key is `(scope, "Driver", "B", v2_deviceId)` — no conflict with v1's `Vehicle(id=A)`.

**v2 pull pipeline:** if backend emits event `SyncRemoteEvent(entityType="Vehicle", entityId="A")` after v1 ships its mutation, v2's `_onRemoteEvent` triggers pull cycle for `Vehicle` entityType → `getChangesSince(checkpoint)` returns `[Vehicle(A, ...)]` → applies via `localApply` → checkpoint advanced.

**Verdict:** **safe** assuming backend event emission contract is honored. This is the **typical** case and the recommendation strategy hinges on it working.

#### Scenario 4: v1 + v2 same backend event stream/subscription — multi-mutator backend pull/push semantics

**Setup:** Backend has its own event broker (e.g., Serverpod streaming endpoint, or Postgres LISTEN/NOTIFY trigger). The question: what triggers an emit?

**Two possible designs:**

- **Design A (RPC-coupled emit):** Server emits event only when sync_core's server-side bundle method is invoked (the typical `<entity>_sync_event.spy.yaml` pattern from weight v1 server, where `sync_event` is fired by the Serverpod endpoint method that sync_core's `SyncRemoteWriteAdapter` calls). v1's custom protocol calls **different** Serverpod endpoints — those endpoints **may or may not** also emit on the same event topic. **HIGH risk if they don't.**

- **Design B (DB-trigger emit):** Server emits event from a database trigger or transactional outbox at the server, capturing all writes regardless of which RPC path made them. **Safe for dual-protocol.** v1 mutations propagate to v2.

**Pull pipeline for v2 multi-page:** `getChangesSince(checkpoint)` returns full server delta from any source. **Safe** when triggered. But if not triggered (Design A failure), v2 is stuck with stale data.

**Recommended verification (out of audit scope, into weight v2 build):**
1. Test with two clients (v1 staging build + v2 staging build) on same backend
2. Mutate from v1 client, observe whether v2 client's `_onRemoteEvent` log line fires (debug log: `subscribed scope=... entityType=...`)
3. If event does not fire → backend is Design A and dual-protocol cross-device sync is broken without server changes

**Verdict:** **HIGH risk pending verification.** Cannot be resolved by sync_core code changes — requires backend event emission contract guarantee.

#### Scenario 5: Soft-delete tombstone propagation v1 → v2 (Sub-A5 Sync reviewer addition)

**Setup:** weight v1 schema includes `isDeleted bool` field на каждой entity (per Sub-A0.5 weight-v1-schema-audit.md `WeighingTable.isDeleted`). v1 user soft-deletes `Configuration(id=42)` via custom protocol → server applies tombstone (`isDeleted=true`).

**v2 outbox state:** v2 имеет pending `update(Configuration(id=42, language='ru'))` op в outbox (queued before v1's delete).

**Race timeline:**
- T=0: v1 mutates `delete Configuration(id=42)` → server applies tombstone
- T=0.5s: v2's outbox flusher attempts `update Configuration(id=42, language='ru')`
- T=1s: server response — depends на server semantics:
  - **Option A:** Server treats update of tombstoned entity as "entity not found" → returns 404 / `RetryableSyncException` → v2 outbox retries → eventually `dead`
  - **Option B:** Server "resurrects" with update payload → entity reappears с `isDeleted=false, language='ru'` → contradicts v1's intent
  - **Option C:** Server preserves tombstone, ignores update silently → v2 client thinks update succeeded but server rejects (silent inconsistency)

**v2 pull pipeline (assuming HIGH risk resolved):** v2 receives `SyncRemoteEvent(Configuration, id=42)` for v1's delete → triggers pull → `getChangesSince` returns `Configuration(id=42, isDeleted=true)`. **`LocalApplyAdapter.applyServerPull` contract:** sync_core ADR-0001 + ADR-0002 silent на whether `localApply` should treat `isDeleted=true` как DELETE on local row или как UPDATE preserving the row. This is **consumer-side discipline gap** — requires explicit decision в weight v2 build.

**Severity:** **MEDIUM** (assuming HIGH risk resolved + pull-on-event recovery works). Если HIGH unresolved → cascades up к HIGH (no recovery).

**Mitigation:**
- ADR-0005 codifies "v2 `LocalApplyAdapter` treats `isDeleted=true` from server pull as DELETE на local row" — consumer convention.
- Sync_core ADR amendment (Option B) optionally formalizes tombstone semantic в `LocalApplyAdapter` contract.
- Server endpoint contract (weight v2): documented behavior для update-of-tombstoned-entity (preferred Option A — return error, не resurrect silently).

**Verdict:** Consumer-side discipline gap (Sub-A5 catch). ADR-0005 must address (added к Section 4.3 sub-section).

---

### Risk classification

#### **HIGH-pending-verification (blocks weight v2 production cutover; does NOT block Phase A closure):**

1. **Backend event stream emission gap for v1-source mutations.** If Serverpod backend emits events only on sync_core's bundle endpoints (Design A above) and v1's custom-protocol writes go through different endpoints, then v2 client never receives `SyncRemoteEvent` for v1-source writes → no pull triggered → v2 sees stale data.
   - **Affects:** all cross-device + cross-protocol read consistency for v2.
   - **Severity classification (Sub-A5 Sync reviewer fix):** HIGH **conditional на Design A**. Verification cheap (~30 min spike — v1 staging client mutation + v2 staging client log observation). If verification proves Design B (DB-trigger / unified emit), HIGH демотируется к LOW immediately; Option C mitigation может быть lifted before Phase A merge. **Recommended:** schedule verification spike before Sub-A6 ADR-0005 finalize, not after; defaults к dedicated scope если verification deferred.
   - **Cannot be fixed in sync_core lib/.** Requires либо (a) backend changes для emit events on unified path covering both protocols, либо (b) Option C dedicated v2 testing scope until cutover.
   - **Detection:** must be verified in weight v2 staging triggering v1 mutation + observing v2 event log.

#### **MEDIUM (mitigation needed in v2 build, NOT in sync_core):**

2. **LWW timestamp skew (v1 ↔ v2 client clocks).** Default `LwwTieBreaker` (line 63-86 of `conflict_policy.dart`) compares `lastModified` first. If both v1 and v2 use **client-side** `millisecondsSinceEpoch` for `lastModified`, two devices with skewed clocks (NTP drift, no time sync) can produce wrong LWW results.
   - **Affects:** correctness of conflict resolution when v1 + v2 mutate same entity within seconds.
   - **Mitigation 1 (preferred):** server stamps `lastModified = serverNow()` on accept; `serverEcho` returns canonical timestamp; v2 `applyServerEcho` writes server's value to local DB. v1 client must follow the same convention.
   - **Mitigation 2 (fallback):** consumer overrides `LwwTieBreaker` with a domain-specific tie-breaker that ignores client clock and uses server-assigned `lastModified` exclusively. Per ADR-0001 §6, sync_core does not own server contract — this is consumer/server responsibility.
   - **Documentation gap:** ADR-0001 / ADR-0003 do not prescribe server-stamp policy explicitly. Recommendation: ADR-0005 should reference this and enforce the convention as part of weight v2 server endpoint contract.

3. **Coalescing blindness to cross-protocol mutations.** v2 outbox coalescer (per `(scope, entityType, entityId, v2_deviceId)`) cannot see v1's mutations. Worst case: v2 user creates+updates entity X; coalescer collapses to single `create(latest)`; meanwhile v1 has already created entity X with a different value server-side. v2's `create` rejected by server (PK conflict or already exists) → `RetryableSyncException` → eventually `dead`.
   - **Affects:** correctness when both v1 and v2 actively create the same entity simultaneously (rare but possible during data import / first-sync).
   - **Mitigation:** server returns `RemoteWriteResult.isDuplicate = true` for already-applied; sync_core treats as success per ADR-0002. Requires server endpoint to support idempotent create with deterministic id (UUID v7 in payload).
   - **No sync_core code change needed**, but server contract verification required.

#### **LOW (acceptable, document workaround):**

4. **Dual-app install on same physical device.** If a single user has both v1 and v2 apps installed concurrently, each holds its own `SyncOrchestrator` instance with separate `deviceId`s and separate scope subscriptions. State is not shared. Backend sees both as distinct devices in `LwwTieBreaker.deviceId` ordering.
   - **Affects:** edge case for users straddling rollout. Dual-install is uncommon for the same logical user.
   - **Mitigation:** install policy decision (e.g., v2 install signals v1 to log out; or v1 hides itself when v2 detects it). Operational, not architectural. Sync_core does not impose any restriction.

5. **Resurrect attempt across protocols.** v1 deletes entity X (server applied); v2 user (unaware) creates same entity X with same id. v2 outbox enqueues `create`; server returns conflict (PK exists with `isDeleted=true` tombstone). v2's `RetryableSyncException` → backoff → eventually consistent with server.
   - **Mitigation:** default `ConflictPolicy.allowResurrect = false` throws `ResurrectAttemptException` in v2's coalescer when both ops are local; in cross-protocol case, the resurrect logic is purely server-side (v2 doesn't see v1's delete in its own outbox). Server-side resurrect is server's policy choice.

---

### Recommendation

**Choose ONE:**

- **Option A:** ❌ Phase A proceeds, no mitigation noted — REJECTED. Backend event emission contract gap (HIGH) is too consequential to leave undocumented.

- **Option B:** ⚠ Phase A escalates fix-task to sync_core repo. **Partially applicable (Sub-A5 Sync reviewer fix):** sync_core lib/ requires no code change, BUT **ADR amendment recommended в sync_core repo** — formalize backend event-emission contract surface + server-stamp `lastModified` convention as part of `SyncRemoteEventAdapter` + `SyncPayloadCodec` adapter contract. Currently ADR-0001 / ADR-0003 are silent на server-stamp policy (genuine documentation gap; verified via grep — `serverNow()` mention 0 в всех 4 ADRs). **Open ADR-0006 fix-task в sync_core repo** to formalize backend contract surface + server-stamp convention. **Complementary к Option C, не mutually exclusive.** Sync_core's responsibility ends at "consumer mapper turns backend events into `SyncRemoteEvent`" — но contract обязательств backend (что MUST emit / что MUST stamp) deserves formal documentation в ADR amendment.

- **Option C:** ✅ **RECOMMENDED.** Phase A proceeds with **dedicated v2 testing scope** as default mitigation strategy, recorded in ADR-0005:
  1. **Default policy:** weight v2 staging and beta builds use a **separate customer scope** (e.g., `customer = 'v2_staging_<userId>'`) until backend event emission contract is verified end-to-end.
  2. **Verification artifact (defer to weight v2 build, not Phase A):** during weight v2 build, a dedicated smoke test verifies that v2 client receives `SyncRemoteEvent` for mutations originated from a v1 staging client on the **same** backend. If this test passes, dedicated-scope mitigation is lifted before production cutover.
  3. **If verification fails:** weight v2 build either (a) blocks production cutover until backend emits events for v1-source writes (separate weight server task), or (b) accepts dedicated-scope as the production strategy (effectively running v2 as a parallel walled garden — viable but reduces "Option 1 same backend" benefit; would re-trigger Sub-A0.5 Trigger 2 evaluation).
  4. **MEDIUM risk #2 (LWW skew):** ADR-0005 codifies "server stamps `lastModified`" convention for weight v2 server endpoints. v1 server convention reviewed during weight v2 build for parity.
  5. **MEDIUM risk #3 (coalescing blindness):** ADR-0005 codifies "server endpoints support idempotent create with deterministic UUID v7 id" convention.

**Phase A closure verdict:** Phase A may close. ADR-0005 must reference this audit and codify Option C mitigation. **Phase A-D gate cannot close** without (a) Option C mitigation in place AND (b) verification plan documented for weight v2 build.

---

## Files / sections referenced

**Sync_core ADRs:**
- [G:/Projects/Flutter/Packages/sync_core/ai/docs/decisions/adr-0001-outbox-first-architecture.md](G:/Projects/Flutter/Packages/sync_core/ai/docs/decisions/adr-0001-outbox-first-architecture.md)
- [G:/Projects/Flutter/Packages/sync_core/ai/docs/decisions/adr-0002-split-write-pull-event-adapters.md](G:/Projects/Flutter/Packages/sync_core/ai/docs/decisions/adr-0002-split-write-pull-event-adapters.md)
- [G:/Projects/Flutter/Packages/sync_core/ai/docs/decisions/adr-0003-syncqueuestore-runintransaction-and-adapter-bundle-events.md](G:/Projects/Flutter/Packages/sync_core/ai/docs/decisions/adr-0003-syncqueuestore-runintransaction-and-adapter-bundle-events.md)
- [G:/Projects/Flutter/Packages/sync_core/ai/docs/decisions/adr-0004-multi-entity-runtime-guidance.md](G:/Projects/Flutter/Packages/sync_core/ai/docs/decisions/adr-0004-multi-entity-runtime-guidance.md)

**Sync_core code (read-only):**
- [G:/Projects/Flutter/Packages/sync_core/lib/src/sync_orchestrator.dart](G:/Projects/Flutter/Packages/sync_core/lib/src/sync_orchestrator.dart) — orchestrator, scope lifecycle, pull pipeline, enqueue+coalesce
- [G:/Projects/Flutter/Packages/sync_core/lib/src/contracts/sync_scope.dart](G:/Projects/Flutter/Packages/sync_core/lib/src/contracts/sync_scope.dart) — scope key value object
- [G:/Projects/Flutter/Packages/sync_core/lib/src/contracts/adapter_bundle.dart](G:/Projects/Flutter/Packages/sync_core/lib/src/contracts/adapter_bundle.dart) — bundle definition (write+codec+localApply+pull+event)
- [G:/Projects/Flutter/Packages/sync_core/lib/src/contracts/sync_orchestrator_config.dart](G:/Projects/Flutter/Packages/sync_core/lib/src/contracts/sync_orchestrator_config.dart) — config defaults
- [G:/Projects/Flutter/Packages/sync_core/lib/src/contracts/sync_remote_event.dart](G:/Projects/Flutter/Packages/sync_core/lib/src/contracts/sync_remote_event.dart) — normalized event DTO
- [G:/Projects/Flutter/Packages/sync_core/lib/src/outbox/outbox_state_machine.dart](G:/Projects/Flutter/Packages/sync_core/lib/src/outbox/outbox_state_machine.dart) — pure state machine
- [G:/Projects/Flutter/Packages/sync_core/lib/src/outbox/outbox_coalescer.dart](G:/Projects/Flutter/Packages/sync_core/lib/src/outbox/outbox_coalescer.dart) — coalesce table per `(scope, entityType, entityId, deviceId)`
- [G:/Projects/Flutter/Packages/sync_core/lib/src/outbox/outbox_flusher.dart](G:/Projects/Flutter/Packages/sync_core/lib/src/outbox/outbox_flusher.dart) — bounded one-shot flush + serverEcho apply
- [G:/Projects/Flutter/Packages/sync_core/lib/src/conflict/lww_resolver.dart](G:/Projects/Flutter/Packages/sync_core/lib/src/conflict/lww_resolver.dart) — LWW comparator
- [G:/Projects/Flutter/Packages/sync_core/lib/src/conflict/conflict_policy.dart](G:/Projects/Flutter/Packages/sync_core/lib/src/conflict/conflict_policy.dart) — ConflictPolicy + DefaultLwwTieBreaker

**Codegen Phase A context:**
- [task.md](task.md) — TASK-021 contract + Sub-A3 plan
- [weight-v1-schema-audit.md](weight-v1-schema-audit.md) — Sub-A0.5 evidence (weight v1 NOT using sync_core)
- [backend-strategy-rationale.md](backend-strategy-rationale.md) — Sub-A1 Option 1 confirmed
- [G:/Projects/vs_code_extensions/code-generator/ai/discussions/archive/9-weight-v2-fresh-build-на-simplified-temp/](G:/Projects/vs_code_extensions/code-generator/ai/discussions/archive/9-weight-v2-fresh-build-на-simplified-temp/) — Discussion #9 Observation #2 (dual-running audit obligatory)
- [G:/Projects/vs_code_extensions/code-generator/ai/discussions/archive/10-initiative-phase-a-simplified-template-a/](G:/Projects/vs_code_extensions/code-generator/ai/discussions/archive/10-initiative-phase-a-simplified-template-a/) — Discussion #10 Q3=a+c specification
