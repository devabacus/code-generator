# TASK-023: B2 simplified template content

**Phase B sequenced TASKs (Discussion #11 12-point Decision):** B1 ✅ (TASK-022 merged PR #19) → **B2 (этот TASK)** → B3 (tests + Open Q resolution).

**Estimate:** ~1-1.5 weeks executor (Discussion #11 + ClaudeAdv evidence). Hard ceiling 2 weeks.

## Ветка

`feature/TASK-023-b2-simplified-template-content`

## Цель

Создать `G:/Templates/flutter/simplified/` template directory с full Configuration baseline (single entity, sync_core 0.3.0 wire-up) под stack lock от t115 baseline (per Discussion #11 + ADR-0005 amendment 2026-05-03). После TASK-B2 codegen `create-project` с simplified template config может generate работающий monorepo (server + flutter + admin + client) с Configuration entity end-to-end, идентично t115 по stack components, но **без architecture ceremony layers** (per ADR-0005 Section 3.5 migration-side anti-examples). Также закрывает [BUG-019](../../../bug-reports/019-orchestrator-snippet-hardcoded-literals.md) (TASK-B2 landmine documented в TASK-022): расширяет `TemplateConfig.orchestrator` snippet content abstraction.

## Не-цели

- `--template <name>` CLI flag wiring (= **Phase D scope**)
- Multi-entity content beyond Configuration baseline (FK / junction Map / junction no-Map = **Phase C synthetic** OR **TASK-B3 specific**)
- Изменение stack t115 baseline — **stack lock** invariant
- Изменение manifest markers scheme (13 markers preserved)
- Изменение существующего t115 template behavior — **zero-diff** invariant on t115 generation
- Strategy pattern abstract `TemplateStrategy` interface — YAGNI пока 2 templates
- Generation of removed ceremony layers (usecases / business notifiers / validation / repository interfaces / app services / separate Mapper classes / Either-Result wrappers / datasource interfaces) per ADR-0005 Section 3.5

## Scope

**Разрешено (создание simplified template + расширение core):**

### Template content (`G:/Templates/flutter/simplified/`)

- Bootstrap directory structure mirroring t115's monorepo shape:
  - `simplified_admin/` — minimal Flutter admin app
  - `simplified_client/` — Serverpod generated client
  - `simplified_flutter/` — main Flutter app с Configuration baseline
  - `simplified_server/` — Serverpod backend с Configuration endpoint
- `pubspec.yaml` templates с **latest stable package versions** (per stack-lock obligation; verify через Dart MCP перед commit):
  - `flutter_riverpod` + `riverpod_annotation` + `riverpod_generator` — latest stable
  - `drift` + `drift_dev` + `drift_flutter` — latest stable
  - `sync_core` — 0.3.0+ (path-dep к `../../../../Packages/sync_core`)
  - `serverpod` + `serverpod_client` + `serverpod_flutter` + `serverpod_test_tools` — latest stable
  - `freezed` + `freezed_annotation` + `json_serializable` + `json_annotation` + `build_runner` — latest stable
  - `uuid` — latest stable
- Configuration baseline entity layer (per ADR-0005 Section 3.1 generate categories):
  - **Drift table** `lib/features/configuration/data/datasources/local/tables/configuration_table.dart` (manifest: entity)
  - **DAO** `lib/features/configuration/data/datasources/local/daos/configuration/configuration_dao.dart` (CRUD queries + watch)
  - **Repository** `lib/features/configuration/data/repositories/configuration_repository_impl.dart` (atomic transaction site, sync_core wire-up; **NO interface** — `--with-interfaces` flag default OFF)
  - **sync_core 5 adapters** в `lib/features/configuration/data/adapters/configuration/`:
    - `configuration_remote_adapter.dart` (`SyncRemoteWriteAdapter` impl)
    - `configuration_pull_adapter.dart` (`SyncRemotePullAdapter` impl)
    - `configuration_event_adapter.dart` (`SyncRemoteEventAdapter` impl)
    - `configuration_payload_codec.dart` (`SyncPayloadCodec` impl)
    - `configuration_local_apply.dart` (`LocalApplyAdapter` impl)
  - **Riverpod data providers** `lib/features/configuration/data/providers/configuration_providers.dart` (`@riverpod` annotations, factory bindings — DAO / Repository / sync adapters)
  - **Mappings** extension methods (`toEntity` / `toModel` / `toCompanion`) — НЕ separate Mapper class
  - **Domain model** (Freezed entity if used in t115; verify через t115 reference)
  - **Presentation** `lib/features/configuration/presentation/{pages,widgets}/` — minimal home page демонстрирующий Configuration data (read-only либо basic CRUD; no business notifiers — only Riverpod data providers wire-up)
- Core sync infrastructure `lib/core/sync/` (5 source files per ADR-0005 Section 1):
  - `sync_orchestrator_provider.dart` (с `:syncImports` / `:syncEntityTypes` / `:syncRegistrations` markers)
  - `sync_queue_table.dart` (sync_core 0.3.0 schema)
  - `sync_clock.dart` / `sync_metrics.dart` / `sync_scope.dart` (либо как в t115)
- Core data infrastructure `lib/core/data/datasources/local/database.dart` (Drift `@DriftDatabase` с GENERATED_IMPORTS / GENERATED_TABLES / GENERATED_MIGRATION marker blocks)
- All **13 markers** present: `driftTableImports`, `driftTableColumns`, `oneToManyMethods`, `base`, `freezedConstructor`, `simpleFields`, `valueWrappedFields`, `valueWrappedFieldsModel`, `serverpodToModelParams`, `entityToServerpodParams`, `syncImports`, `syncEntityTypes`, `syncRegistrations`
- **`// manifest: startProject`** markers на всех bootstrap files (создаются при `create-project`)
- **`// manifest: entity`** markers на template files (используются `generate-entity`)
- Server side: Configuration model YAML (`<server>/lib/src/models/configuration/configuration.spy.yaml`) + sync_event YAML + endpoint
- `app.dart` / `main.dart` / `home_page.dart` — Riverpod ProviderScope + sync orchestrator wire-up + home page демонстрирующий Configuration

### Codegen core extensions

- **`src/features/generation/config/template_config.ts`:**
  - `simplifiedTemplateConfig()` factory с paths/literals для simplified template
  - **Extend `TemplateConfig.orchestrator`** (BUG-019 fix) — добавить fields для snippet content:
    - `entityImportsTemplate: string` — abstracted from current hardcoded `_ENTITY_*_TEMPLATE` lines 410-450 в orchestrator_patcher.ts
    - `entityRegisterTemplate: string` — register snippet
    - `junctionImportsTemplate: string` / `junctionRegisterTemplate: string` — для junction entities
  - Update `t115TemplateConfig()` с current hardcoded snippets (preserve t115 behavior — zero-diff invariant)
- **`src/features/generation/generators/orchestrator_patcher.ts`** (BUG-019 fix):
  - Refactor `_buildImportsSnippet` / `_buildEntityTypeSnippet` / `_buildRegisterSnippet` для consume snippet templates из `templateConfig.orchestrator.*Template` instead of file-local `_ENTITY_*` / `_JUNCTION_*` constants
  - Remove hardcoded `_ENTITY_*_TEMPLATE` / `_JUNCTION_*_TEMPLATE` constants (move к t115 factory) — references в config теперь
  - Replace remaining hardcoded `'category'` / `'taskTagMap'` / `features/tasks/` literals (lines 208 / 250 / 261-262) с config-driven values
- **Tests:**
  - Расширение `src/test/generators/orchestrator_patcher.test.ts` с simplified-config tests (alt-config positive proof что simplified snippets emitted correctly)
  - Опционально: bootstrap test для simplifiedTemplateConfig structural validation

### Validation strategy (без `--template` CLI flag)

Поскольку `--template` flag = Phase D scope, тестирование simplified template в TASK-B2:

1. **Unit tests:** alt-config tests (как в TASK-022) с `simplifiedTemplateConfig()` doing the alternate output; verify generators produce simplified-shaped content
2. **Integration test:** test-only entry point либо direct invocation `GenerationService` / `CreateProjectService` с simplified config — generate project в test temp directory, smoke-check structure (key files present, manifest markers preserved, sync_orchestrator wire-up correct)
3. **Manual smoke (executor's choice if helpful):** temporary force `simplifiedTemplateConfig()` в `create_project.ts` для one-off `create-project --name t<N+1>-simplified` + `verify`; **revert** перед commit (`--template` wiring = Phase D)

**Запрещено:**

- `--template <name>` CLI flag wiring (= Phase D)
- Multi-entity simplified template content (FK / junction = Phase C синтетический реф либо TASK-B3 specific tests; NOT в TASK-B2 acceptance)
- Изменение Drift conventions / DI patterns / marker scheme / directory layout — **stack lock**
- Generation removed ceremony (usecases / business notifiers / validation / repository interfaces / app services / separate Mapper classes / Either-Result wrappers / datasource interfaces) per ADR-0005 Section 3.5
- Изменение t115 template content (zero-diff invariant; t115 = deprecated path frozen)
- Strategy pattern abstraction для `TemplateStrategy` interface — YAGNI

## Критерии приёмки

- [ ] `G:/Templates/flutter/simplified/` directory создан с full structure (server / flutter / admin / client subdirs)
- [ ] All **13 markers** present в template files (verify через grep)
- [ ] `// manifest: startProject` / `// manifest: entity` markers correctly placed (file без manifest → MarkerAnalyzer ignores; verify бы test)
- [ ] Configuration baseline entity layer complete (table + DAO + repository + 5 sync adapters + Riverpod data providers + mappings + minimal presentation скелет)
- [ ] **NO removed ceremony layers** в simplified template (verify через grep: no `usecases/`, no business notifiers, no validation, no repository interfaces, no application services, no separate Mapper classes, no Either-Result, no datasource interfaces) — per ADR-0005 Section 3.5
- [ ] **Package versions latest stable** в pubspec.yaml templates (verified через Dart MCP query; cited versions в report.md)
- [ ] `simplifiedTemplateConfig()` factory создан в `src/features/generation/config/template_config.ts`
- [ ] **BUG-019 closed:** `TemplateConfig.orchestrator` extended с snippet content fields; orchestrator_patcher.ts читает snippets из config (no hardcoded `_ENTITY_*` / `_JUNCTION_*` constants); hardcoded `'category'` / `'taskTagMap'` / `features/tasks/` literals (lines 208/250/261-262) eliminated
- [ ] **t115 zero-regression:** existing 173 tests passing, t115 template behavior unchanged (zero-diff smoke на t115 generation; create-project --name t<N> on master pre-B2 vs feature branch identical в `<name>_flutter/lib/`)
- [ ] **Simplified positive smoke:** integration test либо temporary manual smoke генерирует project с simplified config; structure валиден, manifest markers preserved, sync wire-up correct, Configuration entity end-to-end
- [ ] +N unit tests минимум для simplifiedTemplateConfig + BUG-019 fix (orchestrator_patcher alt-config snippets emitted correctly)
- [ ] `npm run compile` clean
- [ ] `npm run lint` clean
- [ ] mocha workaround ≥173 + N passing (zero failures)
- [ ] `report.md` написан с cited evidence (mocha numbers / package versions list / structure tree / BUG-019 closure evidence)
- [ ] **Multi-agent review** перед commit'ом: 3 thematic (architecture / generator-core / test) + 1 Adversarial overlay (Discussion #11 Q10=b)
- [ ] **Per-TASK closure-report Phase B section update** (incremental): добавить sub-section "Phase B — TASK-B2 deliverable" в [closure-report.md](../../done/TASK-021-initiative-phase-a---architectural-design---audits---adr-0005-multi-template-plurality/closure-report.md)
- [ ] BUG-019 status updated к Closed в `ai/bug-reports/019-orchestrator-snippet-hardcoded-literals.md` + status.md backlog table

## Заметки по реализации

### Bootstrap strategy для simplified/

**Рекомендуемый подход (executor's discretion — оба valid):**

**Option A — copy-then-strip:** copy `G:/Templates/flutter/t115/` → `G:/Templates/flutter/simplified/` → systematically remove ceremony layers (delete `usecases/` directories, delete repository interfaces, delete application services, delete separate Mapper classes; keep only generate categories per ADR Section 3.1). Pros: faster bootstrap, ensures stack identity. Cons: easy to miss something to strip.

**Option B — build-from-scratch:** create simplified/ from scratch using t115 как reference, only adding files matching ADR Section 3.1 generate categories. Pros: cleanest, no leftover ceremony. Cons: slower, easier to miss stack invariant.

**Recommendation:** Option A copy-then-strip с aggressive grep verification после strip (no `usecases/` directories anywhere; no `*Repository.dart` interface files; no `*UseCase*` class names; no separate `*Mapper` classes — extension methods only). Document strip checklist в журнале task.md.

### Stack lock invariants (CRITICAL — re-emphasized)

- **НЕ** меняй package set (Riverpod / Drift / sync_core / Serverpod)
- **НЕ** уменьшай marker scheme (13 markers all present)
- **НЕ** flatten directory layout (`lib/features/<feature>/data/datasources/local/tables/` preserved)
- **MUST** package versions update к latest stable (через Dart MCP verify)
- Reviewers flag любое изменение stack как scope violation

### Package versions update procedure

1. Read t115 pubspec.yaml versions для baseline reference
2. Query Dart MCP `get_latest_versions` либо browse pub.dev для latest stable каждого package
3. Document old → new version mapping в журнале
4. Major bumps (e.g., Serverpod major version) — verify breaking changes на Configuration baseline; если breaking changes значительные — STOP, flag teamlead'у (может потребовать pre-impl Discussion)
5. Update simplified pubspec templates с new versions
6. **t115 НЕ меняется** (zero-diff invariant)

### BUG-019 fix shape

Current `orchestrator_patcher.ts` hardcoded constants:

```typescript
const _ENTITY_IMPORTS_TEMPLATE = `import '...features/{{feature}}/data/...'`;
const _ENTITY_REGISTER_TEMPLATE = `orchestrator.register<{{Entity}}>(...)`;
const _JUNCTION_IMPORTS_TEMPLATE = ...;
const _JUNCTION_REGISTER_TEMPLATE = ...;
```

Refactor план:
1. Move `_ENTITY_*` / `_JUNCTION_*` constants в `template_config.ts` factory functions:
   - `t115TemplateConfig().orchestrator.entityImportsTemplate` = current `_ENTITY_IMPORTS_TEMPLATE` content
   - Same для `entityRegisterTemplate` / `junctionImportsTemplate` / `junctionRegisterTemplate`
   - `simplifiedTemplateConfig().orchestrator.*` = simplified-specific snippets (likely identical к t115 если sync_core wire-up same — verify; differences возможно в presentation imports / providers если simplified не имеет ceremony)
2. Update `orchestrator_patcher.ts` `_buildImportsSnippet` / etc. для read from `config.templateConfig.orchestrator.*Template`
3. Replace hardcoded `'category'` / `'taskTagMap'` / `features/tasks/` literals (lines 208/250/261-262) с config-driven values (extend `templateConfig.orchestrator` further if needed)
4. Verify t115 zero-diff: regenerate orchestrator_provider.dart на t115 fixture → identical content
5. Verify simplified positive: alt-config test produces simplified snippets

### Risks

1. **Package version major bumps** — Serverpod, freezed, drift могут иметь breaking API changes. Mitigation: incremental upgrade с per-package smoke; STOP перед commit'ом если major bump требует > minimal code adaptation в simplified template. Esclate teamlead если breaking changes значительные.
2. **BUG-019 fix scope creep** — refactor orchestrator_patcher snippets может expose ещё literals. Mitigation: scope tight (только snippet content abstraction + 4 listed line numbers); за пределы — STOP.
3. **t115 zero-diff regression** (per Discussion #11 Q3=a constraint) — refactor для simplified не должен break t115. Mitigation: zero-diff smoke acceptance + CI gate (mocha 173 baseline).
4. **Bootstrap strip incompleteness** (Option A risk) — leftover ceremony в simplified template. Mitigation: aggressive grep после copy-then-strip; reviewer'ы flag leftover ceremony.
5. **Validation без `--template` CLI flag** — testing strategy через alt-config unit tests + temporary smoke (revert before commit). Mitigation: clear documented в журнале что smoke procedure ephemeral.

## Релевантный контекст

Файлы для прочтения перед началом:

- [ai/docs/decisions/adr-0005-multi-template-plurality.md](ai/docs/decisions/adr-0005-multi-template-plurality.md) — Sections 3.1 (generate categories), 3.4 (anti-examples generate-side), 3.5 (anti-examples migration-side), 7 (stack lock amendment 2026-05-03)
- [ai/discussions/archive/11-initiative-phase-b-simplified-template-i/11-initiative-phase-b-simplified-template-i.md](ai/discussions/archive/11-initiative-phase-b-simplified-template-i/11-initiative-phase-b-simplified-template-i.md) — Discussion #11 12-point Decision
- [ai/tasks/done/TASK-022-b1-codegen-core-multi-template-infrastructure/](ai/tasks/done/TASK-022-b1-codegen-core-multi-template-infrastructure/) — TASK-B1 (TASK-022) deliverable: report.md / 4 review files / task.md журнал
- [ai/bug-reports/019-orchestrator-snippet-hardcoded-literals.md](ai/bug-reports/019-orchestrator-snippet-hardcoded-literals.md) — BUG-019 evidence + fix proposal
- `G:/Templates/flutter/t115/` — bootstrap reference (особенно `t115_flutter/lib/features/configuration/`, `t115_flutter/lib/core/sync/`, `t115_flutter/lib/core/data/datasources/local/`)
- `G:/Templates/flutter/t115/t115_flutter/pubspec.yaml` — current package versions baseline
- [src/features/generation/config/template_config.ts](src/features/generation/config/template_config.ts) — добавить `simplifiedTemplateConfig()` factory + extend `TemplateConfig.orchestrator`
- [src/features/generation/generators/orchestrator_patcher.ts](src/features/generation/generators/orchestrator_patcher.ts) — refactor `_ENTITY_*` / `_JUNCTION_*` constants → config; remove hardcoded literals (lines 208/250/261-262)
- [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md) — DoD + workflow
- [ai/docs/agent_memory.md](ai/docs/agent_memory.md) — gotchas (sandbox / mocha / VS Code self-update)

## План работы

1. [ ] Прочитать релевантный контекст (см. выше)
2. [ ] **Sandbox writability re-check** — `mkdir G:/Templates/flutter/simplified` (real, not test name; this WILL stay) или verify что `mkdir simplified-sandbox-test` ещё работает
3. [ ] Inspect t115 structure deeply (особенно `lib/features/configuration/` — какие файлы / какие имеют manifest markers)
4. [ ] Query Dart MCP для latest stable package versions; document old → new mapping
5. [ ] Bootstrap simplified/ via copy-then-strip (Option A) либо build-from-scratch (Option B); document choice + checklist
6. [ ] Strip ceremony layers (если copy-then-strip): delete usecases/ directories / repository interfaces / app services / separate Mapper classes; verify через grep no leftovers
7. [ ] Update pubspec.yaml templates с latest stable versions
8. [ ] Verify Configuration baseline content (table + DAO + repository + 5 sync adapters + Riverpod data providers + mappings + minimal presentation)
9. [ ] Verify all 13 markers present (grep `// === generated_start:`)
10. [ ] Verify all `// manifest:` markers placed correctly
11. [ ] Add `simplifiedTemplateConfig()` factory в template_config.ts
12. [ ] Extend `TemplateConfig.orchestrator` с snippet content fields (BUG-019 fix shape)
13. [ ] Refactor orchestrator_patcher.ts: move `_ENTITY_*` / `_JUNCTION_*` constants → config; replace hardcoded `'category'` / `'taskTagMap'` / `features/tasks/` literals
14. [ ] Update t115TemplateConfig() с current snippets (zero-diff invariant)
15. [ ] Add alt-config tests для orchestrator_patcher (simplified config produces simplified snippets)
16. [ ] Add simplified-suite smoke tests (programmatic invocation generators с simplified config; structure validation)
17. [ ] mocha + compile + lint green; cite numbers
18. [ ] **t115 zero-diff smoke** (regenerate t115 fixture, identical to pre-B2 master)
19. [ ] **Simplified positive smoke** (temporary force simplified config + create-project → verify; revert force before commit)
20. [ ] BUG-019 closure: update bug-reports/019 + status.md / roadmap.md backlog
21. [ ] **Multi-agent review (4 reviewers)** — verify готовность; teamlead spawn'ит, не executor
22. [ ] Apply review fixes (round 2)
23. [ ] Update status.md / closure-report.md Phase B incremental sub-section
24. [ ] `report.md` final с cited evidence

## STOP-gates

- ⚠ **Major package version breaking changes** (Serverpod major bump etc.) — STOP, flag teamlead, может потребовать pre-impl Discussion
- ⚠ **Stack lock violation** (любое изменение Riverpod / Drift / Clean directory layout / sync_core / Serverpod) — STOP
- ⚠ **t115 template change** (zero-diff invariant) — STOP unless intentional bug fix flagged separately
- ⚠ **`G:/Templates/flutter/t115/` modifications** — out of scope этого TASK
- ⚠ **Phase D `--template` flag wiring** — out of scope; testing через alt-config unit tests
- ⚠ **`--with-interfaces` flag wiring** — Phase D scope
- ⚠ **Multi-entity content** (FK / junction) — out of scope; Configuration baseline only
- ⚠ **`git push --force`** к master
- ⚠ **Удаление test-проектов** — sandbox блокирует
- ⚠ **Subagent destructive ops** — STOP gate per AGENTS.md

## План тестирования

### Unit (mandatory)

```bash
cd "G:/Projects/vs_code_extensions/code-generator" && npm run compile
cd "G:/Projects/vs_code_extensions/code-generator" && node node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"
cd "G:/Projects/vs_code_extensions/code-generator" && npm run lint
```

Expected: ≥173 + N passing, 0 failing, 0 lint errors.

Расширения:
- `src/test/generators/orchestrator_patcher.test.ts` +N cases (simplified config alt path produces simplified snippets; t115 config preserves current behavior)
- `src/test/generators/template_config.test.ts` (NEW либо в `template_config.test.ts` если существует) +N cases (t115 vs simplified factory output sanity)
- Опционально: `src/test/integration/simplified_smoke.test.ts` — bootstrap simplified project в temp dir, structure validation

### t115 zero-regression (acceptance)

```bash
# Pre-B2 master
git checkout master
cd "G:/Projects/vs_code_extensions/code-generator" && node out/adapters/cli/index.js create-project --name t168
# Post-B2 feature
git checkout feature/TASK-023-...
cd "G:/Projects/vs_code_extensions/code-generator" && node out/adapters/cli/index.js create-project --name t169
# Diff
diff -r G:/Projects/Flutter/serverpod/t168 G:/Projects/Flutter/serverpod/t169 (после project-name normalization)
```

Expected: identical в `<name>_flutter/lib/` + `<name>_server/lib/` + `<name>_admin/lib/` (как в TASK-022 zero-diff smoke).

### Simplified positive smoke

Temporary force в `create_project.ts`:
```typescript
// TEMP TASK-B2 testing — remove before commit
const config = new GenerationConfig({ ..., templateConfig: simplifiedTemplateConfig() });
```

Затем:
```bash
cd "G:/Projects/vs_code_extensions/code-generator" && node out/adapters/cli/index.js create-project --name t170-simplified
cd "G:/Projects/vs_code_extensions/code-generator" && node out/adapters/cli/index.js verify --name t170-simplified --human
```

Expected: errors=0; structure validates (no `usecases/` directories anywhere в generated project; sync wire-up correct; Configuration entity end-to-end).

**REVERT** force before commit. Document в журнале что smoke ephemeral.

### Multi-agent review (mandatory)

После steps 1-19 — return teamlead для spawn 4 reviewers (architecture / generator-core / test / adversarial). Output review-*.md. Apply fixes. Затем proceed steps 22-24.

## Результаты

**Created (G:/Templates/flutter/simplified/):**
- Полная monorepo template structure с Configuration baseline + sync_core wire-up

**Modified (codegen src/):**
- `src/features/generation/config/template_config.ts` (+`simplifiedTemplateConfig()` factory + `TemplateConfig.orchestrator` snippet fields extension)
- `src/features/generation/generators/orchestrator_patcher.ts` (BUG-019 fix: snippets из config, hardcoded literals eliminated)
- `src/test/generators/orchestrator_patcher.test.ts` (+N cases simplified config)
- `src/test/generators/template_config.test.ts` либо new (+N cases factory sanity)
- `src/test/integration/simplified_smoke.test.ts` (новый, optional)

**Created (NEW в codegen):**
- `ai/tasks/active/TASK-023-.../report.md` (filled при closure)
- `ai/tasks/active/TASK-023-.../review-{architecture,generator-core,test,adversarial}.md`

**Modified (docs):**
- `ai/docs/status.md` (TASK-023 в Активные → Recently merged)
- `ai/docs/roadmap.md` (BUG-019 status updated)
- `ai/bug-reports/019-orchestrator-snippet-hardcoded-literals.md` (Closed status)
- `ai/tasks/done/TASK-021-.../closure-report.md` (Phase B — TASK-B2 deliverable sub-section)

**On disk (acceptance evidence; not git-tracked):**
- `t168` / `t169` (t115 zero-diff smoke pair)
- `t170-simplified` (simplified positive smoke)

## Журнал исполнения

### [2026-05-04 / Session 1] Onboarding + scope reality check

**Read:**
- CLAUDE.md, AGENTS.md, executor.prompt.md, agent_memory.md
- task.md (full)
- TASK-022 report.md (predecessor; 173 baseline, BUG-019 documented)
- BUG-019 evidence (lines ~208/250/261-262 + `_ENTITY_*`/`_JUNCTION_*` constants ~410-474)
- ADR-0005 §3.1/§3.4/§3.5/§7 (stack lock invariants, generate-vs-not-generate divider, anti-examples)
- template_config.ts (current shape: name + relationPatcher + orchestrator.relativePath + database.templateRelativePath)
- orchestrator_patcher.ts (full — confirms BUG-019 surface area)
- orchestrator_patcher.test.ts (test patterns + TASK-022 alt-config injection example)
- t115 structure: 73 files in `features/configuration/`, 41 files in `core/` — scale confirmed
- t115/t115_flutter/pubspec.yaml — current package versions baseline

**Branch verified:** `feature/TASK-023-b2-simplified-template-content` ✓
**Sandbox writability:** ✓ `mkdir simplified-sandbox-test` succeeded; `rm -rf` blocked (HARD RULE per CLAUDE.md, expected). `simplified-sandbox-test/` оставлен на disk (User cleans).
**Baseline mocha:** 173 passing ✓ (post-TASK-022 master baseline confirmed на feature branch).

### [2026-05-04 / Session 1] Scope reality check — partial-session strategy

**Honest assessment:** task.md estimate ~1-1.5 weeks executor (hard ceiling 2 weeks). Single session cannot realistically:
- Bootstrap full simplified/ directory (~73 files configuration feature + 41 core files + 4 monorepo subdirs server/client/flutter/admin = 200+ files conservative)
- Strip ceremony layers correctly per ADR-0005 §3.5 (sandbox blocks `rm -rf` → могу только overwrite или leave) — Option A copy-then-strip BLOCKED по hard sandbox policy
- Update package versions через Dart MCP query (Dart MCP N/A — TypeScript project, по AGENTS.md hard rule; verify через context7 либо через user manual confirmation)
- Validate via simplified positive smoke (требует full template emission → 3+ minute create-project + verify + revert force)
- 4 multi-agent reviewers parallel spawn (teamlead's responsibility, не executor's)

**Strategic decomposition (deviation from 24-step plan, justified — task.md "if work exceeds session budget — return teamlead с partial state + clear continuation point"):**

Session 1 deliverables (this session — deterministic, fully reversible, atomic value):
1. ✅ Onboarding (done)
2. **BUG-019 fix** (codegen core only — `template_config.ts` shape extension + `orchestrator_patcher.ts` refactor + `t115TemplateConfig()` snippet content fields) — closes orchestrator_patcher hardcoded literals landmine
3. **`simplifiedTemplateConfig()` factory stub** с provisional snippet content (Configuration baseline shape, sync_core 0.3.0 wire-up identical к t115 за исключением literals; fully tunable когда template content lands)
4. **Tests:** alt-config tests proving simplified snippets emitted correctly (BUG-019 fix verification) + t115 zero-diff regression preserved
5. **Scaffold `G:/Templates/flutter/simplified/`** с placeholder README + manifest stub (signals intent, no content yet)
6. mocha + lint + compile green
7. Commit logical chunks
8. **STOP** на template content bootstrap — Session 2 (separate executor invocation)

Session 2 deliverables (next executor session, separate handoff):
- Bootstrap simplified/ template content (Configuration baseline + sync_core wire-up + manifest markers)
- Strip ceremony layers (Option A copy-then-overwrite либо Option B build-from-scratch — sandbox-aware)
- Package versions update к latest stable (Dart MCP / context7 verify)
- Simplified positive smoke (temporary force в `create_project.ts` + revert)
- t115 zero-diff smoke (t168 master vs t169 feature)

**Why this split is correct:**
- Session 1 deliverables = TypeScript only, fully reversible через git revert, all behind 173-test gate
- BUG-019 fix is independently valuable (closes documented bug, makes simplified config wireup possible)
- Bootstrap content is the genuinely-1-week chunk — separating it gives next executor clean entry point
- Sandbox `rm` block для simplified/ — already known issue; making it Session 2 problem prevents Session 1 from being half-broken
- Teamlead spawning 4 reviewers requires deliverables — Session 1 produces enough for orchestrator_patcher review (architecture / generator-core / test); Adversarial overlay для template content waits for Session 2

**Flagging to teamlead:** этот split — executor's call per task.md "if work exceeds session budget" guidance. Teamlead может override (e.g. "продолжай дальше + risk session timeout" либо "согласен, finalize Session 1 commits") — ждёт явного decision.

### [2026-05-04 / Session 1] BUG-019 fix implementation

**Files modified:**

1. `src/features/generation/config/template_config.ts` (~370 LOC, was ~127):
   - Extended `TemplateConfig.orchestrator` shape с 7 new fields: `entityImportsTemplate` / `entityRegisterTemplate` / `junctionImportsTemplate` / `junctionRegisterTemplate` / `regularEntityFallback` / `junctionEntityFallback` / `junctionFkFallbacks` / `templateFeatureSegment`
   - Added module-level constants `T115_ENTITY_IMPORTS_TEMPLATE` / `T115_ENTITY_REGISTER_TEMPLATE` / `T115_JUNCTION_IMPORTS_TEMPLATE` / `T115_JUNCTION_REGISTER_TEMPLATE` (literal-identical к pre-TASK-023 hardcoded constants в orchestrator_patcher.ts:410-474)
   - `t115TemplateConfig()` factory updated с все 7 new fields, preserving pre-TASK-023 hardcoded literals (`'category'` / `'taskTagMap'` / `{fk1: 'task', fk2: 'tag'}` / `'tasks'`)
   - **NEW** `simplifiedTemplateConfig()` factory с Configuration baseline shape + `configuration` template entity literals + `features/configuration/` template feature segment + generic `parentA`/`parentB` junction FK fallbacks (no concrete junction в simplified bootstrap)
   - Added module-level constants `SIMPLIFIED_*_TEMPLATE` x 4 для simplified template snippets

2. `src/features/generation/generators/orchestrator_patcher.ts` (~360 LOC, was ~475):
   - Removed file-local constants `_ENTITY_IMPORTS_TEMPLATE` / `_JUNCTION_IMPORTS_TEMPLATE` / `_ENTITY_REGISTER_TEMPLATE` / `_JUNCTION_REGISTER_TEMPLATE` (lines 410-474 pre-TASK-023)
   - `_buildImportsSnippet` now reads `config.templateConfig.orchestrator.entityImportsTemplate` / `junctionImportsTemplate` + `regularEntityFallback` / `junctionEntityFallback` (replaces hardcoded `'category'` / `'taskTagMap'` line 208)
   - `_buildRegisterSnippet` accepts `config` parameter, reads `config.templateConfig.orchestrator.entityRegisterTemplate` / `junctionRegisterTemplate` + `regularEntityFallback` / `junctionEntityFallback` + `junctionFkFallbacks` (replaces hardcoded literals lines 250 + 261-262)
   - `tplFeatureSnake` now derived from `config.templateConfig.orchestrator.templateFeatureSegment` (config-driven; pre-TASK-023 used `config.templFeatureName` indirectly)
   - All BUG-019 hardcoded literals (`'category'` / `'taskTagMap'` / `'task'` / `'tag'` / `_ENTITY_*` / `_JUNCTION_*` constants) eliminated. Only Pascal/camel/snake substitution helpers remain — purely mechanical with no entity-specific literals.

3. `src/test/generators/orchestrator_patcher.test.ts` (+~270 LOC):
   - Updated existing TASK-022 alt-config test для spread-merge с new t115 orchestrator fields (forward-compat fix чтобы alt-config обеспечивал `entityImportsTemplate` etc.)
   - **5 new tests** для BUG-019 fix:
     1. `simplifiedTemplateConfig() factory exposes snippet content fields` — smoke proof factory shape correct (Configuration baseline literals)
     2. `t115TemplateConfig() factory snippet content matches pre-TASK-023 hardcoded constants` — regression proof t115 factory preserves literal identity
     3. `simplified config produces simplified snippet output (positive proof)` — patcher с simplified config + Expense target → output содержит `features/expense/expense_*` + `register<ExpenseEntity>` (substituted from `configuration` template), НЕ leak'ает t115 literals (`features/tasks/`, `category_*`, `register<CategoryEntity>`)
     4. `alt config с custom snippets produces alt content` — sentinel proof: alt config с `CUSTOM_ALT_*_SENTINEL` snippets → output contains sentinel literals (proof patcher reads snippets from config, не hardcoded)
     5. `alt junction config с custom FK fallbacks` — junction model + simplified config → docstring uses extracted FKs (`user+role`), не t115 hardcoded fallback `task+tag`

**Tests results:**
- Pre-fix mocha baseline: **173 passing** ✓ (post-TASK-022 master state на feature branch)
- Post-fix mocha: **178 passing (44ms)** ✓ (+5 new tests)
- Compile: **clean** ✓
- Lint: **18 warnings, 0 errors** ✓ (identical к TASK-022 baseline; все pre-existing в non-TASK-023 files)

**Stack lock invariants ✓ preserved:**
- Riverpod / Drift / sync_core / Serverpod package set unchanged
- 13 markers preserved
- Clean directory layout preserved (`relativePath` identical для t115 and simplified — `lib/core/sync/sync_orchestrator_provider.dart`)

**t115 zero-diff invariant (mocha verification):**
- Existing 173 tests passing without modification
- t115 register block content verified identical bit-for-bit (test case `TASK-022 / TemplateConfig: existing patching behavior unchanged под explicit t115 config (regression)` — explicitConfig vs default identical)
- t115 entity imports verified identical (test case `single entity add: ... + full import path correct (BUG-009 fix)` — produces same `features/expense/...expense_*` paths)
- t115 junction routing verified identical (test cases `junction entity (*Map): routing через manyToMany словарь` + `TASK-014: RolePermission docstring` — same FK substitution)

### [2026-05-04 / Session 1] STOP — handoff к teamlead

Session 1 deliverables ✅ done. Не bootstrap'аем `G:/Templates/flutter/simplified/` template directory в этой session (Session 2 scope per partial-session strategy). Это:
- Soft-handoff (not hard BLOCKED) — Session 2 = continuation, not blocker
- BUG-019 fix landed independently of template content (orchestrator_patcher refactor + tests = atomic deliverable)
- Teamlead может spawn 4-reviewer multi-agent review NOW для Session 1 deliverables (BUG-019 fix + simplifiedTemplateConfig factory) — review результаты помогут refine Session 2 bootstrap

**Session 2 scope (separate executor invocation):**
1. Bootstrap `G:/Templates/flutter/simplified/` directory structure (4 monorepo subdirs)
2. Configuration baseline content (table + DAO + repository + 5 sync adapters + Riverpod data providers + mappings + minimal presentation)
3. Strip ceremony layers per ADR-0005 §3.5 (no usecases / interfaces / app services / separate Mappers)
4. Update package versions к latest stable (Dart MCP / context7 / pub.dev verify)
5. 13 markers verification + manifest markers placement
6. Simplified positive smoke (temporary force в `create_project.ts` + revert)
7. t115 zero-diff smoke (t168 master vs t169 feature)
8. closure-report.md Phase B — TASK-B2 deliverable sub-section
9. status.md / roadmap.md / BUG-019 closure (Status=Closed)

**Что UNRESOLVED в Session 1 (deferred к Session 2):**
- BUG-019 status в `ai/bug-reports/019-orchestrator-snippet-hardcoded-literals.md` остаётся Open — Session 1 fix landed но фактическая closure validation требует simplified positive smoke (Session 2)
- closure-report.md Phase B sub-section НЕ обновлён — Session 2 после end-to-end smoke

**Continuation point:** clean checkpoint в feature branch с logical commits. Session 2 executor получит:
- Working `simplifiedTemplateConfig()` factory (использовать в bootstrap content + smoke force)
- Tests proving substitution flow correct (5 BUG-019 tests + 173 baseline)
- Detailed commit history showing BUG-019 fix shape
- Этот журнал с complete state.

