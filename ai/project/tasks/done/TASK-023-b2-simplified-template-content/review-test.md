# TASK-023 Session 1 — Test Review

**Reviewer role:** Test reviewer (read-only)
**Branch under review:** `feature/TASK-023-b2-simplified-template-content` @ `71e3a67`
**Scope:** Session 1 BUG-019 fix subset (NOT full TASK-023; template directory bootstrap deferred к Session 2)
**Date:** 2026-05-04

## Verification artefacts

### Test count — independent verification

| State | Cited | Observed | Match? |
|---|---|---|---|
| Master baseline (pre-Session-1) | 173 | **173 passing (42ms)** | ✅ |
| Feature branch (post-Session-1) | 178 | **178 passing (45/47/44ms × 3 runs)** | ✅ |
| Delta | +5 | **+5** | ✅ |

3 stable mocha runs at 178 passing — no flaky behaviour observed (all completed под 50ms).
Master checkout + recompile + mocha confirmed 173 baseline. Returned to feature branch.

### Test block count

`Grep "^\\s*(test|it)\\s*\\("` against `src/test/generators/orchestrator_patcher.test.ts`:

- Master: 19 tests
- Feature: 24 tests
- **+5 new test blocks** ✅ matches executor's claim

New test names (line numbers from feature branch):

1. L867 `simplifiedTemplateConfig() factory exposes snippet content fields`
2. L908 `t115TemplateConfig() factory snippet content matches pre-TASK-023 hardcoded constants`
3. L939 `simplified config produces simplified snippet output (positive proof)`
4. L1020 `alt config с custom snippets produces alt content (alt-config positive-path proof)`
5. L1092 `alt junction config с custom FK fallbacks применяется когда model FK extraction returns < 2`

### Skip / pending / `.only` audit

`Grep "\\.(skip|only)\\(|\\bpending\\("` against test file → **No matches**. Clean.

### Lint cleanliness

```
✖ 18 problems (0 errors, 18 warnings)
```

0 errors / 18 warnings — identical к TASK-022 baseline (warnings в `section_replacer.test.ts:47`, `junction_detector.test.ts:274`, plus 16 others — all pre-existing в non-TASK-023 files). ✅

### Compile

`tsc -p ./` clean ✅ (both master and feature branch).

### TASK-022 forward-compat regression

Ran `--grep "TASK-022"` → **10 passing (12ms)**, including the existing alt-config test that needed `...t115TemplateConfig().orchestrator` spread-merge fix:

```diff
 orchestrator: {
+    ...t115TemplateConfig().orchestrator,
     relativePath: ['lib', 'core', 'orchestrator', 'alt_orchestrator.dart'],
 },
```

Spread-merge correctly preserves new orchestrator shape fields когда test overrides only `relativePath`. ✅ TASK-022 alt-config test still passes (was forward-compatible needed extension after orchestrator shape grew с 1 field до 9 fields).

---

## Test quality findings

### CRITICAL

(none)

### HIGH

(none)

### MEDIUM

#### M1. Test #5 misnamed — does NOT exercise FK fallback path

**Location:** `orchestrator_patcher.test.ts:1092`

**Test name claim:** `alt junction config с custom FK fallbacks применяется когда model FK extraction returns < 2`

**Actual behaviour:** Test calls `makeJunctionModel('UserRoleMap', [fkField('userId', 'user'), fkField('roleId', 'role')])` — passes **2 FK fields**. Test's own inline comment acknowledges this contradiction:

```typescript
// Junction model с 2 FK (NB: < 2 не triggered junction detection — нужно ≥ 2 FK для junction).
// Используем 2 FK для positive path с ConcreteParent fallbacks.
```

**Path through `_buildRegisterSnippet:271-277`:**
```typescript
const fk1Name = fkFields.length >= 1 ? this._extractEntityNameFromField(fkFields[0]) : fk1Fallback;
const fk2Name = fkFields.length >= 2 ? this._extractEntityNameFromField(fkFields[1]) : fk2Fallback;
```

