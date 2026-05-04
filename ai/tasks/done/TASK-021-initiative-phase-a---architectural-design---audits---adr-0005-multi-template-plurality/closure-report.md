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

## Phase B — TASK-B1 deliverable (codegen core multi-template infrastructure)

**Status:** ✅ Complete (review fixes applied 2026-05-04)
**Branch:** feature/TASK-022-b1-codegen-core-multi-template-infrastructure
**Commits:** 5 round 1 + N round 2 (master..HEAD); см. `git log --oneline master..HEAD`

### Deliverables

| Deliverable | Status | Location |
|---|---|---|
| `TemplateConfig` interface + `t115TemplateConfig()` factory | ✅ | [src/features/generation/config/template_config.ts](../../../src/features/generation/config/template_config.ts) |
| `GenerationConfig.templateConfig` field (default = t115) | ✅ | [src/features/generation/config/generation_config.ts](../../../src/features/generation/config/generation_config.ts) |
| `RelationPatcher` config-driven literals + bonus fix line ~136 | ✅ | [src/features/generation/generators/relation_patcher.ts](../../../src/features/generation/generators/relation_patcher.ts) |
| `OrchestratorPatcher` config-driven path | ✅ | [src/features/generation/generators/orchestrator_patcher.ts](../../../src/features/generation/generators/orchestrator_patcher.ts) |
| `AppDatabaseGenerator` config-driven template path | ✅ | [src/features/generation/generators/app_database_generator.ts](../../../src/features/generation/generators/app_database_generator.ts) |
| +9 unit tests (3 per generator: regression + alt-config + injection) | ✅ | src/test/generators/{relation_patcher,orchestrator_patcher,app_database_generator}.test.ts |

### Verification

