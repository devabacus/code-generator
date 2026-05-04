# Adversarial Review (Overlay) — TASK-022

**Reviewer:** Adversarial (Subagent fresh-eyes)
**Date:** 2026-05-03
**Branch:** `feature/TASK-022-b1-codegen-core-multi-template-infrastructure` (5 commits ahead of master)
**Recommendation:** **Request changes** — 1 DEAL-BREAKER + 3 HIGH findings; numbers fact-check clean but acceptance criteria gaps + weak proof-of-extensibility test

---

## DEAL-BREAKERS (must address перед commit)

### DB-1. Acceptance criterion #12 (closure-report Phase B section update) **not done** — explicit task.md AC

- **Evidence:**
  - `git diff master..HEAD --stat` shows ZERO modifications to `ai/tasks/done/TASK-021-.../closure-report.md`.
  - `Grep "TASK-022\|Phase B — TASK-B1" ai/tasks/done/TASK-021-.../closure-report.md` → `No matches found`.
  - task.md acceptance line 60: *"**Per-TASK closure-report Phase B section update** (incremental, не at-end): добавить sub-section 'Phase B — TASK-B1 deliverable' в [closure-report.md](...) с verification artifacts."*
  - task.md plan line 154 (Step 16) marked `[ ]` (unchecked) — executor knows it's pending.
- **Issue:** Acceptance criterion explicitly required the closure-report update; "incremental, не at-end" was the whole point per ClaudeAdv DEAL-BREAKER from Phase A. Missing it now propagates the Phase A→B drift it was supposed to prevent.
- **Fix:** Add sub-section "Phase B — TASK-B1 deliverable" to `closure-report.md` with: (a) artifact list (5 commits), (b) test count delta (163→172), (c) verify smoke result, (d) zero-diff evidence summary. Then close AC #12 in task.md.

---

## HIGH (likely to bite в integration)

### H-1. `report.md` left as 23-line stub — acceptance criterion #9 unmet

- **Evidence:** `wc -l report.md` → 23. Content is the unfilled template (`Что было реализовано.`, `(количество или список)`, `Да / Нет`, `Ready for review.`).
- **Issue:** task.md AC line 58: *"`report.md` написан с цитированными CLI выводами (real numbers: mocha passing count + verify errors/warnings + zero-diff evidence)."* Empty stub fails this gate, blocks downstream auditability for closure-report.
- **Fix:** Fill report.md with cited CLI outputs (`172 passing (45ms)`, `npm run lint → 0 errors / 18 warnings`, `verify --name t165 --human → errors=0 warnings=1 infos=44`, zero-diff procedure + result). Acceptable to defer until after multi-agent review fixes are folded in, but BEFORE commit / merge.

### H-2. "Alt config produces alt literals" relation_patcher test is negative-only — does NOT prove extensibility

- **Evidence:** `src/test/generators/relation_patcher.test.ts:593-649`. The test sets `templateMainEntity = 'taskAlt'`, `templateRelatedEntity = 'categoryAlt'`, `markerName = 'altRelations'` — none of which exist in mocked template files. Patcher returns early because no template files match. Assertions are all NEGATIVE (`!result.includes('altRelations')`, `result === dest unchanged`).
- **Issue:** The test would PASS even if the refactor mistakenly read `templateRelatedEntity` instead of `templateMainEntity` in line 21. There is no fixture proving that an alt-named template entity is actually picked up. Compare to the orchestrator alt-test (line 784-822) which writes `register<ExpenseEntity>` to an alternate path — that one is positive proof. And app_database alt-test (line 486-533) — also positive (verifies alt template path read).
- **Issue impact:** The relation_patcher test is misleadingly named "produces alt literals" when it actually verifies "no-op when literals don't match fixtures" — leaves a regression vector open for TASK-B2 simplified config swap.
- **Fix:** Either (a) add a positive-path fixture (mock alt template file at `taskAlt_dao.dart` containing `:altRelations` marker, run patcher with alt config, assert alt marker block written to dest), or (b) rename test to honestly reflect what it asserts ("alt config: returns early когда template fixtures missing").

