# Отчёт TASK-022 — B1 codegen core multi-template infrastructure

## Резюме

Реализована multi-template infrastructure в codegen core: `TemplateConfig` interface + `t115TemplateConfig()` factory, расширение `GenerationConfig.templateConfig` (default = t115), refactor 3 generators (`RelationPatcher` / `OrchestratorPatcher` / `AppDatabaseGenerator`) для config-driven literals/paths вместо hardcoded values. Backwards compat preserved через default factory в constructor — все existing call-sites работают unchanged.

## Изменения

| Файл | Тип | Описание |
|---|---|---|
| `src/features/generation/config/template_config.ts` | NEW (~127 LOC) | Interface + t115 factory с literal values от pre-refactor master state; `name: 't115' \| 'simplified'` union (TASK-B2 readiness, H1 review fix) |
| `src/features/generation/config/generation_config.ts` | MODIFIED (+22 LOC) | `templateConfig` field, default = `t115TemplateConfig()` через constructor |
| `src/features/generation/generators/relation_patcher.ts` | MODIFIED (+13 LOC) | 4 literals из config (lines ~21-23, ~39) + bonus fix line ~136 (`'category'` → `templateRelatedEntity` variable, missed literal в `_getDestinationPath` call) |
| `src/features/generation/generators/orchestrator_patcher.ts` | MODIFIED (+8 LOC) | Path components из config (lines ~45-48); snippet template literals — TASK-B2 scope (BUG-019 documented) |
| `src/features/generation/generators/app_database_generator.ts` | MODIFIED (+9 LOC) | Template path из config (lines ~25-28) |
| `src/test/generators/relation_patcher.test.ts` | MODIFIED (+~190 LOC) | +4 cases (regression t115-equivalent / alt-config negative-only / **alt-config positive-path H4 review fix** / explicit-t115 equivalence regression) |
| `src/test/generators/orchestrator_patcher.test.ts` | MODIFIED (+97 LOC) | +3 cases (default config / alt path positive-path / explicit-t115 equivalence) |
| `src/test/generators/app_database_generator.test.ts` | MODIFIED (+117 LOC) | +3 cases (default config / alt template path positive-path freshMock / explicit-t115 equivalence) — 11 universal cases regression preserved |
| `ai/docs/status.md` | MODIFIED | TASK-022 в Активные задачи + BUG-019 в backlog |
| `ai/docs/roadmap.md` | MODIFIED | BUG-019 row в Track 4 backlog table |
| `ai/tasks/active/TASK-022-.../task.md` | MODIFIED (+275 LOC round 1, +N round 2) | Полный scope + План работы + STOP-gates + Журнал исполнения |
| `ai/tasks/done/TASK-021-.../closure-report.md` | MODIFIED | Incremental Phase B — TASK-B1 deliverable sub-section (D1 review fix) |
| `ai/bug-reports/019-orchestrator-snippet-hardcoded-literals.md` | NEW | TASK-B2 landmine documentation (HIGH H3 review fix) |

## Тесты

**Mocha workaround (CI command):**

```
cd code-generator && node node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"
→ 173 passing (45ms)
```

- Baseline pre-B1 master: **163 passing** (verified independently на master checkout — Test reviewer confirmation в review-test.md)
- Post-B1 round 1: **172 passing** (44-46ms за 3 independent runs)
- Post-B1 round 2: **173 passing** (45ms — после H4 alt-config positive-path test добавлен)
- Stability: 3 independent runs identical — no race / order-dep
- 0 failing, 0 skipped, 0 pending, 0 .only

**+10 unit tests общий total** (round 1: +9; round 2: +1 H4 positive-path):

