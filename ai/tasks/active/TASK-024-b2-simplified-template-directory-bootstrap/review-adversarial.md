# Adversarial Review (Overlay) — TASK-024

**Reviewer:** Adversarial (Subagent fresh-eyes)
**Date:** 2026-05-04
**Branch:** `feature/TASK-024-b2-simplified-template-directory-bootstrap` (5 commits, 13 sub-sessions A-E3d2)
**Recommendation:** **Approve with fixes** — substantive deliverable, smokes pass, but several gaps in test coverage, documented acceptance steps not executed, and architectural drift in the multi-template story that should be acknowledged before merge.

---

## DEAL-BREAKERS

### 1. **Acceptance criterion "t115 zero-diff smoke" not actually performed**

**Evidence:**
- `task.md:97-100,125,245` explicitly required: `git checkout master` → `create-project --name t168` → `git checkout feature/...` → `create-project --name t169` → `diff -r` identical in `<name>_flutter/lib/`.
- `task.md:777` Session D plan confirmed step "4. **t115 zero-diff smoke**: t168 master vs t169 feature; identical".
- Filesystem state: `ls G:/Projects/Flutter/serverpod/` shows `t168/` exists but **no `t169/`** — only `t170simplified/.../t173simplified/`, `t174`, `t175`, `t176`, `t177`.
- `report.md` "Тесты" section cites only t176 (simplified) + t177 (legacy verify PASS) — no zero-diff diff -r evidence.
- `grep "diff -r\|t168.*t169\|zero-diff.*PASS" task.md report.md` — zero hits in actual evidence (only in plan/acceptance text).

**Issue:** Acceptance criterion #6 ("**t115 zero-regression** … zero-diff smoke evidence") is **claimed met** via the t177 legacy `verify PASS` but `verify PASS errors=0` is **not the same** as a structural `diff -r` comparison between master-generated and feature-generated t115 projects. The t177 smoke proves *output compiles*, not that *output is byte-identical to master* — which is what the "zero-diff invariant" requires (per `task.md:23,113,258` STOP-gate language).

The defensive guard in `generation_service.ts` at line 289 (`if (config.targetEntity && config.targetEntity.length > 0)`) **changes file path resolution semantics** when targetEntity is empty. For the legacy t115 path, `targetEntity` is also `''` during startProject flow (since startProject manifests are global/featureless), so the guard branch is reachable in both flows. Whether t115 generation produces *byte-identical* output to master is unproven by current evidence.

**Fix:** Either (a) actually perform `t168` (master) vs new `t169` (feature) `diff -r`, OR (b) explicitly downgrade acceptance criterion in report.md to "indirect regression evidence (t177 verify PASS)" with rationale why direct diff is unnecessary. Currently the acceptance is silently undelivered.

---

## HIGH

### 2. **Defensive guard in `generation_service.ts:289` has zero unit-test coverage**

**Evidence:**
- `git diff master..HEAD -- src/features/generation/generators/generation_service.ts` shows added 6-line guard wrapping the existing `replaceAll`.
- `grep "empty.*targetEntity|targetEntity.*length.*0" src/test/generators/generation_service.test.ts` → 0 matches.
- Test file has same 4 tests as master (no new tests added for the guard).
- `generation_service.test.ts:42-50` (`regularConfig`) only takes string targetEntity (always non-empty in tests).

**Issue:** The fix that closed BUG-019 end-to-end is validated *only* through smoke testing on t176. There is no unit test that asserts:
- When `targetEntity = ''` and template path contains `configuration_dao.dart`, the destination preserves `configuration_dao.dart` (not `_dao.dart`).
- The previously-broken case (`replaceAll('configuration', '')` → `_dao.dart`) is now blocked.

This means a future refactor in `_getDestinationPath` could silently re-introduce the bug; only manual smoke would catch it.

