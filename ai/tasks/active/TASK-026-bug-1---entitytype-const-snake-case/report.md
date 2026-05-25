# TASK-026 Report — Bug 1: entityType const snake_case casing fix

**Status:** Ready for multi-agent review + commit. NOT committed, NOT pushed.

**Branch:** `feature/TASK-026-bug-1-entitytype-snake-case` (from master `9c9b472` post-TASK-025).

**Verify result on t188:** ✅ **PASS errors=0, warnings=0, infos=30** (Total 77444ms).

---

## Summary

Single-line fix в `replacement_util.ts` — расширил lookahead в snake-rule c `(?=_|/|\\.dart\\b)` до `(?=_|/|\\.dart\\b|'|")` (3 места: ENTITY + 2× MANY_TO_MANY symmetry). Закрывает Bug 1 из weight TASK-019 sync_core wire-up review.

**Корень бага:** template `const String _categoryEntityType = 'category';` для multi-word target (e.g. `CargoType`) substitution `category` за которым следует `'` НЕ матчился snake-rule lookahead → выходило `'cargoType'` (camelCase). А `orchestrator_patcher.ts` корректно генерил `'cargo_type'` для registration. **Mismatch** → sync_core при flush/pull не находил bundle → push висел молча, delta-pull не срабатывал → 7 multi-word weight сущностей silently не синхронизировались.

**Bonus discovery (Meta-bug):** test filename convention `_test.ts` vs `.test.ts`. Mocha glob `**/*.test.js` (dot prefix) **silently skipped** TASK-025 unit tests (`state_providers_ref_mounted_test.js`) во всём PR cycle — multi-agent Standard + Adversarial review их пропустили. Rename + agent_memory gotcha added в этой же commit (related discovery during TASK-026 verification).

## Implementation diff

### src/features/generation/replacement/replacement_util.ts (~3 строки изменения)

**ENTITY snake-rule (line 47):**

