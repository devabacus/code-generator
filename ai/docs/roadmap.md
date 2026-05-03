# Дорожная карта проекта

Высокоуровневый план развития code-generator.

**Обновлено:** 2026-05-03 (Discussion #9 — weight v2 fresh build pivot)

---

## Текущий статус

**Phase 1.5 ✅ CLOSED** (2026-05-03, TASK-019 acceptance — verify PASS errors=0 на t164).

Phase 1.5 sequence: 9 PRs merged (TASK-011/013/014 sync_core integration + BUG-013 template markers + TASK-012 partial + TASK-016 parser FK alias + TASK-017 DAO substitution + TASK-019 re-acceptance). 163 unit tests baseline.

**Architectural pivot decisions:**
- **Discussion #7** (archived 2026-05-03): Multi-template plurality. t115 → legacy/advanced. New "Simplified Template Initiative".
- **Discussion #8** (archived 2026-05-03): Sequence approved (TASK-018 production migration на Clean) — *superseded by Discussion #9*.
- **Discussion #9** (archived 2026-05-03): Weight v2 fresh build pivot. **TASK-018 cancelled (superseded).** weight v1 = critical-only production baseline. v2 = fresh build на simplified template.

---

## Approved sequence (Discussion #9, 5-6 months realistic, 6 hard ceiling)

**Priority rule (explicit):** Phase A-D gate blockers > Initiative Phase E-G > non-triggered backlog. STOP-gate protocol для concrete blockers.

**Hard ceiling action:** scope cut (drop UI parity для some features, manual cutover, defer cross-device smoke), НЕ timeline extension.

### Month 1 — Phase 1.5 ceremony cleanup + Initiative kickoff

- ✅ TASK-019 closure (Phase 1.5 final gate)
- ✅ HOTFIX-001 (`new_task.py` scan active/ + done/ + blocked/)
- ⏭ TASK-CI-001 (minimal automated gate — `npm test` + static verify smoke) — **before Initiative Phase A start**
- ⏭ Initiative Phase A: Architectural design (ADR + sync_core integration sanity check + backend strategy + test inventory audit + dual-running risk audit + User decision points)

### Month 2 — Initiative Phase B-D + synthetic acceptance

- Initiative Phase B: Generate-vs-not-generate divider implementation
- Initiative Phase C: New t<200>-series reference template (с manifest markers, 5-7 entities synthetic)
- Initiative Phase D: Codegen `--template <name>` selection mechanism

**Phase A-D gate (mandatory before TASK-020 weight v2 starts):**
- [ ] ADR architectural decision document
- [ ] Synthetic reference project t<200> minimal viable (5-7 entities, verify PASS errors=0)
- [ ] Generator infrastructure (`--template` flag, manifest markers, junction regression PASS)
- [ ] Multi-agent review pattern applied (Standard + Adversarial на 5 specific deliverables, catch rate ≥1)
- [ ] Documentation rulebook ("what generator generates / what agents write manually")

**Gate verification artifact:** `ai/tasks/initiative-phase-a-d/closure-report.md` TeamLead-signed + User counter-signed. Без артефакта → TASK-020 cannot start.

### Month 3 — TASK-020 weight v2 bootstrap + Initiative Phase E

- TASK-020 created **only after Phase A-D gate closed**
- Weight v2 entity build (13 entities + sync infrastructure через generator)
- Initiative Phase E: Acceptance — synthetic t<200> + first weight v2 entities side-by-side comparison

### Month 4 — Weight v2 feature parity + Phase F

- Weight v2 UI parity (depends на v1 complexity)
- Weight v2 business logic / workflows manual write (per simplified template philosophy: business layer = manual)
- Initiative Phase F: Documentation reconciliation
  - CLAUDE.md plurality acknowledgment
  - New ADR-0005 "Multi-template plurality decision"
  - agent_memory.md split (Clean t115 patterns / Simplified t<200> patterns)

### Month 5 — Closure + cutover prep

- Weight v2 cross-device runtime smoke
- Initiative Phase G: closure docs + multi-agent review (Standard + Adversarial fresh)
- Basic cutover plan в TASK-020 closure (data source, migration strategy, rollback, transition, smoke, **dual-running window**)

### Month 6+ (post hard ceiling)

- Weight v1 → v2 production cutover (separate later TASK)
- BUG-001 fix capacity-permitting
- Backlog items per severity ladder

---

## Tracks (parallel)

### Track 1: weight v1 production baseline (critical-only maintenance)

**Decision matrix (TASK-020 task.md):**

| Issue type | v1 action | v2 action |
|---|---|---|
| Data loss / corruption | Fix v1 immediately | Verify v2 doesn't have same |
| Security (auth bypass, data leak) | Fix v1 immediately | Verify v2 doesn't have same |
| Sync corruption (orphaned records) | Fix v1 immediately | Verify v2 doesn't have same |
| UI bugs (crash, dead button) | Defer | Backlog v2 |
| Performance regression | Defer | Backlog v2 |
| New feature request | **Reject** | Add to v2 scope |

**Owner pattern:** agent investigates + fix PR, User reviews + approves merge.

### Track 2: Simplified Template Initiative

**Architecture (Discussion #7 Q3=b с boundaries):**
- Drift table + DAO (CRUD queries)
- Repository (sync_core boundary, atomic transaction site) — **НЕ god service**
- sync_core 5 adapters per entity (kept, sync_core contract)
- Riverpod Notifier (UI state)
- UseCase **opt-in** для real business logic

**Generate-vs-not-generate divider:**
- **Generate:** Drift table, DAO, Repository impl, sync_core adapters (5 files), Riverpod data providers, mappings (`toEntity`, `toModel`)
- **Do NOT generate:** Usecases (CRUD = architectural noise), application services, notifiers с business logic, validation rules
- **Optional via CLI flag:** Repository interface (`--with-interfaces`, default OFF)

**Mixed-template boundary rule:** single template per feature internally, multi only на bounded context boundary (но weight v1+v2 = separate apps, не intra-app drift).

**Что reused из Phase 1.5 (~60-70%):**
- Codegen core fixes (parser, junction detection, BUG-008/009/012/013/017 closures)
- Multi-agent review pattern + discussion process
- 163 unit tests (categorized в Phase A audit: universal / Clean-specific / simplified)

### Track 3: Backend strategy (Phase A first decision)

**3 options:**
- **Option 1 (recommended): Same backend** — v1 + v2 read/write same Serverpod DB. Cutover = client switch. Data migration trivial. Sync_core scope subscription lifecycle audit обязателен.
- **Option 2: Forked backend** — clone v1 server, evolve independently. Cutover = data migration script + client+server switch. More flexibility, higher complexity.
- **Option 3: Fresh backend** — greenfield. Cutover = full data export/import. Highest complexity, full architectural freedom. **Overkill для weight rebuild.**

**User decision в Phase A start.** Default recommendation Option 1.

### Track 4: Backlog (trigger-based severity)

| ID | Severity | Description | Action |
|---|---|---|---|
| BUG-001 | High UI | Ref disposed в state_providers (Riverpod async) | Capacity-driven post-Initiative |
| BUG-014 | Low | `relation_patcher.ts` regex без word boundary anchoring | Defer until Initiative refactors |
| BUG-015 | High codegen | Cross-feature junction generation broken | Phase A-D или TASK-020-driven (если weight v2 имеет cross-feature junctions) |
| BUG-016 | Medium | Junction MANY_TO_MANY substitution analog TASK-017 | TASK-020-driven |
| BUG-017 | Low → Medium* | `onDelete=Cascade` для FK alias generates as `setNull` | TASK-020-driven (data integrity) |
| BUG-018 | Low | `entity_yaml_validator` should warn on Serverpod reserved names | Defer |
| HOTFIX-001 | Low | `new_task.py` сканирует только `active/` | Quick mini-chore Month 1 |
| TASK-CI-001 | Medium | Minimal automated gate (`npm test` + verify smoke + 3 suites: universal + t115 regression + simplified) | Named — before Initiative Phase A start |

---

## Deferred (post Months 1-6)

- **Phase 2 (Microservices feature parity)** — defer until Initiative + TASK-020 done
- **Phase 3 (UX/DevEx)** — cherry-pick urgent items only (CLI --help examples, plugin templates, cross-platform paths)
- **Phase 4 (CI/CD + публикация)** — VS Code Marketplace publish, npm publish CLI. TASK-CI-001 partial coverage.

---

## История архитектурных решений

| Discussion | Дата | Decision summary |
|---|---|---|
| #1 | (sync_core repo) | sync_core 0.3.0 design — outbox-first, mutation-first |
| #2 | 2026-05-02 | Junction detection robust YAML field analysis (TASK-013) |
| #3 | 2026-05-03 | Phase 1.5 scope reconsideration — Q1=c hybrid |
| #4 | 2026-05-03 | PR sequence re-order — BUG-013 first |
| #5 | 2026-05-03 | TASK-016 parser fix design — fullDefinition + helper + consumer normalization |
| #6 | 2026-05-03 | TASK-017 DAO substitution design — Approach A order swap + 7 markers verified |
| #7 | 2026-05-03 | Architectural pivot — Multi-template plurality |
| #8 | 2026-05-03 | Roadmap approval (Phase 1.5 + TASK-018 на Clean + Initiative) — *superseded by #9* |
| #9 | 2026-05-03 | **Weight v2 fresh build pivot** — TASK-018 cancelled, v1 critical-only, v2 fresh на simplified |

Полные тексты: `ai/discussions/archive/`.

---

## User decision points budget (Discussion #9 ClaudeO #11)

Per Phase A architectural decisions требуют User input — explicit timeline budget:

| Decision | Required by | Owner | Buffer if delayed |
|---|---|---|---|
| Backend strategy (Option 1/2/3) | Phase A start | User | +1 week per delay week |
| Decision matrix v1 maintenance | Phase A start | User | +1 week per delay week |
| Phase A-D gate sign-off | Before TASK-020 | User | +2 weeks if iteration needed |
| Cutover plan review | TASK-020 closure | User | +1-2 weeks |

Total potential User-side latency: 4-8 weeks. Estimate уже implicitly budgets, но explicit tracking = best practice.

---

## Заметки

- Roadmap = живой документ
- Architectural decisions через Discussion process (multi-agent review + Adversarial pass)
- Маркеры задач: `[ ]` TODO, `[~]` in progress, `[x]` done, `[!]` blocked, `[~]` superseded
- **Phase A-D gate enforcement:** TeamLead обязан verify checklist closed + User counter-sign closure-report.md до `new_task.py` invocation для TASK-020
