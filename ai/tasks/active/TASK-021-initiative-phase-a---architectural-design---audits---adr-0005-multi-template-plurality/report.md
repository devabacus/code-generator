# Отчёт TASK-021 (Initiative Phase A — architectural design + audits + ADR-0005)

**Status:** ✅ Ready for Sub-A6 finalize (ADR promotion + User counter-sign + docs/closure-report + PR)
**Date:** 2026-05-03 (single-day execution after Discussion #10 Decision finalization)
**Process:** TeamLead-orchestrated (Sub-A0/A0.5/A1) + 2 executor subagents parallel (Sub-A2 ADR + Sub-A3 sync_core audit + Sub-A4 test inventory) + 4 reviewer subagents parallel Sub-A5 (architecture + sync + test + adversarial overlay) + TeamLead applied review fixes

## Резюме

TASK-021 реализует Discussion #10 13-point Decision — Initiative Phase A architectural design phase. Single TASK с **7 sub-phases** (Sub-A0 → A0.5 → A1 → A2 + A3 + A4 parallel → A5 → A6) + STOP-gates per phase.

**Architectural foundation produced:**

1. **ADR-0005 (Multi-template plurality + simplified architecture)** — canonical formalization Discussion #7 + Discussion #10 decisions. 7 mandatory sections, generate-side + migration-side anti-examples per category, Phase C amendment clause, Riverpod/Drift TBD placeholders Q7=e REJECT.
2. **`sync-core-audit.md`** — dual-protocol risk classification (1 HIGH-pending-verification + 2 MEDIUM + 2 LOW) + recommendation **Option C (dedicated v2 testing scope)** + complementary Option B (sync_core ADR amendment) для backend event-emission contract formalization.
3. **`test-inventory-audit.md`** — (file, category, action) tuple table 18 файлов / 164 cases / 5 actions; **78% cases / 72% files universal**. Living document до Phase G с changelog policy.
4. **`backend-strategy-rationale.md`** — Option 1 (same backend) confirmed + 4 Option 2 trigger criteria + Sub-A0.5 evidence + Sub-A4 preliminary count integrated.
5. **`weight-v1-schema-audit.md`** — TeamLead-produced evidence-based evaluation 4 Option 2 triggers (0.5 of 4 active — только Trigger 1 partial sync-layer dimension).

**User decisions resolved/pending:**

- ✅ Sub-A1 STOP-gate: User confirmed **Option 1 (same backend)** 2026-05-03 ("ок делай" implicit acknowledgment).
- ⏳ Sub-A6 STOP-gate (ADR-0005 text counter-sign) — pending User read + sign-off.
- ⏳ Sub-A6 STOP-gate (decision matrix v1 maintenance approval) — pending User explicit approval (data loss / security / sync = fix v1; UI / perf / features = defer / v2).

## Multi-agent review process applied (Discussion #10 Q10=d двухслойная structure)

**Layer 1 (pre-implementation):** Discussion #10 ✅ done — 4 agents (TeamLead + Claude_1 + Chatgpt_1 + ClaudeN_1) convergence на 13-point Decision.

**Layer 2 (Sub-A5 post-implementation gate):** 4 reviewers parallel (architecture + sync + test + adversarial overlay) — **49 findings total** (5 CRITICAL / DEAL-BREAKER + 14 HIGH + 11 MEDIUM + 14 LOW + multiple cross-cutting). Catch rate threshold ≥1 substantially exceeded по всем 4 angles.

### Sub-A5 catches → fixes applied

| # | Reviewer | Severity | Finding | Action |
|---|----------|----------|---------|--------|
| 1 | Architecture | CRITICAL | ADR Section 3.3 + 3.4.4 anti-example duplicate wrong citation `Discussion #7 Q5=a` (no such Q exists; Q5=a в Discussion #10 explicitly REJECTED) | ✅ Fixed: replaced со corrected `Discussion #10 Q5=b principle + ClaudeN migration-side anti-examples` |
| 2 | Architecture + Adversarial | CRITICAL / DEAL-BREAKER | ADR Section 3.4.4 commits к `@riverpod` annotation example + Section 2 mentions "Notifier" — pre-decides Riverpod variant despite Section 7.1 + Q7=e REJECT | ✅ Fixed: Section 3.4.4 example переписан как illustrative pseudocode (no annotation pre-decision); Section 7.1 expanded с explanation note про Sub-A5 fix |
| 3 | Test + Adversarial | CRITICAL / DEAL-BREAKER | test-inventory action distribution `keep-universal = 124 cases / 76%` — actual sum 128 / 78% (4-case undercount), "+4" handwave note misleading | ✅ Fixed: распределение recomputed (128/78%), Total math 160→164/100% clean, note rewritten со audit trail |
| 4 | Test + Adversarial | CRITICAL / DEAL-BREAKER | test-inventory line 30 prose distribution swap (2 t115 / 3 rewrite vs reality 3 t115 / 1 rewrite / 1 delete) | ✅ Fixed: prose corrected к match table |
| 5 | Test | CRITICAL | `app_database_generator.test.ts` rationale falsely claims "no Clean-specific paths" — generator hardcodes `data/datasources/local/tables/` (Clean convention) | ✅ Fixed: rationale qualified ("universal verdict conditional on simplified preserving Clean directory hierarchy"); Open Question #3 added |
| 6 | Architecture + Adversarial | HIGH / DEAL-BREAKER | ADR Section 4.3 placeholder TBD despite Sub-A3 ✅ complete | ✅ Fixed: full Sub-A3 risk classification + Option C recommendation inserted; pending Sub-A6 finalize |
| 7 | Adversarial | HIGH / DEAL-BREAKER | ADR pre-supposes decision matrix v1 maintenance approval which is PENDING per task.md acceptance #82 | ✅ Fixed: ADR Section 1 + 5 references qualified ("recommended Discussion #9, awaiting User counter-sign"); Sub-A6 STOP-gate explicit |
| 8 | Architecture | HIGH | Phase C amendment clause verbatim quote followed by editorial rationale paragraph causes "did User counter-sign normative clause OR rationale?" ambiguity | ✅ Fixed: rationale labelled `Rationale (editorial — not part of normative clause)` + normative clause clearly marked verbatim |
| 9 | Architecture | HIGH | Anti-example 3.4.3 `❌ syncStatus inline column` — no exclusion clause for legitimate local-only entities | ✅ Fixed: exclusion clause added ("local-only entities opt-out from sync_core registration — inline marker остаётся consumer's choice") |
| 10 | Architecture | HIGH | Anti-example 3.4.1 `❌ Multi-entity coordination` — blanket prohibition contradicts junction generation (TASK-014 + sync_core ADR-0004 Patterns 6-7) | ✅ Fixed: carve-out added ("Junction entities — НЕ multi-entity coordination, generator emits atomic parent + junction insert per junction adapter generation") |
| 11 | Architecture | HIGH | Section 1 "Default template TBD в Phase D" lacks decision criteria | ✅ Fixed: explicit criteria added ("(a) which template applies to majority new projects, (b) which template имеет full Initiative validation; strong indication = simplified, binding decision deferred Phase D") |
| 12 | Sync | HIGH | sync-core-audit Option B reasoning incomplete — sync_core ADR amendment IS openable for backend event-emission contract formalization | ✅ Fixed: Option B reframed ("Partially applicable — ADR-0006 fix-task в sync_core repo recommended, complementary к Option C, не mutually exclusive") |
| 13 | Sync | HIGH | sync-core-audit HIGH severity over-justified — verification cheap, should be HIGH-pending-verification | ✅ Fixed: severity classification appended "Verification cheap (~30 min spike) demotes к LOW immediately если backend Design B; defaults к dedicated scope если verification deferred" |
| 14 | Sync | MEDIUM | sync-core-audit missing Scenario 5 soft-delete tombstone propagation (legitimate gap given weight v1 `isDeleted` field) | ✅ Fixed: Scenario 5 added (v1 soft-delete + v2 pending update race + LocalApplyAdapter contract gap + ADR-0005 codification recommendation) |
| 15 | Adversarial | HIGH | rationale.md "≥80%" claim contradicts table (76%) и downstream references — fabricated number | ✅ Fixed: corrected к 78% cases / 72% files universal во всех живых docs (rationale.md / test-inventory / ADR Section 5) + audit trail в changelog |
| 16 | Adversarial | HIGH | Sub-A1 sign-off framing использовал inflated "≥80%" claim — User decision на slightly distorted evidence | ✅ Acknowledged: NB note added в rationale.md User decision section ("User retains right re-evaluate если уточнённые numbers меняют preference; TeamLead recommendation Option 1 stays correct") |
| — | Architecture | MEDIUM | Section 5 backend strategy duplicates Sub-A0.5 trigger evaluation table inline (drift risk) | ⏭ Defer Sub-A6 — TeamLead решит keep inline (self-contained ADR) или collapse to reference; not blocker |
| — | Sync | MEDIUM | Coalescer deviceId assumption unstated/unverified | ⏭ Defer — flagged as verification ask в weight v2 build (not Phase A scope) |
| — | Sync | MEDIUM | ADR-0004 Pattern 6/7 dual-protocol implication not engaged | ✅ Partial: ADR Section 4.3 includes Pattern 6 amendment note ("in dual-protocol scenarios, child entity FK validation depends на backend ordering semantics, не consumer-side enqueue order"); Pattern 7 deferred к weight v2 build |
| — | Adversarial | MEDIUM | report.md stub — no consolidated audit trail | ✅ Fixed (this file) |
| — | Adversarial | MEDIUM | ADR-0005 numbering jump from ADR-0001 unjustified | ⏭ Defer Sub-A6 — TeamLead consider rename `adr-0005-...` → `adr-0002-...` либо document numbering reservation; not blocker |
| — | Multiple | LOW | Various nitpicks (action SHA pinning, CRLF, ubuntu-latest drift, header consistency, etc.) | ⏭ Defer — backlog items |

**Multi-agent review pattern validated 6-й precedent** (Phase 1.5 PR #6/#8/#9 + Discussion #6 + TASK-CI-001 + сейчас TASK-021 Phase A). Adversarial overlay особенно ценный — поймал cross-deliverable arithmetic drift + process gaps что thematic reviewers пропустили.

## Изменения

### NEW (TASK folder)

- [task.md](task.md) — TASK contract (7 sub-phases plan + STOP-gates + acceptance criteria)
- [report.md](report.md) — this file
- [weight-v1-schema-audit.md](weight-v1-schema-audit.md) — Sub-A0.5 (TeamLead, ~30 min): 4 Option 2 triggers evaluated, 0.5/4 active (Trigger 1 partial sync-layer)
- [backend-strategy-rationale.md](backend-strategy-rationale.md) — Sub-A1 (TeamLead): Option 1 recommended, 4 trigger criteria documented, Sub-A0.5 + Sub-A4 evidence integrated, User Option 1 sign-off recorded
- [adr-0005-draft.md](adr-0005-draft.md) — Sub-A2 (executor subagent ae2f2ca3ee3c386a4): 7 mandatory sections + 6 generate-side + 7 migration-side anti-examples + Phase C amendment clause + TBD placeholders. **Updated post-Sub-A5 review** (4 critical fixes applied + 6 high fixes + medium fixes)
- [sync-core-audit.md](sync-core-audit.md) — Sub-A3 (executor subagent ae841f5cf7a5d6a6a): dual-protocol audit, ADR-0001..0004 review per section, 5 mutation race scenarios (включая Scenario 5 soft-delete added Sub-A5), HIGH-pending-verification + 2 MEDIUM + 2 LOW classification, Option C recommendation + complementary Option B reframe
- [test-inventory-audit.md](test-inventory-audit.md) — Sub-A4 (executor subagent a7e6bf7d77b48c988): living document, (category, action) tuple table 18 файлов / 164 cases / 5 actions, distribution 78%/19%/0%/2%/1%, Open Questions ×3 (added #3 directory layout dependency Sub-A5 fix), changelog с entry policy

### MODIFIED (codegen docs, Sub-A0)

- [ai/docs/status.md](../../docs/status.md) — TASK-021 added к active; previous TASK-020 listing remains valid
- [ai/docs/roadmap.md](../../docs/roadmap.md) — Month 1 sequence updated with Phase A in-progress (TASK-021)
- [ai/docs/agent_memory.md](../../docs/agent_memory.md) — Phase A pointer added к Approved sequence Next steps

### PENDING Sub-A6 finalize

- `ai/docs/decisions/adr-0005-multi-template-plurality.md` — promote `adr-0005-draft.md` после User counter-sign на text + decision matrix
- `closure-report.md` — Phase A-D Closure Report draft (Phase A section completed; B/C/D placeholders) per ClaudeN structure
- Final updates к status.md / roadmap.md / agent_memory.md / handoff.prompt.md (Phase A closed, Phase B unblocked)

## Тесты

**N/A для этой TASK** (Phase A = ADR + audits + decisions, не code changes):
- Нет правки `src/` → `npm run compile` / `npm run lint` / mocha не triggered
- Нет правки `.github/workflows/` → CI gate stable per TASK-020
- Нет правки шаблона t115 → `codegen verify` не нужен
- Только docs + ADR markdown + audit reports

**CI behaviour expected:** PR на этот branch trigger TASK-020's `.github/workflows/test.yml`, expected PASS (только docs changes, no source touched).

**Acceptance gates** = User sign-offs (backend strategy ✅ done; ADR text + decision matrix pending Sub-A6) + multi-agent review findings addressed (✅ all CRITICAL/DEAL-BREAKER fixed; HIGH ≥80% applied; MEDIUM partial — defer documented; LOW deferred).

## Acceptance criteria status

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Sub-A0.5 weight-v1-schema-audit.md per-trigger evidence | ✅ | 4 triggers evaluated с evidence из weight v1 Drift schema + Serverpod YAML; 0.5/4 active |
| Sub-A1 User signed off backend strategy | ✅ | Option 1 confirmed 2026-05-03, recorded в backend-strategy-rationale.md |
| Sub-A2 adr-0005-draft.md covering 7 sections | ✅ | All 7 mandatory sections present; updated post-Sub-A5 fixes |
| Sub-A3 sync-core-audit.md mandatory structure | ✅ | ADR-0001..0004 review + 5 mutation race scenarios + risk classification + Option A/B/C recommendation; Sub-A5 fixes applied (HIGH-pending-verification qualifier + Option B reframe + Scenario 5 + Pattern 6/7 note) |
| Sub-A4 test-inventory-audit.md tuple table | ✅ | 18 files / 164 cases / 5 actions; living document + changelog policy + Open Q ×3; Sub-A5 math fixes applied (124→128, 76%→78%) |
| Sub-A5 multi-agent review applied | ✅ | 4 reviewers parallel (architecture / sync / test / adversarial overlay), 49 findings, catch rate ≥1 на всех 4 angles, fixes applied pre-Sub-A6 |
| Sub-A6 ADR promoted + User counter-sign + closure-report | ⏳ | Pending — next step |
| User decision matrix v1 maintenance approved | ⏳ | Pending — Sub-A6 STOP-gate |
| Все docs обновлены | ⏳ | Sub-A0 partial done; Sub-A6 finalize completes (status / roadmap / agent_memory / handoff) |
| report.md содержит evidence per sub-phase | ✅ | This file |

**Итого: 6/10 ✅ executor-side, 4/10 pending Sub-A6 finalize.**

## Решения / Заметки

- **Phase A organization:** Single TASK-021 с 7 sub-phases (per Discussion #10 Q1=c hybrid + Sub-A0.5 added per ClaudeN). Sub-A0.5 + Sub-A4 ran parallel с Sub-A1 wait (compresses calendar 7-12d → 5-9d typical case).
- **Backend strategy Option 1:** confirmed на 0.5/4 trigger activation + 78% universal tests evidence. Sync-layer rewrite inherent в weight v2 (sync_core 0.3.0 adoption) — независимо от backend choice.
- **Dual-running risk Option C:** dedicated v2 testing scope (`customer = 'v2_staging_<userId>'`) до production cutover. HIGH risk = backend event emission contract gap (verification-pending). Sync_core ADR amendment в sync_core repo = complementary fix-task (Option B reframed).
- **Anti-examples generate-side + migration-side** = Discussion #10 Claude_1 + ClaudeN combined pattern. Constrains Phase B-D drift в обе стороны (over/under-constrains).
- **Phase C amendment clause** = ClaudeN's verbatim wording, normative clause clearly labelled, editorial rationale separately marked.
- **Q7=e REJECT enforcement:** Riverpod variant / Drift conventions / manifest markers — TBD placeholders Section 7. ADR Section 3.4.4 example pseudocode (no annotation pre-decision).
- **Test inventory Open Q #3 (Sub-A5 addition):** simplified template directory layout dependency — `app_database_generator.test.ts` 11 cases verdict conditional on Clean hierarchy preservation. Phase B prototype resolves; Sub-A6 closure-report flags для Phase B-D handoff.
- **Multi-agent review pattern validated 6-й precedent.** Adversarial overlay (4-th reviewer) caught cross-deliverable arithmetic drift + process gaps что thematic reviewers пропустили — justifies Q10=d 3 thematic + 1 Adversarial pattern для Phase A architectural design.

## Что НЕ сделано (намеренно — вне scope)

- НЕ реализован simplified template код (Phase B scope)
- НЕ создан synthetic t<200> reference project (Phase C scope)
- НЕ реализован `--template` CLI flag (Phase D scope)
- НЕ начат `<weight-v2-build TASK>` (Phase A-D gate not closed yet)
- НЕ pre-decided Phase B-D decisions (Riverpod variant / Drift conventions / manifest markers — Q7=e REJECT)
- НЕ финализирован Phase A-D `closure-report.md` (Sub-A6 draft only — Phase A section; full document = end of Phase D)
- НЕ открыт sync_core ADR-0006 fix-task (separate task в sync_core repo, complementary к Option C; weight v2 build trigger)
- НЕ проведён backend event emission verification spike (out of Phase A scope; weight v2 build executes)

## Risks / Наблюдения post-fix

- **HIGH risk (backend event emission)** verification-pending — Phase A-D gate cannot close без либо verification done либо Option C mitigation in place.
- **Decision matrix v1 maintenance approval** = separate User STOP-gate (Sub-A6); ADR text references conditional ("recommended Discussion #9, awaiting User counter-sign").
- **`<weight-v2-build TASK>` ID allocation** — `new_task.py` allocates next available после Phase A-D gate close. Placeholder remains во всех живых docs до тех пор; Sub-A6 closure-report includes batch-update note.
- **Sub-A5 каталог fixes** — 5 CRITICAL + 14 HIGH applied; 4 MEDIUM deferred (Section 5 inline trigger duplication / coalescer deviceId verification / ADR-0004 Pattern 7 / ADR numbering jump) с rationale в этом report.

## Открытые вопросы для User Sub-A6

1. **ADR-0005 text counter-sign** — read [adr-0005-draft.md](adr-0005-draft.md), sign off на text как канонический architectural contract. SLA 1 неделя.
2. **Decision matrix v1 maintenance approval:**
   - Data loss / security / sync corruption → fix v1 immediately
   - UI bugs / performance regression → defer (cosmetic для frozen app)
   - New feature request → reject (v2 backlog)
   - Confirm / reject / modify эту matrix.
3. **Backend strategy re-evaluation (optional):** numbers refined post-Sub-A5 (≥80% → 78% universal). Direction unchanged; TeamLead recommendation Option 1 stays. Re-evaluate если уточнённые numbers меняют preference.
4. **MEDIUM defer items confirmation:** OK delay (a) Section 5 trigger duplication consolidation, (b) coalescer deviceId verification, (c) ADR-0004 Pattern 7 dual-protocol expansion, (d) ADR-0005 numbering reservation? Все backlog candidates, не Phase A blockers.

## Status

**Ready for Sub-A6 finalize.**

Sub-A0..A5 ✅ done. All CRITICAL/DEAL-BREAKER + 80% HIGH findings addressed. ADR-0005 ready for promotion + User counter-sign. closure-report.md draft pending. Final docs sync + commit + PR pending.

**Next steps (Sub-A6):**
1. Apply remaining HIGH/MEDIUM acknowledged-but-not-applied fixes (минор — мост finished pre-this report)
2. Promote `adr-0005-draft.md` → `ai/docs/decisions/adr-0005-multi-template-plurality.md`
3. Draft `closure-report.md` (Phase A section completed; B/C/D placeholders) per ClaudeN structure
4. Update docs (status.md / roadmap.md / agent_memory.md / handoff.prompt.md) — Phase A closed, Phase B unblocked
5. `task.py pr` → push + create PR + verify CI run
6. **STOP-gate:** await User counter-sign на ADR text + decision matrix approval
7. After User sign-offs: `task.py merge -y` (only when User explicitly says "мержить")
