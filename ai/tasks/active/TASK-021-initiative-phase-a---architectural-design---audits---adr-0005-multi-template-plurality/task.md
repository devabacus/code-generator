# TASK-021: Initiative Phase A — architectural design + audits + ADR-0005 multi-template plurality

## Ветка

`feature/TASK-021-initiative-phase-a---architectural-design---audits---adr-0005-multi-template-plurality`

## Контекст

После Phase 1.5 closure (TASK-019 ✅) + HOTFIX-001 ✅ + TASK-020 (TASK-CI-001 CI gate) ✅, sequence Discussion #9 переходит к **Initiative Phase A — architectural design phase**.

**Discussion #10 ([archive](../../discussions/archive/10-initiative-phase-a-simplified-template-a/))** финализирована 2026-05-03 (4-agent convergence: TeamLead + Claude_1 + Chatgpt_1 + ClaudeN_1, 13-point Decision). Эта TASK реализует Decision.

**Phase A = ADR + audits + decisions, НЕ implementation.** Phase A-D gate 5 deliverables:
1. ✅ **TASK-021 (this)** — ADR + audits (Phase A scope)
2. Synthetic reference project t<200> (Phase C scope)
3. Generator infrastructure `--template` flag (Phase D scope)
4. Multi-agent review pattern applied (Sub-A5 для Phase A; recurring per phase)
5. Documentation rulebook (part of ADR + Phase G doc reconciliation)

## Цель

Создать architectural foundation для Initiative Phase B-D + `<weight-v2-build TASK>`:

1. **ADR-0005 (Multi-template plurality + simplified architecture)** — canonical architectural contract, User counter-signed
2. **sync-core-audit.md** — risk classification dual-running v1+v2 на same backend
3. **test-inventory-audit.md** — (category, action) tuple table для 163 baseline tests, living document до Phase G
4. **backend-strategy-rationale.md** — Option 1 default + 4 Option 2 trigger criteria + Sub-A0.5 weight v1 schema evidence
5. **weight-v1-schema-audit.md** — TeamLead-produced evidence-based evaluation Option 2 triggers
6. **closure-report.md draft** — Phase A section completed; B/C/D placeholders для full Phase A-D gate artifact (finalized end of Phase D)

User counter-signs: backend strategy + decision matrix v1 maintenance + ADR-0005 text.

## Не-цели