С 2 FK fields → `fk1Name = 'user'`, `fk2Name = 'role'` через extraction. **`fk1Fallback`/`fk2Fallback` (= `'parentA'`/`'parentB'` simplified config) НИКОГДА не обращаются в этом тесте.**

**Resulting assertion (`!result.includes('junction FK→task+tag')`)** is satisfied trivially — extraction вернула user/role, поэтому task+tag не появится независимо от того, читается ли fallback из config или hardcoded.

**Impact:** test passes, но не proves что `junctionFkFallbacks` config-driven — это только proves что FK extraction works (already covered TASK-014 tests at L658). The **fallback** branch (`fkFields.length < 2`) для simplified config с `parentA`/`parentB` остаётся непокрытой.

**Recommendation:** либо переименовать тест в `simplified junction docstring uses extracted FKs from model (negative: t115 fallback не leak)` чтобы name соответствовал actual behaviour, либо добавить отдельный test case с `makeJunctionModel('IncompleteJunction', [fkField('soloId', 'solo')])` (1 FK field) → assert `result.includes('junction FK→solo+parentB')` для актуального fallback proof. Простейший fix — переименовать; добавление 1-FK test может trip junction detection если detection требует ≥ 2 FK (executor's inline comment подтверждает это).

#### M2. Test #2 ("literal-identity regression") uses substring `.includes()` not strict equality

**Location:** `orchestrator_patcher.test.ts:908`

**Test name claim:** `t115TemplateConfig() factory snippet content matches pre-TASK-023 hardcoded constants`

**Actual assertions:** все используют `assert.ok(config.orchestrator.entityImportsTemplate.includes('category_remote_adapter.dart'))` — substring containment, not byte-for-byte equality.

**Why this matters для regression:** if executor accidentally changes whitespace, indentation, comment ordering, OR adds extra import line в `T115_ENTITY_IMPORTS_TEMPLATE`, test still passes (substring still present). The pre-TASK-023 hardcoded constants были bit-exact — their relocation к `template_config.ts` should preserve bit-exact identity, otherwise t115 zero-diff invariant is at risk.

**Cause:** `T115_ENTITY_IMPORTS_TEMPLATE` / `T115_JUNCTION_IMPORTS_TEMPLATE` / etc constants are **module-private** (no `export`) в `template_config.ts:214,227,240,262`. Test cannot import them для strict equality assertion. Substring assertions are workaround, not equivalent.

**Stronger guarantee in practice:** existing test L399 (`single entity add: ... + full import path correct (BUG-009 fix)`) и L325 (`junction entity (*Map): routing через manyToMany словарь + docstring`) test the actual emitted output bit-by-bit (с BUG-009 substituted form). Если эти tests pass — t115 snippet identity preserved transitively. So M2 risk in practice mitigated by **existing** test coverage.

**Recommendation:** одна из:
(a) export `T115_ENTITY_IMPORTS_TEMPLATE` etc и assert `assert.strictEqual(config.orchestrator.entityImportsTemplate, T115_ENTITY_IMPORTS_TEMPLATE)`,
(b) добавить explicit comment в test #2 docstring отметив что bit-exact identity covered by L141/L325 transitively + this test only proves anchor literals present,
(c) accept as-is (acceptable per executor's stated scope of "regression proof").

Choice (b) — minimum impact, signals limitation to future readers.

### LOW

#### L1. Test #1 ("factory shape smoke") asserts много через single test

**Location:** `orchestrator_patcher.test.ts:867`

Single test делает 14 assertions (factory name + 4 snippet length checks + 4 fallback checks + 6 substring containment checks). Fails первый failed assertion → cascade gets cut off, no diagnostic для downstream issues.

**Impact:** low — pure factory output is deterministic, поэтому unlikely что cascade actually masks data; mocha's first-failure stop is acceptable for smoke tests. Kept as LOW informational.

#### L2. Sentinel test #4 has minor leak in negative assertion

**Location:** `orchestrator_patcher.test.ts:1086-1088`

```typescript
assert.ok(
    !result.includes('register<ExpenseEntity>'),
    'alt config: t115 default register format `register<ExpenseEntity>` НЕ leak (snippet content НЕ из hardcoded constant)',
);
```

`register<ExpenseEntity>` would only appear if standard t115 `_ENTITY_REGISTER_TEMPLATE` была emitted. Since alt config provided custom `entityRegisterTemplate` со sentinel `altRegister<CategoryAlt>` (substituted на `altRegister<ExpenseAlt>`), the `register<ExpenseEntity>` substring цемент проявляется только if config plumbing failed. Strong proof. ✅

But — note alt config still uses `regularEntityFallback: 'category'` (matching the alt template's `CategoryAlt` literal). If alt config used non-`category` fallback (e.g. `'foo'`), substitution would fail to match `Category` в `altRegister<CategoryAlt>` and leave `altRegister<CategoryAlt>` literally. Test wouldn't catch this configuration mismatch — but it's not in the test's scope.

**Impact:** none for this test's purpose. Sentinel proof solid.

---

## Strengths

1. **Master baseline confirmed** — independent `git checkout master + npm run compile + mocha` gave **173 passing**, exact match к executor's pre-Session-1 cited number. No phantom test inflation.
2. **+5 net additions** verified bit-exact (24 - 19 = 5). No silent test deletions, no `.skip`/`.only` regressions.
3. **Forward-compat fix for TASK-022 alt-config test was clean** — single-line `...t115TemplateConfig().orchestrator` spread preserves shape extension, all 10 TASK-022 tests still pass.
4. **3 stable mocha runs (45/47/44ms)** — no flaky behaviour, all 178 tests deterministic.
5. **Sentinel proof в тесте #4 крепкий** — `CUSTOM_ALT_*_SENTINEL` literals appear в output AND substitute properly (`expense_alt.dart` / `altRegister<ExpenseAlt>`), AND default t115 format absent. Triple assertion (positive sentinel + positive substitution + negative default) — strongest of the 5 new tests.
6. **Positive proof в тесте #3 (simplified config)** correctly verifies feature segment substitution `features/configuration/` → `features/expense/` AND template entity substitution `configuration` → `expense`. Multi-token substitution flow proven.
7. **0 lint errors, 18 warnings preserved** — no new noise introduced.
8. **Compile clean** — TypeScript types для new orchestrator shape fields propagated through GenerationConfig usage в orchestrator_patcher.ts cleanly.

---

## Verdict

**APPROVE с MEDIUM rebadging recommended (M1 + M2).**

Session 1 BUG-019 fix subset is functionally sound — все 5 new tests pass deterministically, existing 173 baseline preserved, TASK-022 forward-compat maintained, lint clean. M1 (misnamed FK fallback test) и M2 (substring vs strict equality) — quality gaps, не deal-breakers. M1 ideally fixed by rename до Session 2 closure (cheap); M2 can be deferred / documented (acceptable). HIGH/CRITICAL: none.

Session 2 (template directory bootstrap) проблема для отдельного review pass — этот review purely covers BUG-019 fix subset.

**Catch count:**
- CRITICAL: 0
- HIGH: 0
- MEDIUM: 2 (M1 misnamed FK fallback test path, M2 substring weak regression assertion)
- LOW: 2 (L1 batch assertion в smoke test, L2 sentinel coverage scope note)
- Strengths: 8

**Recommendation для executor:**
1. (cheap fix) rename test #5 от `... применяется когда model FK extraction returns < 2` → `... simplified junction docstring uses extracted FKs (with config-driven fallback metadata)`. Закрыть M1 без adding new test.
2. (optional) export `T115_*_TEMPLATE` constants + add 4-line assert.strictEqual block в test #2. Закрыть M2 firmly. Alternative — accept M2 как documented limitation.

Не блокирует teamlead's spawn'а Session 1 closure.
