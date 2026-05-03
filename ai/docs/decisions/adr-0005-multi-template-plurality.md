# ADR-0005: Multi-template plurality + simplified architecture

**Status:** ✅ Accepted (User counter-signed 2026-05-03)
**Date:** 2026-05-03
**Authors:** Discussion #7 (informal multi-template plurality decision) + Discussion #10 (Phase A organization formalization) + TASK-021 Sub-A2 executor
**Supersedes:** —
**Superseded by:** —

---

## Контекст

После Phase 1.5 closure (TASK-019 ✅) + HOTFIX-001 ✅ + TASK-020 (TASK-CI-001 CI gate) ✅ накопились следующие architectural pressures:

1. **t115 Clean Architecture overhead.** Concrete audit (t164): 24 author-written files на entity (~3382 LOC), 96 файлов на feature, 8 BUGs обнаружены за 1 день — directly attributed к multi-layer generation complexity. Generator harder to maintain than the apps it generates.
2. **CRUD usecase generation = architectural noise.** `GetTaskByIdUseCase` / `CreateTaskUseCase` per CRUD method = **wrong thing being generated** (Robert Martin's authors сами критиковали этот antipattern). Clean Architecture's value lives на business layer (real workflows: «создать накладную с проверкой кредитного лимита»), не CRUD plumbing.
3. **Sync_core 0.3.0 contract** added 5 adapter files per entity — суммарно 12+ generated files на entity (Clean's 7 + sync's 5). Каждый new architecture concern multiplies, не adds.
4. **Discussion #7 (archived 2026-05-03)** raised "Clean architecture overhead — стоит ли упрощать"; convergence 3 agents (TeamLead + Chatgpt_1 + Claude_1) → **multi-template plurality** decision (informal).
5. **Discussion #9 (archived 2026-05-03)** pivoted weight v2 strategy от migration на t115 → fresh build на simplified template; backend strategy = first Phase A architectural decision.
6. **Discussion #10 (archived 2026-05-03)** finalized Phase A organization (4-agent convergence — TeamLead + Claude_1 + Chatgpt_1 + ClaudeN_1; 13-point Decision); этот ADR = **canonical formalization** Discussion #7 решения с refinements от Discussion #10 (anti-examples generate-side + migration-side, Phase C amendment clause, TBD placeholders Phase B-D).

**References:**
- [Discussion #7 archive](../../discussions/archive/7-clean-architecture-overhead-стоит-ли-упр/) — multi-template plurality original decision
- [Discussion #9 archive](../../discussions/archive/9-weight-v2-fresh-build-на-simplified-temp/) — weight v2 fresh build pivot + decision matrix v1 maintenance + backend strategy options
- [Discussion #10 archive](../../discussions/archive/10-initiative-phase-a-simplified-template-a/) — Phase A organization 13-point Decision

---

## Решение

ADR-0005 фиксирует следующие 7 architectural commitments:

### 1. Multi-template plurality

Codegen tool принимает **multi-template architecture**. Coexisting templates:

- **`t115` (Clean / advanced):** existing template, full Clean Architecture с usecases / notifiers / repository interfaces / multi-layer notifier hierarchy. Stays maintained для:
  - weight v1 production support (critical-only fixes per Discussion #9 decision matrix — **NB:** decision matrix User approval = separate Sub-A6 STOP-gate, см. task.md acceptance #82; на момент ADR sign-off matrix имеет статус «recommended Discussion #9, awaiting User counter-sign»)
  - future projects requiring full Clean ceremony (multi-developer team с extensive widget/integration testing)
- **`simplified` (new):** stripped-down template, generating только schema-derived infrastructure:
  - Drift table + DAO (CRUD queries)
  - Repository implementation (delegation plumbing + sync_core boundary)
  - sync_core 5 adapters per entity (sync_core 0.3.0 contract)
  - Riverpod data providers (factory bindings)
  - Mappings (`toEntity` / `toModel` extension methods)

  Business layer (usecases, application services, validation, custom notifiers с business logic) — **manual write**.

**Template selection** через CLI flag `--template <name>` (Phase D scope). **Default template TBD в Phase D**, selected по criteria: (a) which template applies to majority new projects post-Phase A-D? (b) which template имеет full Initiative validation (weight v2 build)? Strong indication = `simplified` based на Discussion #9 framing (weight v2 = first user, t115 = legacy maintenance only), но binding decision deferred Phase D until simplified prototype validated через synthetic t<200> + first weight v2 entities side-by-side.

**Mixed-template boundary rule (Discussion #7 Q3=b):**
- **Single template per feature** internally (внутри одного bounded context)
- **Multi-template только на bounded context boundary** (новый feature directory)
- weight v1 (Clean) и weight v2 (simplified) = **separate apps**, не intra-app drift — boundary rule satisfied trivially

### 2. Simplified architecture (Discussion #7 Q3=b с boundaries)

**Simplified template layers:**

- **Drift table + DAO** — CRUD queries, schema-derived, mechanical generation
- **Repository implementation** — delegation plumbing + sync_core boundary, **atomic transaction site** (`_db.transaction { dao.insert + orchestrator.enqueue }`). НЕ god service — DAO/sync adapters остаются отдельными классами
- **sync_core 5 adapters per entity** (sync_core 0.3.0 contract):
  - `<entity>_remote_adapter.dart` (`SyncRemoteWriteAdapter` impl)
  - `<entity>_pull_adapter.dart` (`SyncRemotePullAdapter` impl)
  - `<entity>_event_adapter.dart` (`SyncRemoteEventAdapter` impl, опционально)
  - `<entity>_payload_codec.dart` (`SyncPayloadCodec` impl)
  - `<entity>_local_apply.dart` (`LocalApplyAdapter` impl)
- **Riverpod data providers** — factory bindings (DI), no business logic
- **Notifier** — UI state, **manual write** (generated stub только если необходимо для DI parity)
- **UseCase** — opt-in для real business logic (multi-entity workflow, validation, policy enforcement), **manual write**

**Layer count varies (3-7 per entity)** based на actual complexity, не fixed schema. Простая lookup entity = 3 layers (Drift table + DAO + Repository); entity с workflow = +UseCase (4); entity с UI state machine = +Notifier (5).

### 3. Generate-vs-not-generate divider

**Принцип** (Robert Martin's anti-CRUD-usecase principle):
> Генерируй то, что **не имеет business judgment** (mechanical, schema-derived). Не генерируй то, что **varies per business need** (manual write когда есть real workflow).

#### 3.1 Generate (boilerplate, mechanical, no business judgment)

| Категория | Что | Почему |
|---|---|---|
| Drift table | `XxxTable extends Table { ... }` | Schema-derived от Serverpod YAML |
| DAO | `XxxDao` с CRUD queries (`getX`, `getXById`, `insertX`, `updateX`, `deleteX`) | Mechanical from table |
| Repository implementation | Delegation methods + sync_core wire-up (atomic transaction site) | sync_core 0.3.0 mutation-first contract requires Repository = atomic transaction site |
| sync_core adapters (5 files per entity) | `<entity>_remote_adapter.dart`, `<entity>_pull_adapter.dart`, `<entity>_event_adapter.dart`, `<entity>_payload_codec.dart`, `<entity>_local_apply.dart` | sync_core 0.3.0 contract requirement (per ADR-0001/0002 sync_core) |
| Riverpod data providers | `xxxDaoProvider`, `xxxRepositoryProvider`, `xxxLocalApplyProvider` | Mechanical DI factory bindings |
| Mappings | `toEntity`, `toModel` extension methods | Mechanical schema↔domain conversion |

#### 3.2 NOT generate (varies per business need, manual write)

- **Usecases** (CRUD usecase = architectural noise per Robert Martin). UseCase появляется когда есть **real business logic** (multi-entity workflow, validation, policy enforcement) — пишется **вручную** в момент возникновения need
- **Application services** (multi-entity workflow coordination)
- **Notifiers / state providers с business logic** (UI-specific, manual write)
- **Validation rules** (business rule, varies per entity semantics)
- **Filter providers с domain queries** (UI-specific filtering logic)

#### 3.3 Optional via CLI flag

- **Repository interface** (`abstract class XxxRepository { ... }`) — `--with-interfaces` flag, **default OFF** (per Discussion #10 Q5=b principle + ClaudeN migration-side anti-examples — interfaces по-умолчанию = legacy Clean ceremony, manual opt-in only). Включается только если consumer проект практикует mock-based unit testing repository layer и требует interface для mock isolation.

#### 3.4 Generate-side anti-examples (что generator НЕ должен emit)

Для каждой generate-категории — concrete ✅/❌ examples constraining over-generation. Pre-empts «executor interprets ADR generously, добавляет ceremony».

##### 3.4.1 Generate Repository implementation

✅ **DO generate:**

- **Delegation methods:**
  ```dart
  Future<List<X>> getX() => _localDataSource.getX();
  Future<X?> getXById(UuidValue id) => _localDataSource.getXById(id);
  ```
- **Sync_core wire-up (atomic transaction site):**
  ```dart
  Future<UuidValue> createX(X entity) => _db.transaction(() async {
    final id = await _dao.insertX(entity);
    await _orchestrator.enqueue(scope, EntityType.x, id, EntityOperation.create, payload);
    return id;
  });
  ```

❌ **DO NOT generate:**

- **Caching layer внутри repository** (manual decorator если consumer хочет кэш)
- **Transaction retry logic** (sync_core handles retries через outbox state machine + persistent backoff)
- **Multi-entity coordination beyond junction parent/child atomic transactions** (полные application services = manual scope). Junction entities (per sync_core ADR-0004 Patterns 6-7 + codegen TASK-014) — НЕ считаются multi-entity coordination: generator emits atomic parent + junction insert (per junction adapter generation) как single repository transaction.
- **Custom error wrapping в Either/Result types** (Drift errors propagate напрямую; custom error types — opt-in manual)
- **Logging beyond `LoggerService.error` в catch** (per ADR-0001 в codegen — single `LoggerService.error(...)`, не structured per-method audit logs)

##### 3.4.2 Generate sync_core adapters

✅ **DO generate:**

- **Mechanical implementation 5 contract methods** (per sync_core 0.3.0 ADR-0001 contracts list):
  - `SyncRemoteWriteAdapter`: `create / update / delete` → server RPC
  - `SyncRemotePullAdapter`: `getChangesSince(lastSyncAt)` → server batch fetch
  - `SyncRemoteEventAdapter` (опционально): real-time stream subscribe
  - `SyncPayloadCodec`: `encode(entity) → JSON`, `decode(JSON) → entity`
  - `LocalApplyAdapter`: `applyRemoteChange(entity)` → DAO upsert

❌ **DO NOT generate:**

- **Business logic в adapter методах** (e.g., FK validation внутри `LocalApplyAdapter.applyRemoteChange` — это server's job per sync_core ADR-0004 Q2)
- **Custom error handling beyond contract** (`SyncException` hierarchy — sync_core's contract; добавление consumer-specific exceptions = manual)
- **Conflict resolution policy** (sync_core delegates conflict через `ConflictPolicy` injection — generator emits default `last-write-wins`; custom policies = manual)
- **Per-entity scope logic** (scope = consumer's responsibility per sync_core ADR-0004 Q3 — `customer_X` scope name выбирается consumer'ом, не adapter'ом)

##### 3.4.3 Generate Drift table

✅ **DO generate:**

- **Schema-derived columns** (типы маппятся от Serverpod YAML field types: `String → text()`, `int → integer()`, `DateTime → integer().map(MillisecondEpochConverter())()`)
- **FK references** (`integer().references(ParentTable, #id)()`)
- **Standard sync fields** (`userId`, `customerId`, `id`, `createdAt`, `lastModified`, `isDeleted` — sync_core 0.3.0 mandatory, per agent_memory.md)
- **Index hints для FK columns** (Drift `@TableIndex` если YAML specifies)

❌ **DO NOT generate:**

- **Custom `customStatement` migrations** (manual в migration strategy per Drift conventions)
- **Computed / virtual columns с business semantics** (`age = currentYear - birthYear` — manual)
- **Trigger-based denormalization** (e.g., `terminalSetId` snapshot pattern per weight ADR-0014 — manual, intentional bounded context decision)
- **`syncStatus` inline column на sync-covered entities** (legacy weight v1 pattern; sync_core 0.3.0 outbox-first invariant requires separate `sync_queue_table`, не denormalized inline). **Excluded from rule:** local-only entities (opt-out from sync_core registration) — для них inline marker остаётся consumer's choice, generator simply не emits sync infrastructure для таких entities.

##### 3.4.4 Generate Riverpod data providers

✅ **DO generate:**

- **Factory bindings** для DAO / Repository / sync_core adapters / LocalApplyAdapter (illustrative pseudocode — exact Riverpod variant и naming convention TBD per Section 7.1, Q7=e Phase B-D):
  ```dart
  // Pseudocode (final form может быть @riverpod codegen, manual Provider, Notifier, либо иной variant — Phase B prototype решает)
  XxxDao_provider => XxxDao(ref.read(databaseProvider));
  XxxRepository_provider => XxxRepositoryImpl(
    dao: ref.read(xxxDao_provider),
    orchestrator: ref.read(syncOrchestratorProvider),
    db: ref.read(databaseProvider),
  );
  ```

❌ **DO NOT generate:**

- **AsyncNotifier с business logic** (e.g., filtering, sorting, search query state — manual UI provider)
- **Stream providers wrapping repository.watchX()** с дополнительной фильтрацией (manual если consumer нужен filter)
- **Family providers с domain parameters** (e.g., `xxxByCategoryProvider.family((categoryId) => ...)` — manual UI-specific)

##### 3.4.5 Generate DAO

✅ **DO generate:**

- **CRUD queries** (`getX`, `getXById`, `insertX`, `updateX`, `deleteX`)
- **Watch queries** (`watchX`, `watchXById`) — Drift `Stream<List<X>>`
- **FK-related queries** при наличии relation в YAML (`getXByParentId(parentId)`)

❌ **DO NOT generate:**

- **Complex JOIN queries** для UI screens (manual в DAO если нужна specific projection)
- **Aggregate queries** (`countX`, `sumXAmount`) — manual если нужны
- **Soft-delete logic с side effects** (e.g., cascade soft-delete на children — manual)

##### 3.4.6 Generate mappings

✅ **DO generate:**

- **`toEntity()` extension method** на Drift Companion / Drift Row → domain entity
- **`toModel()` extension method** на domain entity → Serverpod model
- **`toCompanion()` extension method** на domain entity → Drift Companion (для insert/update)

❌ **DO NOT generate:**

- **Mappers как отдельные класс** (`class XxxMapper { ... }`) — extension methods достаточно (Discussion #10 ClaudeN's migration anti-example)
- **Validation внутри mapping** (e.g., throw if entity.amount < 0 в `toModel` — это business rule, manual)
- **Format conversion с business semantics** (e.g., `amount.toCurrency(locale)` в mapping — manual)

#### 3.5 Migration-side anti-examples (что developer НЕ должен port из Clean v1 → simplified v2)

Pre-empts «у нас в v1 был X, портирую X в v2»:

❌ **`BaseUseCase<Params, Output>` abstract class** — generated CRUD usecase noise; в simplified usecases пишутся вручную для real business logic, без abstract base
❌ **Multi-layer notifier hierarchy** (data notifier → state notifier → UI notifier) — flat single Riverpod Notifier per UI screen достаточно
❌ **Repository interfaces по-умолчанию** — Discussion #10 Q5=b principle, `--with-interfaces` flag default OFF
❌ **Mappers как separate class** (`class WeighingMapper { static toEntity(...) }`) — extension methods на Drift row / domain entity достаточно
❌ **Either/Result wrappers** if Drift errors propagate напрямую — Drift exceptions достаточно informative; custom Either ceremony = manual если consumer хочет
❌ **Datasource interfaces по-умолчанию** (`abstract class WeighingLocalDataSource`) — Repository ↔ DAO direct binding достаточен; interfaces opt-in manual
❌ **Filter / sort providers с domain queries** (Riverpod `xxxFilteredProvider` с complex predicate logic) — UI provider manual

### 4. Sync_core integration model

Simplified template **сохраняет sync_core 0.3.0 mutation-first contract** без изменений (per sync_core ADR-0001..0004).

#### 4.1 Architectural commitments

- **Repository = atomic transaction site.** Каждый `repository.create / update / delete` атомарно делает в одной storage transaction:
  1. Insert/update domain row через DAO
  2. Enqueue/coalesce запись в outbox через `SyncOrchestrator.enqueue` (per sync_core ADR-0001 §1)
- **Outbox state machine** (`pending / retryable / inFlight / completed / dead`) handles retry / backoff / coalescing — generator НЕ emits custom retry logic per anti-example 3.4.1
- **Coalescing per `(scope, entityType, entityId)`** — sync_core internal, generator НЕ overrides (per sync_core ADR-0001 §5)
- **Scope subscription lifecycle** (`activateScope` / `deactivateScope`) — consumer responsibility, generator emits default per-customer scope binding (`customer_${currentUser.customerId}`); per-entity scope filtering = manual если нужно (per sync_core ADR-0004 Q3)
- **5 adapters per entity** = sync_core 0.3.0 contract requirement (см. Section 1 + 3.1) — non-negotiable

#### 4.2 Multi-entity FK guidance

Per sync_core ADR-0004 Patterns 6-7 (consumer responsibility):

- **FK ordering** при flush: consumer guarantees enqueue parent before child через atomic Repository transaction OR sequential UI actions. Sync_core flush'ит в `enqueued_at` order. Generator НЕ orchestrates topological sort.
- **FK violation handling**: sync_core `RetryableSyncException` → backoff retry → `dead` если permanently unresolved. Consumer monitors `dead` queue через `SyncMetrics`. Generator НЕ emits custom FK violation handling.

#### 4.3 Dual-running risk classification (per Sub-A3 audit, complete)

Per [sync-core-audit.md](../../tasks/done/TASK-021-initiative-phase-a---architectural-design---audits---adr-0005-multi-template-plurality/sync-core-audit.md) (Sub-A3 ✅ complete 2026-05-03):

**Reframing:** Per Sub-A0.5, weight v1 НЕ использует sync_core (custom `base_sync_repository.dart` + inline `syncStatus` column). Audit оценил **dual-protocol** (v1 custom + v2 sync_core) на same Serverpod backend, не two sync_core instances.

| Risk | Severity | Affects | Mitigation |
|------|----------|---------|------------|
| Backend event stream contract gap (v1 mutations invisible to v2's `SyncRemoteEventAdapter`) | **HIGH (verification-pending)** | Cross-device consistency v2 ↔ v1 | Server emits unified `SyncRemoteEvent` per entity mutation regardless of write source (v1 OR v2); OR Option C dedicated v2 testing scope until cutover |
| LWW timestamp skew между v1 client clock и v2 client clock | **MEDIUM** | Last-write-wins correctness when v1 + v2 mutate same entity | Server stamps `lastModified = serverNow()` on accept; client `lastModified` becomes proposal only |
| Outbox-coalescing per `(scope, entityType, entityId, deviceId)` не видит v1 mutations on same entity | **MEDIUM** | v2 client может coalesce stale local op while v1 already won server-side | Pull-on-event picks up server state; LWW resolves stale local override |
| v2 scope subscription lifecycle on logout/login в mixed v1+v2 install (same device) | **LOW** | Edge case если user has both apps installed concurrently | `_scopeGen` race protection (R3.5) handles re-subscribe; install policy decision |
| Resurrect attempt (delete + create) interleaved across v1 and v2 | **LOW** | Edge case requiring LWW + ConflictPolicy | Default `allowResurrect=false` throws `ResurrectAttemptException`; consumer handles via `enqueueResolved` |

**HIGH severity = verification-pending:** Audit conditional ("If Serverpod emits events only on sync_core's bundle endpoints"). Cheap verification (~30min spike: trigger v1 mutation + observe v2 event log) demotes к LOW immediately если backend Design B (DB-trigger emit). Verification scheduled before weight v2 production cutover (NOT в Phase A scope).

**Recommendation: Option C** (Phase A proceeds с dedicated v2 testing scope as default mitigation):
- Weight v2 staging + beta builds → dedicated `customer = 'v2_staging_<userId>'` scope (separate Serverpod customer entity provisioning required — backend data model work, see Sub-A3 audit Adversarial finding)
- Production cutover blocked до либо: (a) backend event-emission contract verified end-to-end OR (b) dedicated scope strategy validated
- Verification artifact: weight v2 build smoke test (trigger v1 mutation + observe v2 event log)

**Option B (escalate sync_core repo fix-task) — partially applicable:** sync_core lib/ requires no code change, но **ADR amendment recommended в sync_core repo** (formalize backend event-emission contract surface + server-stamp `lastModified` convention as part of `SyncRemoteEventAdapter` + `SyncPayloadCodec` adapter contract). Complementary to Option C, не mutually exclusive. Separate task в sync_core repo, не TASK-021 scope.

**Multi-entity FK guidance amendment for dual-protocol** (per Sub-A5 Sync reviewer): Pattern 6 (cross-entity FK ordering, sync_core ADR-0004) presupposes consumer = single mutator. Под dual-protocol, v2's UI/Repository guarantees parent-before-child within v2, но v1 может insert child-before-parent from v1 side. Pattern 6 amendment note: «in dual-protocol scenarios, child entity FK validation depends on backend ordering semantics, не consumer-side enqueue order».

**Phase A closure verdict:** Phase A may close. Phase A-D gate cannot close без (a) Option C mitigation in place AND (b) verification plan documented для weight v2 build.

### 5. Backend strategy

**Confirmed: Option 1 (same backend)** per User sign-off Sub-A1 (2026-05-03, "ок делай" implicit acknowledgement на recommended Option 1 после combined Sub-A0.5 + Sub-A4 evidence).

**Rationale (full evidence в [backend-strategy-rationale.md](../../tasks/done/TASK-021-initiative-phase-a---architectural-design---audits---adr-0005-multi-template-plurality/backend-strategy-rationale.md) + [weight-v1-schema-audit.md](../../tasks/done/TASK-021-initiative-phase-a---architectural-design---audits---adr-0005-multi-template-plurality/weight-v1-schema-audit.md)):**

- **0.5 of 4 Option 2 triggers active** (Sub-A0.5 audit):
  - Trigger 1 (legacy denormalization vs sync_core mutation-first) = ⚠ **PARTIAL** на sync-layer dimension только; **client-side sync rewrite inherent** в weight v2 (sync_core 0.3.0 adoption) **независимо** от backend choice
  - Trigger 2 (significantly different table layout) = ❌ NOT ACTIVE
  - Trigger 3 (production data migration significant anyway) = ❌ NOT ACTIVE under Option 1 (zero migration)
  - Trigger 4 (multi-tenancy / customer scope semantics changes) = ❌ NOT ACTIVE
- **78% codegen test cases / 72% files universal** (Sub-A4 + Sub-A5 math correction): simplified template ≠ полный rewrite generator infrastructure shared (parsers + Drift table + sync orchestrator markers + replacement dictionary + verify CLI + services/utils). Усиливает Option 1 safer / cheaper. **Conditional caveat:** `app_database_generator.test.ts` (11 cases) verdict universal действителен только при сохранении t115 directory layout (см. test-inventory-audit Open Question #3 — Phase B prototype resolves)
- **Zero data migration cost** под Option 1 (v1 production data immediately accessible to v2 client)
- **Cutover = client switch** (install v2 app → point to existing Serverpod backend → all customer data live)
- **v1 + v2 coexist на same backend** (parallel apps, decision matrix v1 maintenance per Discussion #9 recommendation — pending User Sub-A6 sign-off, см. task.md acceptance #82: critical-only fixes к v1 продолжают применяться при approval; иначе frozen полностью)

**Trigger 2/3/4 not active** (no schema redesign signal, no scope semantic changes). Option 2 (forked backend) defer evaluation **unless** ≥1 trigger активируется с concrete evidence. Option 3 (fresh backend) rejected — overkill для weight rebuild scope (out of scope этого Initiative; re-evaluate только if User explicitly решает migrate с Serverpod на another backend framework).

**Sub-A3 sync_core dual-running audit pending** — может surface mitigation requirement (dedicated v2 testing scope), но **не invalidate** Option 1 selection (Sub-A1 STOP-gate ✅ resolved).

### 6. Phase C amendment clause

**Rationale (editorial — not part of normative clause):** Phase C при building synthetic t<200> reference project может discover 6-ю category категорию entities (self-referencing FK / parent-child tree, enum entities, soft-delete-only, polymorphic FK). Без amendment clause Phase C blocks for ADR amendment process — bottleneck. Clause permits Phase C executor добавить category в [Amendment log](#amendment-log) section этого ADR, после TeamLead + User counter-sign, не requiring full ADR rewrite + re-promotion.

**Normative clause (verbatim per Discussion #10 ClaudeN):**

> «Phase C may extend categories list with additional findings via amendment лог section в этом ADR. Amendment requires TeamLead + User counter-sign, не full ADR rewrite. ADR principle (generate-vs-not-generate divider) remains valid; only category coverage expands.»

### 7. TBD placeholders (Phase B-D will resolve)

Q7=e Discussion #10 explicit **REJECT** pre-deciding Phase B-D decisions в Phase A. Эти решения emerge из B-D prototyping; pre-deciding в Phase A без prototype data = artificial constraint, likely revisited в Phase B → wasted user decision cycle.

#### 7.1 Riverpod variant TBD в Phase B prototype

Open question: какие именно Riverpod patterns используются в simplified template?

- **Generated state providers vs Notifiers vs raw families** — TBD
- **`@riverpod` codegen annotations vs manual `Provider`** — TBD
- **AsyncValue handling pattern** (manual `.when` switch vs helper extension) — TBD
- **Provider naming convention** (`xxxProvider` suffix vs `xxxBinding` vs annotation-derived) — TBD

**Note (Sub-A5 fix):** Section 3.4.4 example был ранее использован `@riverpod XxxDao xxxDao(XxxDaoRef ref)` annotation syntax — Sub-A5 Architecture + Adversarial reviewers указали contradiction с Q7=e REJECT. Section 3.4.4 example переписан как illustrative pseudocode (no annotation pre-decision); Section 2 mention "Notifier" — generic Riverpod primitive name, не commitment к specific Notifier API style (Notifier vs StateNotifier vs AsyncNotifier — Phase B-D resolves).

Phase B prototype simplified template + side-by-side с generated stub usage → данные для решения. ADR amendment когда зафиксировано.

#### 7.2 Drift conventions TBD в Phase B prototype

Open question: table layout patterns + DAO method naming в simplified template?

- **Table per entity vs single shared table** — TBD (default = table per entity, как в t115)
- **DAO method naming convention** (`getXById` vs `findXById` vs `xByIdOrNull`) — TBD
- **Relation accessor pattern** (`watchXWithRelations` vs separate `watchXChildren`) — TBD

Phase B prototype simplified Drift schema + iterate. ADR amendment когда зафиксировано.

#### 7.3 Manifest markers для simplified template TBD

Open question: какой набор markers использует simplified template?

- **t115 использует 7-marker pattern** (`:base / :oneToManyMethods / :methods / etc.`) — RelationPatcher dependency
- **Simplified возможно смягчён set markers** (если нет multi-layer wire-up patcher need)
- **OrchestratorPatcher reuse vs simplified-specific patcher** — TBD (см. test-inventory-audit.md open question #2)

Phase B prototype simplified template scaffolding + RelationPatcher / OrchestratorPatcher applicability assessment → данные для решения. ADR amendment когда зафиксировано.

---

## Последствия

### Positive

- **Generation infrastructure-only снижает CRUD noise.** Robert Martin's anti-CRUD-usecase principle applied — generator emits только mechanical / schema-derived code, business layer manual когда есть real workflow.
- **Multi-template flexibility.** Projects choose appropriate template (Clean для testing-heavy projects, simplified для thin-domain / data-driven apps).
- **Phase 1.5 codegen infrastructure (~72% tests universal) reused.** Simplified template ≠ полный rewrite — parsers + Drift table generation + sync_core marker contract + replacement dictionary + verify CLI shared (Sub-A4 evidence).
- **Backend strategy Option 1 minimizes cutover complexity.** Zero data migration; install v2 app → existing data immediately accessible.
- **sync_core 0.3.0 mutation-first contract preserved** без изменений — adapter pattern decoupled от template choice.
- **Anti-examples constrain Phase B-D drift в обе стороны** (over-generation prevented через generate-side ❌; under-generation prevented через explicit ✅ list; legacy ceremony port prevented через migration-side ❌).
- **Phase C amendment clause prevents premature freeze** — category coverage может expand без full ADR rewrite.

### Negative

- **Two templates to maintain** (t115 maintenance burden + simplified evolution). Mitigation: t115 = bugfix-only / legacy template per Discussion #7 Q2=c; новый development effort идёт в simplified.
- **Documentation drift risk** между t115 docs / simplified docs / shared codegen docs. Mitigation: Phase G doc reconciliation mandatory deliverable (Discussion #9 ClaudeO #13).
- **weight v1 client-side sync rewrite inherent** (Trigger 1 partial activation). Mitigation: Sub-A3 audit produces dual-running risk classification + recommendation A/B/C; client rewrite — inherent в v2 scope per Discussion #9 framing, не avoid'ится через Option 2/3.
- **Generator codebase complexity bumps** на template routing logic (`--template` flag, manifest марker set switch, fixture parametrization для `generation_service.test.ts`). Mitigation: Sub-A4 inventory маркирует 1 file `rewrite-for-template-abstraction` (4 cases) + new simplified-suite tests в Phase B-D — bounded scope.

### Mitigations summary

| Risk | Mitigation |
|---|---|
| ADR over-constrains Phase B-D | High-level principle + anti-examples (не exhaustive entity-type table) |
| ADR under-constrains Phase B-D (interpretive drift) | Generate-side anti-examples (Claude pattern) + migration-side anti-examples (ClaudeN pattern) |
| Test inventory becomes stale | `test-inventory-audit.md` = living document до Phase G + changelog section |
| Option 1 same-backend assumed too early | 4 Option 2 triggers documented + Sub-A0.5 evidence-based evaluation; Option 1 confirmed только after audit |
| Phase C category paralysis | Phase C amendment clause (Section 6) |
| Sub-A1 user decision delay | Explicit 1-week SLA tracking + escalation path |

---

## Amendment log

> Phase C executor добавит amendments здесь if discovers новые categories (entity types) или divider refinements. Format: date + amendment description + TeamLead+User counter-sign timestamps + section affected + rationale.

| Date | Amendment | TeamLead | User | Section | Rationale |
|------|-----------|----------|------|---------|-----------|
| (none yet) | | | | | |

---

## Open questions для Sub-A5 reviewers

Status post-Sub-A5 review (resolutions applied в Sub-A6 finalize):

1. **OQ-1 (Section 3.1 — generate Riverpod data providers / loggerServiceProvider):** ⏭ **DEFER к Phase B prototype.** Section 7.1 TBD placeholder покрывает Riverpod variant вопросы — logger wiring = consumer responsibility, simplified template generates только factory bindings.
2. **OQ-2 (Section 3.4.2 — sync_core adapter ConflictPolicy default):** ⏭ **DEFER к Phase B prototype.** Sync_core 0.3.0 default = LWW per `lww_resolver.dart` + `conflict_policy.dart` (`allowResurrect=false`) — applies к simplified out-of-box. Generator emits adapter scaffold; specific ConflictPolicy override = consumer choice.
3. **OQ-3 (Section 4.1 scope binding):** ✅ **RESOLVED Sub-A5 fix.** Default scope binding `customer_${currentUser.customerId}` — fallback клаузой added: для projects без auth (synthetic t<200>) generator emits `'default'` scope literal с TODO comment requiring consumer rewire.
4. **OQ-4 (Section 5 backend strategy inline vs reference):** ⏭ **DEFER (MEDIUM).** Sub-A5 Architecture reviewer flagged duplication risk; current ADR keeps inline summary + reference link. Sub-A6 leaves as-is — Phase G doc reconciliation может consolidate.
5. **OQ-5 (Section 7 TBD placeholders + test-inventory open questions alignment):** ✅ **RESOLVED.** test-inventory-audit.md Open Questions #1 (RelationPatcher applicability) + #2 (OrchestratorPatcher DI style) + #3 (directory layout dependency, Sub-A5 added) align с ADR Section 7.3 manifest markers TBD. Phase B prototype resolves both sets coherently.
6. **OQ-6 (Section 3.4.3 syncStatus exclusion):** ✅ **RESOLVED Sub-A5 fix.** Exclusion clause added для local-only entities (opt-out from sync_core registration).
7. **OQ-7 (Section 4.3 Sub-A3 placeholder):** ✅ **RESOLVED.** Sub-A3 audit ✅ complete; Section 4.3 placeholder filled with full risk classification + Option C recommendation + multi-entity FK guidance amendment for dual-protocol.

**Additional Sub-A5 catches (CRITICAL/HIGH applied):**
- ADR Section 3.3 + 3.4.4 wrong `Discussion #7 Q5=a` citation → corrected к `Discussion #10 Q5=b principle + ClaudeN migration-side anti-examples`
- ADR Section 3.4.4 `@riverpod` annotation example pre-decision → переписан как illustrative pseudocode + Section 7.1 expanded explanation
- Decision matrix v1 maintenance presupposed → Section 1 + 5 references qualified ("recommended Discussion #9, awaiting User Sub-A6 counter-sign")
- Default template TBD lacks criteria → explicit criteria added (Section 1)
- Multi-entity coordination blanket prohibition → junction carve-out added (Section 3.4.1)
- Phase C amendment clause rationale ambiguity → editorial label + normative clause clearly separated

---

## References

- [Discussion #7 archive](../../discussions/archive/7-clean-architecture-overhead-стоит-ли-упр/) — multi-template plurality original decision (3 agents convergence: TeamLead + Chatgpt_1 + Claude_1; 12-point Decision)
- [Discussion #9 archive](../../discussions/archive/9-weight-v2-fresh-build-на-simplified-temp/) — weight v2 fresh build pivot + decision matrix v1 maintenance (4 agents convergence; 16-point Decision)
- [Discussion #10 archive](../../discussions/archive/10-initiative-phase-a-simplified-template-a/) — Phase A organization 13-point Decision (4 agents convergence: TeamLead + Claude_1 + Chatgpt_1 + ClaudeN_1)
- [TASK-021 task.md](../../tasks/done/TASK-021-initiative-phase-a---architectural-design---audits---adr-0005-multi-template-plurality/task.md) — full Phase A scope + 7 sub-phases plan + STOP-gates
- [Sub-A0.5 weight v1 schema audit](../../tasks/done/TASK-021-initiative-phase-a---architectural-design---audits---adr-0005-multi-template-plurality/weight-v1-schema-audit.md) — 4 Option 2 triggers evidence-based evaluation (0.5/4 active)
- [Sub-A1 backend strategy rationale](../../tasks/done/TASK-021-initiative-phase-a---architectural-design---audits---adr-0005-multi-template-plurality/backend-strategy-rationale.md) — Option 1 confirmed + 4 trigger criteria + User sign-off recorded
- [Sub-A3 sync_core dual-running audit](../../tasks/done/TASK-021-initiative-phase-a---architectural-design---audits---adr-0005-multi-template-plurality/sync-core-audit.md) — dual-protocol risk classification (1 HIGH-pending-verification + 2 MEDIUM + 2 LOW + Scenario 5 soft-delete added Sub-A5) + Option C recommendation + complementary Option B reframe
- [Sub-A4 test inventory audit](../../tasks/done/TASK-021-initiative-phase-a---architectural-design---audits---adr-0005-multi-template-plurality/test-inventory-audit.md) — (file, category, action) tuple table 18 файлов / 164 cases / 5 actions; 78% cases / 72% files universal evidence supporting Option 1
- [Codegen ADR-0001 — Logger в шаблонах](../../../docs/decisions/adr-0001-logger-in-templates.md) — referenced в anti-example 3.4.1 (logging beyond `LoggerService.error`)
- sync_core ADRs (path-dep `G:/Projects/Flutter/Packages/sync_core/ai/docs/decisions/`):
  - [ADR-0001 — Outbox-first architecture](../../../../../../Flutter/Packages/sync_core/ai/docs/decisions/adr-0001-outbox-first-architecture.md) — mutation-first contract, 5-adapter list, outbox state machine
  - [ADR-0002 — Split write/pull/event adapters](../../../../../../Flutter/Packages/sync_core/ai/docs/decisions/adr-0002-split-write-pull-event-adapters.md) — adapter pattern decision
  - [ADR-0003 — SyncQueueStore.runInTransaction + AdapterBundle events](../../../../../../Flutter/Packages/sync_core/ai/docs/decisions/adr-0003-syncqueuestore-runintransaction-and-adapter-bundle-events.md) — R3 refactor
  - [ADR-0004 — Multi-entity runtime guidance](../../../../../../Flutter/Packages/sync_core/ai/docs/decisions/adr-0004-multi-entity-runtime-guidance.md) — Patterns 6-7 (consumer FK responsibility)
- weight v1 historical context: `G:/Projects/Flutter/serverpod/weight/ai/docs/decisions/adr-0014-...` (terminalSetId snapshot pattern referenced в anti-example 3.4.3)