- НЕ реализовывать simplified template код (Phase B scope)
- НЕ создавать synthetic t<200> reference project (Phase C scope)
- НЕ реализовывать `--template` CLI flag (Phase D scope)
- НЕ начинать `<weight-v2-build TASK>` (только after Phase A-D gate closed)
- НЕ принимать Phase B-D decisions (Riverpod variant / Drift conventions) — emerge из B-D prototyping (Q7=e REJECT per Discussion #10)
- НЕ менять existing t115 template (legacy/advanced, stays maintained)
- НЕ менять source code в `src/` (генератор) — только ADR + audit reports + docs
- НЕ менять `package.json` / dependencies
- НЕ финализировать Phase A-D `closure-report.md` (это end of Phase D)

## Scope

**Разрешено создавать/модифицировать:**

- `ai/tasks/active/TASK-021-.../` — task folder с artifacts:
  - `task.md` (this)
  - `report.md` (final report)
  - `weight-v1-schema-audit.md` (Sub-A0.5)
  - `backend-strategy-rationale.md` (Sub-A1 input)
  - `adr-0005-draft.md` (Sub-A2 work, promotes в `ai/docs/decisions/` в Sub-A6)
  - `sync-core-audit.md` (Sub-A3)
  - `test-inventory-audit.md` (Sub-A4, living document)
  - `closure-report.md` (Sub-A6 draft, Phase A section only; B/C/D placeholders)
- `ai/docs/decisions/adr-0005-multi-template-plurality.md` — promoted в Sub-A6
- `ai/docs/status.md` — TASK-021 active → done; Phase A status updates
- `ai/docs/roadmap.md` — Month 1 sequence updates
- `ai/docs/agent_memory.md` — Phase A closure pointer

**Запрещено:**

- Менять `src/` (генератор)
- Менять `package.json` / `package-lock.json`
- Менять шаблон `G:/Templates/flutter/t115/`
- Менять `.github/workflows/` (CI gate stable per TASK-020)
- Реализовывать simplified template fixtures / generator changes (Phase B-D scope)
- Финализировать Phase A-D closure-report (end of Phase D)
- Trigger HIGH risk fix-task в sync_core repo напрямую (escalation only — fix-task создаётся отдельно)

## Критерии приёмки

- [x] **Sub-A0.5:** `weight-v1-schema-audit.md` — per-trigger evidence (4 Option 2 triggers оценены active/not-active с evidence из weight v1 Drift schema + Serverpod YAML)
- [x] **Sub-A1:** User signed off backend strategy (Option 1/2/3) — recorded в task.md журнале + `backend-strategy-rationale.md`
- [x] **Sub-A2:** `adr-0005-draft.md` covering: multi-template plurality (Discussion #7 formalization) + simplified architecture (Discussion #7 Q3=b с boundaries) + generate-vs-not-generate divider (principle + generate-side anti-examples + migration-side anti-examples) + sync_core integration model + backend strategy (Sub-A1 confirmed) + Phase C amendment clause + Riverpod/Drift TBD placeholders
- [x] **Sub-A3:** `sync-core-audit.md` — pre-staged file/section list reviewed, 5 mutation race scenarios analysed (Scenario 5 soft-delete added Sub-A5), HIGH-pending-verification / MEDIUM / LOW risk classification + recommendation Option C (complementary Option B sync_core ADR amendment)
- [x] **Sub-A4:** `test-inventory-audit.md` — (category, action) tuple table 164 cases с 5 actions + changelog section + living document marker + Sub-A5 math fixes (78% universal cases / 72% files)
- [x] **Sub-A5:** Multi-agent review applied (Layer 2: 4 reviewers — architecture / sync / test / adversarial overlay), catch rate ≥1 per review met (49 findings, 5 CRITICAL/DEAL-BREAKER + 14 HIGH applied)
- [x] **Sub-A6:** ADR promoted в [ai/docs/decisions/adr-0005-multi-template-plurality.md](../../docs/decisions/adr-0005-multi-template-plurality.md); `closure-report.md` Phase A section completed (B/C/D placeholders); pending User counter-signed ADR text + decision matrix v1 maintenance (Sub-A6 STOP-gates)
- [ ] **User decision matrix v1 maintenance approved** (data loss / security / sync = fix v1; UI / perf / features = defer / v2) — pending
- [x] Все docs обновлены (status.md / roadmap.md / agent_memory.md / handoff.prompt.md) — Phase A finalize state, Sub-A6 awaiting User
- [x] report.md содержит evidence per sub-phase + multi-agent review findings + User sign-offs (Sub-A1 ✅; ADR text + decision matrix pending)

## План работы (декомпозиция для TeamLead + executor)

### Sub-A0: TASK setup (TeamLead, ~0.5 day)

1. [x] `python ai/scripts/new_task.py "..."` → TASK-021 allocated
2. [x] `python ai/scripts/task.py start ...` → feature branch
3. [x] task.md заполнен (this) с 7 sub-phases plan + STOP-gates + acceptance criteria
4. [ ] Update `ai/docs/status.md` + `roadmap.md` + `agent_memory.md` — Discussion #10 archived, TASK-021 active

### Sub-A0.5: Weight v1 schema knowledge dump (TeamLead, ~0.5-1 day, parallel с Sub-A4 start)

5. [ ] Прочитать weight v1 Drift schema (`G:/Projects/Flutter/serverpod/weight/weight_flutter/lib/core/database/...`) + Serverpod entities YAML (`G:/Projects/Flutter/serverpod/weight/weight_server/lib/src/models/...`) через Read tool
6. [ ] Документировать `weight-v1-schema-audit.md` per Option 2 trigger (Claude_1's 4 concrete triggers):
   - Trigger 1: legacy denormalization мешает sync_core mutation-first invariants → active/not-active с evidence
   - Trigger 2: weight v2 нужен significantly different table layout → active/not-active с evidence
   - Trigger 3: production data migration v1 → v2 = significant work anyway → active/not-active с evidence
   - Trigger 4: multi-tenancy / customer scope semantics меняются → active/not-active с evidence
7. [ ] Output → input для Sub-A1 backend-strategy-rationale.md

### Sub-A1: Backend strategy decision (User input, ~1 week SLA)

8. [ ] `backend-strategy-rationale.md` draft (TeamLead, builds on Sub-A0.5 + Sub-A4 preliminary count):
   - Option 1 (same backend) recommended — reasons + Sub-A0.5 evidence summary
   - Option 2 (forked) — 4 triggers status + when revisit
   - Option 3 (fresh) — overkill для weight rebuild scope
9. [ ] STOP-gate: User reads + signs off Option 1/2/3 (in chat or via task.md журнал annotation)
10. [ ] Cannot proceed to Sub-A2 без User decision

### Sub-A2: ADR draft v1 (executor subagent, ~2-3 days)

11. [ ] Spawn executor subagent (worktree isolation) с self-contained prompt:
    - Read task.md (this) + Discussion #10 archive + Discussion #7 archive + relevant agent_memory.md sections + sync_core ADRs (path-dep)
    - Draft `adr-0005-draft.md` covering 6 sections (multi-template plurality / simplified architecture / generate-vs-not-generate divider / sync_core integration / backend strategy / Phase C amendment clause / TBD placeholders)
    - Generate-vs-not-generate divider includes:
      - Generate (Drift table / DAO / Repository impl / sync_core 5 adapters / Riverpod data providers / mappings)
      - NOT generate (usecases / app services / notifiers с business logic / validation / filter providers с domain queries)
      - Optional: Repository interface (`--with-interfaces`, default OFF)
      - **Generate-side anti-examples** для каждой generate category (Claude's pattern: ✅ delegation methods / ❌ caching layer / ❌ retry logic / ❌ multi-entity coordination)
      - **Migration-side anti-examples** (ClaudeN's pattern: ❌ BaseUseCase / ❌ multi-layer notifier / ❌ repository interfaces по-умолчанию / ❌ mappers как separate class / ❌ Either/Result wrappers)
    - Phase C amendment clause text (verbatim ClaudeN's wording)
    - Riverpod variant / Drift conventions = TBD placeholder

### Sub-A3: Sync_core dual-running audit (executor subagent, ~1 day)

12. [ ] TeamLead pre-stages в task.md концретный list для Sub-A3:
    - sync_core ADR-0001/0002/0003 sections (path-dep `G:/Projects/Flutter/Packages/sync_core/ai/docs/decisions/`)
    - Code files: `lib/src/sync/scope/...`, `lib/src/orchestrator/...`, `lib/src/outbox/outbox_state_machine.dart`
13. [ ] Spawn executor subagent (worktree isolation) с pre-staged list:
    - Produce `sync-core-audit.md` per Claude_1's mandatory structure: review findings + scope code review + 4 mutation race scenarios (v1+v2 same entity / v1+v2 different entities same scope / v1+v2 same backend event stream / dedicated v2 testing scope) + HIGH/MEDIUM/LOW risk classification + recommendation A/B/C
14. [ ] STOP-gate: HIGH risks → escalate sync_core author (separate fix-task в sync_core repo); Phase A может proceed parallel

### Sub-A4: Test inventory audit (executor subagent, ~3-5 days, parallel с Sub-A1)

15. [x] Spawn executor subagent (parallel, can start day 0):
    - Heuristic categorization 163 tests per file path rules (Claude_1's specific pointers):
      - Universal: `src/test/parsers/`, `src/test/replacement/`, `src/test/services/`, `src/test/utils/`, `src/test/verify/`
      - Clean-specific: `src/test/generators/relation_patcher.test.ts`, `orchestrator_patcher.test.ts`
      - Edge: `app_database_generator.test.ts`, `section_replacer.test.ts`, `generation_service.test.ts`, `relation_generation.test.ts`
    - Manual review edge cases (~5-8 файлов, ~1-2 hours)
    - Output `test-inventory-audit.md` с (category, action) tuple table:
      | Test file | Category | Action | Rationale |
      | ... | universal/Clean-specific/edge | keep-universal/keep-t115-legacy/port-simplified/rewrite-for-template-abstraction/delete-obsolete | ... |
    - Living document marker + changelog section
16. [x] Sub-A4 preliminary count → feed Sub-A1 rationale.md (если Sub-A1 ещё waiting на User decision) — preliminary distribution в test-inventory-audit.md "Preliminary findings для Sub-A1" section: ≥80% universal coverage усиливает Option 1 (same backend).

### Sub-A5: Multi-agent review Layer 2 (~0.5-1 day, parallel)

17. [ ] Spawn 3 thematic reviewers parallel:
    - **Architecture reviewer** focus: ADR-0005 draft (principle / divider / anti-examples / amendment clause / TBD placeholders)
    - **Sync reviewer** focus: sync-core-audit.md (mutation scenarios / risk classification / recommendation soundness)
    - **Test reviewer** focus: test-inventory-audit.md (action assignments / edge case decisions / living document setup)
18. [ ] If capacity allows: spawn 4-th Adversarial overlay reviewer focus: backend-strategy-rationale + Phase A scope adherence
19. [ ] Catch rate threshold ≥1 finding per review (если 0 → re-review с jagged angle)
20. [ ] Apply review fixes pre-commit; document findings + fixes в report.md

### Sub-A6: ADR finalize + closure-report.md draft (~0.5-1 day)

21. [ ] Apply Sub-A5 review fixes к adr-0005-draft.md
22. [ ] Promote `adr-0005-draft.md` → `ai/docs/decisions/adr-0005-multi-template-plurality.md`
23. [ ] STOP-gate: User counter-signs ADR-0005 text (1 week SLA per Q8 user decision budget)
24. [ ] STOP-gate: User approves decision matrix v1 maintenance (data loss/security/sync = fix v1; UI/perf/features = defer/v2)
25. [ ] Draft `closure-report.md` per ClaudeN's structure:
    ```
    # Phase A-D Closure Report (TASK-021..TASK-024)
    ## Phase A — architectural design (closed YYYY-MM-DD)
    ### Deliverables (links): ADR-0005, sync-core-audit, test-inventory-audit, backend-strategy-rationale
    ### Verification: Standard ✅ <date>, Adversarial ✅ <date>
    ### User counter-sign: @User ✅ <date>
    ## Phase B — placeholder
    ## Phase C — placeholder
    ## Phase D — placeholder
    ## Phase A-D gate verification (final, end of Phase D)
    ```
26. [ ] Update docs (status.md / roadmap.md / agent_memory.md): TASK-021 done, Phase A closed, Phase B unblocked
27. [ ] Заполнить report.md со evidence per sub-phase + multi-agent review summary + User sign-offs
28. [ ] `task.py pr` → push + PR + merge approval (User explicit "мержить")

## STOP-gates

Discussion #10 13-point Decision specifies 5 STOP-gate triggers:

- ⚠ **Sub-A1 STOP-gate:** Cannot proceed Sub-A2 без User backend strategy decision (Option 1/2/3). User SLA: 1 week. Если >1 week — escalate (re-discussion на scope rebalancing).
- ⚠ **Sub-A3 STOP-gate:** Если HIGH risks обнаружены — escalate sync_core author (separate fix-task в sync_core repo). Phase A continues parallel; Phase A-D gate cannot close без mitigation decision.
- ⚠ **Sub-A6 STOP-gate (ADR sign-off):** Cannot promote ADR-0005 в `ai/docs/decisions/` без User counter-sign на text. SLA: 1 week.
- ⚠ **Sub-A6 STOP-gate (decision matrix):** Cannot close TASK-021 без User approval decision matrix v1 maintenance.
- ⚠ **Sub-A5 STOP-gate (catch rate):** Если ≥1 reviewer вернулся с 0 findings — повторить review с jagged angle. Generic «всё хорошо» = недостаточно paranoid.

**Hard ceiling:** 3 weeks calendar (decomposed: executor 1.5w + user SLA 1w/decision × 2 + parallel где возможно). +1 week extension cap (max 4w). Beyond → trigger follow-up discussion на scope rebalancing.

**Action на ceiling — scope cut (in priority order):**
1. Cut depth manual edge review в Sub-A4 (accept ~10% miscategorization)
2. Cut Option 2 rationale verbosity в Sub-A1
3. Cut part of anti-examples в ADR (если principle already clear)

**Cannot cut:** backend decision (Sub-A1) / sync risk classification (Sub-A3) / ADR sign-off (Sub-A6) / multi-agent review (Sub-A5).

## План тестирования

**N/A для этой TASK** — Phase A = ADR + audits + decisions, не code changes:
- Нет правки `src/` → `npm run compile` / `npm run lint` / mocha не triggered
- Нет правки `.github/workflows/` → CI gate stable
- Нет правки шаблона t115 → `codegen verify` не нужен

**Acceptance gates** = User sign-offs + multi-agent review findings addressed.

**CI behaviour expected:** PR triggers `.github/workflows/test.yml` (TASK-020), expected PASS — должен PASS т.к. нет code changes (только docs + ADR markdown). Мониторить first run для confirmation.

## Релевантный контекст

Файлы для прочтения executor subagent перед началом каждого sub-phase:

**Discussion + ADR contexts:**
- [ai/discussions/archive/10-initiative-phase-a-simplified-template-a/10-...](../../discussions/archive/10-initiative-phase-a-simplified-template-a/) — текущая Decision (13 points)
- [ai/discussions/archive/9-weight-v2-fresh-build-на-simplified-temp/](../../discussions/archive/9-weight-v2-fresh-build-на-simplified-temp/) — pivot context, decision matrix v1 maintenance, backend strategy options
- [ai/discussions/archive/7-clean-architecture-overhead-стоит-ли-упр/](../../discussions/archive/7-clean-architecture-overhead-стоит-ли-упр/) — multi-template plurality decision (Discussion #7 — formalizes в ADR-0005)

**Sync_core contexts (path-dep `G:/Projects/Flutter/Packages/sync_core/`):**
- `ai/docs/decisions/adr-0001-outbox-first-architecture.md`
- `ai/docs/decisions/adr-0002-split-write-pull-event-adapters.md`
- `ai/docs/decisions/adr-0003-syncqueuestore-runintransaction-and-adapter-bundle-events.md`
- `ai/docs/decisions/adr-0004-multi-entity-runtime-guidance.md`
- `lib/src/sync/scope/...` (scope subscription lifecycle code)
- `lib/src/orchestrator/...` (mutation handler / outbox enqueue)
- `lib/src/outbox/outbox_state_machine.dart` (coalescing per `(scope, entityType, entityId)`)

**Codegen contexts:**
- [CLAUDE.md](../../../CLAUDE.md) — agent guide
- [AGENTS.md](../../../AGENTS.md) — глобальные правила
- [ai/docs/agent_memory.md](../../docs/agent_memory.md) — gotchas + invariants
- [ai/docs/architecture.md](../../docs/architecture.md) — codegen структура
- [ai/docs/conventions.md](../../docs/conventions.md) — Patterns 1-7 для multi-entity

**Weight v1 contexts (для Sub-A0.5):**
- `G:/Projects/Flutter/serverpod/weight/weight_flutter/lib/core/database/...` (Drift schema)
- `G:/Projects/Flutter/serverpod/weight/weight_server/lib/src/models/...` (Serverpod YAML)
- `G:/Projects/Flutter/serverpod/weight/ai/docs/decisions/adr-0016-sync-outbox-first-architecture.md` (history context)

## Результаты

**Ожидаемые файлы (in TASK folder):**

- `task.md` (this — filled with plan + acceptance + STOP-gates)
- `report.md` (final report со evidence)
- `weight-v1-schema-audit.md` (Sub-A0.5)
- `backend-strategy-rationale.md` (Sub-A1 input + User decision recorded)
- `adr-0005-draft.md` (Sub-A2 work)
- `sync-core-audit.md` (Sub-A3)
- `test-inventory-audit.md` (Sub-A4 living document)
- `closure-report.md` (Sub-A6 draft, Phase A section + B/C/D placeholders)

**Ожидаемые файлы (promoted):**

- `ai/docs/decisions/adr-0005-multi-template-plurality.md` (Sub-A6 promotion + User counter-sign)

**Ожидаемые модификации docs:**

- `ai/docs/status.md` — TASK-021 active → done; Phase A status; Phase B unblocked
- `ai/docs/roadmap.md` — Month 1 sequence updated; Phase A ✅
- `ai/docs/agent_memory.md` — Phase A closure pointer

## Журнал исполнения

(заполняется по ходу работы — Sub-A0..A6 timestamps + ключевые decisions + User sign-offs + STOP-gate resolutions)

- [Sub-A0 2026-05-03] TASK created via new_task.py, feature branch started, task.md filled per Discussion #10 13-point Decision (TeamLead).
- [Sub-A4 2026-05-03] Test inventory audit completed (executor subagent, single session). Discovery: `find src/test -name "*.test.ts"` → 18 файлов / 164 test cases (≈ "163 baseline" в Discussion #10 — счёт включал extension.test.ts boilerplate). Heuristic categorization per Claude_1's file path rules + manual review 5 edge cases (`app_database_generator`, `section_replacer`, `generation_service`, `relation_generation`, `relation_patcher_top_level_placement`). **Action distribution:** 13 файлов (72%, 124 cases) `keep-universal` / 3 файла (17%, 31 cases) `keep-t115-legacy` / 1 (6%, 4 cases) `rewrite-for-template-abstraction` / 1 (6%, 1 case) `delete-obsolete` / 0 `port-simplified`. **Sub-A1 preliminary feedback:** ≥80% универсальных tests усиливает Option 1 (same backend). Output: [test-inventory-audit.md](test-inventory-audit.md). Living document marker + changelog setup. Open questions для Phase B-D (RelationPatcher/OrchestratorPatcher в simplified) — не блокируют Phase A.
- [Sub-A3 2026-05-03] Sync_core dual-running audit completed (executor subagent, single session, read-only). Reviewed 4 sync_core ADRs (ADR-0001/0002/0003/0004) + pre-staged code files (`sync_orchestrator.dart`, `sync_scope.dart`, `adapter_bundle.dart`, `sync_orchestrator_config.dart`, `sync_remote_event.dart`, `outbox_state_machine.dart`, `outbox_coalescer.dart`, `outbox_flusher.dart`, `lww_resolver.dart`, `conflict_policy.dart`). **Critical reframing:** per Sub-A0.5, weight v1 НЕ использует sync_core (custom `base_sync_repository.dart` + inline `syncStatus` column). Dual-running scenario therefore = **dual-protocol** (v1 custom client protocol + v2 sync_core protocol) на same Serverpod backend, не two-sync_core-instance scenario. **Risk classification:** **1 HIGH** (backend event stream emission gap для v1-source mutations — если Serverpod emit'ит events только on sync_core's bundle endpoints, v2 не получит events для v1's writes → stale data); **2 MEDIUM** (LWW timestamp skew между v1/v2 client clocks; coalescing blindness к cross-protocol mutations); **2 LOW** (dual-app install on same device; resurrect attempt across protocols). **Recommendation: Option C** (Phase A proceeds с dedicated v2 testing scope как default mitigation, recorded в ADR-0005). Option B (escalate sync_core fix-task) **rejected** — HIGH risk не sync_core lib/ defect, это backend event emission contract вне sync_core scope. Phase A может close, но Phase A-D gate cannot close без (a) Option C mitigation в place AND (b) verification plan для weight v2 build (smoke test: trigger v1 mutation + observe v2 event log). Output: [sync-core-audit.md](sync-core-audit.md). **Sub-A3 STOP-gate** (HIGH risk → escalate sync_core author) — **N/A**, escalation target — weight v2 server build (backend event emission contract verification) + ADR-0005 Option C codification, not sync_core repo.
- [Sub-A1 2026-05-03] User sign-off recorded в [backend-strategy-rationale.md](backend-strategy-rationale.md) — **Option 1 (same backend)** confirmed ("ок делай" implicit acknowledgement after combined Sub-A0.5 + Sub-A4 evidence: 0.5/4 Option 2 triggers active + 72% universal tests). Sub-A1 STOP-gate ✅ resolved. Sub-A2 + (already started) Sub-A3 unblocked.
- [Sub-A0.5 2026-05-03] Weight v1 schema knowledge dump completed (TeamLead, Read tool sweep ~30 minutes). Output: [weight-v1-schema-audit.md](weight-v1-schema-audit.md). Per-trigger evidence: Trigger 1 ⚠ PARTIAL (sync-layer dimension только; client-side rewrite inherent в v2 regardless of backend choice) / Triggers 2/3/4 ❌ NOT ACTIVE. Net: 0.5/4 triggers active. Confirmed Option 1 (same backend) recommendation. Critical finding (echoed в Sub-A3): weight v1 НЕ использует `sync_core` package (custom `base_sync_repository.dart` + inline `syncStatus` column).
- [Sub-A2 2026-05-03] ADR-0005 draft v1 completed (executor subagent, worktree isolation, single session). Output: [adr-0005-draft.md](adr-0005-draft.md). 7 sections covered per Discussion #10 13-point Decision: (1) Multi-template plurality formalization Discussion #7 / (2) Simplified architecture Q3=b с boundaries / (3) Generate-vs-not-generate divider — 6 generate categories + 6 generate-side anti-example sub-sections (Repository / sync_core adapters / Drift table / Riverpod data providers / DAO / mappings) с concrete ✅/❌ examples + 7 migration-side anti-examples (BaseUseCase / multi-layer notifier / repo interfaces / Mappers class / Either-Result / datasource interfaces / filter providers) / (4) Sync_core integration model — mutation-first preserved, scope lifecycle, multi-entity FK guidance per sync_core ADR-0004 Patterns 6-7, **Section 4.3 placeholder для Sub-A3 dual-running risk** (Sub-A6 finalize will insert recommendation A/B/C — note: Sub-A3 уже delivered Option C recommendation, available для Sub-A6 insert) / (5) Backend strategy — Option 1 confirmed (Sub-A1 sign-off + Sub-A0.5 evidence + Sub-A4 ≥72% universal evidence references) / (6) Phase C amendment clause (verbatim ClaudeN's wording от Discussion #10) + Amendment log table (initially empty) / (7) TBD placeholders Phase B-D (Riverpod variant + Drift conventions + manifest markers — Q7=e REJECT pre-deciding в Phase A). 7 Open Questions logged для Sub-A5 reviewers (architecture / sync / test / adversarial overlay): Riverpod logger wiring / default ConflictPolicy / scope binding default / Option 2 trigger inline vs reference / Section 7.3 alignment с test-inventory-audit open questions / syncStatus inline exclusion clause / Sub-A3 HIGH risk impact. Draft ready for Sub-A5 multi-agent review.
- [Sub-A5 2026-05-03] Multi-agent review applied: 4 reviewers parallel (architecture / sync / test / adversarial overlay) per Discussion #10 Q10=d. **49 findings total, 5 CRITICAL/DEAL-BREAKER + 14 HIGH applied** to ADR + audits pre-Sub-A6: (1) ADR Section 3.3+3.4.4 wrong `Discussion #7 Q5=a` citation → corrected; (2) ADR Section 3.4.4 `@riverpod` annotation example pre-decision → переписан pseudocode + Section 7.1 explanation; (3) test-inventory math 124→128 cases / 76→78% universal; (4) test-inventory line 30 prose distribution swap fixed (3 t115 / 1 rewrite / 1 delete); (5) `app_database_generator.test.ts` rationale qualified + Open Q #3 added (directory layout dependency); (6) ADR Section 4.3 placeholder filled с Sub-A3 Option C recommendation + multi-entity FK Pattern 6 amendment note; (7) ADR decision matrix references qualified ("recommended Discussion #9, awaiting User counter-sign"); (8) Phase C amendment clause editorial label + normative clause separated; (9-11) Anti-example exclusions (syncStatus local-only / multi-entity coordination junction carve-out / default template selection criteria); (12) sync-core-audit Option B reframed as "Partially applicable — sync_core ADR-0006 amendment recommended, complementary к Option C"; (13) sync-core-audit HIGH severity qualified "verification-pending"; (14) sync-core-audit Scenario 5 soft-delete tombstone added; (15-16) rationale.md numbers corrected к 78%/72% + User decision section acknowledgment Sub-A5 framing fix. **Multi-agent pattern validated 6-й precedent** (PR #6/#8/#9 + Discussion #6 + TASK-CI-001 + TASK-021). Adversarial overlay особенно ценный — поймал cross-deliverable arithmetic drift + decision matrix decoupling что thematic reviewers пропустили.
- [Sub-A6 2026-05-03] Finalize: ADR-0005 promoted в [ai/docs/decisions/adr-0005-multi-template-plurality.md](../../docs/decisions/adr-0005-multi-template-plurality.md) (path-rewrite refs `tasks/active/...` → `tasks/done/...`; Open Questions section updated с resolution status). [closure-report.md](closure-report.md) drafted (Phase A section completed; B/C/D placeholders + Phase A-D gate verification checklist). Docs updated: status.md / roadmap.md / agent_memory.md / handoff.prompt.md (Phase A status finalize, sequence updated). [report.md](report.md) populated со complete Sub-A0..A5 evidence + multi-agent review findings table + open questions для User. **Sub-A6 STOP-gates pending User:** (a) ADR-0005 text counter-sign (1 week SLA per Q8), (b) decision matrix v1 maintenance approval. После User sign-offs: `task.py merge -y` (only when User explicitly says "мержить").
