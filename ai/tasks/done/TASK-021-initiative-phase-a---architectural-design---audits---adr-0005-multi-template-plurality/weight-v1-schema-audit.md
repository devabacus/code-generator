# Sub-A0.5: Weight v1 schema knowledge dump

**TASK:** TASK-021 (Initiative Phase A) — Sub-A0.5
**Date:** 2026-05-03
**Author:** TeamLead Claude (read tool sweep)
**Purpose:** Evidence-based evaluation 4 Option 2 (forked backend) trigger criteria для Sub-A1 backend strategy decision

---

## Schema overview (weight v1 как of 2026-05-03)

**13 entities в Drift schema (`weight_flutter/lib/core/data/datasources/local/database.dart`):**

- `ConfigurationTable` (singleton config baseline)
- `CargoTypeTable`, `ContractorTable`, `CustomFieldTable`, `DriverTable`, `VehicleTable` (master data)
- `WeighingTable`, `WeighingPhotoTable`, `WeighingCorrectionTable` (transactional)
- `CorrectionButtonTable` (UI helpers)
- `TerminalSetTable`, `TerminalDeviceTable` (device topology)
- `SubscriptionTable` (billing / access)
- `SyncMetadataTable` (sync metadata, custom)

**Schema version:** 15 (15 migrations applied through дев лайфтайм; multiple data fixes для legacy null-strings, enum corrections, FK cleanups в migrations).

**Server YAMLs (`weight_server/lib/src/models/`):** organized по 9 feature areas (configuration / device_log / exceptions / storage / subscription / system / terminal / user / weighing). Каждая entity имеет paired `<entity>_sync_event.spy.yaml` (sync_core 0.2.x semantic). Plus enum YAMLs (`weighing_direction`, `weighing_status`, `tara_source`, `sync_event_type`).

---

## Critical finding: sync_core integration depth

**weight v1 НЕ использует `sync_core` package.** Evidence:

- `weight_flutter/pubspec.yaml` — нет `sync_core` dependency
- `weight_flutter/lib/core/sync/` содержит **custom** sync infrastructure:
  - `base_sync_repository.dart` (custom abstract class)
  - `sync_controller_provider.dart` + `.g.dart` (Riverpod-based controller)
  - `sync_registry.dart` + `.g.dart` (custom registry)
- НЕТ `lib/features/<entity>/data/adapters/` папок (sync_core 0.3.0 pattern из TASK-011 t115 integration)
- НЕТ outbox table в schema (sync_core 0.3.0 outbox-first invariant)

**Sync state pattern в weight v1:**

`syncStatus TextColumn` живёт **inline в каждой domain table** (см. `weighing_table.dart:63`: `TextColumn get syncStatus => text().map(const SyncStatusConverter())();`). Это **legacy "sync state per row"** pattern, conflict с sync_core 0.3.0 outbox-first invariant (sync state — separate `sync_queue_table`, не denormalized inline).

**Implication:** даже если backend остаётся same (Option 1), client-side sync layer rewrite в weight v2 = **significant work** (custom registry → sync_core 0.3.0 + outbox table + 5 adapters per entity + Repository mutation-first contract).

---

## Other denormalization patterns observed

1. **`terminalSetId` snapshot в `WeighingTable` (`weighing_table.dart:14-17`):** "snapshot бизнес-контекста (ADR-0014). FK только в PostgreSQL, локальный Drift ссылается текстом — TerminalSet-таблица живёт в другой фиче, cross-feature references не нужны." — **bounded context denormalization** (intentional design per weight ADR-0014).
2. **6 hard-required system fields на каждой entity** (`userId`, `customerId`, `id`, `createdAt`, `lastModified`, `isDeleted`, плюс `syncStatus`) — duplicated cross all 13 entities. Не «denormalization» в strict sense — это convention, sync_core 0.3.0 also requires эти поля (per agent_memory.md → "Обязательные поля entity YAML"). **Compatible.**
3. **`MillisecondEpochConverter` для `lastModified`** — Drift custom type converter. Standard pattern, no concern.

