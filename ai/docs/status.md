# Статус проекта

**Обновлено:** 2026-05-03 (Phase 1.5 closure + Discussion #8 finalization)

---

## Текущая фаза

**Phase 1.5 ✅ CLOSED** (2026-05-03).

После 9 PRs в Phase 1.5 sequence — codegen acceptance gate clean (verify PASS errors=0 на production-shaped FK alias scenarios на t164). Architectural pivot decision принят (Multi-template plurality per Discussion #7), sequence approved (Discussion #8).

### Master state

- **Branch:** `master` (Phase 1.5 work merged via PR #6/#7/#8/#9 + TASK-019 closure pending merge)
- **Tests:** 163 passing, 0 failing
- **Compile:** clean
- **Last verify:** t164 PASS errors=0, warnings=1 (unrelated), infos=67

---

## Активные задачи

| ID | Описание | Статус |
|---|---|---|
| TASK-019 | Re-acceptance Phase 1.5 final gate | 🟡 Closing (Phase 5 PASS, Phase 6 closure docs commit pending merge) |

---

## Открытые backlog (trigger-based per Discussion #8)

| ID | Severity | Description | Action |
|---|---|---|---|
| BUG-001 | High UI | Ref disposed в state_providers (Riverpod async) | Capacity-driven post-TASK-018 |
| BUG-014 | Low | `relation_patcher.ts` regex без word boundary anchoring | Defer until Initiative |
| BUG-015 | High codegen | Cross-feature junction generation broken | TASK-018 Phase 0 audit-driven |
| BUG-016 | Medium | Junction MANY_TO_MANY substitution analog TASK-017 | TASK-018 Phase 0 audit-driven |
| BUG-017 | Low → Medium* | `onDelete=Cascade` для FK alias generates as `setNull` | TASK-018 Phase 0 audit-driven |
| BUG-018 | Low | `entity_yaml_validator` should warn on Serverpod reserved names | Defer |
| HOTFIX-001 | Low | `new_task.py` сканирует только `active/` (ID collision risk) | Quick mini-chore (~30 min) before TASK-018 Phase 0 |
| TASK-CI-001 | Medium | Minimal automated gate (`npm test` + static verify smoke) | Named backlog, before Initiative Phase A start |

---

## Sequence (next 3-5 months per Discussion #8)

**Month 1:**
- TASK-019 closure → HOTFIX-001 → TASK-018 Phase 0 preflight audit → TASK-018 production migration

**Month 2:**
- TASK-018 spillover/closure
- BUG-015/016/017 fixes if Phase 0 triggered
- TASK-CI-001 (minimal CI gate)
- Simplified Template Initiative — Phase A-D start

**Month 3:**
- Initiative Phase E-G (codegen `--template` flag + acceptance project + docs)
- BUG-001 fix capacity-permitting

**Month 4-5 (buffer):**
- Initiative spillover + backlog cleanup + post-decisions (Phase 2 timing, weight modernization)

См. [roadmap.md](roadmap.md) для full sequence + tracks.

---

## Cross-repo state

- **codegen репо** (`devabacus/code-generator`): master 530cd28 (TASK-017 merged), 163 tests baseline
- **t115 template** (`devabacus/t115`): master `148ddf1` (BUG-011/013 fixes pushed)
- **sync_core** (`devabacus/sync_core` 0.3.0): in master, validated multi-entity cross-device на Windows + Android
- **weight** (`devabacus/weight`): TASK-018 production migration unblocked после TASK-019 + Phase 0 preflight

---

## Architectural pivot context (Discussion #7)

**Decision:** Multi-template plurality. t115 → legacy/advanced. New "Simplified Template Initiative" parallel track.

**Insight:** Не Clean Architecture как идея плоха, а её automatic generation для каждого CRUD method. Generated CRUD usecases = architectural noise. Generator должен генерировать infrastructure boilerplate, business layer = manual.

См. [Discussion #7 archive](../discussions/archive/7-clean-architecture-overhead-стоит-ли-упр/) + [Discussion #8 archive](../discussions/archive/8-roadmap-approval-sequence-phase-15-closu/).

---

## Closed (история Phase 1.5)

Sequence per Discussion #4:
- ✅ PR #6 BUG-013 (template markers fill 4 layers Approach A)
- ✅ PR #7 TASK-012 partial close (reduced scope verify PASS)
- ✅ PR #8 TASK-016 (parser `relation(parent=X)` directive + helper + path/class normalization + quote-stripping landmine)
- ✅ PR #9 TASK-017 (DAO substitution rewrite Approach A — full BUG-012 closure)
- 🟡 TASK-019 (re-acceptance, pending merge)

**Closed BUGs:** BUG-002/003/004/005/006/008/009/011/012/013.

См. [TASK-019 report](../tasks/active/TASK-019-re-acceptance-full-fk-alias-scenario-verify-phase-1-5-final-gate/report.md) для full Phase 1.5 closure evidence.
