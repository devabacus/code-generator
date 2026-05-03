# Test inventory audit (TASK-021 / Initiative Phase A / Sub-A4)

**Status:** 🟢 Living document
**Maintained until:** Phase G doc reconciliation (end of Initiative)
**Updated:** 2026-05-03 (initial)

## Changelog

**Entry policy:**
- **Mandatory:** any (file, category, action) tuple change; new test file added; test file deleted; recount of cases per file.
- **Optional:** fixture refactor without action change (note in commit, not changelog).
- **Format:** `YYYY-MM-DD | short summary | Author handle`. Re-categorization format: `<file>: <old_action> → <new_action> (<reason>)`.

| Date | Change | Author |
|------|--------|--------|
| 2026-05-03 | Initial categorization (18 test files / 164 test cases, 5 actions) per Discussion #10 Q4=b heuristic + manual edge review | Sub-A4 executor |
| 2026-05-03 | Sub-A5 fix: keep-universal cases corrected 124 → 128 (4-case undercount caught by Test reviewer + Adversarial). Total math 160 → 164. Distribution prose line 30 corrected (3 t115 / 1 rewrite / 1 delete vs prior 2/3/0 swap). | TeamLead Claude (post-Sub-A5) |
| 2026-05-03 | Sub-A5 fix: app_database_generator.test.ts rationale qualified (universal verdict conditional on simplified preserving Clean directory hierarchy). Open Q #3 added (directory layout dependency, Phase B prototype resolves). | TeamLead Claude (post-Sub-A5) |

## Метод и единица учёта

- **Единица аудита** — test файл (`*.test.ts`), не отдельный `it/test()`. CI 3-suite split (TASK-CI-001) и template routing работают на уровне файла; внутри одного файла все cases разделяют setup, fixtures и mock infrastructure → split mid-file = artificial overhead.
- **5 actions** per Discussion #10 Q4 (ClaudeN + Chatgpt_1 consensus):
  - `keep-universal` — runs both templates (t115 + simplified). Universal infrastructure: parsers, dictionaries, services, utils, verify CLI.
  - `keep-t115-legacy` — t115-specific behavior (Clean markers, 7-layer wire-up, usecases). Stays в t115 maintenance suite.
  - `port-simplified` — same concept needed for simplified, requires adaptation due to architectural difference.
  - `rewrite-for-template-abstraction` — refactor для template-agnostic (parametrize fixtures, decouple от specific markers/paths).
  - `delete-obsolete` — Clean-only test без replacement need в simplified.
