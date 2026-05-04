# Generator-Core Review — TASK-024 b2 simplified template directory bootstrap

**Reviewer role:** Generator-Core
**Branch:** `feature/TASK-024-b2-simplified-template-directory-bootstrap`
**Commits reviewed:** 5 (b32c9ae bootstrapper, 504ef8a template-config+cli, 54b195a generation-service guard, c0cd75a BUG-019 docs, 31a0c93 final docs)
**Diff stat:** 14 files / +3287 / -195 (3 docs files, 8 src files, 2 test files)
**Independent mocha re-run:** **181 passing (47ms)** — executor's claim verified.
**Date:** 2026-05-04

---

## Verdict

**APPROVE WITH MINOR CLEANUP.**

The refactor delivers what it advertises: dynamic depth-delta correctness, defensive empty-targetEntity guard, clean separation of t115/simplified profiles via `template_profile.ts`, and proper E3d2 unification of substitution literals. Smokes are reproducible (t176 simplified clean, t177 t115 regression preserved); mocha count verified at 181. Hidden-literal sweep is clean — no leftover hardcoded `'configuration'` / `'simplified'` strings in `src/features/generation` outside the union types and templateConfig factories. Dead import + 1 stale comment + 1 inconsistent default in VS Code adapter are cleanup items, not blockers.

**Catch count:** 0 CRITICAL / 1 HIGH / 4 MEDIUM / 2 LOW

---

## CRITICAL findings

(none)

---

## HIGH findings

### H-1: VS Code adapter still hardcodes `templProject: 't115'` — default-template inconsistency between adapters

**Location:**
- `G:/Projects/vs_code_extensions/code-generator/src/adapters/vscode/commands/create_new_project.ts:40`
- `G:/Projects/vs_code_extensions/code-generator/src/adapters/vscode/commands/create_data_files_by_replacement.ts:43`

Both VS Code commands instantiate `GenerationConfig({ templProject: 't115', ... })` with no template-profile resolution. The TASK-024 default switch (`DEFAULT_TEMPLATE = 'simplified'` + `--template <name>` CLI flag + `resolveTemplateProfile()`) only routes through `src/adapters/cli/commands/{create_project,generate_entity}.ts`. If a user invokes the VS Code command palette `Create New Project`, they receive **t115 output by default** — the opposite of the CLI default.

This contradicts BUG-019 closure note's claim that "default flow simplified" is the project-wide default. It is also a maintainability hazard: when t115 path is eventually deleted, these two VS Code call-sites will silently break with no compile-time error (just a runtime "template directory not found" if t115/ is ever removed).

**Recommended fix (one-liner per call-site):** import `resolveTemplateProfile` from `cli/utils/template_profile.ts` (or relocate the resolver to `src/core/services/`) and replace literal `'t115'` with `resolveTemplateProfile().templProject`. Also propagate `templFeatureName` / `templEntity` / `templateConfig` from the profile to keep VS Code aligned with CLI.

**Severity rationale:** HIGH because it breaks the documented promise of `simplified = default` and introduces an undocumented adapter-divergent behaviour. Not CRITICAL because (a) `t115` directory still exists, (b) VS Code adapter is internal/dev-only per current usage. But the fix is trivial and should ship before merge.

---

## MEDIUM findings

### M-1: Stale doc comment in `orchestrator_patcher.ts` — claims `'configuration'` is simplified default

**Location:** `src/features/generation/generators/orchestrator_patcher.ts:81-82`

```ts
// fallback к `config.templateConfig.orchestrator.templateFeatureSegment` (default = 'tasks'
// для t115, 'configuration' для simplified). Pre-TASK-023 был ТОЛЬКО `config.templFeatureName`;
```

Session E3d2 unified `simplifiedTemplateConfig().orchestrator.templateFeatureSegment = 'tasks'` (verified at `src/features/generation/config/template_config.ts:461`). The comment still claims `'configuration'`. Misleading for future readers and contradicts the actual factory output. **Fix:** update to "(default = 'tasks' для обоих t115 и simplified post-E3d2)".

### M-2: Dead import — `TemplateName` imported but unused in `create_project.ts`

