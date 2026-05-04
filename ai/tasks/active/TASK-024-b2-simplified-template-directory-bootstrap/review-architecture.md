# Architecture Review — TASK-024

**Reviewer:** Architecture (Subagent)
**Date:** 2026-05-04
**Branch:** feature/TASK-024-b2-simplified-template-directory-bootstrap (5 commits)
**Recommendation:** Approve with fixes

---

## Scope of review

Architectural soundness of the multi-template plurality implementation:
- `template_profile.ts` resolver design + `--template <name>` flag wire-up across `create_project.ts` / `generate_entity.ts`
- `simplifiedTemplateConfig()` factory unification with t115 literals (Session E3d2)
- Path-dep patcher Approach 2 dynamic depth-delta in `project_bootstrapper.ts`
- Defensive empty-targetEntity guard in `generation_service.ts`
- ADR-0005 §7 stack-lock invariants compliance + ADR-0005 §3.5 ceremony strip completeness
- Forward extensibility for additional templates

Methodology: read all 5 modified codegen TS files; greppped simplified template (`G:/Templates/flutter/simplified/`) for ceremony layer residue; cross-checked t115 baseline; verified `npm run compile` clean + 181 mocha passing; cited file:line for findings.

---

## Findings

### CRITICAL

None.

### HIGH

1. **`simplifiedTemplateConfig()` is now byte-equivalent to `t115TemplateConfig()` for all snippet templates and orchestrator fallbacks — the "multi-template" axis collapses to template-directory-id only.**
   - Evidence: `src/features/generation/config/template_config.ts:214-278` (`T115_*_TEMPLATE` constants) vs `:338-409` (`SIMPLIFIED_*_TEMPLATE` constants) — line-by-line identical content, only the constant names differ. Verified `T115_ENTITY_IMPORTS_TEMPLATE` (lines 214-220) vs `SIMPLIFIED_ENTITY_IMPORTS_TEMPLATE` (lines 338-344) — identical 7-line `import '../../features/tasks/data/adapters/category/...'` block. Same equivalence for junction imports (227-233 vs 374-380), entity register (240-250 vs 352-362), junction register (262-278 vs 393-409).
   - Both factories return identical orchestrator config: `regularEntityFallback: 'category'`, `junctionEntityFallback: 'taskTagMap'`, `junctionFkFallbacks: { fk1: 'task', fk2: 'tag' }`, `templateFeatureSegment: 'tasks'`, identical `relationPatcher` (`templateMainEntity: 'task'`, `templateRelatedEntity: 'category'`), identical `database.templateRelativePath`.
   - Issue: ADR-0005 §1 framed multi-template as "coexisting templates" with simplified strip-down differing from t115. Under stack-lock decision (§7) the substitution literals were committed identical. After E3d2 unification the **ONLY** functional difference between profiles is `templProject` ('t115' vs 'simplified') — the directory id pointer. Everything else (snippet templates × 4, fallback literals × 4, marker name, scan dirs, database path) is duplicated boilerplate that will inevitably drift.
   - Fix: Either (a) collapse SIMPLIFIED_* constants to references — `const SIMPLIFIED_ENTITY_IMPORTS_TEMPLATE = T115_ENTITY_IMPORTS_TEMPLATE;` — OR (b) refactor to a single shared `STACK_LOCK_TEMPLATE_CONFIG_BASE` with `templProject` parameter, with t115/simplified factories spread-overriding it. Current state hides the architectural truth: there is exactly **one** template config; the only delta is on-disk template directory content. The TS-side TemplateConfig abstraction does not earn its keep.
   - This isn't blocking (it works correctly), but it is technical debt that future agents will mistakenly "fix" by re-introducing differences or fail to keep in sync. Document the equivalence explicitly OR collapse.

