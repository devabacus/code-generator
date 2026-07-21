# Architecture Review — TASK-022

**Reviewer:** Architecture (Subagent)
**Date:** 2026-05-03
**Branch:** feature/TASK-022-b1-codegen-core-multi-template-infrastructure (5 commits — `0b5ba47` factory, `1f7263a` RelationPatcher, `45c4a79` OrchestratorPatcher, `44322ea` AppDatabaseGenerator, `baf545d` docs)
**Recommendation:** **Approve with fixes** (1 HIGH cosmetic + 3 MEDIUM defer-able)

## Findings

### CRITICAL (deal-breakers — must fix перед commit)

_No CRITICAL findings._ Refactor scope was tight, no stack-lock violations, no Strategy pattern abstraction, generators correctly read from injected config, default factory pattern preserves backwards compat.

### HIGH (should fix перед merge)

**H1. Discriminator union mismatch task.md ↔ implementation.**

- Evidence:
  - `ai/tasks/active/TASK-022-b1-.../task.md:71` — spec: `name: 't115' | 'simplified';   // expanded в TASK-B2 (union extension)`
  - `src/features/generation/config/template_config.ts:33` — implementation: `name: 't115';` (single literal, comment at line 22 says "будет расширен в TASK-B2")
- Issue: Spec says union should already include `'simplified'` arm (anticipating TASK-B2). Implementation has only `'t115'`. Not a runtime defect, but means TASK-B2 will need to **modify** `template_config.ts` interface (breaking 8 reference sites) instead of adding a new factory + new branch — adds friction to forward extensibility, contradicts task's "TASK-B1 → TASK-B2 contract" risk #5 mitigation ("mock alt config через generators routes к alternate output (демонстрирует что simplified config TASK-B2 будет plug-and-play)").
- Fix: Change line 33 to `name: 't115' | 'simplified';` per spec. One-line edit, no behavioral consequence (factory still returns `'t115'`). Let TASK-B2 add `simplifiedTemplateConfig()` factory без re-edit interface. **Cost:** ~1 minute. **Justification:** spec compliance + forward extensibility per documented risk mitigation.

### MEDIUM (defer if capacity-bound, document)

**M1. Discriminator field `name` is currently runtime-dead.**

- Evidence:
  - `Grep config\.templateConfig\.name` → only 3 hits, all in test files (`relation_patcher.test.ts:569`, `orchestrator_patcher.test.ts:769`, `app_database_generator.test.ts:467`) as sanity assertion `assert.strictEqual(config.templateConfig.name, 't115')`
  - Zero references in `src/features/generation/**/*.ts` outside `template_config.ts` itself
- Issue: The discriminator field is YAGNI-borderline today — it provides no runtime branching. Per task's stated intent (task.md:33) it's "только для diagnostic / logging". But there are zero log/diagnostic call-sites. If TASK-B2 adopts pure "config-driven" approach (no `if (templateConfig.name === 'simplified')` branches anywhere — strictly literal substitution), this field stays decorative forever. If TASK-B2 needs branching, the discriminator becomes load-bearing. **Per Discussion #11 Q3=a + Claude_1 caveat (no Strategy pattern yet)** — keep field for now, but flag this for TASK-B2 review: if not consumed at runtime by TASK-B2, consider removing in favor of structural typing.
- Fix: Document explicitly in `template_config.ts` JSDoc that `name` is currently advisory — TASK-B2 will demonstrate whether runtime dispatch is needed. **Defer if low capacity.**

**M2. Hidden coupling — template-specific defaults still live in `GenerationConfig` constructor (not migrated to TemplateConfig).**

- Evidence: `src/features/generation/config/generation_config.ts:78,80,83,94,95`:
  ```typescript
  this.templProject     = config.templProject     || 't2';      // legacy/dead default
  this.templFeatureName = config.templFeatureName || 'tasks';   // t115 feature name
  this.templEntity      = config.templEntity      || 'category';// t115 main entity
  this.templEntity1     = config.templEntity1     || 'task';    // t115 junction E1
  this.templEntity2     = config.templEntity2     || 'tag';     // t115 junction E2
  ```
  These are conceptually template-specific defaults: `'tasks'` is t115's feature directory, `'category'` is t115's regular template entity, `'task'/'tag'` are t115's junction template entities. Yet they are NOT in `TemplateConfig` — they live as constructor fallbacks in `GenerationConfig`.