**Location:** `src/adapters/cli/commands/create_project.ts:18`

```ts
import { resolveTemplateProfile, type TemplateName } from '../utils/template_profile';
```

`TemplateName` is never referenced in the file (verified via grep). Drop the type import. Cosmetic but indicates incomplete refactor sweep. `tsc --strict` doesn't flag this because it's a type-only import marked `type`, but ESLint `no-unused-vars` would.

### M-3: CLI default literal `'simplified'` duplicated 2× — drift risk vs `DEFAULT_TEMPLATE`

**Location:**
- `src/adapters/cli/commands/create_project.ts:58` — `.option('--template <name>', '...', 'simplified')`
- `src/adapters/cli/commands/generate_entity.ts:49` — `.option('--template <name>', '...', 'simplified')`

The CLI option default is a hardcoded string literal `'simplified'` while `DEFAULT_TEMPLATE` constant (`src/adapters/cli/utils/template_profile.ts:30`) is the canonical source of truth. If future task changes the default, three places must be updated in lockstep — the literal in the CLI factory call sites won't get caught by `tsc`. **Fix:** import `DEFAULT_TEMPLATE` and use `.option('--template <name>', '...', DEFAULT_TEMPLATE)`. Tiny cleanup but eliminates a real drift class.

### M-4: `--template` × `--templ-project` interaction is dangerous mixing — under-specified semantics

**Location:** `src/adapters/cli/commands/{create_project.ts:87, generate_entity.ts:102}`

```ts
templProject: opts.templProject || templateProfile.templProject,
templFeatureName: templateProfile.templFeatureName,
templEntity: templateProfile.templEntity,
templateConfig: templateProfile.templateConfig,
```

If user passes `--template simplified --templ-project foo`, the generator uses directory `foo/` but with `simplifiedTemplateConfig()` factory (Category fixture in `features/tasks/`, FK fallbacks `task`/`tag`). If `foo/` template directory has incompatible structure, generation silently produces broken output (uri_does_not_exist cascade in target Dart compilation). Same risk for `--template t115 --templ-project simplified`.

CLI help string says "Override template project directory id (default derived from --template)" — but doesn't warn that `templateConfig` is **not** also overridden. Two options:
1. **Document explicitly** that `--templ-project` is hazardous and only useful for advanced cases (e.g. development of new templates), OR
2. **Remove `--templ-project` flag entirely** post-TASK-024 — it's a relic from when there was only one template. If `--template <name>` is the canonical single source of truth, the secondary override creates a footgun without a real use case.

Not blocking because the existing flag was already in master, but the asymmetry is a pre-existing wart that TASK-024 should at least flag in CLI help text.

---

## LOW findings

### L-1: Test fixture path migration in `orchestrator_patcher.test.ts:1107` — uses `features/configuration` path while config is `templFeatureName: 'tasks'`

**Location:** `src/test/generators/orchestrator_patcher.test.ts:1107`

```ts
templFeatureName: 'tasks',
targetFeaturePath: `${PROJECTS_PATH}/${TARGET_PROJECT}/${TARGET_PROJECT}_flutter/lib/features/configuration`,
```

The H-2 restructured test mixes a `tasks` template feature segment with a `configuration` target feature path. The test passes (sentinel literals work as intended), but the path label is non-orthogonal to the test's purpose (FK fallback dispatch). Cosmetic; consider renaming to `features/some_target/` to remove implicit Configuration coupling.

### L-2: Empty-targetEntity guard in `_getDestinationPath` — comment over-explains, real reason is structural

**Location:** `src/features/generation/generators/generation_service.ts:283-292`

The defensive guard is correct. However the comment frames it as "Configuration baseline copies as-is" specific to E3d, when the deeper structural truth is: **for any startProject manifest flow, `targetEntity = ''`, and `replaceAll(templEntity, '')` would corrupt path segments containing the template entity literal.** Pre-E3d3, `templEntity` defaulted to `'category'` and Configuration baseline had no path segment containing `'category'` — so the bug was latent, not absent. Session E3d2 changed `templEntity` to also `'category'` for simplified, again latent. The guard is defense-in-depth that prevents *any future* startProject flow from this entire class of corruption, not just the simplified Configuration case.