- **Multi-agent review (4 reviewers, Discussion #11 Q10=b composition):**
  - Architecture (Approve with fixes): 1 HIGH + 3 MED + 3 LOW — applied
  - Generator-core (Approve with required fix): 2 HIGH + 3 MED + 3 LOW — applied
  - Test (Approve): 0 CRIT/HIGH; 3 MED + 3 LOW — fact-check verified all numerical claims (172 passing, 0 lint errors, +9 cases)
  - Adversarial (Request changes → Approve after fixes): 1 DEAL-BREAKER + 3 HIGH + 2 MED — applied
- **Catch rate threshold ✓ exceeded** — Adversarial caught DEAL-BREAKER (this section missing originally) + 3 HIGH consistent с Phase A precedents
- **Mocha workaround:** 172 passing (round 1) → 173 passing (round 2), 0 failing (3 independent runs ~45ms; baseline 163 + 10 new)
- **Lint:** 0 errors, 18 pre-existing warnings (master baseline same)
- **Verify smoke t165:** PASS errors=0, warnings=1, infos=44 (flutterAnalyze 35895ms / pubGet 5433ms / serverpodGenerate 9535ms / buildRunner 4290ms)
- **Zero-diff smoke t166 (master) vs t167 (feature):** confirmed identical в `<name>_flutter/lib/` + `<name>_server/lib/` + `<name>_admin/lib/` после CRLF + project-name normalization (sed t167→t166 + `--strip-trailing-cr`); remaining diffs только в platform scaffolding generated by `flutter create` / `serverpod create`, не codegen
- **Sandbox writability check `G:/Templates/flutter/simplified/`** ✓ writable (no STOP) — Phase B2 readiness confirmed

### Documented backlog для TASK-B2 (HIGH-3 Generator-core)

См. [BUG-019](../../../bug-reports/019-orchestrator-snippet-hardcoded-literals.md): hardcoded entity literals в `orchestrator_patcher.ts` snippets (`_ENTITY_*` / `_JUNCTION_*` templates lines 410-474 + lines 208/250 entity-type literals) — **OK для B1 scope** (path был только цель TASK-B1), но landmine для TASK-B2 (simplified template content). TASK-B2 acceptance включает refactor этих snippets через `templateConfig.orchestrator` extended fields.

### MEDIUM/LOW deferred к TASK-B2 либо backlog

- Discriminator field `name` runtime-dead (Architecture M1) — TASK-B2 решает (drop OR add usage)
- Template defaults (`'tasks'`/`'category'`) в `GenerationConfig` constructor (Architecture M2) — TASK-B2 work
- `app_database_generator` target write path asymmetric (Architecture M3) — capacity-bound symmetry fix
- `scanDirectories` field never exercised alt-config'ом (Test M2) — addressed by H4 fix
- TDD-first ordering not auditable (Test M3 + Adversarial M-1) — future TASK practice: separate test commits

### Sign-offs

- @TeamLead ✅ 2026-05-04 (post review fixes apply)
- @User ⏳ pending merge approval

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

## Phase B — TASK-024 deliverable (simplified template directory bootstrap)

**Status:** 🟡 In progress (pending review apply + merge approval) — Sessions A-E3d2 complete, ready for multi-agent review (4 reviewers)
**Branch:** `feature/TASK-024-b2-simplified-template-directory-bootstrap`
**Commits:** см. `git log --oneline master..HEAD` post-Session-E3d2 commits

**Deliverables:**
- Simplified template directory bootstrap (`G:/Templates/flutter/simplified/`) — Configuration baseline (singleton entity per ADR-0005 §3.1) + 4 fixture entities в `features/tasks/` (Category/Tag/Task/TaskTagMap) для substitution flow
- Architecture ceremony stripped (per ADR-0005 §3.5): no usecases / no abstract repository interfaces / no business notifiers / no validation gen / no application services / no separate mappers / no Either-Result / no datasource interfaces в flutter app
- pubspec safe bumps к latest stable (Riverpod / Drift / sync_core / Serverpod packages — stack package SET locked per Discussion #11, только versions update)
- Generator default switched к simplified (DEFAULT_TEMPLATE = 'simplified' in `template_profile.ts`); legacy path preserved через `--template t115` opt-in flag
- Bootstrapper dynamic depth-delta для path-deps к Packages (Approach 2 patcher для Templates/Packages/ + out-of-monorepo Projects/Packages/ paths)
- Defensive empty-targetEntity guard в `generation_service._getDestinationPath`
- Simplified template orchestrator file fixed (Configuration-only baseline; previously had Tasks fixture registrations baked в pre-E3d2 → не bootstrappable)

**Verification (cited evidence):**
- Mocha 181/181 passing post Session E3d2 fix (см. tail evidence в Session E3d2 step 3)
- Compile clean (`npm run compile`)
- Default flow smoke `t176`: `verify --name t176` PASS errors=0, warnings=0, infos=30
  - Shape verify: 0 usecases в `t176_flutter/`, 0 abstract repository interfaces, features dir = baseline (auth/bluetooth/configuration/developer_tools/home/settings_definitions/) — без Tasks fixture leak
- Legacy flow smoke `t177`: `verify --name t177 --template t115` PASS errors=0, warnings=1, infos=44 — regression preserved
- Strip checklist (per ADR-0005 §3.5): all-zero usecases / interfaces в `t176_flutter`
- Stack lock preserved (Riverpod + Drift + sync_core + Serverpod package SET unchanged)

**BUG-019 closure:** end-to-end validated через default flow t176 + legacy flow t177 (both errors=0). Закрыт 2026-05-04. Marker scheme + config-driven snippets (TemplateConfig.orchestrator) work as designed; previous E3d default switch errantly set `templFeatureName='configuration'` для simplified flow → E3d2 corrected к 'tasks' (matching t115 — Configuration baseline копируется как-есть startProject manifest, substitution-источник = `features/tasks/` Category fixture в обоих templates). Также cleaned simplified template's `sync_orchestrator_provider.dart` — Configuration-only baseline (Tasks fixture registrations добавляются через `generate-entity` pipeline post-bootstrap).

**Sign-offs:**
- @TeamLead ⏳ pending review apply
- @User ⏳ pending merge approval

**Pending для Phase B closure:**
- Multi-agent review (4 reviewers) apply
- PR created + reviewed + merged
- Phase B section status updates → ✅ closed

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