- Issue: TemplateConfig declares its purpose as "конфигурация template-specific литералов для multi-template architecture" (line 1-2 of template_config.ts), but actually only covers literals from the 3 specific generators (`RelationPatcher`/`OrchestratorPatcher`/`AppDatabaseGenerator`). The architectural narrative "switch template = switch TemplateConfig" is leaky: a TASK-B2 simplified template would still inherit `'tasks'`/`'category'`/`'task'`/`'tag'` defaults from GenerationConfig unless caller overrides explicitly. Hidden assumption that simplified template uses identical entity names as t115 (likely true per ADR-0005 stack lock — simplified inherits Clean directory layout — but undocumented in TemplateConfig).
- Fix: Either (a) document explicitly in `template_config.ts` JSDoc that `templEntity*` and `templFeatureName` are intentionally outside TemplateConfig because all templates share Clean layout per stack lock, OR (b) extend TemplateConfig with a `defaults` block (`feature: 'tasks', mainEntity: 'category', junctionE1: 'task', junctionE2: 'tag'`) that GenerationConfig consults instead of hardcoded fallbacks. Option (a) is YAGNI-correct for B1, option (b) is forward-extensible for cross-template variance. **Defer to TASK-B2 if option (a) chosen — but explicitly document.**

**M3. `app_database_generator.ts:18` — target path still hardcoded via `corePath` getter.**

- Evidence:
  - `app_database_generator.ts:18` → `const destinationDir = this.config.coreDataLocalPath;`
  - `generation_config.ts:160-162` → `get coreDataLocalPath() { return path.join(this.corePath, 'data', 'datasources', 'local'); }`
  - `templateConfig.database.templateRelativePath` only configures the **template** (read source), not the **target** (write destination)
- Issue: Asymmetric configurability. If a future template wanted database.dart at `lib/database/app_database.dart` (not Clean layout), changing `templateRelativePath` would change where to read FROM but NOT where to write TO — generator would still write at `lib/core/data/datasources/local/database.dart`. Per ADR-0005 stack lock simplified inherits Clean layout, so this won't bite in practice. But the asymmetry violates "configuration = symmetric template/target pair" principle that other parts of GenerationConfig follow (e.g., `sourceFeaturePath` ↔ `targetFeaturePath`).
- Fix: Document explicitly in `app_database_generator.ts:18` (just before `destinationDir` line) that target path is intentionally derived via `corePath`/`coreDataLocalPath` config getters because Clean directory layout is stack-locked across templates. Optionally add `targetRelativePath` field to `TemplateConfig.database` for symmetry (defer to B2 if needed). **No action for B1 if documented.**

### LOW (nice-to-have)

**L1. `template_config.ts` factory does not freeze returned object — caller can mutate shared state if same factory invocation reused.**

- Evidence: `template_config.ts:109` — `t115TemplateConfig()` returns a fresh literal object on every call (good — no shared-state risk between concurrent callers). HOWEVER, callers who store the result and mutate (e.g., `const cfg = t115TemplateConfig(); cfg.relationPatcher.markerName = 'x';`) corrupt their own local copy without warning. Tests in `relation_patcher.test.ts:622-624` and `orchestrator_patcher.test.ts:798-805` use spread patterns like `relationPatcher: t115TemplateConfig().relationPatcher` which correctly creates fresh nested objects, so no current bug.
- Fix: Optionally `Object.freeze()` returned object (deep freeze nested fields) to enforce immutability contract. **YAGNI-defendable to skip.**

**L2. Comment drift — pre-TASK-022 line numbers cited in 3 generators don't match current state.**

- Evidence:
  - `relation_patcher.ts:18-20` says "literals читаются из config..." with reference "Pre-TASK-022 hardcoded values: 'task' / 'category' / 'oneToManyMethods' / ['feature/', 'server/']"
  - `orchestrator_patcher.ts:42-44` similar
  - `app_database_generator.ts:21-24` similar
- Issue: These comments reference "pre-TASK-022 lines 18-19, 36" / "lines 42-48" — these line numbers are pre-refactor; readers comparing post-refactor source to comment line numbers will be confused. Future maintainers should look at git history, not comment line refs.
- Fix: Either remove explicit line numbers from comments, OR replace with "see commit `0b5ba47`/`1f7263a`/`45c4a79`/`44322ea`" git ref. **Cosmetic.**

