# Статус проекта

**Обновлено:** 2026-05-28 (**TASK-031 + TASK-032 merged** (PR #30 `c8ad1b5` + PR #31 `6b42bd4`). **TASK-033 implementation complete, awaiting User merge** — session_manager ref.mounted guard в **обоих** templates (последний BUG-001 residual), 8 guards + 7 tests (271 passing), verify t199+t200 PASS errors=0, Standard + Adversarial оба APPROVE)

---

## Текущая фаза

**Phase 1.5 + Phase A + Phase B ✅ CLOSED** (2026-05-03 → 2026-05-04). **🎉 Pipeline 5/5 CLOSED** (2026-05-26).

После 9 PRs Phase 1.5 sequence + Phase A/B + pipeline 5/5 (TASK-030/025/026/027/028/029) — codegen acceptance gate clean (verify PASS errors=0 на t186-t194 post-merge). 11 discussions archived. Architectural roadmap settled через Discussion #7-#12.

**Latest pivot (Discussion #9 + clean-slate amendment 2026-05-03):** Weight build на simplified template — **clean slate** (User confirmed weight v1 НЕ в production, нет users → нет dual-running concerns, нет cutover, нет decision matrix v1 maintenance). TASK-018 cancelled. Weight build = fresh app, hard switch deploy. Estimate revised 5-6 → ~3-4 months realistic, hard ceiling 4 months.

**⚠ CRITICAL Stack-lock decision (2026-05-03 — Discussion #11 + ADR-0005 amendment):** Стэк t115 baseline (Riverpod `@riverpod` annotations + Drift conventions + Clean directory layout + sync_core 0.3.0 + Serverpod) НЕ меняется без явного User approval. Версии всех packages update к latest stable (включая Serverpod). Simplified философия = ТОЛЬКО architecture ceremony reduction (NO usecases / business notifiers / validation generation), всё остальное inherited from t115.

### Master state (2026-05-28 — post TASK-032 merge)

- **Branch:** `master 6b42bd4` (post TASK-032 PR #31 squash merge)
- **Tests:** **264 passing** на master (258 + 6 TASK-032). На ветке TASK-033 — **271 passing** (+7 session_manager: 3 inline golden + 4 live regression).
  - 253 (pipeline 5/5) + 5 TASK-031 + 6 TASK-032 = 264 master; +7 TASK-033 = 271 on branch
- **Compile:** clean (`tsc -p ./` EXIT=0)
- **Lint:** 0 errors, 18 pre-existing warnings (curly rule на existing files)
- **CI:** [.github/workflows/test.yml](../../.github/workflows/test.yml) — minimal gate (compile + lint + mocha)
- **Total PRs merged:** **28** (Phase 1.5 9 + handoff + HOTFIX-001 + TASK-020 + TASK-021 + chore stack-lock + Phase B 3 + post-Phase-B 2 + TASK-030/025/026/027 + handoff sync + **TASK-028 + TASK-029** + this closure docs sync chore)

---

## Активные задачи

- **TASK-033 (in review)** — **session_manager ref.mounted guard в обоих templates** (последний BUG-001 residual, выявлен TASK-032 adversarial F3). `core/providers/session_manager_provider.dart` `_fetchUserContext()` — `state = userContext`/`state = null` после await без guard. 4 файла (t115 + simplified, flutter + admin) × 2 guards = 8. + 7 tests (3 inline golden CI-safe + 4 live regression) → mocha 271 passing. verify t199 (t115) + t200 (simplified) PASS errors=0. **Standard + Adversarial оба APPROVE.** **Branch:** `feature/TASK-033-session-manager-ref-mounted-guard-both-templates`. **Awaiting User merge.**

### Закрыто недавно

- **TASK-032 ✅ merged** (PR #31, master `6b42bd4`, 2026-05-28) — t115 ref.mounted guard parity (Bug 4). 4 `*_state_providers.dart` (11 guards). Template в `devabacus/t115` (`1b2b683`). Adversarial F1 (t115 CI-coverage) fixed inline.
- **TASK-031 ✅ merged** (PR #30, master `c8ad1b5`, 2026-05-28) — t115 LWW guard parity + caret bump custom_lint. Template в `devabacus/t115` (`fbffc4c`). Self-correction: "t115 generate-entity bug" был CLI usage error (TASK-033-nominal cancelled).

**🎉 BUG-001 полностью закрыт** (после TASK-033 merge): entity state_providers (TASK-025 simplified + TASK-032 t115) + core session_manager (TASK-033 оба). Anti-pattern истреблён в обоих templates.

### Suggested follow-up TASKs (capacity-driven, не started; ID присваивается скриптом)

- ~~**Configuration legacy paths consolidation** (TASK-028 adversarial R2 C-1)~~ — **CLOSED 2026-05-28 (variant A — leave, User approved).** Investigation: `reconcileServerChanges` / `handleSyncEvent` / `insertOrUpdateFromServer` в `configuration_local_data_source.dart` = **dead code, 0 call sites** (sync идёт через `configuration_local_apply.dart` LocalApply path). C-1 premise "active UPSERT bypass" опровергнут — методы не вызываются. Авторский комментарий: оставлены намеренно "как часть интерфейса". Удаление = blast radius ради marginal cleanup → leave per author intent.
- ~~**t115 pubspec rotted comments symmetry sweep** (TASK-031 Rev 2 H3)~~ — **DONE 2026-05-28 (chore).** build_runner + json_serializable rotted comments в `t115_flutter/pubspec.yaml` обновлены на accurate (t199 evidence: build_runner 2.15.0 + json_serializable 6.11.2 + analyzer 8.4.0, verify PASS). Comment-only (constraints не trognyты — caret floors resolve корректно). drift_dev/freezed comments не было (constraints ^2.26.0/^3.0.4 resolve к 2.31.0/3.2.3 — работают, не трогаем).
- **Post-pipeline weight backlog** (cross-repo, weight репо): регенерировать существующие 13 сущностей weight v1 под новые шаблоны + перенос кастомов. **Readiness → HIGH** (Bug 4 gap закрыт TASK-032 + session_manager TASK-033). Остаётся `:base` overwrite git-diff procedure. **Capacity-driven, требует context shift в weight репо + User explicit start.** ← следующий substantive item.

### Закрыто в pipeline 5/5 (TASK-019 weight handoff package)

> **Cross-repo origin (2026-05-23):** 5 task package пришёл из weight-system [TASK-021 handoff](../../../../Flutter/serverpod/weight/ai/tasks/active/TASK-021-generator-root-followup/task.md) — фиксы шаблонов после TASK-019 sync_core wire-up review. User decisions Q1-Q6 зафиксированы. Порядок: 4→1→2→3→5. Тестирование = отдельные `t<N+i>` per PR (политика репо). Multi-agent review: 2 baseline / 3 для Bug 3 + Bug 5. Без регена weight (политика TASK-019 + ADR-0016).

| ID | Описание | Status | Merged |
|---|---|---|---|
| TASK-030 | **BLOCKER — template pubGet drift** (caret bump `custom_lint: 0.8.0 → ^0.8.0`). Closes BUG-021. | ✅ done | PR #22 (master `bffe07a` 2026-05-25) |
| TASK-025 | **Bug 4 — Riverpod `ref.mounted` guard в state_providers** (11 guards в 4 simplified files + 9 unit tests). Closes [BUG-001](../bug-reports/001-state-provider-ref-disposed.md) для simplified. Порядок: 1-й. | ✅ done | PR #23 (master `9c9b472` 2026-05-25) |
| TASK-026 | **Bug 1 — entityType const snake_case casing fix** (`replacement_util.ts` ENTITY + 2× M2M snake-rule lookahead, 10 unit tests). **Bonus meta-bug fix:** rename test files `_test.ts` → `.test.ts` (TASK-025 9 dead tests revived). Порядок: 2-й. | ✅ done | PR #24 (master `6c55788` 2026-05-25) |
| TASK-027 | **Bug 2 — enum `byName` → graceful `tryParseEnum` helper** (Option A shared `lib/core/utils/enum_parse.dart` + import injection в category/task/tag entity_extension templates, 9 unit tests). Closes [BUG-022](../bug-reports/022-enum-byname-state-error.md). Порядок: 3-й. | ✅ done | PR #25 (master `0a91e2b` 2026-05-25) |
| TASK-028 | **Bug 3 — LWW skip-stale guard default ON, junction opt-out** (4 simplified `*_local_apply.dart` patched + 15 unit tests). Closes silent data corruption на cross-device pull. **Adversarial caught:** Configuration "singleton" claim misleading → docstring fixed inline. Follow-up TASK-031/032 suggested. Порядок: 4-й. | ✅ done | PR #27 (master `1cb9bf3` 2026-05-25) |
| TASK-029 | **Bug 5 — `generate-entity --with-server` opt-in (default OFF)** (4 core files + VS Code quickPick + 20 tests). Breaking-change CLI — least-surprise после TASK-019 B2 incident. **Adversarial caught:** RelationPatcher тоже bypass filter → inline fix (RelationPatcher теперь filter'ит `server/` scan когда `!withServer`). Порядок: 5-й (последний). | ✅ done | PR #28 (master `5296ce3` 2026-05-26) |

### Закрыто в Phase B (для истории)

| ID | Описание | Status |
|---|---|---|
| TASK-022 | **B1 codegen core multi-template infrastructure** ✅ merged 2026-05-04 (PR #19, master `a3820e4`). | ✅ done |
| TASK-023 | **B2 Session 1 — BUG-019 fix subset** ✅ merged 2026-05-04 (PR #20, master `ff8f9d9`). | ✅ done |
| TASK-024 | **B2 Session 2 — simplified template directory bootstrap** ✅ merged 2026-05-04 (PR #21, master `accb1e2`). `DEFAULT_TEMPLATE` revert simplified → t115; simplified opt-in. | ✅ done |

---

## Открытые backlog (trigger-based per Discussion #9)

| ID | Severity | Description | Action |
|---|---|---|---|
| ~~BUG-001~~ | ~~High UI~~ | ~~Ref disposed в state_providers (Riverpod async)~~ | ✅ **CLOSED 2026-05-28** — TASK-025 (simplified state_providers) + TASK-032 (t115 state_providers) + TASK-033 (session_manager оба). Anti-pattern истреблён в обоих templates. |
| BUG-014 | Low | `relation_patcher.ts` regex без word boundary anchoring | Defer until Initiative |
| BUG-015 | ⚠ High codegen → **untested** | Cross-feature junction (parents в **разных** features) generation broken | ⚠ **t201 prove-out (2026-05-28): same-feature junction PASS errors=0** (canonical task_tag_map + custom author_book_map). **Cross-feature (parents в разных features) НЕ тестировался** — остаётся открытым edge. Re-test перед weight regen если weight имеет cross-feature junction. |
| ~~BUG-016~~ | ~~Medium~~ | ~~Junction MANY_TO_MANY substitution analog TASK-017~~ | ✅ **Appears RESOLVED (verified t201 2026-05-28)** — custom-named junction (author_book_map) substitution чистая errors=0, target names из YAML relations. Вероятно закрыт TASK-014/017. |
| BUG-017 | Low → Medium* | `onDelete=Cascade` для FK alias generates as `setNull` | `<weight-build TASK>`-driven (data integrity). НЕ тестировался в t201 prove-out. |
| BUG-018 | Low | `entity_yaml_validator` should warn on Serverpod reserved names | Defer |
| ~~BUG-019~~ | ~~Medium~~ | ~~Orchestrator snippet hardcoded literals~~ | ✅ Closed 2026-05-04 (TASK-024). |
| ~~BUG-020~~ | ~~Medium → Low~~ | ~~Junction substitution hardcoded `templEntity1`/`templEntity2` defaults (`task`/`tag`)~~ | ⚠ **Likely MOOT (re-classified 2026-05-28)** — premise не материализовался (оба templates сохранили `task_tag_map` fixture → defaults match). t201 custom junction PASS. Target-side substitution из YAML работает. См. [BUG-020](../bug-reports/020-junction-substitution-template-coupling.md). |
| BUG-005 | backlog | `:base` section overwrite при regen теряет custom code | git-diff procedure перед regen. Open architectural. Релевантно weight regen. |
| ~~TASK-CI-001~~ | ~~Medium~~ | ~~Minimal automated gate~~ | ✅ Done via TASK-020 — minimal single-job CI. |

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
| TASK-031 | Bug 3 t115 LWW guard parity | 🟡 In Progress | 2026-05-27 |
| TASK-032 | Bug 4 t115 ref.mounted guard parity | 🟡 In Progress | 2026-05-28 |
| TASK-033 | session manager ref.mounted guard both templates | 🟡 In Progress | 2026-05-28 |