### H-3. Hardcoded entity literals **remain** in `orchestrator_patcher.ts` outside scope — partial extraction, not full multi-template enablement

- **Evidence:** `Grep "'task'|'category'|'taskTagMap'|'task_tag_map'" orchestrator_patcher.ts` shows hardcoded literals at:
  - Line 208: `const tplEntity = isJunction ? 'taskTagMap' : 'category';`
  - Line 250: same.
  - Line 261: `const fk1Name = ... : 'task';`
  - Line 262: `: 'tag';`
  - Lines 410-475: `_ENTITY_IMPORTS_TEMPLATE`, `_JUNCTION_IMPORTS_TEMPLATE`, `_ENTITY_REGISTER_TEMPLATE`, `_JUNCTION_REGISTER_TEMPLATE` — full template strings hardcoded with `'category'` / `'task_tag_map'` / `features/tasks/`.
- **Issue:** task.md scope was narrow (lines 42-48 path components only) — so this is technically NOT in scope for B1. **But:** the title "codegen core multi-template infrastructure" claims more than it delivers. TASK-B2 simplified config will still need to refactor entity literals + template strings — they cannot just plug a new factory and have orchestrator work. The "proof-of-extensibility" framing in B1 is partially fictional.
- **Fix:** Either (a) acknowledge in report.md / closure-report that orchestrator template strings are deliberately deferred to TASK-B2 with explicit backlog item, or (b) widen B1 to fully extract orchestrator template entity literals. Recommendation: option (a) — keep B1 scope tight per task.md, but **document gap explicitly** so TASK-B2 estimate accounts for it (Discussion #11 estimate of "2-2.5 weeks executor" may have already accounted for it; if not, escalate to teamlead).

---

## MEDIUM

### M-1. TDD-first claim не corroborated commit history — tests + refactor co-committed

- **Evidence:** `git log --reverse master..HEAD --format="%H %ai %s" -- src/`:
  ```
  20:32:41  feat(config): добавить TemplateConfig interface
  20:32:53  refactor(relation_patcher): + tests   ← 12 sec gap
  20:33:02  refactor(orchestrator_patcher): + tests
  20:33:12  refactor(app_database_generator): + tests
  ```
  Each refactor commit includes BOTH the generator change AND its `+3` test cases в **одном commit**. There's no atomic "tests-first → red → refactor-then-green" timeline visible.
- **Issue:** Executor's task.md Step 5 claim ("**Baseline:** 170 passing / 2 failing (TDD-first invariant met)") implies a measurable red-then-green moment, but commits don't preserve that history. **Note:** baseline на master = 163 passing (verified by `git checkout master -- src/ && mocha`), not 170 as report implies. So executor's "170" was likely 163 + 7 already-green new tests (regression cases that pass without refactor since constants in `t115TemplateConfig()` match hardcoded values), with 2 tests genuinely red until refactor lands. Plausible but unverifiable from history.
- **Issue impact:** LOW — for refactor-preserves-behavior tasks, TDD-first is mostly ceremonial. Tests passing post-refactor is the real invariant. Just don't claim TDD-first if commit-graph doesn't show it.
- **Fix:** None required — but for future tasks involving behavior CHANGE (not refactor), commit tests first separately to preserve red-then-green evidence.

### M-2. "TDD-first" baseline claim mismatch — 170 vs 163

- **Evidence:** Master baseline measured: `163 passing (42ms)`. Executor's task.md Step 5 says "Baseline: 170 passing / 2 failing". Final = 172 passing.
- **Issue:** The "170 passing" baseline was reported as the post-test-add / pre-refactor state. Math: 163 master + 9 new tests = 172, of which 2 fail before refactor → 170 passing / 2 failing. Self-consistent but executor's wording could mislead reader into thinking 170 was the master baseline.
- **Fix:** Clarify в report.md: "Master baseline = 163 passing. Added 9 TASK-022 cases; 7 immediately green (regression cases asserting t115 default literals), 2 red (alt-config tests requiring refactor). Post-refactor: 172 passing / 0 failing."

---

## Hidden assumptions / undeclared dependencies

### HA-1. Default factory pattern `templateConfig: config.templateConfig || t115TemplateConfig()`

- **Location:** `generation_config.ts:100`.
- **Assumption:** Every existing call-site passes config через `IGenerationConfig` object literal — adding optional field is safe. Verified: `Grep "new GenerationConfig\("` shows 16 call-sites, all use object literal. Backward compat preserved.
- **Risk:** If future code uses `Object.assign` over a typed copy and forgets to spread `templateConfig`, default factory works. But if someone passes `{ templateConfig: undefined }` explicitly (vs not passing it), `||` still falls back. OK.
- **No fix needed.**

### HA-2. `JunctionDetector` import remains required despite refactor — no scope creep

- Verified: `JunctionDetector` import in `relation_patcher.ts:8` and `orchestrator_patcher.ts:5` unchanged. No related drift. Stack lock invariants (no Riverpod/Drift/Serverpod imports added) verified via `git diff --stat` shows only `src/features/generation/{config,generators}/*` and `src/test/generators/*` files.

---

## Process / sequencing landmines

### PS-1. Executor closed Steps 1-12 within 26 minutes from session start (per task.md "<26 minutes" note)

- **Verification:** `git log --reverse master..HEAD --format="%ai"` first commit `20:32:41` → last src commit `20:33:12` = 31 seconds for code commits. The 26 minutes likely covers earlier exploration / test-writing / interactive sandbox check (which was not committed because it was just a `mkdir simplified-sandbox-test` + `Remove-Item`).
- **Concern raised in promptguide:** Discussion #11 estimate was "2-2.5 weeks executor". 26-minute closure is ×80 faster. Quality concerns:
  - **All 12 steps actually done?** Verified via task.md журнал entries → Steps 1-12 [x] checked, with prose explanations. Some steps (Step 9 — call-sites adaptation) legitimately were no-op due to default factory pattern. Step 11 verify smoke documented with concrete numbers. Step 12 zero-diff documented with normalization procedure. **Evidence is consistent.** Estimate of 2-2.5 weeks accounted for full B-cycle scope (TASK-B2 simplified content + tests + Open Q resolution); B1 alone is a tight focused refactor that genuinely takes <1 day.
- **Conclusion:** Estimate-vs-actual gap is between Phase B total (which Discussion #11 estimate covers) and B1 alone. Not a quality concern. Executor closed B1 cleanly.

### PS-2. PowerShell wrapper sandbox check — minor process detail

- **Evidence:** task.md journal line 273: `bash → powershell.exe -NoProfile -Command "..."`.
- **Issue:** Standard Windows pattern when PowerShell tool blocked. Not workaround of anything destructive — just `mkdir + Test-Path + rmdir + Test-Path`. **No scope violation.**

---

## Fact-check results

| Claim | Actual | Verdict |
|---|---|---|
| **172 passing** | `172 passing (45ms)` confirmed (mocha CLI output) | ✅ verified |
| **45ms runtime** | Re-runs: 45ms / 41ms / 42ms (consistent <50ms) — not Russian decimal "45 sec" | ✅ verified |
| **0 lint errors** | `npm run lint` → "0 errors, 18 warnings" — matches | ✅ verified |
| **18 pre-existing warnings** (not new) | All warnings in pre-existing files (`add_microservice/index.ts`, `openapi_parser.ts`, `server_yaml_parser.ts`, etc.) — none in TASK-022 modified files | ✅ verified |
| **t165 verify PASS errors=0 warnings=1 infos=44** | t165 directory exists at `G:/Projects/Flutter/serverpod/t165/`. Did not re-run (per instructions). Numbers cited consistent with previous TASK verify outputs (warnings≤2 infos~44 typical post-CHANGELOG). | ✅ plausible (not re-verified per instruction) |
| **Zero-diff smoke t166 vs t167** | `diff -r --brief t166/lib t167/lib` shows 24 differing files. After `sed s/t166/t167/g` + CRLF strip on samples (database.dart / main.dart / app.dart / sync_queue_table.dart) — all collapse to project-name diffs only. Normalization legitimate (each project has own name embedded in code). | ✅ verified — diffs reduce to expected normalization residue |
| **Step 9 no-op (call-sites unchanged)** | `git diff master..HEAD -- src/features/generation/generators/generation_service.ts src/adapters/cli/commands/` → empty output. Verified via `IGenerationConfig` object-literal pattern + default factory | ✅ verified |
| **TDD-first ordering** | Refactor + test added in SAME commit (1f7263a, 45c4a79, 44322ea). Master baseline = 163, post = 172, +9 tests claim verified. TDD-first invariant ceremonial (refactor preserves behavior) but not git-historically provable | ⚠ partial — claim self-consistent but commit graph doesn't preserve red-then-green |
| **Bonus fix line 133 needed in master** | `git show master:src/.../relation_patcher.ts` line 136 (≈"line 133" before refactor adjustment) had hardcoded `templEntity: 'category'` — confirmed. Bonus fix legitimate (consistency, not introduced bug) | ✅ verified — true existing inconsistency |
| **+9 tests added** | Verified via diff: relation_patcher.test.ts +3 cases (T-022 section), orchestrator_patcher.test.ts +3 cases, app_database_generator.test.ts +3 cases — exactly 9 `test('TASK-022 / TemplateConfig: ...'` blocks across files | ✅ verified |
| **Stack lock compliance (no Riverpod/Drift/Serverpod/markers/directory layout changes)** | `git diff master..HEAD --stat` shows changes confined to `src/features/generation/{config,generators}/*` + `src/test/generators/*` + `ai/docs/status.md` + task papka. No package.json / lib/ infrastructure / template directory drift | ✅ verified |

---

## Strengths

1. **Numbers fact-check clean** — 172 passing, 0 lint errors, 18 pre-existing warnings — all reproducible by re-running mocha + lint independently.
2. **Step 9 default factory pattern** is a clean, idiomatic backward-compat solution (no need to touch 16 call-sites). Saves significant churn.
3. **Bonus fix line 133** is genuinely useful consistency improvement — was a latent inconsistency in master that no predecessor TASK caught (TASK-008/017/etc. were focused on different concerns).
4. **Orchestrator + AppDatabase alt-config tests** are legitimate proof-of-extensibility (positive path verifications: alt path written / alt template read).
5. **Zero-diff smoke procedure** is honest about normalization (CRLF + project name) — not pretending those diffs don't exist.
6. **Stack lock fully respected** — diff confined to expected files, no Riverpod/Drift/markers/directory layout drift.
7. **TypeScript-safe optional field** with `templateConfig?: TemplateConfig` + default factory — no breaking change for consumers.

---

## Verdict

The refactor itself is correct, surgical, and preserves behavior (172 passing, zero-diff smoke validates). The 1 DEAL-BREAKER (closure-report not updated) and 2 HIGH (report.md stub, weak alt-config test in relation_patcher) are gaps in the **acceptance evidence layer**, not in the code. Fix those before commit / merge:

1. Update `closure-report.md` with Phase B sub-section (DB-1).
2. Fill `report.md` with cited CLI outputs (H-1).
3. Either strengthen relation_patcher alt-config test to positive path, OR rename it honestly (H-2).
4. Document orchestrator entity literal gap as deferred-to-TASK-B2 backlog (H-3).

After those fixes, this is a clean approve. The code quality and fact-check is the strongest of the recent reviewable TASKs (TASK-013/014 had bombs in adversarial round 1; TASK-022 has none).

---

## Catch count: 7 findings (1 DEAL-BREAKER / 3 HIGH / 2 MEDIUM / 0 LOW + 2 ✅ no-finding sections)

- **DEAL-BREAKER:** DB-1 (closure-report missing)
- **HIGH:** H-1 (report.md stub), H-2 (relation_patcher alt-config test negative-only), H-3 (orchestrator literals partial extraction)
- **MEDIUM:** M-1 (TDD ordering not commit-provable), M-2 (170 vs 163 baseline math clarification)
- **PASSED:** Numbers fact-check, stack lock, scope adherence, default factory pattern soundness
