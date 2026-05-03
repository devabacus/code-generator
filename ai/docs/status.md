# Статус проекта

**Обновлено:** 2026-05-03 (Discussion #9 — weight v2 fresh build pivot + TASK-CI-001 closed via TASK-020)

---

## Текущая фаза

**Phase 1.5 ✅ CLOSED** (2026-05-03).

После 9 PRs Phase 1.5 sequence — codegen acceptance gate clean (verify PASS errors=0 на t164). 9 discussions archived. Architectural roadmap settled через Discussion #7-#9.

**Latest pivot (Discussion #9):** weight v2 fresh build на simplified template. **TASK-018 cancelled (superseded).** weight v1 = critical-only production baseline. v2 = fresh build = real production validation для simplified template.

### Master state

- **Branch:** `master 77145a3` (post HOTFIX-001 + TASK-020 in flight)
- **Tests:** 163 passing, 0 failing (mocha workaround `--ignore extension.test.js`)
- **Compile:** clean
- **CI:** [.github/workflows/test.yml](../../.github/workflows/test.yml) — minimal gate (compile + lint + 163 unit tests)

---

## Активные задачи

| ID | Описание | Status | Started |
|---|---|---|---|
| TASK-020 | CI minimal gate (TASK-CI-001) — `.github/workflows/test.yml` | 🟡 Ready for review | 2026-05-03 |

---

## Открытые backlog (trigger-based per Discussion #9)

| ID | Severity | Description | Action |
|---|---|---|---|
| BUG-001 | High UI | Ref disposed в state_providers (Riverpod async) | Capacity-driven post-Initiative |
| BUG-014 | Low | `relation_patcher.ts` regex без word boundary anchoring | Defer until Initiative |
| BUG-015 | High codegen | Cross-feature junction generation broken | Phase A-D или `<weight-v2-build TASK>`-driven |
| BUG-016 | Medium | Junction MANY_TO_MANY substitution analog TASK-017 | `<weight-v2-build TASK>`-driven |
| BUG-017 | Low → Medium* | `onDelete=Cascade` для FK alias generates as `setNull` | `<weight-v2-build TASK>`-driven (data integrity) |
| BUG-018 | Low | `entity_yaml_validator` should warn on Serverpod reserved names | Defer |
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
- `<weight-v2-build TASK>` start — fresh build на simplified template (only after Phase A-D gate closed). NB: TASK-020 уже занят CI gate, weight v2 получит next available ID через `new_task.py`.
- Initiative Phase E (acceptance side-by-side comparison)

**Month 4:**
- Weight v2 feature parity (UI + business logic manual write)
- Initiative Phase F (documentation reconciliation: CLAUDE.md plurality + ADR-0005 + agent_memory.md split)

**Month 5:**
- Weight v2 cross-device runtime smoke
- Initiative Phase G (closure docs + multi-agent review + cutover plan basic в `<weight-v2-build TASK>` closure)

**Month 6+ (post hard ceiling):**
- Weight v1 → v2 production cutover (separate later TASK)
- BUG-001 capacity-permitting

См. [roadmap.md](roadmap.md) для full 4-track sequence.

---

## Cross-repo state

- **codegen репо** (`devabacus/code-generator`): master `77145a3` (post HOTFIX-001), 163 tests baseline + CI workflow
- **t115 template** (`devabacus/t115`): master `148ddf1`, BUG-011/013 fixes pushed (legacy/advanced template)
- **sync_core** (`devabacus/sync_core` 0.3.0): in master, validated multi-entity cross-device. Dual-running scope subscription audit obligatory в Initiative Phase A
- **weight v1** (`devabacus/weight`): production baseline, **critical-only maintenance** per Discussion #9 decision matrix
- **weight v2** (TBD): fresh build на simplified template (`<weight-v2-build TASK>` — next available ID), starts only after Initiative Phase A-D gate closed

---

## User decision points (Discussion #9)

| Decision | Required by | Owner | Buffer |
|---|---|---|---|
| Backend strategy (Option 1 same / 2 forked / 3 fresh) | Phase A start | User | +1 week per delay |
| Decision matrix v1 maintenance approval | Phase A start | User | +1 week per delay |
| Phase A-D gate sign-off (closure-report.md) | Before `<weight-v2-build TASK>` | User | +2 weeks if iteration |
| Cutover plan review | `<weight-v2-build TASK>` closure | User | +1-2 weeks |

**Recommendation для Q-open backend:** Option 1 (same backend) default. Option 2 только если schema redesign. Option 3 — overkill.

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
