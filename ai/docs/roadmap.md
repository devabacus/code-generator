# Дорожная карта проекта

Высокоуровневый план развития code-generator.

**Обновлено:** 2026-05-26 (**🎉 Pipeline 5/5 CLOSED** — TASK-019 weight handoff package complete)

---

## Текущий статус

**Phase 1.5 + Phase A + Phase B ✅ EXECUTED** (2026-05-03 → 2026-05-04). **🎉 Pipeline 5/5 CLOSED** (2026-05-26). master `5296ce3` (post TASK-029 PR #28 squash merge). **28 PRs merged** total. **253 tests** passing на master.

**🎉 Pipeline 5/5 closed:**

- ✅ **TASK-030 BLOCKER** (PR #22, master `bffe07a`) — template pubGet drift fix через caret bump `custom_lint`. Closes [BUG-021](../bug-reports/021-pub-deps-drift-template-pubspec.md).
- ✅ **TASK-025 Bug 4** (PR #23, master `9c9b472`) — Riverpod `ref.mounted` guard в state_providers. Closes [BUG-001](../bug-reports/001-state-provider-ref-disposed.md) для simplified.
- ✅ **TASK-026 Bug 1** (PR #24, master `6c55788`) — entityType const snake_case casing fix (lookahead quote-boundary). Bonus: meta-bug rename `_test.ts` → `.test.ts` (TASK-025 dead tests revived).
- ✅ **TASK-027 Bug 2** (PR #25, master `0a91e2b`) — enum `byName` → `tryParseEnum` graceful helper. Closes [BUG-022](../bug-reports/022-enum-byname-state-error.md).
- ✅ **TASK-028 Bug 3** (PR #27, master `1cb9bf3`) — LWW skip-stale guard default ON, junction opt-out. 4 simplified `*_local_apply.dart` patched. Adversarial caught Configuration "singleton" claim — fixed inline. Follow-up TASK-031/032 suggested.
- ✅ **TASK-029 Bug 5** (PR #28, master `5296ce3`) — `generate-entity --with-server` opt-in default OFF. Breaking CLI change. Adversarial caught RelationPatcher leak — fixed inline.

**Suggested follow-up TASKs (capacity-driven):**

- **TASK-031** (suggested per TASK-028 adversarial R2 H-1): t115 LWW guard parity. ADR-0005 amendment "bug-fix-as-needed" rationale. ~1-2 часа.
- **TASK-032** (suggested per TASK-028 adversarial R2 C-1): Configuration legacy paths consolidation. ~2-3 часа.
- **Post-pipeline weight backlog** (cross-repo): регенерировать 13 сущностей weight v1 под новые шаблоны.

**Phase B execution outcomes:**
- TASK-022 (PR #19, `a3820e4`) — TemplateConfig injection, 173→179 tests
- TASK-023 (PR #20, `ff8f9d9`) — simplified template content session 1, BUG-019 fix
- TASK-024 (PR #21, `accb1e2`) — simplified directory bootstrap, **Discussion #12 pivot:** DEFAULT_TEMPLATE simplified → t115; simplified opt-in via `--template simplified` для new CRUD projects. Both templates долго-сохраняемые.

**Architectural pivot decisions:**
- **Discussion #7** (archived 2026-05-03): Multi-template plurality. t115 → legacy/advanced. New "Simplified Template Initiative".
- **Discussion #8** (archived 2026-05-03): Sequence approved — *superseded by Discussion #9*.
- **Discussion #9** (archived 2026-05-03): Weight v2 fresh build pivot. **TASK-018 cancelled.**
  - **Clean-slate amendment 2026-05-03:** weight v1 НЕ в production, нет users → нет dual-running concerns, нет cutover, нет decision matrix v1 maintenance. Estimate 5-6 → ~3-4 months realistic.
- **Discussion #10** (archived 2026-05-03): Initiative Phase A organization (13-point Decision).
- **Discussion #11** (archived 2026-05-03): Initiative Phase B implementation strategy (12-point Decision) + **⚠ CRITICAL Stack-lock User decision** (стэк t115 baseline locked, package versions update к latest stable, simplified философия = ТОЛЬКО architecture ceremony reduction).
- **Discussion #12** (archived 2026-05-04): **⚠ Pivot — t115 как default; simplified = opt-in.** Post-TASK-024 multi-agent review re-evaluation: simplified ≡ t115 минус 3 abstract layers (~30% file reduction marginal benefit); migration cost для weight (13 entities) > rebuild benefit. **DEFAULT_TEMPLATE reverts simplified → t115.** Weight TASK-018 ре-activated на t115 + sync_core wire-up (proven, no migration cost). Simplified = opt-in для new CRUD projects via `--template simplified`. Both templates долго-сохраняемые. Stack lock + 13 markers + Clean directory layout invariants preserved.

---

## Approved sequence (Discussion #9, 5-6 months realistic, 6 hard ceiling)

**Priority rule (explicit):** Phase A-D gate blockers > Initiative Phase E-G > non-triggered backlog. STOP-gate protocol для concrete blockers.

**Hard ceiling action:** scope cut (drop UI parity для some features, manual cutover, defer cross-device smoke), НЕ timeline extension.

### Month 1 — Phase 1.5 ceremony cleanup + Initiative kickoff

- ✅ TASK-019 closure (Phase 1.5 final gate)
- ✅ HOTFIX-001 (`new_task.py` scan active/ + done/ + blocked/)
- ✅ TASK-CI-001 closed via TASK-020 — minimal single-job CI ([.github/workflows/test.yml](../../.github/workflows/test.yml)): `npm ci` + `npm run compile` + `npm run lint` + mocha 163 unit tests on PR/push to master. 3-suite split (universal + t115 regression + simplified) deferred to Initiative Phase A test inventory audit deliverable. Verify smoke deferred (heavy, requires real test project).
- 🟡 Initiative Phase A (TASK-021 Sub-A6 finalize per Discussion #10 13-point Decision): Architectural design — ADR-0005 multi-template plurality promoted в [ai/docs/decisions/](decisions/adr-0005-multi-template-plurality.md) + sync_core dual-running audit (Option C dedicated v2 testing scope recommended) + test inventory audit (78% universal cases) + backend strategy Option 1 confirmed + weight v1 schema audit (0.5/4 triggers active). Sub-A5 multi-agent review (4 reviewers) → 49 findings (5 CRITICAL/DEAL-BREAKER + 14 HIGH applied). **Pending User counter-sign:** ADR text + decision matrix v1 maintenance.

### Month 2 — Initiative Phase B-D + synthetic acceptance

- Initiative Phase B: Generate-vs-not-generate divider implementation
- Initiative Phase C: New t<200>-series reference template (с manifest markers, 5-7 entities synthetic)
- Initiative Phase D: Codegen `--template <name>` selection mechanism

**Phase A-D gate (mandatory before `<weight-build TASK>` starts):**
- [ ] ADR architectural decision document
- [ ] Synthetic reference project t<200> minimal viable (5-7 entities, verify PASS errors=0)
- [ ] Generator infrastructure (`--template` flag, manifest markers, junction regression PASS)
- [ ] Multi-agent review pattern applied (Standard + Adversarial на 5 specific deliverables, catch rate ≥1)
- [ ] Documentation rulebook ("what generator generates / what agents write manually")

**Gate verification artifact:** `ai/tasks/initiative-phase-a-d/closure-report.md` TeamLead-signed + User counter-signed. Без артефакта → `<weight-build TASK>` cannot start.

### Month 3 — `<weight-build TASK>` bootstrap + Initiative Phase E

> NB: TASK-020 уже занят CI gate (TASK-CI-001). Weight v2 build получит next available ID через `new_task.py` (e.g. TASK-021 если ID не conflict'нет с другими).

- `<weight-build TASK>` created **only after Phase A-D gate closed**
- Weight v2 entity build (13 entities + sync infrastructure через generator)
- Initiative Phase E: Acceptance — synthetic t<200> + first weight v2 entities side-by-side comparison

### Month 4 (post clean-slate revision) — Weight build feature parity + Phase F+G closure

- Weight build UI parity (без v1 visual reference compatibility, simplified philosophy)
- Weight build business logic / workflows manual write (per simplified template philosophy: business layer = manual)
- Weight build cross-device runtime smoke
- Initiative Phase F: Documentation reconciliation (CLAUDE.md plurality + ADR-0005 + agent_memory.md split)
- Initiative Phase G: closure docs + multi-agent review (Standard + Adversarial fresh)

### Hard ceiling 4 months (was 6 pre clean-slate)

- Action на ceiling = scope cut (drop UI parity для some features), НЕ extend
- **Removed under clean-slate (2026-05-03):**
  - Cutover plan execution (нет users чтобы migrate)
  - Dual-running window planning (нет coexistence)
  - v1 → v2 production cutover separate later TASK (нет v1)
  - Backend event emission verification spike (no v1-source mutations)
  - Decision matrix v1 maintenance approval (нет v1)
- BUG-001 fix capacity-permitting

---

## Tracks (parallel)

### Track 1: ⏭ N/A under clean-slate decision (2026-05-03)

**Removed:** weight v1 production baseline (critical-only maintenance) — User confirmed weight v1 НЕ в production, нет real users → нет maintenance burden.

Decision matrix v1 maintenance moot. Track 1 deleted. All ресурсы flow в Track 2 (Simplified Template Initiative) + future weight build.

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
| BUG-015 | High codegen | Cross-feature junction generation broken | Phase A-D или `<weight-build TASK>`-driven (если weight v2 имеет cross-feature junctions) |
| BUG-016 | Medium | Junction MANY_TO_MANY substitution analog TASK-017 | `<weight-build TASK>`-driven |
| BUG-017 | Low → Medium* | `onDelete=Cascade` для FK alias generates as `setNull` | `<weight-build TASK>`-driven (data integrity) |
| BUG-018 | Low | `entity_yaml_validator` should warn on Serverpod reserved names | Defer |
| ~~BUG-019~~ | ~~Medium~~ | ~~Orchestrator snippet templates содержат hardcoded entity literals (`category`/`taskTagMap`/`features/tasks/`)~~ | ✅ Closed 2026-05-04 (TASK-024 Session E3d2) — default flow t176 + legacy flow t177 verify PASS errors=0; junction-substitution-side → BUG-020 |
| BUG-020 | Medium | Junction substitution coupled с hardcoded `templEntity1`/`templEntity2` defaults (`task`/`tag`) — Session 2 landmine для simplified junction generate-entity flow | TASK-023 Session 2 либо follow-up TASK после Session 2 closure |
| ~~HOTFIX-001~~ | ~~Low~~ | ~~`new_task.py` сканирует только `active/`~~ | ✅ Closed (PR #14) |
| ~~TASK-CI-001~~ | ~~Medium~~ | ~~Minimal automated gate~~ | ✅ Closed via TASK-020 — minimal single-job, [.github/workflows/test.yml](../../.github/workflows/test.yml). 3-suite split + verify smoke deferred to Phase A. |

---

## Deferred (post Months 1-6)

- **Phase 2 (Microservices feature parity)** — defer until Initiative + `<weight-build TASK>` done
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
| #10 | 2026-05-03 | **Initiative Phase A organization** — single TASK-021 с 7 sub-phases (Sub-A0..A6 + Sub-A0.5 weight schema audit), Sub-A1/A4 parallel, Q7=c ADR text sign-off MUST, Q7=e реджект (B-D decisions emerge in B-D), Q8 decomposed ceiling 3w calendar, Q10 двухслойная review structure (Layer 1 = #10 ✅ / Layer 2 = Sub-A5 3 thematic), ADR-0005 Phase C amendment clause |

Полные тексты: `ai/discussions/archive/`.

---

## User decision points budget (Discussion #9 ClaudeO #11)

Per Phase A architectural decisions требуют User input — explicit timeline budget:

| Decision | Required by | Owner | Buffer if delayed |
|---|---|---|---|
| Backend strategy (Option 1/2/3) | Phase A start | User | +1 week per delay week |
| Decision matrix v1 maintenance | Phase A start | User | +1 week per delay week |
| Phase A-D gate sign-off | Before `<weight-build TASK>` | User | +2 weeks if iteration needed |
| Cutover plan review | `<weight-build TASK>` closure | User | +1-2 weeks |

Total potential User-side latency: 4-8 weeks. Estimate уже implicitly budgets, но explicit tracking = best practice.

---

## Заметки

- Roadmap = живой документ
- Architectural decisions через Discussion process (multi-agent review + Adversarial pass)
- Маркеры задач: `[ ]` TODO, `[~]` in progress, `[x]` done, `[!]` blocked, `[~]` superseded
- **Phase A-D gate enforcement:** TeamLead обязан verify checklist closed + User counter-sign closure-report.md до `new_task.py` invocation для `<weight-build TASK>` (TASK-020 ID уже занят CI gate)