**L3. `report.md` is empty stub — documentation gap.**

- Evidence: `ai/tasks/active/TASK-022-.../report.md` (23 lines) — все секции stub-template ("Что было реализовано." / "(количество или список)" / etc.)
- Issue: task.md журнал at lines 270-276 has the actual evidence (172 passing tests, t165 PASS errors=0, zero-diff confirmed), but `report.md` per acceptance #58 must contain "цитированными CLI выводами (real numbers: mocha passing count + verify errors/warnings + zero-diff evidence)". Currently it's a placeholder.
- Fix: Fill `report.md` with the evidence already captured in task.md журнал (mocha 172/172, verify t165 errors=0/warnings=1/infos=44, zero-diff t166 vs t167). Required per acceptance criteria #58. **Must do before merge** but architecturally trivial.

## Strengths

- **Tight scope adherence.** Refactor stayed strictly within 3 generators + their tests + 1 new file + 1 modified config. No `generation_service.ts` touch, no `create_project.ts` touch, no `generate_entity.ts` touch — backwards compat verified through default factory pattern in constructor (line 100 of `generation_config.ts`). `git diff master..HEAD --stat` shows only 11 files, 816 insertions / 11 deletions — clean refactor surface.
- **YAGNI compliance verified.** No abstract `TemplateStrategy` interface, no premature dispatch logic, no scope creep into Phase D `--template <name>` CLI flag wiring. Per Discussion #11 Q3=a + Claude_1 caveat correctly honored.
- **Field grouping is semantically correct.** Three top-level groups (`relationPatcher` / `orchestrator` / `database`) cleanly map 1:1 to the three target generators. Each generator reads ONLY from its own group — no cross-coupling between groups (verified via Grep: `relation_patcher.ts` references only `config.templateConfig.relationPatcher.*`; `orchestrator_patcher.ts` only `config.templateConfig.orchestrator.*`; `app_database_generator.ts` only `config.templateConfig.database.*`).
- **Bonus fix line 113-114 of `relation_patcher.ts` correctly captured.** Per task.md plan step 6, the previously hardcoded `'category'` literal at line 133 (pre-refactor) was migrated to `templateRelatedEntity` variable. Verified at current line 113-114 — uses `templateRelatedEntity` substituted from config.
- **Test architecture sound.** Each generator's test suite has exactly 3 TemplateConfig injection cases covering: (a) default config produces hardcoded-equivalent literals (regression guard), (b) alt config produces alt-shaped output (proof-of-extensibility), (c) explicit t115 config = default config output (equivalence regression). +9 tests as required, mocha count 172 = 163 baseline + 9 new (matches acceptance #57).
- **Stack-lock invariants compliant.** No Riverpod/Drift/markers/directory-layout changes. Manifest scheme untouched (`manifests.ts` unmodified). 13 markers preserved per ClaudeAdv evidence.
- **No Hidden coupling missed in 3 generators' direct scope.** Grep verified that all `'oneToManyMethods'`, `'sync_orchestrator_provider.dart'`, `'database.dart'` template-relative-path literals in the 3 target generators are now config-driven. The remaining occurrences live only in: (a) test fixtures (correct — tests assert literal values), (b) `template_config.ts` factory (correct — that's where they belong now), (c) JSDoc comments (correct — documentation references).

## Verdict

Refactor is architecturally sound and ready to merge after addressing **H1** (one-line union type fix per spec) and **L3** (fill report.md with evidence already captured in task.md журнал). The other findings (M1/M2/M3/L1/L2) are forward-looking observations about residual coupling that does NOT bite in B1 but should inform B2 design — flag in `closure-report.md` Phase B section per acceptance #60. The default factory pattern via constructor (`templateConfig = config.templateConfig || t115TemplateConfig()`) is semantically correct: existing call-sites get t115 transparently, new sites can override. The "fake t115 config for simplified scenarios" concern (raised in your review focus #2) is non-issue because in B1 there is only t115 — every call-site IS legitimately t115. The concern materializes in TASK-B2 when simplified factory lands; at that point Phase D `--template <name>` CLI flag will switch the factory invocation, so existing call-sites (which currently take the default) will need explicit pass-through OR template detection in CLI layer. That's TASK-B2 / Phase D scope, not B1's problem.

## Catch count: 7 findings (0 CRITICAL / 1 HIGH / 3 MEDIUM / 3 LOW)
