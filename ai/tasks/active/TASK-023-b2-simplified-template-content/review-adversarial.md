# Adversarial Review (Overlay) — TASK-023 Session 1 (BUG-019 fix subset)

**Reviewer:** Adversarial (Subagent fresh-eyes)
**Date:** 2026-05-04
**Branch:** feature/TASK-023-b2-simplified-template-content (4 commits Session 1; commits `6537088` → `994bf1b` → `832ba6a` → `71e3a67`)
**Recommendation:** Approve with fixes

---

## DEAL-BREAKERS

_None._ The Session 1 deliverable is internally coherent — code compiles, tests pass, t115 default flow byte-equivalent (existing 173 tests cover regression).

---

## HIGH

### H-1. Silent behaviour change for `generate-entity --templ-feature <X != tasks>` callers — `templFeatureName` no longer participates in orchestrator substitution

**Evidence:**
- Master `orchestrator_patcher.ts:67`: `const tplFeatureSnake = toSnakeCase(config.templFeatureName);`
- HEAD `orchestrator_patcher.ts:82`: `const tplFeatureSnake = toSnakeCase(config.templateConfig.orchestrator.templateFeatureSegment);`
- CLI surface: `src/adapters/cli/commands/generate_entity.ts:45` declares `--templ-feature <name>` flag with default `'tasks'` — operationally **user-overridable**.
- `generate_entity.ts:90-106` builds `GenerationConfig` **without** passing `templateConfig` — falls through to `t115TemplateConfig()` default which hardcodes `templateFeatureSegment: 'tasks'`.
- Result: a caller invoking `generate-entity --templ-feature configuration` previously substituted template's `features/<X>/` literal using `'configuration'`; post-TASK-023 it uses `'tasks'` regardless of CLI flag. `templFeatureName` is now consumed only in `generation_config.ts:97` for `sourceFeaturePath` (file-system source folder). The two values can drift silently.

**Issue:** Pre-TASK-023, the `--templ-feature` CLI flag was the single source of truth for both source-feature lookup AND substitution anchor. Post-TASK-023, a `templateConfig.orchestrator.templateFeatureSegment` lane is bolted on, but no synchronisation between the two. No test covers this divergence (every test that sets `templFeatureName` also passes the matching templateConfig OR relies on default `'tasks'` matching the t115 factory default).

**Why this isn't a deal-breaker:** No production caller is currently overriding `--templ-feature` against a template that doesn't match (weight workflow uses defaults).

**Fix (suggested for round-2 or Session 2):**
- Either (a) make `templFeatureSegment` default to `config.templFeatureName` when not explicitly provided, OR (b) add a runtime assertion/warn if `templFeatureName !== templateConfig.orchestrator.templateFeatureSegment`, OR (c) document the divergence explicitly with a test that exercises an explicit override and proves the current behaviour is intentional.
- At minimum: add a regression test exercising `templFeatureName: 'foo'` against `templateConfig: t115TemplateConfig()` to encode the fact that the substitution anchor now ignores `templFeatureName`.

---

### H-2. Test "alt junction config с custom FK fallbacks" is mislabeled — does NOT exercise the `junctionFkFallbacks` config field at all

**Evidence:** `src/test/generators/orchestrator_patcher.test.ts:1092-1146`.

- Test name: *"alt junction config с custom FK fallbacks применяется когда model FK extraction returns < 2"*
- Test header comment line 1093-1095: *"Bomb-style positive: defensive FK fallbacks читаются из config.junctionFkFallbacks. Test: junction model с 0 FK fields → patcher fallbacks к config-defined parentA/parentB, не hardcoded task/tag."*
- Actual test body line 1124-1129: junction model is constructed **with two FKs** (`userId`, `roleId`), and the lead comment admits *"NB: < 2 не triggered junction detection — нужно ≥ 2 FK для junction. Используем 2 FK для positive path с ConcreteParent fallbacks."*
- Assertion line 1136-1139: `assert.ok(result.includes('junction FK→user+role'))` — i.e., proves the *extracted* FKs survive (substitution working). The negative assertion `!result.includes('junction FK→task+tag')` only proves t115's `task+tag` fallback didn't leak — which would also pass with hardcoded fallbacks just as long as the extraction succeeded.
- **There is zero coverage of `parentA`/`parentB` fallbacks ever firing.** Either FK extraction always succeeds for junction-detected models (making fallback dead code) or the test should assemble a junction model that triggers the fallback (e.g., a model that fakes `JunctionDetector.isJunctionEntity() === true` but has `model.fields.filter(isRelation).length < 2`).

