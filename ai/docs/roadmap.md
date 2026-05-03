# Дорожная карта проекта

Высокоуровневый план развития code-generator.

**Обновлено:** 2026-05-03 (Discussion #8 finalization)

---

## Текущий статус

**Phase 1.5 ✅ CLOSED** (2026-05-03, TASK-019 acceptance — verify PASS errors=0 на t164).

Phase 1.5 sequence: 9 PRs merged (TASK-011/013/014 sync_core integration + BUG-013 template markers + TASK-012 partial + TASK-016 parser FK alias + TASK-017 DAO substitution + TASK-019 re-acceptance). 163 unit tests baseline. См. [TASK-019 report](../tasks/done/TASK-019-re-acceptance-full-fk-alias-scenario-verify-phase-1-5-final-gate/report.md) для full evidence.

**Architectural pivot decision** (Discussion #7 archived 2026-05-03): Multi-template plurality. t115 → legacy/advanced template. New "Simplified Template Initiative" — standalone parallel track.

---

## Approved sequence (Discussion #8, next 3-5 months)

**Priority rule (explicit):** TASK-018 production blockers > Initiative > non-triggered backlog. STOP-gate protocol для concrete production blockers (concept-level risks НЕ trigger STOP).

### Month 1 — Phase 1.5 cleanup + weight TASK-018

- ✅ TASK-019 closure (Phase 1.5 final gate)
- ⏭ HOTFIX-001 (`new_task.py` scan `active/` only, ~30 min mini-chore)
- ⏭ **TASK-018 Phase 0 preflight audit** (mandatory pre-implementation, ~1-2h):
  - Cross-feature junction inventory (BUG-015 trigger check)
  - Junction FK alias inventory (BUG-016 trigger check)
  - onDelete=Cascade audit (BUG-017 data-integrity check)
  - Entity grouping plan (13 entities → feature directories)
  - Trigger matrix (BUG-XXX × triggered? YES/NO/REQUIRES_FIX)
- ⏭ TASK-018 production migration (weight, Clean t115 path) — start Phase 1 после Phase 0 + triggered fixes

### Month 2 — Initiative kickoff + post-TASK-018 backlog

- TASK-018 spillover / completion
- BUG-015/016/017 fixes if Phase 0 triggered (separate PRs)
- TASK-CI-001 (minimal automated gate `npm test` + static verify smoke) — **before Initiative Phase A start**
- Simplified Template Initiative — Phase A-D start (design + first reference template)

### Month 3 — Initiative completion

- Initiative Phase E-G (codegen `--template <name>` flag + acceptance project + docs)
- First simplified template project + side-by-side comparison (t164 Clean vs t<200> simplified)
- BUG-001 fix (Ref disposed) если capacity

### Month 4-5 (buffer)

- Initiative spillover
- Backlog cleanup (BUG-014/018 defer until Initiative-time consolidation)
- Long-term decisions: Phase 2 Microservices timing, weight modernization (Q2=c hybrid path)

---

## Tracks (parallel)

### Track 1: weight TASK-018 (cross-repo, Clean path)

Production migration на 13 entities. На текущем t115 Clean Architecture (Q2=c hybrid per Discussion #7/#8). **Phase 0 preflight audit обязателен** перед Phase 1.

**Cross-repo blocking:** TASK-018 не зависит от Initiative. Initiative starts post-TASK-018 closure (или parallel only with dedicated capacity).

### Track 2: Simplified Template Initiative

Standalone effort post-Phase-1.5 closure. ~2-4 weeks calendar focused work (Discussion #7/#8 estimate).

**Architecture (Discussion #7 Q3=b с boundaries):**
- Drift table + DAO (CRUD queries)
- Repository (sync_core boundary, atomic transaction site) — НЕ god service
- sync_core 5 adapters per entity (kept, sync_core contract)
- Riverpod Notifier (UI state)
- UseCase **opt-in** для real business logic (multi-entity workflow, validation)

**Generate-vs-not-generate divider:**
- **Generate:** Drift table, DAO, Repository impl, sync_core adapters (5 files), Riverpod data providers, mappings (`toEntity`, `toModel`)
- **Do NOT generate:** Usecases (CRUD = architectural noise), application services, notifiers с business logic, validation rules
- **Optional via CLI flag:** Repository interface (`--with-interfaces`, default OFF)

**Mixed-template boundary rule:** single template per feature internally, multi only на bounded context boundary.

**Sync_core integration sanity check** mandatory в design phase (transaction site, OutboxCoalescer call, scope subscription lifecycle).

**Что reused из Phase 1.5 (~60-70%):**
- Codegen core fixes (parser, junction detection, orchestrator patcher, app_database_generator)
- Multi-agent review pattern + discussion process
- 163 unit tests (most universal)
- sync_core 0.3.0 integration

### Track 3: Backlog (trigger-based severity ladder)

| BUG | Severity | Action | Trigger |
|---|---|---|---|
| BUG-001 (Ref disposed) | High UI | Capacity-driven post-TASK-018 | UI-only, не codegen blocker |
| BUG-014 (regex anchoring) | Low | Defer | Until Initiative refactors substitution |
| BUG-015 (cross-feature junction) | High codegen | Phase 0 audit-driven | Weight production has cross-feature junctions |
| BUG-016 (junction FK alias) | Medium | Phase 0 audit-driven | Weight has junction FK aliases |
| BUG-017 (onDelete=Cascade) | Low → Medium* | Phase 0 audit-driven | Data-integrity matters |
| BUG-018 (reserved names) | Low | Defer | Validator improvement, не blocker |

*BUG-017 escalates если weight YAMLs require Cascade semantics.

---

## Deferred (post Months 1-5)

- **Phase 2 (Microservices feature parity)** — Python/Node/Go feature parity. Defer до Initiative + TASK-018 done.
- **Phase 3 (UX/DevEx)** — README, CLI --help examples, plugin templates, cross-platform paths. Cherry-pick urgent items only.
- **Phase 4 (CI/CD + публикация)** — VS Code Marketplace publish, npm publish CLI. **TASK-CI-001 (named backlog)** — minimal CI gate (`npm test` + static verify) before Initiative Phase A.

---

## История архитектурных решений

| Discussion | Дата | Decision summary |
|---|---|---|
| #1 | (sync_core repo) | sync_core 0.3.0 design — outbox-first, mutation-first |
| #2 | 2026-05-02 | Junction detection robust YAML field analysis (TASK-013) |
| #3 | 2026-05-03 | Phase 1.5 scope reconsideration — Q1=c hybrid (TASK-012 partial + BUG-012/013 hard-blocking) |
| #4 | 2026-05-03 | PR sequence re-order — BUG-013 first потому что reduced scope ≥1 FK не PASS до BUG-013 fix |
| #5 | 2026-05-03 | TASK-016 parser fix design — `fullDefinition` + helper + consumer normalization core requirement |
| #6 | 2026-05-03 | TASK-017 DAO substitution design — Approach A order swap + 7 markers consumers verified |
| #7 | 2026-05-03 | **Architectural pivot — Multi-template plurality** (Clean Architecture overhead для CRUD) |
| #8 | 2026-05-03 | **Roadmap approval** — sequence Phase 1.5 closure + TASK-018 Phase 0 + Initiative + backlog ladder |

Полные тексты: `ai/discussions/archive/`.

---

## Заметки

- Roadmap = живой документ, обновляется по мере развития
- Изменения требуют User approval (через Discussion если архитектурное)
- Маркеры задач: `[ ]` TODO, `[~]` in progress, `[x]` done, `[!]` blocked
- Multi-agent review pattern (Standard + Adversarial) — обязателен для major TASK
- Pre-implementation Discussion — обязателен для high blast radius changes (parser, substitution, template)