2. **`simplifiedTemplateConfig()` factory docstring (lines 425-433) misleads about "Snippet content differences from t115" — there are none.**
   - Evidence: Docstring at `src/features/generation/config/template_config.ts:425-433` claims under "Snippet content differences from t115" that simplified Configuration baseline = startProject baseline (different from t115). But the snippet templates are byte-identical (Finding HIGH-1). The actual difference lives **on-disk** in the template directory content (ceremony layers stripped in `G:/Templates/flutter/simplified/` vs retained in `G:/Templates/flutter/t115/`), NOT in the TS factory.
   - Issue: docstring says "Snippet wire-up shape (sync_core 0.3.0 contract) + substitution literals (template fixture entities) — invariant across templates" (lines 432-433) which is correct, but section heading "Snippet content differences from t115" (line 425) is contradicted by the body. Reader-confusing.
   - Fix: Rename heading from "Snippet content differences from t115" to "Difference from t115 (template directory content only)" and clarify that TS-level snippet definitions are intentionally identical (post-E3d2 stack-lock unification).

3. **`resolveTemplateProfile` JSDoc claims commander validates via `choices()` — it does not.**
   - Evidence: `src/adapters/cli/utils/template_profile.ts:69` says "defensive — commander validates через `choices()`". Actual `option('--template <name>', ...)` calls in `create_project.ts:58` and `generate_entity.ts:49` do NOT include `.choices(['t115', 'simplified'])`. Commander accepts any string; only `resolveTemplateProfile`'s runtime throw catches typos.
   - Issue: Misleading documentation invites future agents to remove the runtime check assuming commander handles it. Also: typos like `--template t116` produce a runtime error "Unknown template 't116'" instead of commander's standard usage hint.
   - Fix: Either add `.choices(['t115', 'simplified'])` to both `option(...)` calls (cleaner UX + earlier validation) and keep the runtime check as defensive dead code, OR fix the docstring to accurately state "runtime validation only; commander does not enforce choices". Recommend the former — costs ~2 LOC.