- `relation_patcher.test.ts`: t115 config produces hardcoded-equivalent literals / alt config negative-only / **alt config positive-path** (H4) / regression equivalence with explicit t115 config
- `orchestrator_patcher.test.ts`: default config orchestrator path constructed from config / alt path routes к alt target (positive proof) / behavior unchanged под explicit t115
- `app_database_generator.test.ts`: template database path from config / alt path reads alt template (freshMock pattern) / 11 universal cases passing с t115 config (regression preserved per Open Q #3)

**Per-generator counts (verified Test reviewer):**

| Generator | Master | Branch | Delta |
|---|---|---|---|
| `relation_patcher.test.ts` | 12 | 16 | +4 |
| `orchestrator_patcher.test.ts` | 16 | 19 | +3 |
| `app_database_generator.test.ts` | 11 | 14 | +3 |

**Lint:**

```
npm run lint
→ ✖ 18 problems (0 errors, 18 warnings)
```

Master baseline identical (Test reviewer independent verify): 18 warnings все pre-existing в файлах не-TASK-022 scope (`add_microservice/index.ts`, `openapi_parser.ts`, `server_yaml_parser.ts`, etc.).

**Compile:**

```
npm run compile
> tsc -p ./
(clean exit)
```

**Verify smoke на t165 (round 1):**

```
node out/adapters/cli/index.js verify --name t165 --human
→ PASS: verify t165
    ✓ flutterAnalyze — 35895ms (errors=0, warnings=1, infos=44)
    ✓ pubGet — 5433ms
    ✓ serverpodGenerate — 9535ms
    ✓ buildRunner — 4290ms
Total: 55154ms
```

**Zero-diff smoke (TASK-B1 specific acceptance per ClaudeAdv DEAL-BREAKER #3):**

Procedure: `create-project --name t166` на pre-B1 master + `create-project --name t167` на feature/TASK-022 branch → copy directories → sed normalize project name (t167→t166) → `diff -r --strip-trailing-cr`.

Result: **zero diff в `t166_flutter/lib/`**, **`t166_server/lib/`**, **`t166_admin/lib/`** после CRLF + project-name normalization. Remaining diffs только в platform scaffolding (kotlin com.example dirs, ios/macos pbxproj UUIDs, `.env` random tokens, `.flutter-plugins-dependencies` timestamps, platform CMakeLists, web/index.html) — generated by upstream `flutter create` / `serverpod create`, не codegen.

Adversarial reviewer fact-check (review-adversarial.md): "diff -r --brief t166/lib t167/lib shows 24 differing files. After sed s/t166/t167/g + CRLF strip on samples (database.dart / main.dart / app.dart / sync_queue_table.dart) — all collapse to project-name diffs only. Normalization legitimate (each project has own name embedded in code)" — **verified ✅**.

**Sandbox writability check** (early step, ClaudeAdv HIGH #2):

```powershell
New-Item -ItemType Directory -Path "G:/Templates/flutter/simplified-sandbox-test" -Force
Test-Path "G:/Templates/flutter/simplified-sandbox-test"  # → True
Remove-Item "G:/Templates/flutter/simplified-sandbox-test" -Recurse -Force
Test-Path "G:/Templates/flutter/simplified-sandbox-test"  # → False
```

**Result:** writable, no STOP. TASK-B2 location confirmed accessible.

## Multi-agent review (4 reviewers, Discussion #11 Q10=b)

| Reviewer | Verdict | Catch |
|---|---|---|
| Architecture | Approve with fixes | 0 CRIT / 1 HIGH / 3 MED / 3 LOW |
| Generator-core | Approve with required fix | 0 CRIT / 2 HIGH / 3 MED / 3 LOW |
| Test | APPROVE | 0 CRIT / 0 HIGH / 3 MED / 3 LOW (fact-check verified all claims — no fabrication) |
| Adversarial | Request changes → Approve after fixes | 1 DEAL-BREAKER / 3 HIGH / 2 MED |

**Catch rate threshold ✓ exceeded:** 28 findings total, 1 DEAL-BREAKER + 4 HIGH applied (round 2).

Review files: `review-architecture.md` / `review-generator-core.md` / `review-test.md` / `review-adversarial.md` в TASK папке.

### Applied fixes (round 2)

| ID | Source | Fix |
|---|---|---|
| D1 | Adversarial DEAL-BREAKER DB-1 | closure-report.md incremental Phase B — TASK-B1 deliverable sub-section (artefact list / test count delta / verify smoke result / zero-diff evidence) |
| H1 | Architecture HIGH H1 | `template_config.ts` `name: 't115' \| 'simplified'` union expansion (per task.md spec line 71) |
| H2 | Generator-core HIGH H1 + Architecture LOW L3 + Adversarial HIGH H-1 | report.md filled с cited CLI выводами (этот файл) |
| H3 | Generator-core HIGH H2 + Adversarial HIGH H-3 | NEW `ai/bug-reports/019-orchestrator-snippet-hardcoded-literals.md` documenting TASK-B2 landmine + roadmap.md / status.md backlog rows |
| H4 | Adversarial HIGH H-2 | `relation_patcher.test.ts` alt-config positive-path test (создаёт alt fixture с alt entity name + alt marker block, verifies alt marker блок записан в dest — proof что patcher REALLY reads templateMainEntity / markerName из config, не hardcoded) |

### Deferred к TASK-B2 / backlog (MEDIUM/LOW)

- Discriminator field `name` runtime-dead (Architecture M1) — TASK-B2 решает (drop OR add usage, depends на runtime dispatch decision)
- Template defaults (`'tasks'`/`'category'`/`'task'`/`'tag'`) в `GenerationConfig` constructor (Architecture M2) — TASK-B2 work либо separate config refactor
- `app_database_generator` target write path asymmetric (Architecture M3) — capacity-bound symmetry fix; OK для B1 т.к. Clean directory layout stack-locked
- `scanDirectories` field never exercised alt-config'ом (Test M2) — partially addressed by H4 alt-config (alt config с alt scanDirectories ['feature/', 'server/'] same as t115; full alt scan dirs deferred к TASK-B2)
- TDD-first ordering not auditable from squashed commits (Test M3 + Adversarial M-1) — future TASK practice: separate test commits до refactor commits
- "170 baseline" wording в round 1 journal misleading (Adversarial M-2) — clarified здесь: actual master baseline = 163, "170 passing / 2 failing" = post-test-add / pre-refactor state (163 + 9 new tests, 7 immediately green, 2 red until refactor)

## Риски / Заметки

- **TASK-B2 landmine documented** (BUG-019): orchestrator_patcher snippet templates содержат hardcoded entity literals (`'category'` / `'taskTagMap'` lines ~208/~250, `'task'` / `'tag'` lines ~261-262, `_ENTITY_*_TEMPLATE` / `_JUNCTION_*_TEMPLATE` lines ~410-474). Не блокирует TASK-B1 closure (out of B1 scope per task.md acceptance line 49 — path-only), но требует addressing в TASK-B2 acceptance (extend `templateConfig.orchestrator` shape с entityTemplate / junctionTemplate / fallback fields). Полная spec в `ai/bug-reports/019-orchestrator-snippet-hardcoded-literals.md`.
- **Stack lock invariants ✓ preserved:** zero changes to Riverpod / Drift / markers (13) / Clean directory layout / sync_core / Serverpod. `git diff master..HEAD --stat` confirms changes confined к `src/features/generation/{config,generators}/*` + `src/test/generators/*` + docs.
- **Backwards compat ✓:** все existing call-sites unchanged благодаря default factory в constructor (`templateConfig: config.templateConfig || t115TemplateConfig()`). 16 `new GenerationConfig(...)` call-sites verified Adversarial reviewer — все используют object literal pattern, optional field безопасно extension.
- **Bonus fix line ~136 в relation_patcher.ts**: missed literal `templEntity: 'category'` в `_getDestinationPath(new GenerationConfig({ ...config, templEntity: 'category' }), ...)` call → substituted на `templateRelatedEntity` variable (already extracted from config line ~22). Identical поведение для t115 (config supplies `'category'` per t115TemplateConfig factory). Closes incomplete refactor который иначе оставил бы hidden hardcoded literal в same generator. Existed в master pre-refactor (verified Generator-core reviewer + Adversarial reviewer).

## Статус

Ready for review approval + merge.

- @TeamLead ✅ 2026-05-04 (post review fixes apply)
- @User ⏳ pending merge approval
