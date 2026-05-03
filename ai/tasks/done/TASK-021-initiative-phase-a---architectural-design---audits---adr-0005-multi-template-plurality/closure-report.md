# Phase A-D Closure Report (TASK-021..TASK-NNN)

**Status:** 🟡 Draft (Phase A section ✅ complete; Phase B / C / D placeholders pending)
**Maintained:** Phase A executor (TeamLead Claude) — accumulator until end of Phase D
**Final sign-off (end of Phase D):** TeamLead + User counter-sign — gates `<weight-v2-build TASK>` start

---

## Phase A — architectural design (closed 2026-05-03 pending User counter-sign)

### Deliverables (links)

| Deliverable | Status | Location |
|-------------|--------|----------|
| ADR-0005 (Multi-template plurality + simplified architecture) | ✅ Promoted (post-Sub-A5 fixes) | [ai/docs/decisions/adr-0005-multi-template-plurality.md](../../docs/decisions/adr-0005-multi-template-plurality.md) |
| sync-core-audit.md (dual-protocol risk classification + Option C recommendation) | ✅ Complete + Sub-A5 fixes | [sync-core-audit.md](sync-core-audit.md) |
| test-inventory-audit.md (164 cases / 5 actions, living document) | ✅ Complete + Sub-A5 math fixes | [test-inventory-audit.md](test-inventory-audit.md) |
| backend-strategy-rationale.md (Option 1 confirmed + Option 2 trigger criteria) | ✅ Complete + Sub-A5 numbers updates | [backend-strategy-rationale.md](backend-strategy-rationale.md) |
| weight-v1-schema-audit.md (4 Option 2 triggers evaluated) | ✅ Complete | [weight-v1-schema-audit.md](weight-v1-schema-audit.md) |

### Verification

- **Layer 1 review (pre-implementation):** Discussion #10 archived 2026-05-03, 4 agents convergence (TeamLead + Claude_1 + Chatgpt_1 + ClaudeN_1), 13-point Decision
- **Layer 2 review (Sub-A5 post-implementation gate):** 4 reviewers parallel (architecture / sync / test / adversarial overlay) ✅ <date 2026-05-03>
  - Architecture reviewer: 14 findings (2 CRITICAL + 5 HIGH + 4 MEDIUM + 3 LOW); recommendation Approve with fixes — applied
  - Sync reviewer: 10 findings (0 CRITICAL + 2 HIGH + 3 MEDIUM + 5 LOW); recommendation Approve with fixes — applied
  - Test reviewer: 11 findings (2 CRITICAL + 3 HIGH + 2 MEDIUM + 4 LOW); recommendation Request changes — math + prose CRITICAL fixes applied
  - Adversarial overlay: 14 findings (3 DEAL-BREAKER + 4 HIGH + 4 MEDIUM + 3 LOW); recommendation Request changes — DEAL-BREAKERS + HIGH applied
- **Catch rate threshold (≥1 finding per review):** ✅ substantially exceeded (49 findings total, 5 CRITICAL/DEAL-BREAKER, 14 HIGH applied)

### User counter-sign (Phase A — Sub-A6 STOP-gates ✅ resolved)