4. **Configuration ceremony retained in simplified template contradicts ADR-0005 §3.5 anti-examples + executor's own report grep claims.**
   - Evidence (greps over `G:/Templates/flutter/simplified/`):
     - `simplified_flutter/lib/features/configuration/data/services/configuration_service_impl.dart:12` — `class ConfigurationServiceImpl implements IConfigurationService` (application service ceremony retained; ADR-0005 §3.5 anti-example "Application services (`*_service.dart` для multi-entity workflows)")
     - `simplified_flutter/lib/features/configuration/domain/services/i_configuration_service.dart` — service interface retained (ADR-0005 §3.5 #6 "Service interfaces / impls")
     - `simplified_flutter/lib/features/configuration/domain/datasources/i_configuration_remote_data_source.dart` — datasource interface retained (ADR-0005 §3.5 anti-example "Datasource abstract interfaces")
     - `simplified_flutter/lib/features/configuration/domain/dependencies/configuration_dependencies.dart` + `core/dependencies/configuration_dependencies_impl.dart:11 implements IConfigurationDependencies` — DI dependencies abstraction retained
     - `simplified_flutter/lib/features/configuration/data/models/configuration/configuration_model.dart` + 4 fixture `*_model.dart` files — separate Model layer retained (the Session B/C plan had stripped this — "extension methods достаточно"; the data layer Model class is a separate file with `_model_extension.dart` mappers)
     - `simplified_flutter/lib/features/configuration/presentation/registry/` (settings_registry / definitions / setting_tiles 6+ files / dialogs / widgets / models — ceremonies listed as anti-examples in Session A audit "presentation/registry/* (settings_registry / definitions / setting_definition) — ceremony complex UI")
     - `simplified_flutter/lib/features/configuration/presentation/providers/settings_mapper.dart` — separate Mapper class file (ADR-0005 §3.5 #3 strict anti-example "Mappers как separate class")
   - Report.md line 53 claims: "Shape verify: 0 usecases в `t176_flutter/`, 0 abstract repository interfaces (`i_*_repository.dart`)". This is true narrowly (those specific patterns) but report omits that **service interfaces, datasource interfaces, dependencies abstractions, separate Model layer, settings registry ceremony, and separate Mapper classes are all retained** in Configuration baseline + presentation layer.
   - Issue: Session E3c rationale (lines 2300-2310 in task.md) explicitly retained these as "Configuration UI ceremony as Configuration baseline test fixture" — the rationale is reasonable BUT (a) it directly contradicts ADR-0005 §3.5 anti-examples with no amendment recorded, (b) the task.md acceptance criteria explicitly required strip checklist verification (line 60-66 in task.md: "❌ `*_service.dart` для multi-entity workflows / ❌ Separate `*Mapper` class files / ❌ `abstract class *DataSource` interfaces"), (c) report.md presents "all-zero strip" framing without the carve-outs.
   - Fix: Record an explicit ADR-0005 §3.5 amendment (per ADR-0005 §6 amendment clause) documenting the **Configuration baseline carve-out** with rationale: "Configuration feature retains Settings registry / setting_tiles / dialogs / IConfigurationService / IConfigurationDependencies / data/models layer because (a) these are Configuration baseline test fixture demonstrating end-to-end startProject UX, (b) the alternative (stripping Configuration UI) would require rewriting `home_page.dart` consumer chain, out of TASK-024 scope". Without this amendment, the codebase silently violates its own architectural invariant — future agents will either "fix" this by stripping Configuration (breaking generation) or interpret §3.5 as advisory.

### MEDIUM

5. **`_getDestinationPath` empty-targetEntity guard is a real fix, but its diagnosis exposes a deeper invariant — `targetEntity` semantics is overloaded.**
   - Evidence: `src/features/generation/generators/generation_service.ts:289-292`. Comment correctly explains: when `targetEntity = ''` (startProject flow), `replaceAll(templEntity, '')` would mangle filenames like `configuration_dao.dart` → `_dao.dart`.
   - Issue: This is a band-aid for a type-system gap. `config.targetEntity` is typed as `string` but semantically has two distinct modes: (a) "non-empty entity name during generate-entity" → rewrite filenames; (b) "empty during startProject baseline copy" → preserve filenames. The current type allows mixing these states silently. The `replaceAll('configuration', '')` bug would have surfaced regardless of simplified vs t115 if t115 ever ran startProject with a non-default `templEntity`. The defensive guard fixes the symptom; the root cause is `GenerationConfig.targetEntity: string | undefined` semantics never being normalized.
   - Fix (low priority — band-aid is correct, but document the invariant): Add a TS comment to `GenerationConfig.targetEntity` field declaration stating "empty string ('') signals startProject flow — no entity rewrite; non-empty string signals generate-entity flow with filename rewrite". Optionally restructure to `targetEntity: string | null` where `null` is the explicit "no entity" sentinel. Current band-aid is acceptable as permanent fix because `targetEntity = ''` in Configuration baseline copy is legitimate behavior, not user error.

6. **Path-dep patcher Approach 2 dynamic depth-delta is correctly generalized, but the `delta < 0` sub-zero case silently no-ops with potentially incorrect output.**
   - Evidence: `src/core/services/project_bootstrapper.ts:60-64` — "Если delta <= 0, paths не нуждаются в углублении. Sub-zero (target на меньшей глубине чем template) — exotic case, тоже no-op (углубить нельзя mathematically; "shallow" target означал бы paths должны бы стать короче, но шаблон уже формирует paths под template depth, так что noop безопасен)".
   - Issue: The "noop безопасен" claim is hopeful, not verified. Consider hypothetical `--projects-path G:/`: target depth `5` (e.g. `G:/myapp/myapp_flutter`), template depth `5` (`G:/Templates/flutter/t115/t115_flutter`) → delta = 0 → no-op. But target's `../../Packages/X` resolves to `G:/Packages/X` (does NOT exist), `../../../../Projects/...` resolves to `(beyond-G:)/Projects/...` (does NOT exist). The patcher produces "syntactically valid pubspec that resolves to nothing". The "no-op is safe" assumption holds only for delta >= 0 paths that incidentally resolve to existing locations — it is a design coincidence, not invariant.
   - Fix: Add detection — if delta < 0 OR resulting paths fail filesystem existence check, log a warning (e.g. `logger.warn('path-dep patcher delta=${delta}; paths may not resolve. Verify ${pubspecPath}')`). Current state is "fail silently then explode at flutter pub get" — not friendly. Lower-priority because the only validated entry points (`Projects/Flutter/serverpod/` default + `Templates/flutter/` simplified) both have delta ≥ 0.

7. **`resolveTemplateProfile` PROFILES dictionary uses getter-based factory invocation — works but introduces non-obvious lazy semantics.**
   - Evidence: `src/adapters/cli/utils/template_profile.ts:50, 63` — `get templateConfig() { return t115TemplateConfig(); }` (and same for simplified).
   - Issue: A getter on a const literal object means each `profile.templateConfig` access calls the factory anew (creating a fresh `TemplateConfig` instance per access). This is currently fine because `t115TemplateConfig()` / `simplifiedTemplateConfig()` are pure (no side-effects, no caching needed). But the pattern is non-obvious — reader sees `PROFILES[name]` and reasonably assumes a static lookup. If a future contributor mutates `profile.templateConfig.orchestrator.entityImportsTemplate = ...`, the mutation is silently lost (next access returns a fresh factory output). Conversely, if factories ever cache state, the lazy getter becomes incorrect.
   - Fix: Either (a) make the getter explicit by renaming to a method `templateConfigFactory(): TemplateConfig`, OR (b) eagerly resolve once: `templateConfig: t115TemplateConfig()` (eager, single instance per profile object lifetime). Recommend (b) — simpler, matches reader intuition. Current state works but invites confusion.

### LOW

8. **`DEFAULT_TEMPLATE = 'simplified'` aligned with ADR-0005 §1 clean-slate amendment — verified correct.**
   - Evidence: `src/adapters/cli/utils/template_profile.ts:30`. ADR-0005 amendment log entry 2026-05-03: "default template = simplified; weight TASK after Phase C synthetic" (counter-signed).
   - No issue. Recording this as a positive verification, not a finding.

9. **Stack-lock invariants verified preserved in simplified template content:**
   - `@riverpod` annotation count: 29 files (`grep -l "@riverpod" simplified_flutter/lib -r`) — Riverpod stack preserved.
   - `@DriftDatabase` annotation present in `core/data/datasources/local/database.dart` — Drift conventions preserved.
   - `package:sync_core/sync_core.dart` imports in 23+ files (5 adapter files per entity × 5 entities + sync infra) — sync_core 0.3.0 wire-up preserved.
   - `simplified_server` Serverpod backend present with `bin/main.dart`, `migrations/`, `*.spy.yaml` models — Serverpod stack preserved.
   - 13/13 `// === generated_start:*` marker types present (`base, driftTableColumns, driftTableImports, entityToServerpodParams, freezedConstructor, oneToManyMethods, serverpodToModelParams, simpleFields, syncEntityTypes, syncImports, syncRegistrations, valueWrappedFields, valueWrappedFieldsModel`) — verified `grep -roh "// === generated_start:[a-zA-Z]*" --include="*.dart"` matches t115 reference scheme.
   - Directory layout `lib/features/<feature>/data/datasources/local/tables/` preserved.
   - 0 `t115`/`T115` literal residue (`grep -rn "t115\|T115" --include="*.dart" --include="*.yaml"` empty).

10. **`--templ-project` flag is preserved as override-only — backward-compat clean.**
    - Evidence: `create_project.ts:59` `option('--templ-project <id>', 'Override template project directory id (default derived from --template)')` (no default value supplied), `:87` `templProject: opts.templProject || templateProfile.templProject`.
    - Net effect: legacy callers passing only `--templ-project simplified` still work (resolveTemplateProfile uses default 'simplified' profile, `opts.templProject` overrides). New callers use `--template t115` and `templ-project` is auto-derived. Forward-compat clean.

11. **Forward extensibility — adding 3rd template would require extending union type + factory; pattern scales reasonably.**
    - Evidence: `template_profile.ts:28` `export type TemplateName = 't115' | 'simplified'` (closed union); `:44` `PROFILES: Record<TemplateName, TemplateProfile>` (exhaustive on union).
    - To add a 3rd template: (a) add to union, (b) add PROFILES entry, (c) add factory in `template_config.ts`. TS exhaustiveness check enforces (b)/(c). Reasonable boilerplate. Caveat: under stack-lock + simplified currently being identical to t115, adding a 3rd template would (under the same stack-lock constraint) likely also be identical TS-side. The TS-side abstraction may not be the right scaling axis — see Finding HIGH-1.

12. **Defensive empty-targetEntity guard preserves backward compat — generate-entity flow unaffected.**
    - Evidence: `generation_service.ts:289` `if (config.targetEntity && config.targetEntity.length > 0) { ... }`. Generate-entity always passes non-empty `model.tableName` → guard never trips → existing behavior preserved. Mocha 181 passing confirms no regression.

---

## Strengths

- **Path-dep patcher Approach 2 (dynamic depth-delta) is a clean architectural generalization** — replaces hardcoded "+1 level" with mathematical computation `delta = targetSegments - templateSegments`. Forward-extensible to arbitrary `--projects-path` shapes (Templates/flutter/, Projects/Flutter/serverpod/, hypothetical third locations) without revisiting. 2 new mocha tests cover both delta=0 (TASK-024 fix) and delta=1 (regression baseline). Existing 6 patcher tests adjusted to use realistic depth shapes — improves test signal vs noise.
- **`--template <name>` flag wire-up is consistent across `create_project.ts` and `generate_entity.ts`** — same default, same profile resolution path, both preserve legacy `--templ-project`/`--templ-entity`/`--templ-feature` overrides for fine-grained control.
- **Stack-lock invariants are demonstrably preserved** in simplified template content — Riverpod / Drift / sync_core / Serverpod / 13 markers / Clean directory layout all verified intact via greps.
- **Defensive empty-targetEntity guard is the correct fix** for the underlying bug (filename mangling). Comment at `generation_service.ts:284-288` accurately diagnoses the root cause. Permanent fix, not band-aid.
- **Configuration baseline rationale is internally coherent** even though contradicting §3.5 — Configuration UI demonstrates startProject end-to-end UX; stripping it would require larger consumer-chain rewrite. Decision is reasonable even if process-incomplete (missing ADR amendment).
- **Sub-second test suite (181 passing in 47ms)** confirms no architectural changes broke unit-test surface.

---

## Verdict

The Phase B B2 implementation correctly delivers a working multi-template plurality with `--template <name>` opt-in, default switch to simplified, and verified end-to-end smoke (t176 default + t177 legacy both errors=0). The path-dep patcher generalization is a clean architectural improvement. The defensive empty-targetEntity guard is a real fix.

However, two architectural truths surface that the current implementation hides:
1. **Under stack-lock decision, simplified and t115 TS-side configs are byte-identical** — the multi-template axis collapses to template-directory-id pointer only. The duplication of SIMPLIFIED_*_TEMPLATE constants creates technical debt that will silently drift. (Finding HIGH-1 + HIGH-2)
2. **Configuration baseline ceremony retention contradicts ADR-0005 §3.5 anti-examples** with no recorded amendment. The "all-zero strip" framing in report.md elides the carve-outs. (Finding HIGH-4)

Recommendation: **Approve with fixes**. HIGH-1/2/3/4 should be addressed before PR merge — none are blocking but together they leave architectural state confused. HIGH-4 specifically requires either an ADR-0005 amendment (per §6 amendment clause + TeamLead/User counter-sign) or a fresh-eyes decision to strip Configuration UI (probably out of scope for this task; defer to follow-up). HIGH-1/2/3 are TS-level cleanup ~30 LOC total.

MEDIUM findings (5/6/7) are technical-debt notes that don't block merge but should be addressed in next iteration. LOW findings (8-12) are positive verifications, no action required.

---

## Catch count: 12 findings (0 CRITICAL / 4 HIGH / 3 MEDIUM / 5 LOW)