- **Heuristic boundaries** per Claude_1 (Discussion #10 #312):
  - Universal: `src/test/parsers/`, `src/test/replacement/`, `src/test/services/`, `src/test/utils/`, `src/test/verify/`
  - Clean-specific: `relation_patcher.test.ts`, `orchestrator_patcher.test.ts`
  - Edge (manual review): `app_database_generator.test.ts`, `section_replacer.test.ts`, `generation_service.test.ts`, `relation_generation.test.ts`
- **Discovery:** `find src/test -name "*.test.ts" | sort` — 18 файлов / 164 test cases (≈ "163 baseline" в Discussion #10 — счёт включал extension.test.ts boilerplate).
- **Test case counting tool:** `grep -c "^\s*\(it\|test\)(" <file>` — sum across 18 files = 164 cases (independently verified). Use this command для repro и future appendings.

## Preliminary findings для Sub-A1 backend strategy decision

**Distribution insight:** 13 файлов (72%) `keep-universal` / 3 файла (17%) `keep-t115-legacy` / 1 файл (6%) `rewrite-for-template-abstraction` / 1 файл (6%) `delete-obsolete` / 0 `port-simplified`.

**Preliminary count для Sub-A1 consumption (deferred analysis к [backend-strategy-rationale.md](backend-strategy-rationale.md)):** 78% cases / 72% files остаются universal (включая Drift table generation, junction detection, parser, replacement dictionary, sync orchestrator marker contract). Clean-specific остаток (OrchestratorPatcher + RelationPatcher с 7-marker pattern + Clean usecase EOF placement) изолирован в 3 файла. Backend strategy implications — см. rationale.md.

**Caveat для Sub-A1:** distribution считает только existing tests. Simplified template принесёт **новые** tests (Riverpod data providers generation + simplified DAO/Repository wire-up + simplified marker contract если будет отличаться) — Phase B-D будут добавлены в этот living document.

## Observations / open questions для TeamLead

1. **`extension.test.ts` — VS Code stub.** 1 placeholder test (`assert.strictEqual(-1, [1,2,3].indexOf(5))`), не относится к генератору. Помечен `delete-obsolete` независимо от template — тех долг, не Phase B work. Можно вынести в backlog отдельным cleanup TASK или чекнуть прямо в Phase B.
2. **`generation_service.test.ts` — fixtures вяжут к Clean (`feature/data/adapters/...`, `feature/domain/entities/...`).** Сама path-rewrite логика `_getDestinationPath` универсальна (template path → target path string transform с junction-aware substitution). Но fixtures используют Clean directory layout. Action `rewrite-for-template-abstraction` — параметризовать fixtures за `templateLayout` чтобы covered обоих templates.
3. **`relation_generation.test.ts` (BUG-012 snake_case path normalization)** — universal helper `generateDriftTableImports` produces import lines `import 'X_table.dart';`. Drift table generation в **обоих** templates per ADR-0005 generate-side divider. **`keep-universal`**.
4. **`app_database_generator.test.ts` + `section_replacer.test.ts`** — markers `GENERATED_*` and `:syncImports/:syncEntityTypes/:syncRegistrations` это **sync_core orchestrator wiring contract**, НЕ Clean-specific. Оба template сохранят эти markers (sync_core requires registration). **`keep-universal`**.
5. **`relation_patcher_top_level_placement.test.ts` (BUG-013 EOF placement для usecases)** — RelationPatcher infrastructure универсальна (heuristic isBlockInClass), но fixtures и regression context exclusively о usecases (Clean's domain layer, simplified удаляет per ADR-0005). Action `keep-t115-legacy` — bug regression не релевантен для simplified, перерайтнуть требует изобрести fictional top-level non-usecase scenario (artificial). Decision rationale: keep test at t115 suite, не блокирует simplified; если в Phase B-D появится top-level EOF marker scenario для simplified — добавить отдельный test параллельно.
6. **Open question #1 (low priority):** RelationPatcher как механизм будет ли вообще использоваться в simplified template? Если simplified не использует marker-patching (только разовая generation без regen), оба `relation_patcher.test.ts` + `relation_patcher_top_level_placement.test.ts` остаются строго в t115 suite. Phase B prototype покажет.
7. **Open question #2 (low priority):** Если ADR-0005 решает что simplified тоже будет использовать `OrchestratorPatcher` (для multi-entity registration в `SyncOrchestrator`), то `orchestrator_patcher.test.ts` фикстуры могут потребовать `port-simplified` adaptation (DI chain `ConfigurationLocalApply(ConfigurationDao(dbService))` адаптировать под simplified DI стиль). Сейчас categorize как `keep-t115-legacy` — Phase B-D resolve.
7a. **Open question #3 (medium priority — added Sub-A5 fix):** Сохранит ли simplified template directory layout `lib/features/<feature>/data/datasources/local/tables/<entity>_table.dart` + `lib/core/sync/sync_queue_table.dart`? `app_database_generator.ts` (line 105 + 116) hardcodes scan paths под t115 Clean convention. Если simplified flatten к `lib/features/<entity>/<entity>_table.dart` или `lib/sync/`, BUG-008/D7/G1 regression coverage в `app_database_generator.test.ts` (11 cases) требует **`rewrite-for-template-abstraction`** (parametrize `tableScanPath` config). Phase B prototype resolve. **Текущий verdict `keep-universal` валиден ТОЛЬКО при сохранении t115 directory hierarchy.**
8. **No `port-simplified` or `delete-obsolete` actions assigned для existing tests.** `delete-obsolete` reserved для Phase B-D когда simplified prototype выявит tests которые однозначно не релевантны (сейчас precaution — никакая категория не очевидно obsolete). `port-simplified` появится когда simplified template добавит specific behaviour, требующий нового кода покрытия (вне scope Phase A).

## Action distribution

| Action | Count | % of 18 files | Test cases | % of 164 |
|--------|-------|---------------|------------|----------|
| `keep-universal` | 13 | 72% | 128 | 78% |
| `keep-t115-legacy` | 3 | 17% | 31 | 19% |
| `port-simplified` | 0 | 0% | 0 | 0% |
| `rewrite-for-template-abstraction` | 1 | 6% | 4 | 2% |
| `delete-obsolete` | 1 | 6% | 1 | 1% |
| **Total** | **18** | **100%** | **164** | **100%** |

**Math check:** 128 universal + 31 t115-legacy + 0 port + 4 rewrite + 1 delete-obsolete = 164 cases. ✅ Все 164 cases покрыты, distribution arithmetically clean.

**Note (Sub-A5 fix 2026-05-03):** Initial Sub-A4 audit showed `keep-universal = 124 cases / 76%` — Sub-A5 Test reviewer + Adversarial overlay caught 4-case undercount. Actual sum from per-file Cases column (sum 11+6+6+5+8+20+6+15+15+6+7+14+9 = 128 cases). Distribution recomputed; all downstream references (Sub-A1 rationale.md + ADR-0005 Section 5) updated to **78% cases / 72% files universal**.

## (file, category, action) tuple table

| Test file | Category | Action | Cases | Rationale |
|-----------|----------|--------|-------|-----------|
| [extension.test.ts](src/test/extension.test.ts) | boilerplate | `delete-obsolete` | 1 | VS Code scaffold stub (`assert.strictEqual(-1, [1,2,3].indexOf(5))`), не tests генератор. Тех долг, удалить независимо от template. |
| [generators/app_database_generator.test.ts](src/test/generators/app_database_generator.test.ts) | universal (conditional) | `keep-universal` | 11 | Drift `AppDatabase` scan-based table wiring + `GENERATED_IMPORTS/TABLES/MIGRATION` markers. Markers — sync_core infrastructure contract, оба template используют. **Caveat:** `app_database_generator.ts:105+116` hardcodes scan path к Clean `data/datasources/local/tables/` + fixtures используют тот же layout. Universal verdict **conditional** — действителен ТОЛЬКО если simplified template сохранит директорную иерархию. Если нет — `rewrite-for-template-abstraction` (parametrize `tableScanPath`). См. Open question #3. |
| [generators/generation_service.test.ts](src/test/generators/generation_service.test.ts) | edge | `rewrite-for-template-abstraction` | 4 | `_getDestinationPath` junction-aware path rewrite (TASK-014 regression). Логика универсальна, но fixtures используют Clean layout (`feature/data/adapters/`, `feature/domain/entities/`). Параметризовать fixtures за `templateLayout` для cover обоих templates. |
| [generators/orchestrator_patcher.test.ts](src/test/generators/orchestrator_patcher.test.ts) | Clean-specific | `keep-t115-legacy` | 16 | Phase C orchestrator wire-up patcher; fixtures используют Clean DI chain (`ConfigurationLocalApply(ConfigurationDao(dbService))`) + Clean directory paths (`features/configuration/data/adapters/`, `features/configuration/domain/entities/`). Simplified возможно использует другой DI/wiring — Phase B-D resolve (open question #2). Сейчас t115-only. |
| [generators/python_endpoint_generator.test.ts](src/test/generators/python_endpoint_generator.test.ts) | universal | `keep-universal` | 6 | Python microservice endpoint generation для Serverpod backend. Не зависит от Flutter template (только backend integration). |
| [generators/relation_generation.test.ts](src/test/generators/relation_generation.test.ts) | edge → universal | `keep-universal` | 6 | `generateDriftTableImports` produces `import 'X_table.dart';` для FK references. Drift tables генерируются в обоих templates per ADR-0005 generate-divider. Snake_case normalization (BUG-012) — universal helper, никаких Clean fixtures. |
| [generators/relation_patcher.test.ts](src/test/generators/relation_patcher.test.ts) | Clean-specific | `keep-t115-legacy` | 12 | RelationPatcher с `:base / :oneToManyMethods` markers, fixtures используют Clean DAO directory layout (`data/datasources/local/daos/<entity>/<entity>_dao.dart`). t115's 7-marker dependency. Открытый вопрос #1: использует ли simplified RelationPatcher вообще. |
| [generators/relation_patcher_top_level_placement.test.ts](src/test/generators/relation_patcher_top_level_placement.test.ts) | Clean-specific | `keep-t115-legacy` | 3 | BUG-013 regression: top-level EOF marker placement для **usecases** (Clean's domain layer). Simplified удаляет usecases per ADR-0005. RelationPatcher infrastructure универсальна, но bug context exclusively Clean. Не блокирует simplified. |
| [generators/section_replacer.test.ts](src/test/generators/section_replacer.test.ts) | edge → universal | `keep-universal` | 5 | `SectionReplacer` no-op behavior для sync orchestrator markers (`:syncImports`, `:syncEntityTypes`, `:syncRegistrations`). Markers — sync_core infrastructure contract; оба template сохраняют. Тест проверяет separation of concerns между SectionReplacer и OrchestratorPatcher — universal. |
| [parsers/entity_yaml_validator.test.ts](src/test/parsers/entity_yaml_validator.test.ts) | universal | `keep-universal` | 8 | Validation Serverpod YAML entities. Парсинг универсален, не template-specific. |
| [parsers/junction_detector.test.ts](src/test/parsers/junction_detector.test.ts) | universal | `keep-universal` | 20 | TASK-013 junction detection через `JunctionDetector.isJunctionEntity()`. Универсальный парсер, шейринг между templates. |
| [parsers/openapi_parser.test.ts](src/test/parsers/openapi_parser.test.ts) | universal | `keep-universal` | 6 | OpenAPI 3.x parser для Python endpoint integration. Не зависит от Flutter template. |
| [parsers/server_yaml_parser.test.ts](src/test/parsers/server_yaml_parser.test.ts) | universal | `keep-universal` | 15 | TASK-016 / BUG-012 — parsing `relation(parent=X)`, snake → lowerCamel, junction snake-snake. Универсальный парсер. |
| [replacement/replacement_util.test.ts](src/test/replacement/replacement_util.test.ts) | universal | `keep-universal` | 15 | `getDictionaryRules` (ENTITY/PROJECT/FEATURE) — replacement substitution rules для template → target rewrite. Универсальная инфраструктура, оба template используют. |
| [services/project_bootstrapper.test.ts](src/test/services/project_bootstrapper.test.ts) | universal | `keep-universal` | 6 | `patchPubspecPackagePaths` для Phase D path-dep adjustments (sync_core in-monorepo и out-of-monorepo). Универсальный pubspec helper. |
| [services/template_service.test.ts](src/test/services/template_service.test.ts) | universal | `keep-universal` | 7 | `TemplateService.scanTemplates` — discovery шаблонов в `/templates/` directory. Universal infrastructure (multi-template plurality enabler — будет использовано simplified template). |
| [utils/text_util.test.ts](src/test/utils/text_util.test.ts) | universal | `keep-universal` | 14 | `snakeToLowerCamelCase` helper edge cases (TASK-016 / BUG-012). Universal text util. |
| [verify/verify_analyzer_parser.test.ts](src/test/verify/verify_analyzer_parser.test.ts) | universal | `keep-universal` | 9 | `parseAnalyzerCounts` для verify CLI command (Flutter analyze output parser). Universal CLI helper, оба templates verified одной командой. |

## CI 3-suite split mapping (для TASK-CI-001 future)

Per Discussion #10 #38 + decision matrix t115 + simplified + universal suites:

- **`universal-suite`** (13 файлов / 128 cases): runs на всех PR независимо от template. `app_database_generator`, `section_replacer`, `relation_generation`, `python_endpoint_generator`, parsers/* (`entity_yaml_validator`, `junction_detector`, `openapi_parser`, `server_yaml_parser`), `replacement/replacement_util`, services/* (`project_bootstrapper`, `template_service`), utils/`text_util`, verify/`verify_analyzer_parser`.
- **`t115-legacy-suite`** (3 файла / 31 cases): runs на t115 fixture / template change. `orchestrator_patcher`, `relation_patcher`, `relation_patcher_top_level_placement`.
- **`simplified-suite`** (0 файлов сейчас, populates в Phase B-D): новые test files появятся когда simplified template prototype добавит generation logic вне universal scope.
- **Bridge (`rewrite-for-template-abstraction`)** (1 файл / 4 cases): `generation_service.test.ts` после Phase B refactor → universal-suite (parametrized fixtures cover both templates).
- **Removed** (1 файл / 1 case): `extension.test.ts` deleted → not in any suite.

**Phase B-D pre-condition before CI 3-suite split actually wired:** ≥1 simplified-suite test file exists и `generation_service.test.ts` refactored. Если 0 simplified tests + bridge не tackled — single suite остаётся optimal (split overhead > maintenance benefit).

## Phase B-D actionable backlog

Decoupled from Phase A scope, для future work:

1. **Cleanup:** Delete `extension.test.ts` (низкий приоритет, может быть в любом cleanup PR).
2. **Phase B refactor:** `generation_service.test.ts` — параметризовать fixtures за `templateLayout`, decouple от Clean paths. Effort: 1-2 hours.
3. **Phase B-D add:** Simplified template tests (TBD после prototype):
   - Riverpod data providers generation (если в scope ADR-0005 generate-side)
   - Simplified DAO/Repository wire-up (если использует другой DI стиль чем t115)
   - Simplified marker contract (если отличается от t115)
4. **Phase B-D resolve open questions #1+#2:**
   - Использует ли simplified RelationPatcher?
   - Использует ли simplified OrchestratorPatcher с другим DI стилем?
5. **Phase G doc reconciliation:** Update этот документ с финальными counts + любые re-categorizations после Phase B-D evidence.