```diff
-            { from: `${baseForms.d}(?=_|/|\\.dart\\b)`, to: newForms.dSnake },
+            { from: `${baseForms.d}(?=_|/|\\.dart\\b|'|")`, to: newForms.dSnake },
```

**MANY_TO_MANY entity1 + entity2 snake-rules (line 105, 112) — симметрия:**

```diff
-            { from: `${unCap(templEntity1)}(?=_|/|\\.dart\\b)`, to: toSnakeCase(unCap(config.targetEntity1)) },
+            { from: `${unCap(templEntity1)}(?=_|/|\\.dart\\b|'|")`, to: toSnakeCase(unCap(config.targetEntity1)) },
```

Comments expanded с TASK-026 rationale (Bug 1 + sync_core mismatch reference).

### Meta-bug fix: test file renames (was discovered DURING verification)

- `git mv src/test/generators/state_providers_ref_mounted_test.ts → state_providers_ref_mounted.test.ts` (TASK-025 9 dead tests revived в CI)
- `mv src/test/replacement/entity_snake_quote_boundary_test.ts → entity_snake_quote_boundary.test.ts` (мой TASK-026 file)
- Cleanup stale `out/test/*_test.js`/`.map` artifacts

### New unit test: `src/test/replacement/entity_snake_quote_boundary.test.ts` (10 tests, 2 suites)

| Suite | Test | Coverage |
|---|---|---|
| ENTITY snake-rule | 1. single quote `'category'` → `'cargo_type'` | core fix |
| | 2. double quote `"category"` → `"cargo_type"` | JSON/payload context |
| | 3. identifier `categoryTable` preserved → `cargoTypeTable` | camelCase rule не сломан |
| | 4. `.field` context `category.id` preserved → `cargoType.id` | dot-context preserved |
| | 5. single-word target `member` regression — `'category'` → `'member'` | snake==camel для single-word |
| | 6. path/file context regression — `category_table.dart` → `cargo_type_table.dart` | BUG-002 не сломан |
| | 7. end-to-end repository_impl snippet | canonical case from weight TASK-019 |
| MANY_TO_MANY snake-rule | 8. entity1 single quote `'task'` → `'cargo_type'` | M2M symmetry |
| | 9. entity2 single quote `'tag'` → `'custom_field'` | M2M symmetry |
| | 10. M2M identifier `taskTable` preserved → `cargoTypeTable` | camelCase preserved |

### agent_memory.md gotcha added

> ⚠ Test filename convention: `<name>.test.ts` (dot prefix), НЕ `<name>_test.ts` (underscore). Mocha glob `out/test/**/*.test.js` матчит **только** dot-prefix. Файлы с `_test.js` суффиксом silently skipped. Discovered 2026-05-25 (TASK-026): TASK-025 ввёл outlier — 9 тестов dead до TASK-026 rename. Standard+Adversarial оба пропустили. Lesson: всегда называть `<name>.test.ts` + проверять mocha count = baseline + N.

### Repo status

```
git status:
 M ai/docs/agent_memory.md                            (gotcha test filename convention)
 M src/features/generation/replacement/replacement_util.ts    (3 lookahead extensions)
 R src/test/generators/state_providers_ref_mounted_test.ts → ...ref_mounted.test.ts  (meta-bug fix)
?? src/test/replacement/entity_snake_quote_boundary.test.ts   (new, 10 tests)
?? ai/tasks/active/TASK-026-.../task.md                       (modified — журнал + статусы)
?? ai/tasks/active/TASK-026-.../report.md                     (этот файл)
```

## Regression baseline (pre-verify)

```
[tsc -p ./] /g/SDKs/nodejs/node.exe node_modules/typescript/bin/tsc -p ./
→ EXIT=0 (silent)

[mocha workaround] /g/SDKs/nodejs/node.exe node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"
→ 209 passing (48ms)
  Composition: 190 baseline (current master = post-TASK-025 merge без revived tests)
    + 9 TASK-025 tests revived через rename meta-bug fix
    + 10 TASK-026 tests = 209 total, 0 failing, 0 регрессий

[eslint] /g/SDKs/nodejs/node.exe node_modules/eslint/bin/eslint.js src --ext ts
→ EXIT=0 — 0 errors, 18 pre-existing warnings (curly rule на existing files)
```

## E2E DoD verify on t188

### Step 1 — create-project (~4.4 мин)

```
[create-project] /g/SDKs/nodejs/node.exe out/adapters/cli/index.js create-project --name t188 --template simplified --human
→ Duration: 262786ms
→ EXIT=0
→ Completeness: t188_admin/ ✓, t188_flutter/lib/core/sync/ ✓, t188_flutter/lib/features/configuration/ ✓, t188_server/ ✓
```

### Step 2 — generate-entity cargo_type (multi-word, canonical case)

```
[generate-entity] /g/SDKs/nodejs/node.exe out/adapters/cli/index.js generate-entity \
  --yaml .../t188_server/lib/src/models/cargo_type/cargo_type.spy.yaml \
  --feature-path .../t188_flutter/lib/features/cargo_type \
  --workspace .../t188 --template simplified --human
→ Duration: 39ms
→ EXIT=0
→ SUCCESS: 19 created + 2 modified (sync_orchestrator_provider.dart + database.dart)
→ Stderr: 2× [SectionReplacer] Generator function not found for name: base (known diagnostic)
```

### Step 3 — grep evidence (Bug 1 CORE criterion: strings совпадают?)

```bash
$ grep -E "_cargoTypeEntityType\s*=\s*['\"]" .../cargo_type_repository_impl.dart
const String _cargoTypeEntityType = 'cargo_type';

$ grep -E "_cargoTypeEntityType\s*=\s*['\"]" .../cargo_type_event_adapter.dart
const String _cargoTypeEntityType = 'cargo_type';

$ grep "cargo_type" .../sync_orchestrator_provider.dart
import '../../features/cargo_type/data/adapters/cargo_type/cargo_type_event_adapter.dart';
...
  'cargo_type',         # registry entry
    'cargo_type',       # entityType key

$ grep -rn "'cargoType'\|\"cargoType\"" .../t188_flutter/lib/features/cargo_type/
(no output) — 0 anti-pattern occurrences
```

**✅ STRINGS СОВПАДАЮТ** на всех 3 точках emission (repository_impl / event_adapter / orchestrator) = `'cargo_type'`. Mismatch устранён E2E. Это сам критерий устранения Bug 1.

**✅ 0 anti-pattern** `'cargoType'` / `"cargoType"` в string literals — substitution не оставила camelCase в любых string-context'ах.

### Step 4 — verify (DoD gate)

```
[verify] /g/SDKs/nodejs/node.exe out/adapters/cli/index.js verify --name t188 --human
[1/4] flutter pub get (flutter)...
[2/4] serverpod generate --experimental-features=all...
[3/4] dart run build_runner build --delete-conflicting-outputs...
[4/4] flutter analyze...

PASS: verify t188
  project: G:\Projects\Flutter\serverpod\t188
  ✓ flutterAnalyze — 51445ms (errors=0, warnings=0, infos=30)
  ✓ pubGet — 3878ms
  ✓ serverpodGenerate — 12871ms
  ✓ buildRunner — 9247ms
Total: 77444ms
→ EXIT=0
```

**DoD gate ✅ PASS.** `errors=0, warnings=0, infos=30`.

## Acceptance criteria checklist

- [x] `replacement_util.ts` ENTITY snake-rule расширен lookahead: `(?=_|/|\\.dart\\b|'|")`
- [x] MANY_TO_MANY snake-rule (entity1/entity2) симметрично расширен
- [x] Unit test `src/test/replacement/entity_snake_quote_boundary.test.ts` — **10 кейсов** (expanded scope vs task.md plan 5→10: + end-to-end snippet + M2M coverage)
- [x] tsc clean, eslint clean (0 errors)
- [x] mocha workaround → **209 passing** (190 baseline + 9 TASK-025 revived via meta-bug fix + 10 TASK-026 = 209)
- [x] `codegen verify --name t188 --human` → **PASS errors=0, warnings=0, infos=30** (Total 77444ms)
- [x] grep evidence на t188: `_cargoTypeEntityType` literal = `'cargo_type'` в obоих файлах (repository_impl + event_adapter), orchestrator registration key = `'cargo_type'` — **strings совпадают** (Bug 1 RESOLVED)
- [x] `report.md` с реальным CLI-выводом (этот файл)
- [x] **BONUS:** meta-bug fix (test filename convention) + agent_memory.md gotcha — TASK-025 9 dead tests revived в CI

## Stack-lock compliance (Discussion #11)

- ✅ **Riverpod / Drift / Clean directory layout / sync_core / Serverpod / 13 markers** — не trog'ались
- ✅ **t115 шаблон** — НЕ trog'ался (frozen)
- ✅ Изменения только в `src/features/generation/replacement/` (генератор internals) + test infra (no API/CLI changes)

## Test projects (sandbox-protected, остаются на disk)

- `G:/Projects/Flutter/serverpod/t188/` — ✅ canonical TASK-026 baseline (PASS errors=0, grep evidence confirmed)
- `G:/Projects/Flutter/serverpod/t187/` — post-TASK-025 merge baseline (PASS)
- `G:/Projects/Flutter/serverpod/t186/` — TASK-025 baseline (PASS)
- `G:/Projects/Flutter/serverpod/t180..t185/` — TASK-025/030 history

## Multi-agent review (pending)

⏳ teamlead запускает Standard + Adversarial reviewers pre-commit. Focus targets:

- **Standard:** correctness regex (`(?=_|/|\\.dart\\b|'|")` — valid lookahead alternation, нет greedy capture), 10 test coverage adequacy (ENTITY 7 + M2M 3), end-to-end snippet test = canonical weight case, BUG-002 regression (path/file context preserved), meta-bug fix scope justification.
- **Adversarial:** hidden side-effects (другие литералы вне entityType context — JSON keys, payload codec internals, ID extractors), regression на substitution rules collision (`category` literal в comment text? в string interpolation `'${category}'`?), edge cases для unicode/escape sequences в string literals (`'\\u00e9category'`), test missing для junction targets с quote-boundary (M2M ENTITY substitution когда junction target = multi-word). Scope creep concern: meta-bug rename + agent_memory edit в TASK-026 commit (defensible, но flag для discussion).

## Re-verify после merge (post-merge teamlead obligation)

- [ ] `git checkout master && git pull` после merge
- [ ] `codegen create-project --name t189` + `codegen verify --name t189` — confirm master green
- [ ] grep evidence на t189 generated cargo_type — `'cargo_type'` everywhere

## Files (absolute paths)

**Inside repo (git tracked / staged):**

- `g:/Projects/vs_code_extensions/code-generator/src/features/generation/replacement/replacement_util.ts` (modified, ~3 строки + expanded comments)
- `g:/Projects/vs_code_extensions/code-generator/src/test/generators/state_providers_ref_mounted.test.ts` (renamed from `_test.ts` — META-BUG fix, 9 TASK-025 tests revived)
- `g:/Projects/vs_code_extensions/code-generator/src/test/replacement/entity_snake_quote_boundary.test.ts` (new, 10 tests, 2 suites)
- `g:/Projects/vs_code_extensions/code-generator/ai/docs/agent_memory.md` (gotcha test filename convention)
- `g:/Projects/vs_code_extensions/code-generator/ai/tasks/active/TASK-026-.../task.md` (журнал + статусы)
- `g:/Projects/vs_code_extensions/code-generator/ai/tasks/active/TASK-026-.../report.md` (этот файл)

**Excluded from commit (debug staging area, gitignore'd):**

- `tmp/cargo_type_yaml/` — yamls для verify (gitignored с TASK-025 H1 fix)

## Decision required from teamlead

1. После multi-agent review (Standard + Adversarial) — apply findings inline или escalate
2. После reviewers approve — commit + PR + ждать User merge approval ("мержить")
3. Post-merge: re-verify create-project + verify на свежем t189
