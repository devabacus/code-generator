# TASK-011 Standard Review Report

**Reviewer:** standard correctness review (sync_core teamlead-side, read-only)
**Date:** 2026-05-02
**Verdict:** APPROVE WITH NITS

## Проверенные зоны

| Зона | Status | Notes |
|---|---|---|
| Acceptance criteria (Must-have) | ⚠ matches as documented | 30 manifest markers verified (15 entity + 5 manyToMany + 10 startProject) — task.md заявляла "30 файлов", совпадает. **+1 stray .tmp файл в tag/** (см. Finding #2). |
| DoD verify (errors=0) | ⚠ historical evidence | Re-run в момент review даёт `errors=15` на t152 (post-F4 BUG-009 demonstration). Cited JSON в report.md (F3 → errors=0, warnings=3, infos=44) — historical но verifiable: serverpodGenerate=8939ms / buildRunner=3806ms / pubGet=7608ms / flutterAnalyze=6431ms. Re-validate невозможна без recreate-project (delete-blocked sandbox policy). **Acceptable** для acceptance gate но снижает confidence. |
| Discussion #1 Decision (6 amendments) | ✅ all enforced | Variant A (Configuration baseline) ✅, junction `endsWith('Map')` kept ✅, Phase E5+new doc ✅, B5/B6/B7 ✅, C0 ✅, C7 ✅, F0 ✅, verification rule между A0 и F0 ✅. |
| Tests (82+ passing) | ✅ 82/82 passing | Re-run npm test: `82 passing (114ms)`, 0 failures. Numbers exactly match report.md (62 baseline + 20 new). |
| BUG-007/008/009 classification | ⚠ partially correct | BUG-007 ✅ pre-existing (relation_patcher gap для template без markers — корректно). BUG-008 ✅ fixed в Phase D5 (scanCoreTableFiles + 2 regression tests). **BUG-009 classification disputed** — см. Finding #1. |
| Cosmetic concerns (database.dart duplicates) | ⚠ acceptable but flagged | Подтверждено в t152: 2× `import 'tables/sync_metadata_table.dart'`, 2× `SyncMetadataTable`, 2× `ConfigurationTable`. `flutter analyze` errors=0 — не блокер. Architectural concern для будущего refactor (Lesson 3 в report.md уже это документирует). |
| Code quality (orchestrator_patcher.ts) | ⚠ design gap | Templates `_ENTITY_IMPORTS_TEMPLATE` / `_JUNCTION_IMPORTS_TEMPLATE` hardcoded на `features/tasks/...` строки. `_substitutePlaceholders` подменяет только entity name, не feature path. Это и есть root-cause BUG-009. См. Finding #1. |

## Findings

### Finding #1: BUG-009 — orchestrator_patcher hardcodes `features/tasks/` feature path в import templates

- **Severity:** major (классификация в report.md "out of scope" downplays реальный impact на TASK-012)
- **Where:** `src/features/generation/generators/orchestrator_patcher.ts:291-309`
- **Issue:**
  - `_ENTITY_IMPORTS_TEMPLATE` (line 291-297) и `_JUNCTION_IMPORTS_TEMPLATE` (line 303-309) содержат hardcoded `features/tasks/` literal в каждой import строке
  - `_substitutePlaceholders()` (line 251-273) подменяет только entity name (`category` → `<target>`), но **не feature segment** (`tasks` → `<target_feature>`)
  - Patcher не получает / не использует `config.targetFeaturePath` или `config.templFeatureName` для построения relative import path
  - Любой `generate-entity --feature-path .../features/expense --workspace <new>` ломает orchestrator с 7 `uri_does_not_exist` + cascade 8 undefined symbols (15 errors total)
- **Production impact:**
  - **TASK-012 (codegen → todo real app smoke generation)** напрямую блокируется этим — и report.md сам это признаёт ("TASK-012 разблокирован после merge но **требует BUG-009 fix как prerequisite**")
  - **weight TASK-018** (production migration, 13 entities на feature `weight`) тоже блокируется через TASK-012 hard gate
- **Recommendation:**
  - Не блокирует acceptance TASK-011 (DoD attached к Phase F3, который PASS на свежем `create-project` без generate-entity calls)
  - **Но bug-report 009 рекомендую переклассифицировать** из "out-of-scope" в "scoped follow-up": реализация `orchestrator_patcher.ts` создана в TASK-011 → bug created here, не pre-existing. "Pre-existing" classification сейчас вводит в заблуждение. Это design gap новой компоненты.
  - **Fix simple:** добавить 4-ю substitution form `tplFeatureSnake` → `targetFeatureSnake` через `path.basename(config.targetFeaturePath)` (analog того как `_buildImportsSnippet` уже делает 3-form для entity name)

### Finding #2: Stray .tmp файл в template

- **Severity:** nit
- **Where:** `G:/Templates/flutter/t115/t115_flutter/lib/features/tasks/data/adapters/tag/tag_payload_codec.dart.tmp.37380.1777697814357`
- **Issue:** В template остался artefact от executor's session — temp file вида `tag_payload_codec.dart.tmp.<pid>.<timestamp>`. Содержит manifest marker (`grep` детектит его в `manifest: entity` count, поднимая total с 30 до 31).
- **Recommendation:** Очистить перед merge — `rm tag_payload_codec.dart.tmp.*` в template directory. Не блокер acceptance но грязнит template который копируется в каждый new project.

### Finding #3: Commutative test недостаточно строгий

- **Severity:** minor
- **Where:** `src/test/generators/orchestrator_patcher.test.ts:318-344` (`commutative apply: A→B == B→A`)
- **Issue:** Test проверяет только counts (`register<AlphaEntity>` = 1, `register<BetaEntity>` = 1) и presence обоих registrations. Не проверяет `assert.strictEqual(resultAB, resultBA)` (литеральное string equality). Это значит, что order Alpha-then-Beta vs Beta-then-Alpha может оставить final orchestrator со **разной order'ом** entries в marker блоках — и test всё равно pass. Claim "commutative" в report.md сильнее реального покрытия.
- **Recommendation:** дополнить тест либо `strictEqual(resultAB, resultBA)`, либо комментарием что concurrent test verifies eventual consistency (set-equality), не string-equality. Принимаемо как-есть для acceptance, но flag для будущего hardening.

### Finding #4: SectionReplacer warning'и при тесте

- **Severity:** nit
- **Where:** `npm test` stderr output during `B6 idempotent digest`:
  ```
  [SectionReplacer] Generator function not found for name: syncImports
  [SectionReplacer] Generator function not found for name: syncEntityTypes
  [SectionReplacer] Generator function not found for name: syncRegistrations
  ```
- **Issue:** SectionReplacer (через `section_config.ts`) обрабатывает orchestrator файл, видит `:syncImports` / `:syncEntityTypes` / `:syncRegistrations` markers, но не имеет registered generator function для них (логика moved в `OrchestratorPatcher`). Warning'и emit'ятся в stderr на каждый `process()` вызов orchestrator файла во время normal generation flow — это noise.
- **Recommendation:** Либо register placeholder no-op generators для этих 3 markers в `section_config.ts`, либо filter "expected" markers list в SectionReplacer, либо просто принять warning'и как diagnostic noise. Не блокер.

### Finding #5: F3 verify evidence не reproducible на текущем state t152

- **Severity:** minor (process gap, not code quality)
- **Where:** report.md cited `verify --name t152` PASS errors=0 (Phase F3, before F4)
- **Issue:** Sandbox delete policy (CLAUDE.md) prevents recreate-project для re-validation. После Phase F4 (BUG-009 demonstration) t152 contains expense feature → re-run `verify` сейчас даёт errors=15 (которые report.md сам attestates). Reviewer не может independently re-confirm F3 numbers.
- **Recommendation:** Acceptable для acceptance — evidence cited в moment-in-time, корректность не вызывает сомнений (commit history + executor's process). Но для будущих TASK хорошо бы fixate verify JSON output **в самом** report.md как `<details>` block + git commit с reproducible state перед deconstructive demo phase (F4).

## Approve / Block

**Verdict: APPROVE WITH NITS.**

### Rationale

**Что работает (must-have фундамент):**
- 30 manifest markers расставлены корректно (Phase A) ✅
- 3 marker pairs paired correctly в orchestrator (Phase B), Configuration baseline preserved ✅
- `OrchestratorPatcher` реализован: idempotent + recovery from legacy duplicates + junction detection + commutative semantics — все unit tests pass ✅
- `patchPubspecPackagePaths` extended на `>=4 levels up + Projects/` pattern ✅
- BUG-008 (D5 scope) fixed properly: `scanCoreTableFiles()` + 2 regression tests + idempotency test, scan теперь покрывает `lib/core/**/*_table.dart` ✅
- Docs cleanup E5/E5.1: README short bullet ✅, новый `docs-code-generator/sync-core-integration.md` (~120 lines) с complete coverage что генерируется + YAML req's + limitations + references ✅
- 82 tests passing, 0 failures (62 baseline + 7 OrchestratorPatcher + 5 SectionReplacer + 6 patchPubspecPackagePaths + 2 BUG-008 regression) ✅
- Discussion #1 Variant A approved + 6 amendments — все enforced в task.md execution ✅
- Phase F0 E2E patcher validation done на t115 (re-add 4 tasks через generate-entity) — proof patcher работает на realistic data set ✅
- DoD F3 evidence cited (errors=0, warnings=3, infos=44 на свежем t152) — historical PASS ✅

**Что заслуживает follow-up (но не блокирует TASK-011 acceptance):**
- BUG-009 — design gap в `orchestrator_patcher.ts`, hardcoded feature path в import templates. **Reclassify** из "pre-existing out-of-scope" в "scoped follow-up для TASK-012 prerequisite". Fix simple (добавить 4-th substitution form для feature segment).
- Cosmetic database.dart duplicates (Lesson 3) — `flutter analyze` errors=0 не trigger но visually messy; architectural decision для будущего refactor (template fixed-line imports vs scan-based — choose one).
- Stray `.tmp.<pid>.<ts>` файл в tag/ template — clean before merge.
- Commutative test слабоват (counts-only); SectionReplacer noise warning'и; F3 evidence не reproducible после F4 — все nit-level.

**Не нашёл блокеров:** acceptance criteria все [x] выполнены как заявлено, DoD evidence cited (хоть и historical), tests pass, Discussion #1 decisions enforced, нет regression в существующем кодгена. F3 фундаментальный gate (errors=0 на свежем create-project Configuration-only baseline) — выполнен корректно, и это и есть scope TASK-011.

**Recommendation для teamlead/User:**
1. Принять TASK-011 как done с zafiksированным **BUG-009 как обязательный prerequisite** перед стартом TASK-012 (не "after merge unblocked" а "fix BUG-009 первым → потом TASK-012")
2. Очистить `.tmp` файл в template перед squash-merge PR
3. Опционально доработать commutative test (string equality vs counts-only) и SectionReplacer noise — низкий приоритет

**Готов к merge.** Подтверждаю что TASK-011 acceptance criteria выполнены, evidence consistent с code state, нет hidden costs скрытых в "out of scope" classification — BUG-009 явно flagged как production-blocker для TASK-012 в report.md.