Suggestion: tighten the comment to acknowledge "any startProject flow with empty targetEntity" rather than just E3d-specific Configuration case. This makes the invariant clearer for future readers.

---

## Strengths

1. **Dynamic depth-delta math correct for both flows.** Verified arithmetic:
   - **Default flow:** `templatesPath=G:/Templates`, `templProject=simplified` → `templFlutterProjectPath=G:/Templates/flutter/simplified/simplified_flutter` (5 segs). `projectsPath=G:/Projects/Flutter/serverpod`, `targetProject=t176` → `targetFlutterProjectPath=G:/Projects/Flutter/serverpod/t176/t176_flutter` (6 segs). Delta = 1, +1 `../` injection. Real-world output confirmed: `path: ../../../Packages/ble_feature` in `t176/t176_flutter/pubspec.yaml`.
   - **Simplified bootstrap (TASK-024 use-case):** `templatesPath=G:/Templates`, `templProject=t115` → 5 segs. `projectsPath=G:/Templates/flutter`, `targetProject=simplified` → 5 segs. Delta = 0 → no-op. Real-world confirmed: `path: ../../Packages/ble_feature` preserved in `Templates/flutter/simplified/simplified_flutter/pubspec.yaml`.
   - **`delta <= 0` guard** correctly handles same-depth and exotic shallow-target cases (no-op).
   - **Idempotency preserved:** `{4}` exact regex (not `{4,}`) prevents re-deepening on double-run; D8 fix lineage retained.

2. **Hidden-literal sweep clean.** Grep for `'configuration'` in `src/features/generation/`: only one hit in `orchestrator_patcher.ts` comment (M-1, doc-only). Grep for `'simplified'` in `src/`: only legitimate union types (`'t115' | 'simplified'`) and factory names. No leaked literals.

3. **Test fixture migration internally consistent.** Pre-E3d2 tests asserted simplified config used `'configuration'` literals (which contradicted the substitution-as-Configuration-duplication bug); post-E3d2 tests assert `category` + `features/tasks/` (matching the actual unified literals). H-2 FK fallback test was correctly restructured: since simplified and t115 now share the same `task`/`tag` defaults, the test was forced to use a custom config with `sentinelFk1`/`sentinelFk2` literals to actually prove config-driven dispatch (rather than coincidentally matching either default).

4. **t115 zero-regression confirmed via t177 evidence.** `t177 = create-project --name t177 --template t115` produces:
   - 2 usecases (`auth_usecases.dart`, `configuration_usecases.dart`)
   - 1 abstract `i_auth_repository.dart`
   - Configuration-only orchestrator register block
   Compared to `t176 = create-project --name t176` (simplified default):
   - 0 usecases, 0 abstract `i_*_repository.dart`
   - Same Configuration-only orchestrator
   Ceremony reduction differential is exactly what ADR-0005 §3.5 specifies. Legacy path preserved.

5. **Refactor scope correctly bounded.** 8 src files modified (3 CLI + 1 utils + 1 core service + 1 generator + 1 config + 1 generator); 2 test files; 3 docs. No spurious changes outside TASK-024 scope. Commits cleanly conventional and well-titled.

6. **Empty-targetEntity guard is defense in depth, not a workaround.** The fix prevents `replaceAll(templEntity, '')` from corrupting path segments. Earlier this class of corruption was latent (templEntity = 'category', Configuration baseline paths had no 'category' segments). E3d's first attempt set `templEntity: 'configuration'` for simplified profile and surfaced the corruption as 312 errors. E3d2 reverted to `'category'` (matches t115) AND added the guard — proper structural fix.