- **Backend strategy (Option 1)** — ✅ confirmed 2026-05-03 ("ок делай" Sub-A1 acknowledgment, recorded в backend-strategy-rationale.md)
- **ADR-0005 text counter-sign** — ✅ confirmed 2026-05-03 ("ok" implicit acknowledgment after Sub-A6 PR #16 review + CI PASS)
- **Decision matrix v1 maintenance approval** — ✅ confirmed 2026-05-03 ("ok" implicit acknowledgment):
  - Data loss / security / sync corruption → **fix v1 immediately**
  - UI bugs / performance regression → **defer** (cosmetic для frozen app)
  - New feature request → **reject** (v2 backlog)

**All Sub-A6 STOP-gates ✅ resolved.** Phase A section closed. Awaiting Phase B/C/D execution для full Phase A-D gate close (final TeamLead + User counter-sign at end of Phase D).

### Phase A Risks documented for Phase B-D

1. **HIGH-pending-verification (sync-core-audit Risk #1):** Backend event emission contract gap для v1-source mutations. Verification cheap (~30 min spike — v1 staging mutation + v2 staging log observation). **Phase B-D mitigation:** Option C (dedicated v2 testing scope `customer = 'v2_staging_<userId>'`) до verification done; backend smoke test obligatory в weight v2 build.
2. **MEDIUM (sync-core-audit Risk #2):** LWW timestamp skew между v1/v2 client clocks. **Mitigation:** server stamps `lastModified = serverNow()` on accept. **Phase B-D action:** weight v2 server endpoint contract codifies этот convention; v1 server reviewed для parity.
3. **MEDIUM (sync-core-audit Risk #3):** Outbox-coalescing blindness к cross-protocol mutations. **Mitigation:** server endpoints support idempotent create with deterministic UUID v7 id. **Phase B-D action:** verified в weight v2 server.
4. **MEDIUM (sync-core-audit Scenario 5 Sub-A5 addition):** Soft-delete tombstone propagation v1 → v2 — `LocalApplyAdapter` contract gap. **Mitigation:** ADR-0005 codifies "v2 LocalApplyAdapter treats `isDeleted=true` from server pull as DELETE on local row".
5. **MEDIUM (test-inventory Open Q #3 Sub-A5 addition):** simplified template directory layout dependency — `app_database_generator.test.ts` 11 cases verdict universal conditional на Clean hierarchy preservation. **Phase B prototype resolves;** если flatten → 11 cases демотируются к `rewrite-for-template-abstraction`.
6. **R1-R5 ADR risks** (over-constrains / under-constrains / test inventory stale / Option 1 assumed / category paralysis): mitigations applied (anti-examples generate-side + migration-side / living document / Option 2 triggers / Phase C amendment clause).

### Phase B unblock backlog (handoff к Phase B executor)

- **Open Question #1 (test-inventory):** RelationPatcher applicability в simplified template — Phase B prototype resolves (если не используется → both relation_patcher tests stay strictly t115 suite)
- **Open Question #2 (test-inventory):** OrchestratorPatcher DI style adaptation для simplified — Phase B prototype resolves (если другой DI стиль → orchestrator_patcher.test.ts требует `port-simplified`)
- **Open Question #3 (test-inventory + ADR Section 7.3):** simplified template directory layout (`data/datasources/local/tables/` preservation) — Phase B prototype resolves (affects app_database_generator + relation_generation + lib/core/sync paths)
- **TBD placeholders (ADR Section 7.1 + 7.2):** Riverpod variant + Drift conventions — Phase B prototype первой simplified entity скажет
- **CI 3-suite split (TASK-CI-001 future):** wired когда (a) ≥1 simplified suite файл exists AND (b) generation_service.test.ts refactored. Sub-A4 mapping готов для extension.
- **`<weight-v2-build TASK>` ID resolution:** при `new_task.py` invocation присваивается next available; batch grep+replace `<weight-v2-build TASK>` placeholder во всех живых docs (status.md / roadmap.md / agent_memory.md / handoff.prompt.md / closure-report.md).
- **sync_core ADR-0006 fix-task** (Option B complementary): formalize backend event-emission contract surface + server-stamp `lastModified` convention в `SyncRemoteEventAdapter` + `SyncPayloadCodec` adapter contract. Trigger когда weight v2 build начинается (или раньше при capacity).

### MEDIUM Sub-A5 deferrals для Phase G doc reconciliation

- **Section 5 inline trigger duplication consolidation** (Architecture reviewer MEDIUM #8) — Phase G doc reconciliation
- **ADR-0005 numbering jump** justification or rename (Adversarial reviewer MEDIUM #8) — Phase G doc reconciliation
- **Coalescer deviceId verification** в weight v2 (Sync reviewer MEDIUM #3) — weight v2 build smoke test
- **ADR-0004 Pattern 7 dual-protocol expansion** (Sync reviewer MEDIUM #5) — partial done в ADR Section 4.3 (Pattern 6 amendment note); Pattern 7 separate task

---

## Phase B — implementation simplified template (placeholder, filled end of B)

**Scope per ADR-0005 + Discussion #9 Q3=c sequencing:**
- Implement generate-vs-not-generate divider per ADR Section 3
- Apply generate-side + migration-side anti-examples per ADR Section 3.4
- Resolve Phase B-D TBD placeholders (Riverpod variant / Drift conventions / manifest markers)
- Resolve test-inventory Open Questions #1 / #2 / #3
- Codegen core changes (parsers / replacement / generators) для multi-template support

**Deliverables (TBD при completion):**
- Simplified template generator path
- Updated codegen test suite (categorized per Sub-A4 + simplified suite emerges)
- Phase B section в closure-report (Verification + sign-offs added)

**Phase B Verification (TBD):** Multi-agent review (Standard + Adversarial минимум, 4 thematic если capacity)

---

## Phase C — synthetic reference project t<200> (placeholder, filled end of C)

**Scope per ADR-0005 Section 6 (Phase C amendment clause):**
- Create synthetic t<200> project с 5-7 entities covering categories: Configuration / single FK identity / single FK alias / junction Map / junction no-Map
- Verify codegen verify PASS errors=0 на все scenarios
- Может trigger ADR-0005 amendment если discover 6-я category (per amendment clause)
- Resolve test-inventory Open Question #3 definitively (directory layout)

**Deliverables (TBD при completion):**
- Synthetic t<200> project (`G:/Projects/Flutter/serverpod/t200/`)
- Updated test-inventory-audit changelog
- Phase C section в closure-report (Verification + sign-offs + ADR-0005 amendments если потребовались)

**Phase C Verification (TBD):** verify PASS errors=0 + multi-agent review

---

## Phase D — generator infrastructure `--template` CLI flag (placeholder, filled end of D)

**Scope per ADR-0005 Section 1:**
- Implement `--template <name>` CLI flag (`create-project` + `generate-entity` commands)
- Manifest markers для simplified template (set смягчён vs t115's 7-marker pattern — Phase B/C resolves)
- Junction detection regression PASS (TASK-013 / TASK-014 не сломаны под new template)
- Default template selection criteria (per ADR Section 1)

**Deliverables (TBD при completion):**
- CLI flag implementation
- TASK-CI-001 extension к 3-suite split (universal + t115 regression + simplified) wired
- Phase D section в closure-report (Verification + sign-offs)

**Phase D Verification (TBD):** unit tests on flag handling + integration tests CLI + multi-agent review

---

## Phase A-D gate verification (final, end of Phase D)

**Mandatory before `<weight-v2-build TASK>` start:**

- [ ] Phase A section ✅ closed (TeamLead + User counter-sign)
- [ ] Phase B section ✅ closed
- [ ] Phase C section ✅ closed (synthetic t<200> verify PASS errors=0)
- [ ] Phase D section ✅ closed (CLI flag + 3-suite CI split wired)
- [ ] Multi-agent review applied к каждой phase (catch rate ≥1 per review)
- [ ] Backend strategy mitigation in place (Option C dedicated v2 testing scope OR HIGH risk verified resolved)
- [ ] Documentation rulebook ("what generator generates / what agents write manually") finalized — references ADR-0005 + анти-examples
- [ ] sync_core ADR-0006 fix-task status known (in-flight / scheduled / decided NOT-needed)

**Sign-off:**
- @TeamLead ✅ <date>
- @User ✅ <date>

**Without artifact** → `<weight-v2-build TASK>` cannot start через `new_task.py` invocation per Discussion #10 Q15 (Phase A-D gate verification artifact requirement).

---

## Amendment log (closure-report level)

(Updates this document — separate от ADR-0005 amendment log)

| Date | Change | Author |
|------|--------|--------|
| 2026-05-03 | Initial draft (Phase A section completed; B/C/D placeholders) | TeamLead Claude (Sub-A6) |
