# Phase A-D Closure Report (TASK-021..TASK-NNN)

**Status:** 🟡 Draft (Phase A section ✅ complete; Phase B / C / D placeholders pending)
**Maintained:** Phase A executor (TeamLead Claude) — accumulator until end of Phase D
**Final sign-off (end of Phase D):** TeamLead + User counter-sign — gates `<weight-build TASK>` start

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

- **Backend strategy (Option 1)** — ✅ confirmed 2026-05-03 ("ок делай" Sub-A1 acknowledgment, recorded в backend-strategy-rationale.md). **Post clean-slate decision:** Option 1 trivially correct (nobody writing к backend, weight build = first user).
- **ADR-0005 text counter-sign** — ✅ confirmed 2026-05-03 ("ok а" implicit acknowledgment after Sub-A6 PR #16 review + CI PASS + clean-slate amendments)
- **Decision matrix v1 maintenance approval** — ⏭ **N/A под clean-slate decision 2026-05-03** (нет v1 в production → нет maintenance criteria для approve)

**All Sub-A6 STOP-gates ✅ resolved.** Phase A section closed. Clean-slate decision (User 2026-05-03) удалила dual-running concerns + decision matrix requirement. Awaiting Phase B/C/D execution для full Phase A-D gate close (final TeamLead + User counter-sign at end of Phase D).

**⚠ CRITICAL Stack-lock decision (2026-05-03 — Discussion #11 User_2 override + ADR-0005 amendment):** Стэк t115 baseline (Riverpod через `@riverpod` annotations + Drift conventions + Clean directory layout + sync_core 0.3.0 + Serverpod) НЕ меняется без явного User approval. Версии всех packages update к latest stable (включая Serverpod). Simplified философия меняет ТОЛЬКО architecture ceremony (NO usecases / business notifiers / validation / repository interfaces по умолчанию / app services / mappers separate class / Either-Result / datasource interfaces). ADR-0005 Section 7.1/7.2/7.3 TBD placeholders RESOLVED via stack lock. Phase B-D + weight build all inherit this constraint. Future agents treat stack lock как hard architectural invariant.

### Phase A Risks documented for Phase B-D

**Post clean-slate decision (2026-05-03):** Sub-A3 dual-running risks (sync-core-audit #1-#5) NOT applicable для weight build — see [sync-core-audit.md](sync-core-audit.md) "Reference-only" status pinning. Useful single-app applicable findings retained:

1. **MEDIUM (single-app sync_core best practice):** Server-stamps `lastModified = serverNow()` on accept = LWW correctness между multi-device users одного приложения (multiple weight clients одного customer на разных phones). **Phase B-D action:** weight server endpoint contract codifies этот convention.
2. **MEDIUM (single-app sync_core best practice):** Server endpoints support idempotent create с deterministic UUID v7 id = network retry safety (mobile flaky connection, retried POST не дублирует record). **Phase B-D action:** verified в weight server endpoints.
3. **MEDIUM (sync-core-audit Scenario 5 Sub-A5 addition, applicable single-app):** Soft-delete tombstone propagation — `LocalApplyAdapter` contract gap. sync_core ADR-0001/0002 silent на whether `localApply` should treat `isDeleted=true` от server pull как DELETE на local row либо UPDATE preserving the row. **Mitigation:** ADR-0005 codifies "v2 LocalApplyAdapter treats `isDeleted=true` from server pull as DELETE on local row" — applies к weight build (single-app sync_core consumer).
4. **MEDIUM (test-inventory Open Q #3 Sub-A5 addition):** simplified template directory layout dependency — `app_database_generator.test.ts` 11 cases verdict universal conditional на Clean hierarchy preservation. **Phase B prototype resolves;** если flatten → 11 cases демотируются к `rewrite-for-template-abstraction`.
5. **R1-R5 ADR risks** (over-constrains / under-constrains / test inventory stale / Option 1 assumed / category paralysis): mitigations applied (anti-examples generate-side + migration-side / living document / Option 2 triggers / Phase C amendment clause).
6. **LOW (sync_core ADR-0006 amendment opportunity):** formalize backend event-emission contract surface + server-stamp convention в sync_core ADR — useful documentation regardless of clean slate. Separate task в sync_core repo, не TASK-021 scope.

### Phase B unblock backlog (handoff к Phase B executor)

- **Open Question #1 (test-inventory):** RelationPatcher applicability в simplified template — Phase B prototype resolves (если не используется → both relation_patcher tests stay strictly t115 suite)
- **Open Question #2 (test-inventory):** OrchestratorPatcher DI style adaptation для simplified — Phase B prototype resolves (если другой DI стиль → orchestrator_patcher.test.ts требует `port-simplified`)
- **Open Question #3 (test-inventory + ADR Section 7.3):** simplified template directory layout (`data/datasources/local/tables/` preservation) — Phase B prototype resolves (affects app_database_generator + relation_generation + lib/core/sync paths)
- **TBD placeholders (ADR Section 7.1 + 7.2):** Riverpod variant + Drift conventions — Phase B prototype первой simplified entity скажет
- **CI 3-suite split (TASK-CI-001 future):** wired когда (a) ≥1 simplified suite файл exists AND (b) generation_service.test.ts refactored. Sub-A4 mapping готов для extension.
- **`<weight-build TASK>` ID resolution:** при `new_task.py` invocation присваивается next available; batch grep+replace `<weight-build TASK>` placeholder во всех живых docs (status.md / roadmap.md / agent_memory.md / handoff.prompt.md / closure-report.md). NB: post clean-slate decision placeholder dropped "v2" prefix — нет "v1" чтобы distinguish от.
- **sync_core ADR-0006 fix-task** (sync_core repo, optional): formalize backend event-emission contract surface + server-stamp `lastModified` convention в `SyncRemoteEventAdapter` + `SyncPayloadCodec` adapter contract. Useful documentation regardless of clean slate. Trigger по capacity / interest, не blocking weight build.

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

**Mandatory before `<weight-build TASK>` start (post clean-slate decision):**

- [x] Phase A section ✅ closed (TeamLead + User counter-sign 2026-05-03)
- [ ] Phase B section ✅ closed
- [ ] Phase C section ✅ closed (synthetic t<200> verify PASS errors=0)
- [ ] Phase D section ✅ closed (CLI flag + manifest markers wired; default `--template simplified`)
- [ ] Multi-agent review applied к каждой phase (catch rate ≥1 per review)
- [ ] Documentation rulebook ("what generator generates / what agents write manually") finalized — references ADR-0005 + anti-examples

**Removed under clean-slate (2026-05-03):**
- ~~Backend strategy mitigation Option C dedicated v2 testing scope~~ — N/A (no v1 in production)
- ~~HIGH risk verified resolved~~ — N/A (dual-running risks moot)
- ~~Decision matrix v1 maintenance approval~~ — N/A
- ~~sync_core ADR-0006 fix-task obligatory~~ — optional (useful documentation regardless, не blocking weight build)

**Sign-off (final, end of Phase D):**
- @TeamLead ⏳ pending Phase D
- @User ⏳ pending Phase D

**Without artifact** → `<weight-build TASK>` cannot start через `new_task.py` invocation per Discussion #10 Q15 (Phase A-D gate verification artifact requirement).

---

## Amendment log (closure-report level)

(Updates this document — separate от ADR-0005 amendment log)

| Date | Change | Author |
|------|--------|--------|
| 2026-05-03 | Initial draft (Phase A section completed; B/C/D placeholders) | TeamLead Claude (Sub-A6) |
| 2026-05-03 | Clean-slate amendment: dual-running risks removed (Sub-A3 audit pinned reference-only); decision matrix v1 maintenance N/A; `<weight-v2-build TASK>` → `<weight-build TASK>` placeholder rename; Phase A-D gate checklist simplified (4 mandatory + 4 removed); estimate revised к ~3-4 months realistic (was 5-6) | TeamLead Claude (post User clean-slate decision) |