7. **`template_profile.ts` resolver design is clean.** Single Record<TemplateName, TemplateProfile> table, lazy `templateConfig` via getter, defensive `throw new Error` for unknown names (commander's `choices()` validates upstream but the runtime guard is correct belt+suspenders). Backward compat: `--templ-project` still respected via `||` fallback.

8. **Configuration baseline correctly copies as-is.** Verified via t176 inspection: `lib/features/configuration/` present, `lib/features/tasks/` absent (no fixture leak into target). The simplified template's `sync_orchestrator_provider.dart` was correctly cleaned from Tasks-fixture-baked-in to Configuration-only-register state in E3d2.

---

## Verification artifacts (independent re-run)

| Check | Method | Result |
|---|---|---|
| Mocha test count | `node node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"` | **181 passing** ✓ matches executor claim |
| Compile | `npm run compile` | clean ✓ |
| t176 simplified ceremony reduction | `find G:/Projects/Flutter/serverpod/t176/t176_flutter -path '*/usecases/*.dart'` | 0 ✓ |
| t176 abstract repos | `find ... -name 'i_*_repository.dart'` | 0 ✓ |
| t176 tasks fixture leak | `test -d .../t176_flutter/lib/features/tasks` | absent ✓ |
| t177 t115 regression | `find G:/Projects/Flutter/serverpod/t177/t177_flutter -path '*/usecases/*.dart'` | 2 (auth + configuration) ✓ |
| t177 abstract repos | `find ... -name 'i_*_repository.dart'` | 1 (i_auth_repository) ✓ |
| Default depth-delta target | `grep "path:" t176/t176_flutter/pubspec.yaml` | `../../../Packages/ble_feature` (depth +1) ✓ |
| Same-depth bootstrap target | `grep "path:" Templates/flutter/simplified/simplified_flutter/pubspec.yaml` | `../../Packages/ble_feature` (no-op, depth 0) ✓ |
| Hidden literals `'configuration'` in generators | `grep -n "'configuration'" src/features/generation` | 1 hit (doc comment in orchestrator_patcher.ts:82, M-1) |
| Hidden literals `'simplified'` in src | `grep -rn "'simplified'" src/` | only union types and factory names ✓ |
| `DEFAULT_TEMPLATE` references | `grep -rn "DEFAULT_TEMPLATE" src/` | 2 hits in template_profile.ts (declaration + use) — not used in CLI option defaults (M-3) |
| VS Code adapter `templProject: 't115'` | `grep -n "templProject" src/adapters/vscode/` | 2 hits, hardcoded (H-1) |

---

## Recommended pre-merge cleanup

1. **H-1** — Update VS Code adapter call-sites to use `resolveTemplateProfile()` (or document that VS Code adapter is intentionally not migrated and add TODO comment).
2. **M-1** — Fix stale `'configuration' для simplified` comment in `orchestrator_patcher.ts:82`.
3. **M-2** — Drop unused `type TemplateName` import in `create_project.ts:18`.
4. **M-3** — Replace `'simplified'` literal CLI defaults with `DEFAULT_TEMPLATE` constant (2 lines).
5. **M-4** — Decide flag-design policy: deprecate `--templ-project` or document the hazard explicitly in `--help`.

L-1 / L-2 are optional polish, not blocking.

---

## Push-back (where I disagreed with executor)

- Executor framed the empty-targetEntity guard as "Configuration baseline copies as-is." The deeper truth: **all startProject flows have empty `targetEntity`** and the prior `replaceAll(templEntity, '')` was a latent bug for any template whose paths contained the `templEntity` substring. The guard is correct structural defense, not a Configuration-specific patch. Comment should be tightened (L-2).
- Executor's claim "Mocha 181/181 passing" is **accurate** (independently verified). My initial first-run output was truncated and misled me to think the count was 179; full re-run confirms 181. No discrepancy.
- Executor's claim that `--templ-project` is "preserved для backward compat" understates the footgun risk (M-4). It's not just back-compat — it's an active mixing trap.
- Executor doesn't mention the VS Code adapter still defaults to t115 (H-1). This is the most material gap in the otherwise clean delivery.

---

## Catch count

- **CRITICAL: 0**
- **HIGH: 1** (H-1 VS Code adapter t115 hardcode)
- **MEDIUM: 4** (M-1 stale comment, M-2 dead import, M-3 duplicated CLI default literal, M-4 flag mixing footgun)
- **LOW: 2** (L-1 test path label, L-2 guard comment framing)

**Strengths: 8.**