**Issue:** Coverage gap. The new `junctionFkFallbacks` config field is consumed by `orchestrator_patcher.ts:290-291`, but no test verifies the consumption produces the configured fallback values. A breakage of the fallback path (e.g., regression that points at `'task'/'tag'` via accidental literal) would not be caught.

**Fix:** Add a test where junction detection succeeds but `model.fields.filter(f => f.isRelation === true).length < 2` (e.g., zero or one relation field tagged as junction), verifying the docstring contains `'junction FK→parentA+parentB'` for simplified config and `'junction FK→task+tag'` for t115 config.

---

### H-3. `simplifiedTemplateConfig()` factory contains forward-looking literals that will silently break Session 2 junction generate-entity flow

**Evidence:** Hidden coupling between `templateConfig` and other `GenerationConfig` defaults (`templEntity1`, `templEntity2`):
- `src/features/generation/config/generation_config.ts:94-95`: hardcoded defaults `templEntity1 = 'task'`, `templEntity2 = 'tag'` regardless of `templateConfig.name`.
- `src/features/generation/replacement/replacement_util.ts:60-61` consumes these defaults to build `tplJunctionSnake = 'task_tag_map'` and Pascal/camel variants.
- Simplified template's bootstrap (Session 2) will produce junction files like `configuration_map_*.dart` (per `simplifiedTemplateConfig().junctionImportsTemplate` evidence). When `generate-entity` runs against that bootstrap, `replacement_util` substitution rule `task_tag_map → role_permission` will not match the on-disk literal `configuration_map`, leaving file content un-substituted.
- This is **separate from the orchestrator_patcher BUG-019 fix** (which abstracted only orchestrator-snippet literals). The broader "junction-template-fixture" abstraction (Bomb #2 from TASK-013 / TASK-014 — `replacement_util.MANY_TO_MANY` + `_getDestinationPath`) is **not** abstracted by Session 1 and is silently broken for simplified.

**Issue:** Session 1's BUG-019 fix abstracts only one of two orthogonal junction-literal sites. The complete simplified-template support requires:
1. Orchestrator snippet literals (Session 1 ✓)
2. `replacement_util` junction file rename literals (Session 2 — **not yet identified** in journal)
3. `_getDestinationPath` junction file path literals (Session 2 — same)

**Fix:** Either (a) Session 2 acceptance must explicitly include closure of (2) + (3) above with config-driven `templEntity1`/`templEntity2` per templateConfig, OR (b) raise a TASK-016 / BUG-XXX backlog item ahead of Session 2 so it's not discovered mid-bootstrap. The journal does not flag this — Session 2 executor risks discovering it as scope creep mid-implementation.

---

### H-4. Executor's "-66 LOC orchestrator_patcher.ts" claim is inaccurate (off by ~half)

**Evidence:** `git diff master..HEAD --numstat src/features/generation/generators/orchestrator_patcher.ts` →

```
74    108    src/features/generation/generators/orchestrator_patcher.ts
```

74 inserted + 108 deleted = **net -34 LOC**, not -66 as claimed in the executor's task journal (line ~384 *"~360 LOC, was ~475"* implies -115 net which is also wrong; the literal `LOC` claim is off relative to actual `git diff --numstat`).

**Issue:** Documentation accuracy. Not load-bearing for correctness, but undermines trust in cited evidence elsewhere (motivates fact-check of every claim in the report). Multi-agent review precedent: claimed numbers must match observed numbers. (`-66 LOC` likely conflated insertions-into-config with deletions-from-patcher; or misread file size delta.)

**Fix:** Correct the figure in `report.md` (currently empty stub — see process H-5 below) and the journal. Cite `git diff --stat`/`--numstat` exactly: `74 insertions, 108 deletions, net -34 LOC` for orchestrator_patcher; `369 insertions, 6 deletions, net +363 LOC` for template_config.ts.

---

### H-5. `report.md` is template stub — acceptance criterion explicitly violated

**Evidence:** `ai/tasks/active/TASK-023-b2-simplified-template-content/report.md` is 23 lines of unfilled template ("Что было реализовано.", "Список ключевых файлов и причины.", "(количество или список)").

`task.md:118` requires: *"`report.md` написан с cited evidence (mocha numbers / package versions list / structure tree / BUG-019 closure evidence)"*.

**Issue:** Even under the partial-session split, Session 1 has cohesive deliverables that warrant a written report. Multi-agent reviewers were spawned (per teamlead's instructions including this Adversarial run) — they need report.md to verify claimed numbers. Currently every claim must be re-derived from journal + git diff (this Adversarial review did so manually).

**Fix (mandatory):** Executor must populate `report.md` with:
- Session 1 deliverable summary (codegen TS subset)
- Cited mocha (178 passing 42-47ms over 3 runs) / lint (0/18) / compile clean
- Cited LOC deltas (per H-4)
- Files modified table with verified line counts
- Honest "Session 2 outstanding" sub-section listing acceptance criteria deferred (template directory bootstrap, package versions, simplified positive smoke, BUG-019 status flip, closure-report Phase B sub-section)

The split is reasonable; the report stub is not.

---

## MEDIUM

### M-1. `simplifiedTemplateConfig().relationPatcher` self-coupled literals — `templateMainEntity` == `templateRelatedEntity` == `'configuration'`

**Evidence:** `template_config.ts:464-465`.

`RelationPatcher` design (per its docstring) swaps two distinct entity literals to locate `oneToManyMethods` marker block. With both fields equal, the swap is a no-op. The factory comment line 460-462 self-identifies the landmine: *"⚠ Когда Phase C synthetic добавляет concrete FK fixture, эти literals потребуется обновить."*

**Issue:** Acceptable for Configuration-singleton baseline (relations not exercised), but:
- No test guards against silent failure when simplified template enters multi-entity territory.
- The factory's `relationPatcher` config is a half-real placeholder; at minimum should be flagged in `simplifiedTemplateConfig`'s factory JSDoc as `// TODO: Phase C synthetic — concrete FK fixture required`.

**Fix:** Add a `// TODO` comment AND optionally an unit test that asserts simplified RelationPatcher invocation throws/logs when target entity has a relation (so Phase C executor encounters a hard failure rather than silent wrong substitution).

---

### M-2. Junction `junctionEntityFallback: 'configurationMap'` is a fictional placeholder — Session 2 will likely have to revise

**Evidence:** `template_config.ts:478` + factory JSDoc line 379-389 explicitly admits *"Symmetric с t115 в shape (substitution flow mechanical), но конкретные literal values (`configuration_map`) — это placeholder; t115 has `task_tag_map` от concrete TaskTagMap fixture."*

The simplified template bootstrap (Session 2) will not contain a `configuration_map_*.dart` directory because Configuration baseline is singleton with no junction. So `SIMPLIFIED_JUNCTION_*_TEMPLATE` const literals encode a **non-existent** template fixture. Tests that exercise simplified junction substitution (line 1092-1146) only verify substitution mechanics — they don't assert the fallback shape matches any real on-disk simplified fixture.

**Issue:** Forward-looking assumption that may not survive Session 2's bootstrap-or-Phase-C-synthetic. If Phase C synthetic uses different literal naming (e.g., `parent_child_map` not `configuration_map`), the simplified factory will need re-revision. This couples Session 1 deliverable to a Session 2 decision that hasn't happened.

**Fix:** Either (a) drop simplified junction templates from Session 1 (set them to throw or use a TODO sentinel) since simplified bootstrap doesn't ship with a junction reference; OR (b) document explicitly in factory JSDoc that the junction fallback values are subject to revision when Phase C lands a concrete junction fixture.

---

### M-3. `simplified-sandbox-test/` directory left on disk in `G:/Templates/flutter/` — pollutes template root

**Evidence:** `ls G:/Templates/flutter/` returns:
```
Packages/
simplified-sandbox-test/
t115/
```

Per journal line 333-334: *"Sandbox writability: ✓ mkdir simplified-sandbox-test succeeded; rm -rf blocked (HARD RULE per CLAUDE.md, expected). simplified-sandbox-test/ оставлен на disk (User cleans)."*

**Issue:** Process landmine for Session 2 — Session 2's `mkdir simplified` may end up adjacent to `simplified-sandbox-test/`, and reviewers will see the dangling directory in `G:/Templates/flutter/` listings until User cleans it. This is correct behaviour per CLAUDE.md HARD RULE on sandbox `rm` — but the sandbox-test step was unnecessary on a feature branch where `mkdir simplified` (the real target name) would have served the same writability-probe purpose. The fact-check probe could have been against a path Session 2 actually uses.

**Fix:** Flag User to clean `G:/Templates/flutter/simplified-sandbox-test/` before Session 2. Recommend Session 2 executor's first action: `mkdir G:/Templates/flutter/simplified` (real target) which also confirms writability without creating throwaway dirs.

---

## LOW

### L-1. `name: 't115' | 'simplified'` discriminator field consumed only in tests — dead in business logic

**Evidence:** `Grep templateConfig\.name` in `src/`:
- `app_database_generator.test.ts:467` — assertion only
- `orchestrator_patcher.test.ts:769` — assertion only
- `relation_patcher.test.ts:569` — assertion only

No business-logic site reads `templateConfig.name`. The field exists purely for diagnostic/logging (per JSDoc line 36-37) but currently has no logging consumer.

**Issue:** Documentary-only field. Not load-bearing, but represents API surface that future callers may misinterpret as actionable.

**Fix:** Either (a) wire `templateConfig.name` into a logger.info() at GenerationService construction (low-effort observability), OR (b) downgrade the JSDoc to *"reserved for future diagnostic use; currently unused at runtime"*.

---

### L-2. Spread-merge fix in TASK-022 alt-config test indicates fragile test coupling

**Evidence:** `orchestrator_patcher.test.ts:799-806` (test "TASK-022 / TemplateConfig: alt config routes к alt target file"):

```typescript
templateConfig: {
    name: 't115',
    relationPatcher: t115TemplateConfig().relationPatcher,
    orchestrator: {
        ...t115TemplateConfig().orchestrator,    // ← NEW spread-merge in TASK-023
        relativePath: ['lib', 'core', 'orchestrator', 'alt_orchestrator.dart'],
    },
    database: t115TemplateConfig().database,
},
```

Pre-TASK-023, this test specified only `{ relativePath: [...] }` because `TemplateConfig.orchestrator` had only one field. TASK-023 adds 7 fields, so the literal `{ relativePath }` is no longer a valid `TemplateConfig.orchestrator` shape — TypeScript would reject it. Spread-merge is the fix.

**Issue:** Tests that build `templateConfig` literally (rather than starting from `t115TemplateConfig()` and mutating) are fragile to future field additions. Three tests in the suite still use the literal-construction pattern with explicit field listing (line 1034-1052 alt-config; line 967-980 simplified-config — both passing because they fully specify the new shape, but breakable on next field add). Future config evolution will need same spread-merge rewrite.

**Fix:** Document this as a test-pattern convention OR refactor to test helper `makeAltTemplateConfig({ orchestrator: { relativePath: [...] }})` that internally spread-merges from `t115TemplateConfig()`.

---

### L-3. Snippet template constants exported as module-private but not literally `private`

**Evidence:** `template_config.ts:214-278` (T115_*_TEMPLATE constants) and `template_config.ts:338-419` (SIMPLIFIED_*_TEMPLATE constants).

These are module-private (no `export` keyword), only consumed by their respective factory functions in the same file. This is correct, but the JSDoc claims *"Reference points (для verification что literals unchanged): ... orchestrator_patcher.ts:410-474 (pre-TASK-023)"* — useful for archaeology but slightly misleading since the constants no longer exist there.

**Issue:** Minor documentation drift. After enough TASKs, these "see lines X-Y in file Z (pre-TASK-023)" pointers accumulate and become less verifiable.

**Fix:** Replace explicit line-number pointers with git-blame-able references like *"Pre-TASK-023 location: [orchestrator_patcher.ts at master commit a3820e4 lines 410-474]"* OR drop the line-number specificity and just cite the TASK ID.

---

## Hidden assumptions

1. **`templFeatureName` and `templateConfig.orchestrator.templateFeatureSegment` are silently coupled** — they MUST agree for substitution to work, but no enforcement exists. Test fixtures all set them in lockstep, masking the ground hazard. (See H-1 above.)

2. **`templEntity1`/`templEntity2` (TASK-014) defaults `'task'`/`'tag'`** are silently still in scope when `simplifiedTemplateConfig()` is in use — replacement_util substitution rules use them. (See H-3 above.)

3. **`junctionFkFallbacks` is dead-coverage** — no test exercises it firing. The H-2 mislabeled test never triggers the < 2 FK branch. Fallback could be `{ fk1: 'X', fk2: 'Y' }` and tests would still pass.

4. **Simplified factory junction snippet literals encode a fictional `configuration_map` template fixture** — no on-disk template will contain those literals (Configuration baseline = singleton, no junction). The substitution mechanic is tested but the fallback shape is unfalsifiable until Session 2 / Phase C creates a concrete junction reference. (See M-2.)

5. **`templateConfig.name: 't115' | 'simplified'`** is used only in test assertions; no business logic branches on it. Adding it to the union type was prep for TASK-022 H1 finding, but no consumer actually exists. (See L-1.)

6. **t115 zero-diff invariant is verified through mocha-only path** — the journal explicitly defers e2e t168 vs t169 zero-diff smoke to Session 2. The mocha verification is sufficient *only if* the existing 173 tests cover every substitution branch — they do for default flow, but not for `--templ-feature foo` non-default paths (which now silently degrade per H-1).

---

## Process / sequencing landmines (including partial-session split)

### P-1. Partial-session split decision is honest but creates ambiguous gate

**What happened:** Executor unilaterally split TASK-023 into Session 1 (BUG-019 codegen-TS subset) + Session 2 (template directory bootstrap + smoke + closure). Per `task.md` guidance line 199: *"if work exceeds session budget — return teamlead с partial state + clear continuation point"*. The split adheres to that guidance — executor flagged + paused.

**Issue:** Multi-agent review (this Adversarial run) was spawned for Session 1 only. But Session 1 alone is not deliverable as TASK-B2 — it's a chunk, not the full TASK closure. Reviewers' "Approve" for Session 1 cannot mean "approve TASK-B2" — only "approve the BUG-019 codegen-TS slice". This creates a process question: when is Session 2's review run? Is Session 1 review re-litigated when Session 2 lands template content? Or does Session 2 get its own 4-reviewer round?

**Recommendation:**
- Treat Session 1 review as a "pre-TASK-B2 closure" gate — approve only the codegen-TS subset, defer broader BUG-019 closure / TASK-B2 acceptance to Session 2's review round.
- Session 2 must spawn another full 4-reviewer round (3 thematic + 1 Adversarial) covering: template content correctness, package version updates, smoke evidence, closure-report Phase B section update, BUG-019 closure assertion.
- Or merge Session 1 to a sub-branch (e.g., `feature/TASK-023-b2-session-1`) and require Session 2 to be cumulative on that, with a single final review of the cumulative branch before TASK-B2 closure. This avoids reviewer fatigue from re-litigating Session 1 changes during Session 2 review.

### P-2. `simplified-sandbox-test/` directory leak (see M-3)

Sandbox `rm` block was known going in (CLAUDE.md HARD RULE). Executor's choice to probe writability via a throwaway-named directory (`simplified-sandbox-test`) instead of the actual target (`simplified`) directly creates cleanup debt. Not a violation, but optimisable.

### P-3. `report.md` stub-stage was the most surprising omission

Executor wrote a 100+-line journal entry (lines 318-443 of `task.md`) detailing the partial-split rationale, files modified, mocha numbers, etc. — most of which **belongs** in `report.md` per task.md acceptance. The journal is good context, but it's not the checkable artifact reviewers cite. (See H-5.)

### P-4. BUG-019 status update deferred — `ai/bug-reports/019-...md` still says "Open (TASK-B2 scope)"

Per `task.md:121`: *"BUG-019 status updated к Closed in `ai/bug-reports/019-orchestrator-snippet-hardcoded-literals.md` + status.md backlog table"*. Currently still Open. Executor's journal line 436-437 honestly notes the defer pending simplified positive smoke. Reasonable defer if a single-status flip is allowed at end of TASK-B2 — but Session 2 must remember to execute the flip; risk: TASK-B2 closes with BUG-019 still labeled "Open".

**Recommendation:** Add to Session 2 acceptance checklist explicitly.

### P-5. Branch name `feature/TASK-023-b2-simplified-template-content` describes Session 2 scope, not Session 1 deliverable

PR for Session 1 alone would be misleading — branch name promises template content that hasn't landed. Either (a) merge Session 1 as a stacked PR titled "feat: BUG-019 codegen-TS abstraction (TASK-023 Session 1)" with explicit "Session 2 outstanding" footer, or (b) keep both sessions on the same branch and PR only after Session 2 closes (cleaner, longer-lived branch).

---

## Fact-check results

| Claim | Actual | Verdict |
|---|---|---|
| `178 passing (42ms, post-fix from 173 baseline)` | `178 passing (43-47ms)` over 3 runs (43, 47, 42 ms) — stable | ✓ ACCURATE |
| `0 lint errors / 18 pre-existing warnings` | `npm run lint` → `✖ 18 problems (0 errors, 18 warnings)` — same on master HEAD baseline | ✓ ACCURATE |
| `-66 LOC orchestrator_patcher.ts` | `git diff --numstat`: `74 insertions, 108 deletions = net -34 LOC` | ✗ INACCURATE (off by ~half; see H-4) |
| `+5 new tests covering BUG-019 fix` | `git diff -- src/test/generators/orchestrator_patcher.test.ts | grep -cE "^\+\s*test\("` → `5` | ✓ ACCURATE |
| `7 new fields in TemplateConfig.orchestrator all consumed` | Actually **8 distinct properties** added (entityImportsTemplate / entityRegisterTemplate / junctionImportsTemplate / junctionRegisterTemplate / regularEntityFallback / junctionEntityFallback / junctionFkFallbacks / templateFeatureSegment); all 8 consumed in `orchestrator_patcher.ts` (lines 82, 229-230, 238-239, 278-279, 290-291, 300, 321) | ✗ ACCURATE FOR CONSUMPTION but field-count off-by-one (executor said 7, actual 8) — minor |
| `simplifiedTemplateConfig() factory created` | `template_config.ts:451-489` ✓ exists with all required fields | ✓ ACCURATE |
| `t115 zero-diff preserved (mocha existing tests passing)` | 173 pre-existing tests pass; substitution byte-equivalence verified through `single entity add: ... full import path correct (BUG-009 fix)` test which checks specific Expense imports + the `existing patching behavior unchanged под explicit t115 config (regression)` test which proves explicitConfig === defaultConfig output. **Caveat:** These tests cover only default-flow callers; non-default `--templ-feature` callers are silently broken — see H-1 | ⚠ PARTIAL — accurate for default flow only |
| `Spread-merge fix для existing TASK-022 alt-config test (forward compat)` | `orchestrator_patcher.test.ts:802` adds `...t115TemplateConfig().orchestrator,` spread before `relativePath` override — verified | ✓ ACCURATE |
| `Compile: clean` | `npm run compile` → no output (success) | ✓ ACCURATE |

---

## Strengths

1. **Honest scope-realism + pause flag** — executor flagged session-budget exhaustion BEFORE attempting bootstrap, per `task.md:199` guidance. Prevents half-broken Session 1 + Session 2 having to debug + finish.
2. **Bit-identical t115 snippet relocation** — the four `T115_*_TEMPLATE` constants in `template_config.ts:214-278` byte-match pre-TASK-023 `_ENTITY_*_TEMPLATE`/`_JUNCTION_*_TEMPLATE` in `orchestrator_patcher.ts` master. Verified through git show + visual diff. Zero-diff invariant for default flow holds.
3. **TypeScript-only atomic deliverable** — Session 1 changes are confined to codegen-TS (3 files, no template directory touched). Fully reversible via `git revert` if discovered defective.
4. **Spread-merge fix for TASK-022 alt-config test** is the right pattern — backwards-compat for tests that build `TemplateConfig` literally; without the fix, all such tests would fail TypeScript compilation.
5. **Forward-looking sentinel test** (line 1020-1090, "alt config с custom snippets produces alt content") proves the abstraction is real — `CUSTOM_ALT_*_SENTINEL` would only appear in output if patcher actually reads from config, not from constants.
6. **Sound substitution-flow semantics** — `_substitutePlaceholders` ordering (feature path → snake → Pascal → camel) is correctly preserved; new fields don't disturb the order. Junction FK substitution via `_substituteJunctionFKs` runs before standard entity substitution as documented (no token conflict).

---

## Verdict

**Approve with fixes.**

Session 1 is a legitimately atomic codegen-TS subset of TASK-B2 — BUG-019 hardcoded constants are now config-driven, t115 default flow byte-equivalent, 178 passing tests, lint/compile clean. The partial-split decision is defensible per `task.md:199` and was correctly flagged.

However, four findings need closure before TASK-B2 itself can close:

- **H-1** (silent `--templ-feature` behaviour change) requires either a regression test or an explicit guard — non-defaults are now silently broken.
- **H-2** (mislabeled FK-fallback test) requires a test that actually exercises the `< 2 FK` branch — `junctionFkFallbacks` is currently uncovered.
- **H-3** (simplified `templEntity1`/`templEntity2` coupling) requires Session 2 acceptance to explicitly include `replacement_util`/`_getDestinationPath` literal abstraction OR an explicit BUG-XXX backlog item.
- **H-5** (`report.md` stub) is mandatory — every reviewer (this run included) had to manually re-derive every claim. Even Session 1 deserves a written report.

H-4 (off-by-half LOC claim) and the M/L findings are polish items; not blocking.

Session 2 must spawn its own 4-reviewer round when template directory + smoke + closure-report sub-section land. Session 1 review approval should NOT be treated as approval of TASK-B2 closure.

---

## Catch count: **15 findings** (0 DEAL-BREAKER / 5 HIGH / 3 MEDIUM / 3 LOW / 4 process landmines)

Adversarial mandate (≥1 critical/high) **satisfied** — H-1 (silent behaviour change), H-2 (dead-coverage mislabeled test), and H-3 (simplified replacement coupling) are findings the 3 thematic reviewers may not have caught (each is cross-axis: H-1 spans config + CLI + substitution, H-2 spans test design + branch coverage, H-3 spans Session 1 + Session 2 + replacement_util).
