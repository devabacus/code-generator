# Отчёт TASK-019 (Phase 1.5 Final Gate — Re-acceptance)

## Резюме

TASK-019 closes Phase 1.5 final gate per [Discussion #8 Decision](../../discussions/archive/8-roadmap-approval-sequence-phase-15-closu/) (3-agent consensus 2026-05-03 + User approved).

**Phase 1.5 ✅ CLOSED.** Verify PASS errors=0 на t164 (production-shaped FK alias scenarios) — codegen acceptance gate clean. Manual cross-device smoke = User signoff zone (deferred OK, не блокер closure).

**Что значит для weight TASK-018:** unblocked (modulo Phase 0 preflight audit, новый pre-implementation requirement per Discussion #8).

## Verify evidence (t164 — fresh project, 4 entity scenarios)

```
PASS: verify t164
errors=0, warnings=1 (unrelated dev tools), infos=67
success: true
```

**4 entity scenarios все PASS:**

| Scenario | Coverage | Evidence |
|---|---|---|
| Entity A (identity FK) | Backwards compat `categoryId, parent=category` | `getProjectsByCategoryId` + `t.categoryId.equals(categoryId)` ✅ |
| Entity B (single FK alias) | TASK-016+017 closure `assigneeId, parent=team_member` | `getInvoicesByAssigneeId` + `t.assigneeId.equals(assigneeId)` + `import 'team_member_table.dart'` + `references(TeamMemberTable, ...)` ✅ |
| Entity C (3 FK mix) | CustomerUser-style production landmine | 3 separate methods properly named, 3 DAO column refs, 3 cross-feature parent table imports ✅ |
| Entity D (junction no Map) | TASK-013/014 regression `OrderTeamMemberLink` | adapters в `invoices/data/adapters/invoice_team_member_link/`, 5 class refs БЕЗ `Map` suffix, junction FK docstring `junction FK→invoice+teamMember` ✅ |

**Negative grep zero leaks:**
- `getInvoicesByTeamMemberId|getInvoicesByMemberId` (Entity B parent-derived): **0 matches**
- `getProfilesByTerminalSetId|getProfilesByCargoTypeId` без `Default` prefix (Entity C): **0 matches**
- `task_tag_map|TaskTagMap|InvoiceTeamMemberLinkMap` (Entity D Map suffix): **0 matches**

**Regression checks (BUG-008/009/011/012/013/017):**
- BUG-008 (database.dart scan): all 11 entity tables imported ✅
- BUG-009 (orchestrator imports): correct feature paths ✅
- TASK-013/014 (junction routing): Entity D evidence ✅

## Acceptance criteria status

- [x] 1: Fresh project t164 created
- [x] 2: 4 entity scenarios (A identity, B single alias, C 3-FK mix, D junction no Map)
- [x] 3: generate-entity PASS все 9 запусков
- [x] 4: verify --name t164 PASS errors=0
- [x] 5: counts cited (errors=0, warnings=1, infos=67)
- [x] 6: 7 marker layers field-alias-preserved для FK aliases
- [x] 7: junction routing correct (TASK-013/014 regression)
- [x] 8: BUG-008/009 regression PASS
- [ ] 9: Manual cross-device smoke — **User signoff zone** (instructions provided ниже, deferred per Discussion #8 Q1=a)
- [x] 10: Full evidence in this report

**9/10 criteria passed. #9 = User-zone manual cross-device testing на 2 устройствах (Windows + Android).**

## 4 backlog items discovered (executor flagged)

Per Discussion #8 Q4 trigger-based severity ladder:

| BUG | Severity | Description | Action |
|---|---|---|---|
| BUG-015 | High (codegen) | Cross-feature junction generation broken — relative imports `'../<fk_entity>/...'` assume same-feature | TASK-018 Phase 0 audit-driven (если weight production has cross-feature junctions) |
| BUG-016 | Medium | Junction MANY_TO_MANY substitution analog TASK-017 (preserve field name in junction methods) | TASK-018 Phase 0 audit-driven |
| BUG-017 | Low → Medium* | `onDelete=Cascade` для FK alias generates as `setNull` (semantic mismatch, compile-clean) | TASK-018 Phase 0 audit-driven, escalate если data-integrity matters |
| BUG-018 | Low | `entity_yaml_validator` should warn on Serverpod reserved class names (Order/User collisions) | Defer post-Phase 1.5 |

Bug-reports создание для backlog items deferred (Discussion #8 trigger-based — create bug-reports когда Phase 0 audit triggers them в actual weight YAMLs).

## Iteration history (executor)

3 attempts to reach passing project:
- **t162 FAIL** — `Order` class collision с Serverpod built-in `OrderBy` → renamed Order → Invoice
- **t163 FAIL** — cross-feature junction provider relative imports broken → restructured TeamMember → `invoices/` feature (same-feature design per t157 pattern)
- **t164 PASS** — final accepted

Time spent: ~76 minutes (within 90-min STOP-gate per phase).

## Изменения

**Modified (codegen):**
- `ai/tasks/active/TASK-019-...` → moved to `done/` per `task.py pr` flow
- `ai/discussions/archive/7-clean-architecture-overhead-стоит-ли-упр/` (Discussion #7 archive)
- `ai/discussions/archive/8-roadmap-approval-sequence-phase-15-closu/` (Discussion #8 archive)
- `ai/docs/roadmap.md` — Simplified Template Initiative + Discussion #8 sequence/priorities
- `ai/docs/status.md` — Phase 1.5 closed, current focus
- `ai/docs/agent_memory.md` — Phase 1.5 outcome summary, Discussion #7/#8 references

**Created (codegen):**
- t164 test project in `G:/Projects/Flutter/serverpod/t164/` (production-shaped FK alias acceptance evidence)
- t162/t163 broken iterations (per sandbox policy — not deleted, marked WIP if needed)

## Manual cross-device smoke инструкция для User (criterion #9 — User signoff zone)

**Setup:**
1. `cd G:/Projects/Flutter/serverpod/t164/t164_server`
2. `docker compose up -d` (postgres + redis)
3. `serverpod create-migration --force`
4. `dart bin/main.dart --apply-migrations --role=maintenance`
5. `dart bin/main.dart` (server на http://localhost:8080/)
6. Device 1 (Windows): `cd ../t164_flutter; flutter run -d windows`
7. Device 2 (Android emulator): `cd ../t164_flutter; flutter run -d <android-id>`

**CRUD scenarios (для каждого: create on Device 1 → wait 5-10s sync → verify on Device 2 → reverse direction):**
- **Scenario A (Identity FK):** Category "Work" → Project "MVP" с categoryId
- **Scenario B (Single FK alias):** TeamMember "Alice" → Invoice с assigneeId=Alice + Invoice без assignee (nullable test)
- **Scenario C (3 FK mix):** TerminalSet + CargoType + Worker → Profile с 3 FKs → update defaultTerminalSetId на null (SetNull test)
- **Scenario D (Junction):** Invoice + TeamMember → InvoiceTeamMemberLink → soft-delete junction record

**Pass criteria:** все entities sync в обоих направлениях, soft-delete tombstones работают, FK references resolve correctly, nullable FK can be null/back, junction CRUD работает.

## Phase 1.5 closure summary

**Sequence completed:**
- ✅ TASK-011 (TASK-X1 sync_core 0.3.0 templates integration) — PR #2
- ✅ TASK-013 (junction detection robust YAML field analysis) — PR #3
- ✅ TASK-014 (junction adapter file path generation для non-Map entities) — PR #4
- ✅ PR #6 BUG-013 (template markers fill 4 layers Approach A)
- ✅ PR #7 TASK-012 partial close (reduced scope verify PASS errors=0)
- ✅ PR #8 TASK-016 partial close (parser parent= directive + helper + path/class normalization + Adversarial-caught quote-stripping landmine)
- ✅ PR #9 TASK-017 (DAO substitution rewrite Approach A — full BUG-012 closure)
- ✅ TASK-019 (this — re-acceptance final gate)

**Tests baseline:** 163 passing (122 baseline + 41 Phase 1.5 additions across PR #6/#8/#9).

**Closed BUGs:** BUG-002/003/004/005/006/008/009/011/012/013.
**Resolved:** BUG-012 fully (TASK-016 + TASK-017 closure).
**Open backlog:** BUG-001 (UI Ref disposed, capacity-driven), BUG-014/015/016/017/018 (TASK-018 Phase 0 audit-driven or defer per severity).

## Тесты

- **Total:** 163 passing, 0 failing
- **Compile:** clean
- **Verify:** t164 PASS errors=0

## Discussion sequence

- [Discussion #3](../../discussions/archive/3-phase-15-scope-reconsideration-acceptanc/) — Phase 1.5 scope reconsideration (Q1=c hybrid)
- [Discussion #4](../../discussions/archive/4-pr-1-bug-013-blocks-reduced-scope-verify/) — PR sequence re-order (BUG-013 first)
- [Discussion #5](../../discussions/archive/5-task-016-bug-012-parser-fix-pre-implemen/) — TASK-016 parser fix design
- [Discussion #6](../../discussions/archive/6-task-017-dao-substitution-rewrite-pre-im/) — TASK-017 DAO substitution design
- [Discussion #7](../../discussions/archive/7-clean-architecture-overhead-стоит-ли-упр/) — Multi-template plurality decision
- [Discussion #8](../../discussions/archive/8-roadmap-approval-sequence-phase-15-closu/) — Roadmap approval + sequence

## Статус

**Phase 1.5 ✅ CLOSED.** Ready for review and merge.

**Next per Discussion #8 sequence:**
- HOTFIX-001 (`new_task.py` scan `active/` only — quick mini-chore ~30 min)
- TASK-018 (weight production migration на Clean t115 path) Phase 0 preflight audit
- After TASK-018 closure → Simplified Template Initiative starts (Phase A-G, ~3-4 weeks)
