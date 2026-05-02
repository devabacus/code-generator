# TASK-011 Standard Review Report Round 2

**Reviewer:** standard correctness review (round 2 — adversarial fixes verification)
**Date:** 2026-05-02
**Verdict:** **CHANGES REQUESTED** (Bomb #2 не реально closed — duplicate_import warnings присутствуют в t153 verify output)

## Резюме

D6 (BUG-009), D8 (pubspec idempotency), D9.1 (.tmp cleanup), D9.3 (TASK-013 priority bump), D10 (eventual consistency test), D11 (SectionReplacer noise), D12 (t153 generation + verify) — все **substantively closed**. Code edits на disk match commit message claims, регрессия от round 1 нет.

**КРИТИЧНОЕ исключение:** D7 (Drift duplicate fix, Bomb #2) — claim "Variant A — template без fixed-line core imports" enforced на t115 working tree, **НО** generated t153 проект всё ещё содержит **duplicate fixed-line imports + duplicate table classes**. `flutter analyze` t153 выдаёт **2 `duplicate_import` warnings** на строках 10:8 + 12:8 of `database.dart` — exactly the issue Bomb #2 описывал. Verify report цитирует "warnings=3" но не acknowledge'ит что 2 из этих 3 warnings — exact reproduction of Bomb #2.

## Round 1 → Round 2 transitions

| Round 1 finding | Round 2 status | Evidence |
|---|---|---|
| **Bomb #1 BUG-009 (orchestrator hardcodes `tasks/`)** | ✅ closed via D6 + E2E validation | `t153/.../sync_orchestrator_provider.dart:24-30` — все 7 import строк имеют `features/expense/` (не `features/tasks/`). 2 new tests ([orchestrator_patcher.test.ts:180-251](src/test/generators/orchestrator_patcher.test.ts:180)) с full-path positive + negative assertion (`!result.includes('features/tasks/')`). Tests passing. |
| **Bomb #2 Drift duplicate tables (database.dart)** | ⚠ **PARTIAL: source-fix done, generated artefact still broken** | t115 template fixed (working tree, не committed) — `database.dart:7-13` содержит D7 comment block + удалены fixed-line imports. **НО** `t153/.../database.dart:7-8` всё ещё содержит `import 'tables/sync_metadata_table.dart';` + `import '.../configuration_table.dart';` ВНЕ markers. Tables list `:18-26` содержит `SyncMetadataTable` + `ConfigurationTable` дважды. См. Finding R2-#1 ниже. |
| **Bomb #3 Junction heuristic** | ✅ documented + scope expansion | `backlog.md:7` priority Low → Medium + scope item "Audit weight 13 entities" (UserPermission/RolePermission/ContractorTariff). Acceptable per round 1 recommendation (не блокер acceptance, follow-up TASK with proactive trigger). |
| **Bomb #4 Pubspec regex non-idempotent** | ✅ closed via D8 | `project_bootstrapper.ts:58-61` — regex `(?:\.\.\/){4,}` → `(?:\.\.\/){4}`. Test [project_bootstrapper.test.ts:75-107](src/test/services/project_bootstrapper.test.ts:75) проверяет `assert.strictEqual(after1, after2, ...)` + negative `!after2.includes('../../../../../../Projects/')`. Passing. |
| **Bomb #5 F0 evidence theatre** | ✅ closed via D9.2 (caveat documented) | `report.md:150-162` — секция "Caveat: Phase F0 validation strength" честно признаёт "F0 НЕ proves runtime correctness — downstream `flutter analyze` failed из-за relation_patcher pre-existing gap". |
| **Bomb #6 t115 template inconsistency** | ✅ acknowledged punt to follow-up | per round 1 recommendation. |
| **Standard Finding #2 .tmp file** | ✅ closed via D9.1 | `find /g/Templates/flutter/t115 -name "*.tmp*"` → empty. |
| **Standard Finding #3 commutative test** | ✅ honestly reformulated via D10 | Test renamed "commutative apply" → "eventual consistency apply". `test:415-484` использует `extractRegistrationNames` + `extractImportPaths` set-equality (`assert.deepStrictEqual([...setAB].sort(), [...setBA].sort())`). Honest claim в comment'е (lines 415-431) что patcher НЕ true bytewise commutative. |
| **Standard Finding #4 SectionReplacer noise** | ✅ closed via D11 | `section_config.ts:15-19` `SECTION_REPLACER_SKIP_MARKERS` whitelist для `syncImports`/`syncEntityTypes`/`syncRegistrations`. `npm test 2>&1 \| grep "SectionReplacer.*Generator function not found"` → empty. |

## Verify re-run

Re-run в момент review (cmd `node out/adapters/cli/index.js verify --name t153 --human`):

```
PASS: verify t153
  project: G:\Projects\Flutter\serverpod\t153
  ✓ flutterAnalyze — 3020ms (errors=0, warnings=3, infos=44)
  ✓ pubGet — 7981ms
  ✓ serverpodGenerate — 8958ms
  ✓ buildRunner — 4198ms
Total: 24158ms
```

PASS errors=0 — formal acceptance hold. Numbers совпадают (warnings=3, infos=44; analyzer ms slight diff, normal variance).

**Detail breakdown 3 warnings:**
```
warning - Duplicate import - lib\core\data\datasources\local\database.dart:10:8 - duplicate_import
warning - Duplicate import - lib\core\data\datasources\local\database.dart:12:8 - duplicate_import
warning - The value of the local variable 'client' isn't used - lib\features\developer_tools\presentation\pages\developer_tools_page.dart:22:11 - unused_local_variable
```

**2 из 3 warnings — `duplicate_import` в database.dart — этот же Bomb #2 issue.**

## npm test

```
85 passing (115ms)
```

✅ 85 passing, 0 failures. Breakdown совпадает с заявленным: 62 baseline + 7 OrchestratorPatcher + 5 SectionReplacer + 6 patchPubspec + 2 BUG-008 regression + 2 D6 BUG-009 full-path + 1 D7 dedup. Реально: ещё OrchestratorPatcher tests включают eventual consistency (D10) + recovery + multiple — 9 в файле, не 7. Numbers слегка сдвинуты, но total 85 — корректно.

`npm test` output не содержит `[SectionReplacer] Generator function not found` warnings — D11 confirmed clean.

## Findings

### Finding R2-#1 (CRITICAL): D7 Drift duplicate fix не propagated в t153 — Bomb #2 reproduces в генерированном артефакте

- **Severity:** **major** — claim "Bomb #2 closed" в report.md и commit message не соответствует observable artefact
- **Where:** `G:/Projects/Flutter/serverpod/t153/t153_flutter/lib/core/data/datasources/local/database.dart:7-26`
- **Issue:**
  - t115 template **исправлен** на disk (working tree at `G:/Templates/flutter/t115/.../database.dart:7-12` содержит D7 comment block + fixed-line imports удалены).
  - **НО** generated t153 (init commit `4d8f831` at 17:28:33 — после template fix at 17:18:57) **НЕ имеет** D7 marker comment + содержит **полностью pre-D7 содержимое**:
    ```dart
    // t153 database.dart:7-26 (init commit 4d8f831):
    import 'tables/sync_metadata_table.dart';                                                     // ← line 7 (вне markers)
    import '../../../../features/configuration/data/datasources/local/tables/configuration_table.dart';  // ← line 8 (вне markers)
    // === GENERATED_IMPORTS_START ===
    import '../../../../features/configuration/data/datasources/local/tables/configuration_table.dart';  // ← duplicate (внутри markers)
    import 'tables/sync_metadata_table.dart';                                                     // ← duplicate (внутри markers)
    import '../../../sync/sync_queue_table.dart';
    // === GENERATED_IMPORTS_END ===

    @DriftDatabase(tables: [
        SyncMetadataTable,           // ← line 19 (вне markers)
        ConfigurationTable,          // ← line 20 (вне markers)
    // === GENERATED_TABLES_START ===
    ConfigurationTable,              // ← duplicate (внутри markers)
        SyncMetadataTable,           // ← duplicate (внутри markers)
        SyncQueueTable,
    // === GENERATED_TABLES_END ===
    ])
    ```
  - `flutter analyze` t153 (re-run 2026-05-02 в момент review): **2 `duplicate_import` warnings** на line 10:8 + 12:8.
  - `grep "// BUG-009/D7" t153/.../database.dart` → 0 matches; `grep "// BUG-009/D7" t115/.../database.dart` → 1 match. **Template fix НЕ propagated в generated artefact.**
- **Why current code/tests don't catch it:**
  - `D7 regression test` ([app_database_generator.test.ts:300-348](src/test/generators/app_database_generator.test.ts:300)) использует **synthetic** template (`newTemplateContent` line 305) который **уже** имеет clean state — empty fixed-line imports section. Test не воспроизводит scenario "template имеет fixed-line imports → generator должен detect/dedupe". Test **passes the wrong scenario** (already-clean template) и не ловит реальный bug.
  - **Real bug:** AppDatabaseGenerator на line 27-37 — если target file НЕ существует, читает template и updates только GENERATED markers section. Fixed-line imports ВНЕ markers preserve as-is из template. Если template был фиксирован (D7) — тогда generated должен быть clean. Но t153 был сгенерирован **до** template fix proпaгировался (или используется stale `out/` compile, или какой-то другой path → нужно investigate root cause).
  - **Possible root cause hypothesis:** t153 init commit at 17:28:33; t115 template Modify at 17:18:57; `out/` last compile at 17:34:03 (post-t153 generation). Это suggests что в момент создания t153 running compiled JS не имел D7 fix (compile last happened before D7 changes). Executor compiled `out/` ПОСЛЕ запуска create-project + generate-entity for t153.
- **Production impact:**
  - t153 — это **DoD acceptance gate evidence**. Verify PASS errors=0 формально, но **2 `duplicate_import` warnings** — exact issue Bomb #2 was supposed to close. Adversarial concern about Drift schema correctness не resolved для production migration risk: developer любого нового проекта получит идентичные duplicates если build runs against pre-D7-compile JS.
  - **Если** D7 template fix действительно работает на rebuild (clean compile + fresh create-project) — нужна **proof**: re-run create-project → t154 → check db.dart. **Не cited в report.md** evidence что D7 propagates через generator.
- **Recommendation:**
  - **Block merge.** Действия:
    1. **Re-compile** `out/` (uncertain текущий compile содержит D7 logic).
    2. **Re-run create-project --name t154** свежим вызовом.
    3. **Confirm** `t154/.../database.dart` НЕ содержит fixed-line imports вне markers + `flutter analyze` t154 имеет **0** `duplicate_import` warnings (warnings count <=1, не 3).
    4. **Update D7 regression test** на realistic scenario: template содержит fixed-line imports `import 'tables/sync_metadata_table.dart'` ВНЕ markers + scan найдёт тот же файл → assert generated имеет ровно 1 import. (Текущий test использует pre-cleaned template — не ловит bug.)
  - **Альтернатива (дешевле):** AppDatabaseGenerator должен **сам очищать** fixed-line core imports outside markers. Принимаем что template гарантированно содержит ОДНОГО рода imports — внутри `:GENERATED_IMPORTS:` markers. Generator стрипает all `import '...sync_metadata_table.dart';` `import '...configuration_table.dart';` `import '...sync_queue_table.dart';` outside markers перед записью. Это closes loop независимо от template state.

### Finding R2-#2 (minor): task.md acceptance checkbox desync

- **Severity:** nit (process gap, не code quality)
- **Where:** `ai/tasks/active/TASK-011-.../task.md` lines 70-80, 89-180 etc.
- **Issue:** task.md показывает 53 unchecked `[ ]` checkboxes для phases B/B5/B6/B7/C0/C/C7/D/D5/D6/D7/D8/D9/D10/D11/D12/F и т.д., тогда как report.md (line 25-46) и фактические артефакты (commits + tests + working tree) подтверждают что все эти phases done. В принципе уже flagged в round 2 prompt — reviewer должен flag desync.
- **Recommendation:** Update task.md acceptance checkboxes до merge. Это формальный artefact для будущей trace audit; "[ ]" suggesting "not done" mleads downstream readers (TASK-012 executor).

### Finding R2-#3 (nit): D7 regression test design weakness

- **Severity:** nit
- **Where:** `src/test/generators/app_database_generator.test.ts:300-348` (D7 regression test)
- **Issue:** Test использует synthetic clean template (`newTemplateContent` line 305-320) с empty `:GENERATED_IMPORTS:` section. Asserts что result имеет ровно 1 instance каждого import. **Test passes — но не воспроизводит реальный bug scenario** (template имеет fixed-line imports вне markers + scan находит те же файлы по absolute path).
  - Реальный bug в адверсариальном reviewer raised: template content имел `import 'tables/sync_metadata_table.dart';` ВНЕ markers + scan находил тот же файл `tables/sync_metadata_table.dart` через recursive scan → result был 2 imports (один outside markers, один inside).
  - D7 fix template (удалить fixed-line imports) — это лечит bug в template, но не лечит generator robustness. Test не покрывает scenario "что если template content stale" — что и происходит на t153.
- **Recommendation:** Дополнить D7 regression test: synthetic template содержит fixed-line `import 'tables/sync_metadata_table.dart';` ВНЕ markers + scan returns тот же файл → assert generator strips outside-markers import OR asserts result имеет ровно 1 instance (что бы оно ни было). Это **TDD-first** проверка контракта, не template state-specific.

## Final verdict

**CHANGES REQUESTED.**

D6 (BUG-009 orchestrator), D8 (pubspec idempotency), D9 (cleanup), D10 (eventual consistency), D11 (SectionReplacer noise), D12 (verify reproducibility) — все substantively closed. Tests passing 85/85, no regression от round 1.

**Блокер: D7 (Drift duplicate fix, Bomb #2) — не реально closed.** Template на disk fixed, но generated t153 artefact (DoD evidence) всё ещё демонстрирует exact bug who Bomb #2 описывал — `flutter analyze` reports 2 `duplicate_import` warnings на duplicate fixed-line imports в `database.dart`. Это **PARTIAL fix** который presented как closed.

**Required actions перед merge:**
1. Re-compile `out/` (clean build) → re-run `create-project --name t154` → verify t154 → confirm `flutter analyze` показывает 0 `duplicate_import` warnings (или warnings <=1).
2. Strengthen D7 regression test: use realistic template scenario (fixed-line imports вне markers + scan находит те же файлы). Current test uses synthetic clean template и passes the wrong scenario.
3. (Recommended) Update task.md acceptance checkboxes до actual state — устранить desync.

**Если пункт 1 confirmится** (D7 template fix действительно propagates через rebuild) — Bomb #2 truly closed. Если **НЕТ** (t154 имеет идентичные duplicates) — нужна **architectural-level** fix в `AppDatabaseGenerator` который strip'ает fixed-line imports outside markers (или ADR'ить решение что template config — hard contract и developer responsibility — это не то, что Variant A предполагал).

**Готов к merge** только после п.1 acceptance evidence cited в report.md (verify t154 errors=0 + warnings=1, не 3).

---

## Bonus: minor process observations

- Round 2 prompt flag'нул task.md desync proactively — отличная mitigation того что round 1 не упомянул это.
- Adversarial review reformulation D10 (eventual consistency vs commutativity) — пример как honest reformulation > overstating claims. Hardening test is real (set-equality + counts), comment lines 415-431 объясняют trade-off.
- D8 negative assertion (`!includes('../../../../../../Projects/')`) — отличный pattern для idempotency tests, должен быть скопирован в other idempotency tests как convention.