**Fix:** Add minimum 2 unit tests:
- `_getDestinationPath('features/configuration/data/datasources/local/configuration_dao.dart', regularConfig(''))` → returns same path (file name preserved).
- `_getDestinationPath('foo_bar_table.dart', regularConfig('expense'))` → still produces `expense_bar_table.dart` (existing behavior unchanged).

### 3. **`template_profile.ts` (NEW 80-line file) has zero test coverage**

**Evidence:**
- `find src/test -name "template_profile*"` → 0 hits.
- `find src/test -name "create_project*"` → 0 hits.
- `find src/test -name "generate_entity*"` → 0 hits.

**Issue:** `template_profile.ts` is the new central mechanism for `--template <name>` resolution and is invoked from both `create_project.ts` and `generate_entity.ts`. It encapsulates:
- `DEFAULT_TEMPLATE = 'simplified'` (a substantive behavior change)
- `resolveTemplateProfile()` resolver with throw-on-unknown-name
- Profile-specific defaults (`templFeatureName: 'tasks'` vs former `'configuration'` — the fix that resolved E3d 312-error duplication)

None of this logic is covered by mocha. Any future regression in profile lookup or default resolution would only be caught by smoke tests.

**Fix:** Add at minimum 4 tests:
- `resolveTemplateProfile()` (no arg) → returns simplified profile.
- `resolveTemplateProfile('t115')` → returns t115 profile.
- `resolveTemplateProfile('simplified').templFeatureName === 'tasks'` (regression guard for E3d 312-error case).
- `resolveTemplateProfile('foo')` → throws Error mentioning valid templates.

### 4. **`DEFAULT_TEMPLATE` exported but unused outside template_profile.ts**

**Evidence:**
- `grep -rn "DEFAULT_TEMPLATE" src/` → 2 hits, both inside `template_profile.ts` (declaration line 30 + internal usage line 74).
- `create_project.ts:58` and `generate_entity.ts:49` both hardcode the literal `'simplified'` as commander default value, bypassing the constant.

**Issue:** `export const DEFAULT_TEMPLATE` is dead exported API. If User wants to flip default to `t115` for some reason, they would change the constant **but two CLI registrations would still default to `'simplified'`** (single source of truth violation). Either drop the export or re-route the CLI defaults through it.

**Fix:** Either (a) remove `export` and make it internal, or (b) reference it from CLI registrations: `.option('--template <name>', '...', DEFAULT_TEMPLATE)`. Option (b) is preferred per single-source-of-truth principle.

### 5. **Unused `TemplateName` import in `create_project.ts`**

**Evidence:**
- `create_project.ts:18`: `import { resolveTemplateProfile, type TemplateName } from '../utils/template_profile';`
- `grep "TemplateName" create_project.ts` → 1 hit (the import itself), 0 references in the file body.

**Issue:** Dead import. ESLint did not flag it because lint passes (`tsc --noUnusedLocals` is not enforced). Cosmetic but indicates the executor was iterating quickly without cleanup.

**Fix:** Remove the unused `type TemplateName` from the import.

### 6. **Massive code duplication between `t115TemplateConfig()` and `simplifiedTemplateConfig()`**

**Evidence:**
- `template_config.ts:214-220` (`T115_ENTITY_IMPORTS_TEMPLATE`) vs `:338-344` (`SIMPLIFIED_ENTITY_IMPORTS_TEMPLATE`) — diff returns identical 7-line content.
- Same pattern for `*_JUNCTION_IMPORTS_TEMPLATE`, `*_ENTITY_REGISTER_TEMPLATE`, `*_JUNCTION_REGISTER_TEMPLATE` — 4 pairs of byte-identical string constants.
- `diff <(awk '/function t115TemplateConfig/,/^}/' template_config.ts | grep -v "name:") <(awk '/function simplifiedTemplateConfig/,/^}/' template_config.ts | grep -v "name:")` shows the two factories differ ONLY in the constant names they reference (which contain identical content).

