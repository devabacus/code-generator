# Sub-A1: Backend strategy rationale (TASK-021 / Initiative Phase A)

**Date:** 2026-05-03
**Author:** TeamLead Claude
**Purpose:** Evidence-based backend strategy decision для weight v2 fresh build (Discussion #9 + #10)
**Status:** ⏳ Awaiting User sign-off (1 week SLA per Discussion #10 Q8)

---

## Summary

**TeamLead recommendation: Option 1 (same backend) — sign off.**

Sub-A0.5 audit показал **0.5 of 4 Option 2 trigger criteria active** (только Trigger 1 partial activation на sync-layer dimension, не schema). Trigger 1 partial — **client-side sync rewrite inherent** в weight v2 (sync_core 0.3.0 adoption) **независимо** от backend choice. Backend-level concerns absent.

**User decision required:**
- ✅ **Option 1** (same backend) — recommended default
- ⚠ **Option 2** (forked backend) — only если User signal schema redesign requirement или legal/operational reason
- ❌ **Option 3** (fresh backend) — overkill, не justified evidence

---

## Context

### Discussion #9 (archived 2026-05-03) introduced 3 backend options:

- **Option 1 (same backend):** v1 + v2 read/write same Serverpod DB. Cutover = client switch. Data migration trivial (none — same DB). Sync_core scope subscription lifecycle audit обязателен.
- **Option 2 (forked backend):** clone v1 server, evolve independently. Cutover = data migration script + client+server switch. More flexibility, higher complexity.
- **Option 3 (fresh backend):** greenfield server. Cutover = full data export/import. Highest complexity, full architectural freedom. Overkill для weight rebuild.

### Discussion #10 Decision: Backend strategy = **first** Phase A architectural decision.

User must sign off в Sub-A1 ДО Sub-A2 (ADR draft). STOP-gate: cannot proceed без User decision. SLA: 1 week.

### Claude_1's 4 Option 2 trigger criteria (Discussion #10):

1. weight v1 schema имеет concrete legacy denormalization которая мешает sync_core mutation-first invariants
2. weight v2 нужен significantly different table layout (e.g., split user/profile или event sourcing addition)
3. Production data migration от v1 schema → v2 schema = significant work anyway → fork schema в v2 не добавляет cost
4. Multi-tenancy / customer scope semantics меняются между v1 и v2

---

## Evidence base: Sub-A0.5 audit findings

См. полный отчёт: [weight-v1-schema-audit.md](weight-v1-schema-audit.md).

### Trigger evaluation summary

| Trigger | Status | Evidence summary |
|---------|--------|------------------|
| 1. Legacy denormalization vs sync_core mutation-first | ⚠ **PARTIAL** (sync-layer dimension) | Schema: clean. Sync-layer: weight v1 использует custom `base_sync_repository.dart` + inline `syncStatus` column на каждой entity table — НЕ sync_core 0.3.0 outbox-first pattern. Client-side rewrite (~13 entities × 5 adapters + Repository mutation-first refactor + outbox table) **inherent в v2** независимо от backend choice. |
| 2. Significantly different table layout | ❌ **NOT ACTIVE** | 13 entities — reasonable domain coverage. Discussion framing = "fresh build на simplified template" (architecture rebuild), не "schema rebuild". Schema additions would be additive (e.g. dedicated outbox table). |
| 3. Production data migration significant work anyway | ❌ **NOT ACTIVE** (Option 1) | Same backend → zero migration. Trigger 3 active **только if Option 2 chosen** (circular reference). |
| 4. Multi-tenancy / customer scope semantics меняются | ❌ **NOT ACTIVE** | `customerId` уже per entity. sync_core 0.3.0 multi-entity scope validated cross-device (Windows + Android, t115). No signal change. |

**Net trigger activation: 0.5 of 4.**

### Key finding from Sub-A0.5

**weight v1 НЕ использует `sync_core` package.** Custom infrastructure:
- `weight_flutter/pubspec.yaml` — нет `sync_core` dependency
- `weight_flutter/lib/core/sync/`: custom `base_sync_repository.dart` + Riverpod-based controller + custom registry
- НЕТ `lib/features/<entity>/data/adapters/` папок (sync_core 0.3.0 pattern)
- НЕТ outbox table в schema
- `syncStatus` колонка inline в каждой domain table (legacy "sync state per row" pattern, conflict с sync_core 0.3.0 outbox-first invariant)

**Implication:** Sync-layer rewrite в v2 = **inherent** (Discussion #9 framing). Backend-level: Serverpod server doesn't care which sync protocol client uses — server stays common ground.

---

## Option 1 (same backend) detailed reasoning

**Why Option 1 is the recommended default:**

### Pro

1. **Zero data migration.** v1 production data immediately accessible to v2 client (install v2 app → point to existing Serverpod backend → all customer data live).
2. **Cutover simplicity.** Client switch only (no server-side migration window, no rollback complexity для DB state).
3. **3.5 of 4 triggers not active.** Trigger 1's sync-layer concern is client-side problem, не backend-level.
4. **Trigger 3 circular** — only active if Option 2 chosen. Option 1 inherently zero-data-migration.
5. **Sync-layer rewrite (Trigger 1 partial) inherent** в weight v2 scope per Discussion #9. Не avoid'ится через Option 2 — sync_core 0.3.0 adoption = v2 design decision regardless of backend strategy.
6. **Cutover complexity minimized** under Option 1 — install v2 app, users seamlessly access existing data.
7. **Backwards compat path open.** v1 client продолжает работать parallel с v2 client против same backend (decision matrix v1 maintenance per Discussion #9 — critical-only fixes к v1 продолжают применяться).

### Con / Caveats

1. **Sync_core dual-running risk** (Discussion #9 Observation #2 + Sub-A3 audit pending) — v1 + v2 на same backend имеют scope subscription lifecycle questions. Mutation-first contract на single-app validated, dual-app не tested. **Mitigation:** Sub-A3 audit produces risk classification + recommendation (Option A proceed / B escalate sync_core fix-task / C dedicated v2 testing scope до production cutover).
2. **Schema evolution shared.** Любые schema changes для v2 affect v1 backend. Mitigation: Phase B-D constrains schema additions to additive-only (no breaking changes к v1 contract).
3. **Server-side bug surface shared.** Server bug fixes affect both apps. Mitigation: Standard production hygiene (small scope-bound fixes, regression testing).

---

## Option 2 (forked backend) — when to revisit

Defer Option 2 evaluation **unless** один из 4 triggers активируется:

### Trigger 1 (legacy denormalization) — schema-level, не sync-layer

**Status:** ❌ NOT active (Sub-A0.5 audit). Schema is clean modulo intentional ADR-0014 snapshot pattern (terminalSetId).

**Re-evaluate if:** weight v2 design surfaces concrete schema-level denormalization которое блокирует sync_core mutation-first contract. **Currently no such evidence.**

### Trigger 2 (significantly different table layout)

**Status:** ❌ NOT active. User не сигнализировал radical schema redesign. Discussion #9 explicitly = architecture rebuild, не schema rebuild.

**Re-evaluate if:** User announces v2 will fundamentally redesign tables (e.g. split `WeighingTable` в multiple normalized tables, add event sourcing layer, change ID strategy). **Currently no such signal.**

### Trigger 3 (production data migration significant anyway)

**Status:** ❌ NOT active under Option 1 (zero migration). Circular — only active if Option 2 chosen.

**Re-evaluate if:** Other triggers force Option 2 → Trigger 3 becomes active, but doesn't independently trigger Option 2 selection.

### Trigger 4 (multi-tenancy / customer scope semantics changes)

**Status:** ❌ NOT active. Customer scope semantics validated multi-entity cross-device (sync_core 0.3.0 t115 acceptance).

**Re-evaluate if:** User announces v2 changes customer scope (e.g. multi-org per user, hierarchy of customers, share data между customers). **Currently no such signal.**

### Summary trigger logic

**Option 2 selection requires ≥1 trigger active с concrete evidence.** Currently 0 of 4 active с concrete evidence (Trigger 1 partial sync-layer activation = inherent в v2 regardless of backend).

---

## Option 3 (fresh backend) — rejected

**Status:** Overkill для weight rebuild scope.

**Reasons:**
- Greenfield server requires backend architecture decisions (DB choice, server framework, deployment) которые Discussion #9 не addressing
- Cutover = full data export/import (highest complexity)
- Discussion #9 explicit: "Option 3 (fresh) — overkill для weight rebuild"
- No User signal про backend technology change (Serverpod stays)

**Re-evaluate only if:** User explicitly решает migrate с Serverpod на another backend framework (out of scope этой Initiative).

---

## Sub-A1 sign-off requirements

**User decision:** Sign off **Option 1 / 2 / 3** + acknowledge:

1. **Option 1 acknowledgment:** "Sign off Option 1 (same backend). Trigger 1 partial activation noted — sync-layer rewrite inherent в v2 client. Sub-A3 sync_core dual-running audit will surface mitigation strategy (Option A/B/C recommendation) до Phase A closure."
2. **Option 2 acknowledgment** (if selected): "Sign off Option 2 (forked backend). Trigger [X/Y/Z] active because [concrete evidence]. Acknowledge cutover complexity = data migration script + server cutover + client switch. Phase A scope expands +1-2 weeks для backend forking design."
3. **Option 3 acknowledgment** (if selected): "Sign off Option 3 (fresh backend). Reason: [explicit User reason]. Acknowledge full data export/import migration + greenfield server architecture decisions added to Phase A scope."

**Recording sign-off:** TeamLead annotates **task.md журнал** + adds line к этому файлу:

```markdown
## User decision (Sub-A1 STOP-gate resolved)

**Date:** 2026-05-XX
**Decision:** Option [1/2/3]
**User acknowledgment:** [verbatim quote или paraphrase]
**Recorded by:** TeamLead Claude
```

---

## Notes для Sub-A2 (ADR-0005 draft)

После Sub-A1 sign-off, ADR-0005 backend strategy section:

- Document confirmed option (Option 1 default)
- Reference этот rationale.md
- Reference Sub-A0.5 audit findings (weight-v1-schema-audit.md)
- Reference Sub-A3 audit recommendation (Option A/B/C — added Sub-A3 completion)
- Phase C amendment clause covers future schema additions (additive-only constraint per Trigger 2 not-active rationale)

---

## Sub-A4 preliminary feedback (added 2026-05-03 после Sub-A4 completion + Sub-A5 math correction)

Sub-A4 audit complete. **Distribution (18 файлов / 164 test cases):**

| Action | Files | Cases | % files | % cases |
|--------|-------|-------|---------|---------|
| `keep-universal` | 13 | **128** | **72%** | **78%** |
| `keep-t115-legacy` | 3 | 31 | 17% | 19% |
| `port-simplified` | 0 | 0 | 0% | 0% |
| `rewrite-for-template-abstraction` | 1 | 4 | 6% | 2% |
| `delete-obsolete` | 1 | 1 | 6% | 1% |
| **Total** | **18** | **164** | **100%** | **100%** |

**Sub-A5 math correction (2026-05-03):** initial Sub-A4 audit reported `124 cases / 76% universal` — Sub-A5 Test reviewer + Adversarial overlay caught 4-case undercount. Corrected к **128 cases / 78% universal**. См. test-inventory-audit.md changelog для full audit trail.

**Strengthens Option 1 recommendation:** **78% cases / 72% files** универсальные (parsers + Drift table + sync orchestrator markers + replacement dictionary + verify CLI + services/utils). Clean-specific остаток изолирован в 3 файла (OrchestratorPatcher + RelationPatcher × 2). Это означает что simplified template ≠ полный rewrite codegen — большинство infrastructure shared. Backend-level concerns absent (Sub-A0.5) + tests-level shared infrastructure (Sub-A4) = **Option 1 (same backend) сильно safer than рассматривание Option 2/3**.

**NB (Sub-A5 Test reviewer caveat):** `app_database_generator.test.ts` (11 cases) verdict `keep-universal` действителен **conditional** — generator hardcodes scan path к Clean `data/datasources/local/tables/` directory. Если simplified template flattens directory hierarchy → 11 cases демотируются к `rewrite-for-template-abstraction`, distribution shifts к ~71% universal. Phase B prototype resolves (см. test-inventory-audit.md Open Question #3).

См. полный отчёт: [test-inventory-audit.md](test-inventory-audit.md).

---

## Files referenced

- [weight-v1-schema-audit.md](weight-v1-schema-audit.md) — Sub-A0.5 evidence
- `ai/discussions/archive/9-weight-v2-fresh-build-на-simplified-temp/` — Discussion #9 backend options origin
- `ai/discussions/archive/10-initiative-phase-a-simplified-template-a/` — Discussion #10 4 trigger criteria + Sub-A1 STOP-gate
- (pending Sub-A3 deliverable) `sync-core-audit.md` — dual-running risk classification + recommendation A/B/C
- (pending Sub-A4 deliverable) `test-inventory-audit.md` — preliminary distribution для backend impact assessment

---

## User decision (Sub-A1 STOP-gate resolved)

**Date:** 2026-05-03
**Decision:** **Option 1 (same backend)** — confirmed
**User acknowledgment:** "ок делай" (implicit sign-off на recommended Option 1 после combined Sub-A0.5 + Sub-A4 evidence — 0.5/4 triggers active + 78% universal cases / 72% universal files)
**Recorded by:** TeamLead Claude

**NB (Sub-A5 Adversarial reviewer fix):** Sub-A1 sign-off framing использовал preliminary `≥80%` claim из initial Sub-A4 audit (test-inventory-audit.md:32 prior wording). Sub-A5 caught math drift; corrected number = **78% cases / 72% files universal**. Direction of evidence unchanged (still strongly favors Option 1) — decision unchanged. Audit trail integrity preserved через corrections в test-inventory + здесь + ADR-0005 Section 5. **User retains right re-evaluate если уточнённые numbers (78% не ≥80%) меняют backend strategy preference** (TeamLead recommendation: Option 1 stays correct).

**Sub-A1 STOP-gate ✅ resolved.** Sub-A2 (ADR draft) + Sub-A3 (sync_core audit) proceeded parallel; both ✅ complete.

Mitigation strategy для Trigger 1 partial activation (sync-layer rewrite inherent) + Sub-A3 dual-running risk recommendation = **Option C (dedicated v2 testing scope)** — added в ADR-0005 Section 4.3.
