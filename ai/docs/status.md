# Статус проекта

**Обновлено:** 2026-05-03 (Phase 1.5 + Phase A ✅ closed; clean-slate + ⚠ CRITICAL stack-lock decisions; Discussion #11 archived; ready for Phase B execution)

---

## Текущая фаза

**Phase 1.5 + Phase A ✅ CLOSED** (2026-05-03).

**Phase B Discussion #11 ✅ archived** — 12-point Decision finalized. **Ready for TASK-B1 creation** (codegen core multi-template infrastructure refactor).

После 9 PRs Phase 1.5 sequence — codegen acceptance gate clean (verify PASS errors=0 на t164). 9 discussions archived. Architectural roadmap settled через Discussion #7-#9.

**Latest pivot (Discussion #9 + clean-slate amendment 2026-05-03):** Weight build на simplified template — **clean slate** (User confirmed weight v1 НЕ в production, нет users → нет dual-running concerns, нет cutover, нет decision matrix v1 maintenance). TASK-018 cancelled. Weight build = fresh app, hard switch deploy. Estimate revised 5-6 → ~3-4 months realistic, hard ceiling 4 months.

**⚠ CRITICAL Stack-lock decision (2026-05-03 — Discussion #11 + ADR-0005 amendment):** Стэк t115 baseline (Riverpod `@riverpod` annotations + Drift conventions + Clean directory layout + sync_core 0.3.0 + Serverpod) НЕ меняется без явного User approval. Версии всех packages update к latest stable (включая Serverpod). Simplified философия = ТОЛЬКО architecture ceremony reduction (NO usecases / business notifiers / validation generation), всё остальное inherited from t115. Phase B-D + weight build inherit this constraint. ADR-0005 Section 7.1/7.2/7.3 TBD RESOLVED via stack lock. test-inventory Open Q #1/#2/#3 resolved as YES RelationPatcher / inherits t115 DI / preserve Clean directory layout.

### Master state

- **Branch:** `master 70650f7` (post stack-lock chore PR #17)
- **Tests:** 163 passing, 0 failing (mocha workaround `node node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"`)
- **Compile:** clean
- **CI:** [.github/workflows/test.yml](../../.github/workflows/test.yml) — minimal gate (compile + lint + 163 unit tests)
- **Total PRs merged:** 17 (Phase 1.5 9 + handoff + HOTFIX-001 + TASK-020 + TASK-021 + chore stack-lock + this docs refresh chore in flight)

---

## Активные задачи

| ID | Описание | Status | Started |
|---|---|---|---|
| TASK-022 | **B1 codegen core multi-template infrastructure** ✅ merged 2026-05-04 (PR #19, master `a3820e4`) — `TemplateConfig` injection + 173 passing tests, BUG-019 documented. См. [done/TASK-022-.../report.md](../tasks/done/TASK-022-b1-codegen-core-multi-template-infrastructure/report.md). | ✅ done | 2026-05-03 |
| TASK-023 | **B2 simplified template content** — создание `G:/Templates/flutter/simplified/` с Configuration baseline + sync_core 0.3.0 wire-up под stack lock; `simplifiedTemplateConfig()` factory; **BUG-019 closure** (orchestrator snippets из config); package versions update к latest stable. Estimate ~1-1.5 нед per Discussion #11. См. [task.md](../tasks/active/TASK-023-b2-simplified-template-content/task.md). | 🟡 in progress | 2026-05-04 |

---

## Открытые backlog (trigger-based per Discussion #9)

| ID | Severity | Description | Action |
|---|---|---|---|
| BUG-001 | High UI | Ref disposed в state_providers (Riverpod async) | Capacity-driven post-Initiative |
| BUG-014 | Low | `relation_patcher.ts` regex без word boundary anchoring | Defer until Initiative |
| BUG-015 | High codegen | Cross-feature junction generation broken | Phase A-D или `<weight-build TASK>`-driven |
| BUG-016 | Medium | Junction MANY_TO_MANY substitution analog TASK-017 | `<weight-build TASK>`-driven |
| BUG-017 | Low → Medium* | `onDelete=Cascade` для FK alias generates as `setNull` | `<weight-build TASK>`-driven (data integrity) |
| BUG-018 | Low | `entity_yaml_validator` should warn on Serverpod reserved names | Defer |
| BUG-019 | Medium | Orchestrator snippet templates содержат hardcoded entity literals (`category`/`taskTagMap`/`features/tasks/`) — TASK-B2 landmine | TASK-B2 Session 1 ✅ closes orchestrator-side (PR pending merge); junction-substitution-side в BUG-020 |
| BUG-020 | Medium | Junction substitution coupled с hardcoded `templEntity1`/`templEntity2` defaults (`task`/`tag`) в `replacement_util.ts` + `generation_service.ts` + `relation_patcher.ts` — Session 2 landmine для simplified junction generate-entity | TASK-023 Session 2 либо follow-up TASK после Session 2 closure |
| ~~TASK-CI-001~~ | ~~Medium~~ | ~~Minimal automated gate~~ | ✅ Done via TASK-020 (PR pending) — minimal single-job CI. 3-suite split deferred to Phase A test inventory audit. |

---

## Approved sequence (Discussion #9, 5-6 months realistic, 6 hard ceiling)

**Month 1:**
- ✅ HOTFIX-001 closed — `new_task.py` сканирует active/ + done/ + blocked/
- ✅ TASK-CI-001 closed via TASK-020 — minimal CI gate ([.github/workflows/test.yml](../../.github/workflows/test.yml)): compile + lint + 163 unit tests on PR/push to master
- Initiative Phase A (architectural design + ADR + sync_core integration audit + backend strategy + test inventory + dual-running risk audit)

**Month 2:**
- Initiative Phase B-D (generate-vs-not-generate divider + synthetic t<200> reference + `--template` CLI flag)
- **Phase A-D gate close** (5-deliverable checklist + closure-report.md TeamLead + User counter-sign)

**Month 3:**
- `<weight-build TASK>` start — fresh build на simplified template (only after Phase A-D gate closed). NB: TASK-020 уже занят CI gate, weight v2 получит next available ID через `new_task.py`.
- Initiative Phase E (acceptance side-by-side comparison)

**Month 4 (post clean-slate revision):**
- Weight build feature parity (UI + business logic manual write per simplified template philosophy)
- Initiative Phase F (documentation reconciliation: CLAUDE.md plurality + ADR-0005 + agent_memory.md split)
- Weight build cross-device runtime smoke
- Initiative Phase G (closure docs + multi-agent review)

**Hard ceiling 4 months (was 6):**
- Action на ceiling = scope cut (drop UI parity для some features), НЕ extend
- Removed under clean-slate: cutover plan, dual-running window planning, v1→v2 transition execution
- BUG-001 capacity-permitting

См. [roadmap.md](roadmap.md) для full 4-track sequence.

---

## Cross-repo state

- **codegen репо** (`devabacus/code-generator`): master `841764e` (post TASK-020 CI gate), 163 tests baseline + CI workflow + TASK-021 (PR #16 awaiting merge approval)
- **t115 template** (`devabacus/t115`): master `148ddf1` — **deprecated path** (frozen, no active maintenance, removal planned 6-12 месяцев если нет consumers, per ADR-0005 clean-slate amendment)
- **sync_core** (`devabacus/sync_core` 0.3.0): in master, validated multi-entity cross-device. Dual-running audit (Sub-A3) reference-only post clean-slate decision
- **weight v1**: ⚠ **NOT в production** (clean-slate decision 2026-05-03 — User confirmed нет real users, нет maintenance burden)
- **weight build** (TBD): fresh app на simplified template (`<weight-build TASK>` — next available ID), starts only after Initiative Phase A-D gate closed

---

## User decision points (post clean-slate amendment 2026-05-03)

| Decision | Required by | Owner | Status |
|---|---|---|---|
| Backend strategy (Option 1 same / 2 forked / 3 fresh) | Phase A start | User | ✅ confirmed Option 1 (Sub-A1 2026-05-03; trivially correct under clean-slate — nobody writing к backend ещё) |
| ~~Decision matrix v1 maintenance approval~~ | ~~Phase A start~~ | ~~User~~ | ⏭ **N/A under clean-slate** (нет v1 в production → нет maintenance criteria для approve) |
| ADR-0005 text counter-sign | Sub-A6 | User | ✅ confirmed 2026-05-03 ("ok а" implicit acknowledgment after PR #16 review + clean-slate amendments) |
| Phase A-D gate sign-off (closure-report.md) | Before `<weight-build TASK>` | User | ⏳ pending end of Phase D |
| ~~Cutover plan review~~ | ~~`<weight-build TASK>` closure~~ | ~~User~~ | ⏭ **N/A under clean-slate** (нет users чтобы migrate; weight build = installable app) |

**All Phase A user decisions ✅ resolved post clean-slate amendment.** Phase A-D gate sign-off remains future User decision (after Phase B/C/D execution).

---

## Architectural pivot context

**Discussion #7** (Multi-template plurality): t115 → legacy/advanced. New "Simplified Template Initiative" — standalone parallel track. **Generate vs не-generate divider:**
- **Generate:** Drift table, DAO, Repository impl, sync_core adapters, Riverpod data providers, mappings
- **Do NOT generate:** Usecases (CRUD = noise), application services, notifiers с business logic, validation
- **Optional via CLI flag:** Repository interface (`--with-interfaces`)

**Discussion #9** (weight v2 fresh build pivot): TASK-018 cancelled. weight v1 stays Clean (critical-only). weight v2 = fresh build на simplified template = real production validation. Backend strategy first Phase A decision.

См. [Discussion #7 archive](../discussions/archive/7-clean-architecture-overhead-стоит-ли-упр/) + [Discussion #8 archive](../discussions/archive/8-roadmap-approval-sequence-phase-15-closu/) (superseded by #9) + [Discussion #9 archive](../discussions/archive/9-weight-v2-fresh-build-на-simplified-temp/).

---

## Closed (Phase 1.5 история)

Sequence per Discussion #4 → #6:
- ✅ PR #6 BUG-013 (template markers fill 4 layers Approach A)
- ✅ PR #7 TASK-012 partial close (reduced scope verify PASS)
- ✅ PR #8 TASK-016 (parser FK alias support + helper + path/class normalization + quote-stripping)
- ✅ PR #9 TASK-017 (DAO substitution rewrite Approach A — full BUG-012 closure)
- ✅ PR #10 TASK-019 (re-acceptance final gate + handoff prep)
- ✅ PR #11 handoff.prompt.md commit

**Closed BUGs Phase 1.5:** BUG-002/003/004/005/006/008/009/011/012/013.

См. [TASK-019 report](../tasks/done/TASK-019-re-acceptance-full-fk-alias-scenario-verify-phase-1-5-final-gate/report.md) для full closure evidence.