**No critical schema-level denormalization найдено** (кроме intentional ADR-0014 snapshot).

---

## Evaluation: 4 Option 2 trigger criteria

Discussion #10 Q2 + Claude_1 4 trigger criteria:

### Trigger 1: legacy denormalization мешает sync_core mutation-first invariants

**Status: ⚠ PARTIALLY ACTIVE** (за nuance — не data-level, а sync-layer-level).

**Evidence:**
- Schema-level: чисто (no problematic denormalizations за пределами intentional ADR-0014 snapshot)
- Sync-layer level: weight v1 использует custom `base_sync_repository.dart` + inline `syncStatus` column. Sync_core 0.3.0 mutation-first contract требует outbox table + Repository pattern с atomic transaction site (`_db.transaction { dao.insert + orchestrator.enqueue }`).
- **Impact:** Не блокирует Option 1 (same backend). Backend serves both v1 (custom client sync) и v2 (sync_core client). Но client-side rewrite в v2 = ~всё data layer rewrite (13 entities × 5 sync_core adapters + Repository mutation-first refactor + outbox table addition).

**Backend implication:** None (server doesn't care which sync protocol client uses).

### Trigger 2: weight v2 нужен significantly different table layout

**Status: ❌ NOT ACTIVE** (User не сигнализировал radical schema redesign).

**Evidence:**
- 13 entities — reasonable domain coverage для weighing system. Нет obvious bloat / missing entities.
- Schema version 15 с multiple data fix migrations — указывает на **iterative refinement**, не radical redesign in cards.
- Discussion #9 framing: weight v2 = "fresh build на simplified template" (architecture rebuild), не "schema rebuild".
- Decision matrix (Discussion #9): "New feature request → Reject (v1 frozen for new features) → Add to v2 scope" — implies v2 will добавлять features, но baseline schema stays.

**Risk:** Если в Phase B-D synthetic t<200> design surfaces что simplified template требует schema additions (e.g. dedicated outbox table, enhanced sync metadata) — это **additive**, не "significantly different layout".

**Trigger remains not active unless User explicitly signals schema redesign.**

### Trigger 3: production data migration v1 → v2 = significant work anyway

**Status: ❌ NOT ACTIVE** (если Option 1).

**Evidence:**
- Если backend same (Option 1) и schema same → **zero data migration**. Cutover = client switch (install v2 app, point to same Serverpod backend, всё data доступна).
- Existing v1 server data **cannot** disappear — production users live there. Migration cost = 0 для same-backend approach.
- Альтернативно (Option 2 forked) → migration script нужен — что подтверждает Trigger 3 = active **только if Option 2 chosen**.

**Conclusion:** Trigger 3 status зависит от Option 1/2 choice — circular reference. Defaulting to "not active" под Option 1 assumption.

### Trigger 4: multi-tenancy / customer scope semantics меняются

**Status: ❌ NOT ACTIVE** (current customer scope semantics validated, no signal change).

**Evidence:**
- weight v1 уже имеет `customerId` per entity (multi-tenant ready) — see `weighing_table.dart:58`.
- sync_core 0.3.0 supports scope subscription per customer (validated multi-entity cross-device на Windows + Android per agent_memory.md).
- t115 multi-entity validation gate ✅ closed (sync_core repo CLAUDE.md): 5 entities cross-device sync working на Windows + Android. Same customer scope semantics applied.
- Discussion #9 + #10 не содержат сигналов про customer scope redesign.

**Conclusion:** Customer scope semantics stay same. v1+v2 compatible на same backend без scope-level conflicts (modulo dual-running risk audit Sub-A3).

---

## Summary table

| Trigger | Status | Evidence |
|---------|--------|----------|
| 1. Legacy denormalization мешает sync_core mutation-first | ⚠ PARTIAL (sync-layer, не schema-layer) | Custom base_sync_repository + inline syncStatus column. Schema clean. Client-side rewrite needed irrespective backend choice. |
| 2. Significantly different table layout | ❌ NOT ACTIVE | 13 entities reasonable. Discussion framing = architecture rebuild, не schema. Schema additions would be additive. |
| 3. Production data migration significant work anyway | ❌ NOT ACTIVE (Option 1) | Same backend → zero migration. Trigger active only if Option 2 chosen (circular). |
| 4. Multi-tenancy / customer scope semantics меняются | ❌ NOT ACTIVE | customerId уже per entity. sync_core 0.3.0 multi-entity scope validated. No signal change. |

**Net trigger activation: 0.5 of 4 (Trigger 1 partial, sync-layer dimension).**

---

## Recommendation для Sub-A1 backend strategy

**Option 1 (same backend) confirmed.** Reasons:

1. **3.5 of 4 triggers not active.** Trigger 1's sync-layer concern is **client-side problem**, не backend-level. Backend remains common ground для v1 + v2 без conflict.
2. **Trigger 3 circular** — only active if Option 2 chosen. Option 1 inherently zero-data-migration.
3. **Sync-layer rewrite** (Trigger 1 partial) is **inherent в weight v2** scope per Discussion #9 framing ("fresh build на simplified template"). Не avoid'ится через Option 2 — sync_core 0.3.0 adoption = v2 design decision regardless of backend strategy.
4. **Cutover complexity minimized** под Option 1 — install v2 app, point to existing backend, users seamlessly access existing data.

**Sync_core dual-running risk** (Discussion #9 Observation #2 + Sub-A3 audit) requires verification — но это **не blocks** Option 1 selection в Sub-A1, только informs mitigation strategy. Если Sub-A3 находит HIGH risks → mitigation = "dedicated v2 testing scope (separate customer scope) до production cutover" per Discussion #9 #9.

**Recommendation для User:** **Option 1 (same backend) — sign off** unless объявлен schema redesign requirement (Trigger 2 → active) или legal/operational reason для backend split (out of scope этого audit).

---

## Notes for Sub-A1 backend-strategy-rationale.md

TeamLead должен включить в `backend-strategy-rationale.md`:

1. **Resummary этого audit** (4 trigger findings + 0.5/4 activation count)
2. **Critical caveat:** Trigger 1 partial activation указывает на **inherent** client-side sync rewrite в v2 (irrespective of backend choice). User должен понимать что v2 build = significant work (~13 entities × 5 adapters + Repository mutation-first + outbox + UI parity), независимо от Option 1 vs 2 decision.
3. **Sub-A3 sync_core dual-running audit pending** — может surface mitigation requirement (dedicated v2 testing scope), но не invalidate Option 1.
4. **Option 2 / 3 default rejection** documented с references к этим findings.
5. **Sub-A4 preliminary count** — добавится позже, fed для User decision context.

---

## Files reviewed для этого audit

- `G:/Projects/Flutter/serverpod/weight/weight_flutter/lib/core/data/datasources/local/database.dart` (Drift schema, 13 tables, schema version 15, migrations)
- `G:/Projects/Flutter/serverpod/weight/weight_flutter/lib/core/sync/` directory listing (custom sync infra, NO sync_core dep)
- `G:/Projects/Flutter/serverpod/weight/weight_server/lib/src/models/` directory listing (9 feature areas, paired sync_event YAMLs per entity)
- `G:/Projects/Flutter/serverpod/weight/weight_server/lib/src/models/weighing/` listing (representative feature)
- `G:/Projects/Flutter/serverpod/weight/weight_flutter/lib/features/weighing/data/datasources/local/tables/weighing_table.dart` (representative table, denormalization patterns)
- `G:/Projects/Flutter/serverpod/weight/weight_flutter/lib/features/` listing (15 feature folders, no `adapters/` subdirectory anywhere)

**Time spent:** ~30 minutes (TeamLead Read tool sweep, no executor delegation needed для Sub-A0.5 scope).

**Output:** This file. Feeds Sub-A1 (backend strategy decision) + Sub-A2 (ADR-0005 sync_core integration section).