**Issue:** Post-Session-E3d2 the two factories produce **functionally identical configs** except for the `name: 't115' | 'simplified'` field. This was tagged as a "documented question" in the prompt context but is now a real pattern in committed code — `simplifiedTemplateConfig()` is essentially `t115TemplateConfig()` with a relabel.

This is a real architectural drift from ADR-0005 §1's "multi-template plurality" claim:
- The codegen TS layer emits identical snippets for both templates (substitution literals, FK fallbacks, snippet content all unified).
- The actual differences live ONLY in `G:/Templates/flutter/<id>/` directory content (no usecases/etc. in simplified).
- Codegen layer = pure routing on `--template` flag → directory id.

This is closer to **single-template-with-two-output-directories** than multi-template plurality. The duplication suggests the abstraction is wrong: should there be a single `defaultTemplateConfig()` factory + a thin `name` override? Or should the simplified factory genuinely diverge (e.g., simpler register block without sync_core orchestrator import section if/when ADR-0005 evolves to allow simpler shapes)?

**Fix:** Either (a) collapse to single factory with `name` parameter (since that's the only differentiator), explicitly acknowledging "post-Session-E3d2 unification — semantic differences live only in template directory content, not in codegen literals", or (b) document explicit roadmap for when the simplified factory is expected to diverge (e.g., Phase E weight TASK-018 may add no-orchestrator variant). Currently the duplication is unjustified noise that future maintainers will struggle to interpret.

### 7. **t115 template uncommitted state creates merge race condition**

**Evidence:**
- `cd G:/Templates/flutter/t115 && git status` shows 5 modified files (all 4 pubspec.yamls + 1 pubspec.lock) — Serverpod 3.1.1 → 3.4.8 bumps.
- `t177_flutter/pubspec.yaml` (the smoke project) → `serverpod_flutter: 3.4.8` (matches uncommitted state).
- Same uncommitted bumps were referenced as "separate User decision" in task.md but are *load-bearing* for the t177 verify PASS evidence.

**Issue:** TASK-024 PR (codegen-side) acceptance criterion #6 (t115 regression preserved) depends on t115 template state that does not exist in any committed branch. When this PR merges:
- A fresh developer running `create-project --template t115` gets 3.1.1 versions from committed t115/.
- Verify PASS evidence cited in `report.md` (t177) was on a non-reproducible state.
- If User decides NOT to commit t115 bumps (deprecated path per ADR-0005 §1), then t177 evidence is invalid for the as-merged state.

This is a cross-repo coupling that makes PR acceptance non-self-contained.

**Fix:** Either (a) commit t115 bumps to a separate PR before merging this one, OR (b) re-run t177 smoke against committed t115 baseline (3.1.1) to confirm legacy regression is preserved at the actually-shipping state. Option (a) is preferred because t115 is the legacy/deprecated path and skew is dangerous.

---

## MEDIUM

### 8. **Empty-targetEntity guard might miss other replaceAll sites**

**Evidence:**
- `grep "replaceAll(config.templEntity" src/` returns 3 hits:
  - `generation_service.ts:291` (guarded by E3d2 fix)
  - `relation_patcher.ts:55,184` (NOT guarded — same template→target replacement pattern)

**Issue:** `relation_patcher.ts:184` does the same `replaceAll(config.templEntity, targetEntitySnake)` without an empty-targetEntity guard. Currently `relation_patcher` only runs for entities with FK relations (`generate-entity` flow), where `targetEntity` is always set, so empty-string is unlikely. But if startProject flow ever invokes relation patching (e.g., for Configuration baseline that grows FK fields), the same bug would re-emerge.

This is band-aid territory — there's no enforced invariant that "templEntity-replacement only runs when targetEntity is non-empty". The proper fix would be at the substitution helper level, not the call sites.

**Fix:** Either (a) extract a `_safeReplaceAll(haystack, templEntity, targetEntity)` helper that handles empty-string, OR (b) document explicit invariant at relation_patcher call sites that this code path is reachable only with non-empty targetEntity.

### 9. **`.gitignore` modification uncommitted; `.claude/settings.local.json` not in any commit**

**Evidence:**
- `cd G:/Projects/vs_code_extensions/code-generator && git status` shows `modified: .gitignore` (uncommitted).
- `.claude/settings.local.json` exists locally and is the file that the gitignore add targets.
- Neither in any of the 5 PR commits.

**Issue:** Per task.md context, `.claude/settings.local.json` is the rm/delete permission grants used during the work. Adding it to `.gitignore` means new developers checking out this branch won't have:
- The file (gitignored)
- The permission grants (file content)
- A documented bootstrap step to recreate them

Onboarding gap. Future agent sessions on a fresh checkout would re-encounter the sandbox blocks (which is exactly what t174 deletion failure documented).

**Fix:** Either (a) commit the gitignore change + provide a documented `.claude/settings.local.example.json` template that developers copy/customize, OR (b) revert the gitignore change since it's not part of this PR's scope (it's noise that survives the PR boundary).

### 10. **Smoke project artifacts (t170-177) cluttering test directory; t174/t175 documented as failures but not cleaned**

**Evidence:**
- `ls G:/Projects/Flutter/serverpod/ | grep "^t17"` → 8 directories: `t170simplified .. t177`.
- t174 (60 errors baseline) and t175 (0 errors prefix-failure smoke) flagged as "failure baseline references" in task.md — but they are large flutter projects (each ~hundreds of MB).

**Issue:** These artifacts are not in any documented cleanup procedure. Sandbox `rm` block is documented but doesn't justify keeping ALL failure smokes forever. If these are genuinely useful baselines, they should be in a documented archive directory; if not, User should delete them via PowerShell directly. Current state is "developer leftovers" mistaken for evidence.

**Fix:** Document explicit retention policy: keep `t176` + `t177` as PR evidence; flag `t170simplified-t175` for User-side cleanup post-merge. (This is documentation, not blocking.)

### 11. **Mapper class violation documented but not flagged in strip checklist**

**Evidence:**
- `grep "class.*Mapper {" simplified_flutter/lib/features` → 1 hit: `presentation/providers/settings_mapper.dart:16: class SettingsMapper {`.
- task.md Session E3c documents this as "presentation-layer SettingsMapper retained per Configuration baseline preservation" with rationale.
- ADR-0005 §3.5 #3 strip target is "separate Mapper class files (extension methods OK)".
- Strip checklist evidence in report.md only cites usecases/repos/interfaces/usecase files/validators (lines 56-58) — Mapper not mentioned.

**Issue:** The Mapper exception is documented in the journal but **not in the report or acceptance evidence**. A reviewer reading only the report would assume strip checklist is fully clean. The 1 Mapper class is a documented, defensible exception, but it should be transparently surfaced in acceptance evidence.

**Fix:** Add to `report.md` Тесты section: "Strip checklist: 1 documented exception (presentation-layer `SettingsMapper`, retained per Configuration baseline preservation Session E3c rationale; ADR-0005 §3.5 #3 strip target presumes domain mappers, not presentation/UI ViewModel mappers)."

---

## LOW

### 12. **Pubspec analyzer-7 lockstep documented but not flagged as constraint for downstream Phase E**

**Evidence:**
- `simplified_flutter/pubspec.yaml:75-99` documents `build_runner ^2.4.15` / `json_serializable 6.11.2` / `freezed ^3.0.6` / `custom_lint 0.8.0` pins with rationale "analyzer ^7 lockstep с custom_lint 0.8.0".
- task.md Session E3d documents that custom_lint stuck at 0.8.1 with analyzer ^8 cap blocks entire chain.

**Issue:** Future Phase E weight TASK-018 (or any project that wants to use analyzer 8+ ecosystem) inherits this lockstep. This is documented in pubspec comments but not in ADR-0005 nor in any "Known constraints" section that downstream tasks would naturally read.

**Fix:** Add a one-paragraph "Pubspec analyzer-7 lockstep" note to ADR-0005 §7 "Stack lock invariants" subsection, citing custom_lint 0.8.x as upper bound. This makes the constraint discoverable for future template upgrade decisions.

### 13. **5 commits combine 8+ logical changes; commit boundaries hide the E3d2 fix dependency on E3d**

**Evidence:**
- `git log master..HEAD --oneline`:
  - b32c9ae fix(bootstrapper): динамическая depth-delta
  - 504ef8a feat(template-config + cli): switch default factory + --template t115 legacy flag
  - 54b195a fix(generation-service): defensive empty-targetEntity guard
  - c0cd75a docs(bug-reports): BUG-019 closed
  - 31a0c93 docs(task-024): final report + closure-report
- Commit 504ef8a (`template-config + cli`) bundles: (1) `template_profile.ts` NEW, (2) `create_project.ts` flag wire-up, (3) `generate_entity.ts` flag wire-up, (4) `template_config.ts` simplified factory unification, (5) `orchestrator_patcher.test.ts` test updates.

**Issue:** Bisecting future regressions in `--template` flag handling vs simplified factory unification will be harder with these collapsed. Granted, executor budget exhaustion across 13 sub-sessions justified pragmatic commit batching.

**Fix:** Acceptable as-is. (Documenting for posterity; not blocking.)

---

## Hidden assumptions

### A. Configuration baseline duplication root cause not documented as "fixed for default template only"

The E3d→E3d2 fix path (`templFeatureName: 'configuration'` → `'tasks'`) closed the 312-error duplication for the **simplified profile**, but the duplication mechanism is **agnostic to template name** — any future template profile that sets `templFeatureName` to a name that matches a startProject-manifested feature directory in its template tree will reproduce the bug.

There is no defensive check in `generation_service` or anywhere else that detects "templFeatureName matches an existing startProject-manifest directory" and warns. Future Phase D (multi-template flag wiring) or Phase E weight migration might re-introduce this if not careful.

### B. Defensive empty-targetEntity guard masks deeper question

Why was `targetEntity` empty during startProject flow at all? The guard handles the symptom but the root question — "should startProject flow ever call `_getDestinationPath` with empty targetEntity, or is that a coverage gap of the substitution model?" — is not answered. The task.md Session E3d notes "templEntity = 'configuration' и targetEntity = '' для startProject flow" but doesn't ask why startProject flow uses GenerationService at all if it's "no entity scope". An alternative architecture would be: startProject flow uses a different generator that doesn't perform entity-name substitution.

This is conceptual debt, not blocking. Future refactor opportunity.

### C. "Multi-template plurality" claim weakened by codegen-layer unification

ADR-0005 §1 claims "multi-template architecture" with t115 + simplified as separate templates. Post-Session-E3d2, the codegen TS layer (`template_config.ts` factories + `template_profile.ts` profiles) treats them as effectively identical except for `name: 't115' | 'simplified'` and `templProject` directory id.

The actual ceremony reduction (no usecases / no abstract interfaces) lives **only in the template DIRECTORY content** (`G:/Templates/flutter/simplified/`). This is closer to "single template runtime + two output directories" than "two distinct template strategies".

If/when the simplified template wants to legitimately diverge (e.g., emit different sync_orchestrator wire-up shape, or omit Riverpod data providers when using a different DI framework), the current factory split provides a hook. Until then, the duplication is speculative future-proofing.

---

## Process / sequencing landmines

### P1. Configuration baseline duplication BUG E3d should have been caught earlier

The 312-error smoke failure at Session E3d revealed a bug that a careful pre-Sessions-A review of `template_profile.ts` (line 52: `templFeatureName: 'configuration'`) would have flagged: simplified template has BOTH a `features/configuration/` directory AND a `templFeatureName: 'configuration'` substitution key. The collision was structural and grep-discoverable.

This suggests the multi-agent review pattern would have benefitted from an interim review at Session A/B/C boundary, not just at the final boundary (now). Lesson learned: for >5 sub-session tasks, schedule interim reviews on architectural decisions before they become hard to unwind.

### P2. Session E3a wasted: "fixture entities copy" vs Session E3b "regenerate via codegen generate-entity"

Session E3a copied fixture entities directly; Session E3b regenerated through codegen. Session E3b superseded E3a. Net waste = 1 sub-session. This is acknowledged in task.md but not as a process improvement opportunity.

Lesson: when "copy-as-baseline" vs "regenerate-via-pipeline" decision is unclear at the start, prototype both paths in a smaller scope before committing to one.

### P3. Codegen TS modifications crossed scope boundary multiple times

Original task.md scope was "template directory bootstrap" with "Codegen extensions (если требуется для validation)" as a discretionary annex. By Session E3d, codegen TS was the primary deliverable (template_profile.ts NEW, create_project.ts/generate_entity.ts modifications, defensive guard, simplified factory unification). The scope expansion was driven by smoke failures, not premeditated.

This is not strictly a violation — STOP-gates allow scope expansion under teamlead approval — but it does mean the TASK-024 PR is doing both template content AND codegen changes that, in isolation, could have been split into separate TASKs.

Lesson: when smoke testing reveals codegen TS bugs, split into "TASK-024-template + TASK-025-codegen-fixes" and merge sequentially. Currently the PR conflates two concerns.

### P4. 13 sub-sessions without mid-session multi-agent review

The first multi-agent review (this one) is at the very end. Bugs E3d (312-error) were caught by the executor's own smoke test, not by reviewer feedback. If reviewers had been spawned at Session E (boundary between content authoring and codegen integration), the architectural smell of `templFeatureName: 'configuration'` could have been flagged at that gate.

Lesson: for tasks with both content-authoring and codegen TS changes, schedule a review at the gate between them (cheaper to catch 312-error before the test on disk).

---

## Fact-check results

| Claim | Actual | Pass |
|---|---|---|
| 181 mocha passing (no net delta vs prior 181 baseline) | 181 passing × 2 stable runs (~45ms) | ✅ |
| `npm run lint` 0 errors | 0 errors, 18 warnings (matches report) | ✅ |
| `npm run compile` clean | tsc no output | ✅ |
| t176 directory exists (default flow smoke) | exists, structure matches simplified shape | ✅ |
| t176: 0 usecases dirs | 0 (verified) | ✅ |
| t176: 0 abstract repository interfaces | 0 (verified) | ✅ |
| t177 directory exists (legacy flow smoke) | exists, structure matches t115 shape | ✅ |
| t177: 4 usecases dirs (t115 ceremony preserved) | 4 (verified) | ✅ |
| t177: 1 abstract repository interface | 1 (verified — `i_authentication_repository.dart`) | ✅ |
| Strip checklist all-zero in simplified template | 0 usecases / 0 abstract repos / 0 interfaces dirs / 0 use_case files / 0 validators-filters; **1 Mapper class** (documented exception, not in report) | ⚠ Partial |
| Stack lock preserved (Riverpod / Drift / sync_core / Serverpod) | 65 @riverpod, 2 @DriftDatabase, 13 marker types, 0 t115 residue | ✅ |
| BUG-019 closed end-to-end | Status: Closed (verified in bug-reports/019-...) + smoke evidence | ✅ |
| 5 commits on feature branch | 5 commits verified | ✅ |
| Configuration baseline in `features/configuration/` | exists, 70 .dart files | ✅ |
| 4 fixture entities in `features/tasks/` | exists (Category/Tag/Task/TaskTagMap, 107 .dart files) | ✅ |
| Pubspec safe bumps (analyzer-7 lockstep) | 8 packages bumped, comments preserve pin rationale | ✅ |
| Generator default switched к simplified | `DEFAULT_TEMPLATE = 'simplified'` + commander default `'simplified'` (both places) | ✅ |
| **t115 zero-diff smoke evidence** | **NO direct diff -r evidence; t169 doesn't exist** | ❌ |
| 0 t115 docstring residue in simplified template | 0 (verified — `grep -ri "t115\|T115"` empty for `lib/` *.dart) | ✅ |
| simplified template `.dart` file count delta vs t115 | configuration: 77 → 70 (−7), tasks: 131 → 107 (−24); modest reduction | ✅ |

---

## Strengths

1. **Smokes are real and reproducible.** t176 (simplified default) and t177 (legacy `--template t115`) both verify PASS errors=0 — direct evidence of working state.
2. **Stack lock invariants intact.** 13 marker types, @riverpod/@DriftDatabase counts within expected range, 0 t115 residue in simplified — careful authoring discipline through 13 sub-sessions.
3. **BUG-019 closure is end-to-end validated.** Both smoke flows pass + bug-reports doc updated + status.md/roadmap.md updates applied. Documentation hygiene is high.
4. **Defensive empty-targetEntity guard correctly written.** Logic at `generation_service.ts:289` is correct (uses `relativePath` as source when guard skipped, preserving existing behavior for non-Configuration files). The fix itself is sound; only test coverage is missing.
5. **Honest documentation of constraints.** Pubspec analyzer-7 lockstep, ecosystem incompatibilities, sandbox blocks — all documented transparently in journal rather than masked.
6. **5 commits with conventional commit messages in Russian.** Per project conventions, commit messages are appropriate and granular enough for bisection where it matters most (bootstrapper / generation-service / template-config-cli are distinct commits).

---

## Verdict

TASK-024 delivers substantive value: simplified template directory bootstrapped, default switched, BUG-019 closed end-to-end via smoke, stack lock preserved. The 13 sub-session journal documents real architectural learning (E3d 312-error → E3d2 unification → both flows green).

The major gaps are around **test coverage** of the new TS code (template_profile.ts has 0 tests, defensive guard has 0 tests, CLI flag handling has 0 tests) and **acceptance documentation** (the t115 zero-diff smoke from acceptance criterion #6 was never performed; the indirect t177 verify PASS was substituted without explicit downgrading of the criterion). 

Beyond that, the multi-template plurality story has weakened to "single-template + two output directories" — the simplifiedTemplateConfig() and t115TemplateConfig() factories are essentially identical post-Session-E3d2. This is not a deal-breaker but should be acknowledged in ADR-0005 (current text claims more architectural distinction than exists).

The t115 template uncommitted state is a real cross-repo coupling that affects acceptance reproducibility and should be resolved (commit t115 bumps OR re-test against committed baseline) before merging.

Recommended path to merge:
1. **Required:** add unit tests for empty-targetEntity guard (DEAL-BREAKER #2) and template_profile resolution (HIGH #3) — small effort, large coverage payoff.
2. **Required:** either perform t168/t169 zero-diff smoke OR update acceptance criterion in report.md to document the substitution (DEAL-BREAKER #1).
3. **Required:** resolve t115 uncommitted state (HIGH #7) — commit bumps in separate PR or re-run t177 against committed baseline.
4. **Recommended:** remove unused `TemplateName` import (HIGH #5), wire `DEFAULT_TEMPLATE` constant into commander defaults (HIGH #4), document Mapper exception in report.md (MEDIUM #11).
5. **Optional:** decide on multi-template factory duplication direction (HIGH #6) — collapse or document divergence roadmap. May be deferred to follow-up TASK.

After items 1-3 above, this PR is mergeable.

---

## Catch count: 13 findings (1 DEAL-BREAKER / 6 HIGH / 4 MEDIUM / 2 LOW)
