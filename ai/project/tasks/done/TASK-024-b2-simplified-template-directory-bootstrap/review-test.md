# Test Review — TASK-024 (B2 simplified template directory bootstrap)

**Reviewer:** Test Reviewer (read-only, parallel multi-agent review)
**Date:** 2026-05-04
**Branch:** `feature/TASK-024-b2-simplified-template-directory-bootstrap` (5 commits over master ff8f9d9 = TASK-023 PR #20 tip)
**Verdict:** **APPROVE** — все executor's claims verified, baseline math корректна, новые тесты well-formed.

---

## Резюме

Independent verification полностью подтверждает executor's claims:

- **Mocha:** 181/181 passing (3 stable runs)
- **Master baseline:** 179 passing → feature branch = 181 (delta = **+2**)
- **Lint:** 0 errors, 18 warnings (matches claim)
- **Compile:** clean (`tsc -p ./` zero output)
- **Skip/only/pending:** 0 instances
- **Smoke evidence on disk:** t176 + t177 both present
- **Shape verification:** t176 (simplified) = 0 usecases / 0 abstract repo interfaces; t177 (t115 legacy) = 4 usecases dirs (ceremony preserved)

Один минорный nit на report wording (см. Findings #1) — non-blocking, executor merely сказал "no net delta vs prior 181 baseline" подразумевая что предыдущая R&D-ветка где-то имела 181 — но фактический master = 179. Это не bug, не regression, просто wording.

---

## Findings

### Finding #1 — wording: "prior 181 baseline" misleading vs master = 179 (NIT)

**Severity:** nit / non-blocking
**Location:** `ai/tasks/active/TASK-024.../task.md` prompt mentions "no net delta vs prior 181 baseline"; executor's report.md says "181/181 passing post Session E3d2 fix (compile clean → no regressions)" — что accurate, но prompt-level wording could mislead.

**Verified facts:**
- `master` (ff8f9d9 = TASK-023 PR #20) → **179 passing**
- `feature/TASK-024-...` HEAD → **181 passing**
- Delta = **+2** = exactly the 2 new tests added в `project_bootstrapper.test.ts` для dynamic depth-delta scenarios

**Recommendation:** No code change needed. If desired, executor can update report.md note "(net +2 vs master 179 baseline = 181 — 2 new depth-delta scenarios in project_bootstrapper.test.ts, no regressions)" — but optional.

---

### Finding #2 — 2 new tests well-formed (POSITIVE)

**Location:** `src/test/services/project_bootstrapper.test.ts` lines 145-end
**Suite:** `patchPubspecPackagePaths — TASK-024 dynamic depth delta`
**Tests added:**
1. **`regression: default Projects/Flutter/serverpod/ target deepens на 1 уровень`** — проверяет default depth-delta (= +1) preserved для in-monorepo + out-of-monorepo path-deps.
2. **`same-depth target (--projects-path Templates/flutter/): patcher no-op`** — проверяет delta = 0 case (target живёт на той же depth что template), patcher должен быть no-op.

**Coverage assessment:** оба test'а well-formed:
- Используют `MockFileSystem` (тот же pattern что existing Phase D suite)
- Cover positive branch (delta > 0 deepens) + zero-delta branch (no-op)
- Assertion messages descriptive
- Comments объясняют real-world depth math (5 segs template / 6 segs default target / 5 segs Templates-based target)

**Verified:** 8/8 tests passing в `project_bootstrapper.test.js` (6 prior + 2 new). Independent run confirmed.

**Note:** Не покрывается negative-delta case (target на меньшей depth чем template) — но executor's `_calculateDeepening` unlikely produces this в realistic scenarios. Для bootstrap'а `Templates/flutter/` это maximum upper case, и delta=0 already handled. Не блокирует acceptance.

---

### Finding #3 — H-2 sentinel restructure корректна (POSITIVE)

**Location:** `src/test/generators/orchestrator_patcher.test.ts` lines 1095-1170 (test "TASK-023 / BUG-019: junction with <2 FKs falls back to junctionFkFallbacks config (Round 2 H-2 restructured)")

**Pre-Session-E3d2 problem:** simplified config + t115 config теперь оба используют `task`/`tag` FK fallbacks. Поэтому assertion "junction FK→solo+parentB" (старый simplified literal) больше не valid — нужен sentinel literal чтобы доказать config-driven dispatch.

**E3d2 fix verification:**
```typescript
templateConfig: {
  ...simplifiedTemplateConfig(),
  orchestrator: {
    ...simplifiedTemplateConfig().orchestrator,
    junctionFkFallbacks: { fk1: 'sentinelFk1', fk2: 'sentinelFk2' },
  },
},
```

Это **legitimate sentinel proof** — overrides default fallbacks к literal-strings которые НЕ существуют ни в одном config'е. Если patcher был бы hardcoded constant — `solo+sentinelFk2` не появилось бы в output. Test passes — proof actually exercises config-driven dispatch branch.

**POSITIVE assertions:**
- `result.includes('junction FK→solo+sentinelFk2')` — sentinel actually flows through
- `!result.includes('junction FK→solo+tag')` — default fallback не leak'ит когда custom override present
- `!result.includes('junction FK→task+tag')` — hardcoded constant не leak'ит

**Verdict:** semantically correct restructure. Test names updated (E3d2 / Round 2 markers), test still proves config-driven dispatch.

---

### Finding #4 — Test stability (POSITIVE)

3 independent mocha runs:
- Run 1: 181 passing (49ms)
- Run 2: 181 passing (47ms)
- Run 3: 181 passing (59ms)

No flake, no race / order dependence detected.

---

### Finding #5 — Master baseline cross-check (POSITIVE)

Switched к master (ff8f9d9 = TASK-023 PR #20 tip), recompiled, ran mocha → **179 passing**. Returned to feature branch, restored stash, recompiled → **181 passing**. Delta = +2 = exactly the 2 new depth-delta tests added в `project_bootstrapper.test.ts`. Math корректна.

---

### Finding #6 — Lint cleanliness (POSITIVE)

`npm run lint` output:
```
✖ 18 problems (0 errors, 18 warnings)
0 errors and 18 warnings potentially fixable with the `--fix` option.
```

Exact match с executor's claim "0 errors / 18 pre-existing warnings". Все warnings — `Expected { after 'if' condition` (curly-brace style, `--fix` available) + 1 `Unused eslint-disable directive` в `section_replacer.test.ts`. Pre-existing, не introduced by TASK-024.

---

### Finding #7 — Compile cleanliness (POSITIVE)

`npm run compile` (= `tsc -p ./`) output: empty (clean). No type errors.

---

### Finding #8 — Smoke evidence on disk (POSITIVE)

`G:/Projects/Flutter/serverpod/` directory listing:
- t170simplified, t171simplified, t172simplified, t173simplified — earlier iterations (in-progress smokes from prior sessions)
- t174 — failure baseline (60 errors, blocked by sandbox от deletion per User memory note)
- t175 — intermediate retry
- **t176** — final default flow smoke (claimed PASS errors=0)
- **t177** — final legacy flow smoke (claimed PASS errors=0)

Both target dirs present.

---

### Finding #9 — Shape verification (POSITIVE — KEY GATE)

**t176 (simplified default):**
- usecases dirs: **0** ✓ (claim: 0)
- abstract `i_*_repository.dart` interfaces: **0** ✓ (claim: 0)
- features/: `auth/ bluetooth/ configuration/ developer_tools/ home/ settings_definitions/` — Configuration baseline + per-app features only, no Tasks fixture leak

**t177 (legacy `--template t115`):**
- usecases dirs: **4** ✓ (>0 expected — t115 ceremony preserved)
- features/: identical baseline `auth/ bluetooth/ configuration/ developer_tools/ home/ settings_definitions/` — ceremony differentiation чисто внутри features (e.g. usecases subdirs внутри auth/)

**Verdict:** Strip checklist (per ADR-0005 §3.5) properly applied для simplified default flow. Legacy regression preserved via opt-in `--template t115` flag. BUG-019 closure end-to-end verified at shape level.

---

### Finding #10 — No skip / pending / .only (POSITIVE)

Grep `\.skip\(|\.only\(|pending\(` в `src/test/` → 0 matches. No tests disabled.

---

## Раскладка по prompt-checklist

| Item | Claim | Verified | Status |
|------|-------|----------|--------|
| 1. Test count (181) | 181 passing | 181 passing × 3 runs stable | ✅ |
| 2. project_bootstrapper 2 new tests | 2 added для depth-delta | 8/8 passing (6 prior + 2 new), proper coverage | ✅ |
| 3. orchestrator_patcher H-2 sentinel restructure | sentinel literals exercise fallback branch | sentinelFk1/sentinelFk2 verified в config override + assertions | ✅ |
| 4. Stability (3 runs) | n/a | 181 / 181 / 181 (49ms / 47ms / 59ms) | ✅ |
| 5. Master baseline cross-check | n/a (executor claim 181 vs prior 181) | master = 179, feature = 181, delta = +2 (matches 2 new tests) | ✅ (with NIT on wording) |
| 6. Lint (0 errors / 18 warnings) | 0 errors / 18 warnings | 18 problems (0 errors, 18 warnings) | ✅ |
| 7. No skipped / pending / .only | claim implicit | 0 instances grep | ✅ |
| 8. t176 + t177 directories | both PASS | both present | ✅ |
| 9. Shape verify | t176: 0 usecases / 0 abs interfaces; t177: >0 usecases | t176: 0/0; t177: 4 usecases | ✅ |

---

## Recommendation

**APPROVE for merge.**

Все test-relevant claims executor'а verified independently:
- Test count delta math корректна (master 179 → feature 181 = +2 new depth-delta tests)
- 2 new tests well-formed (positive default + zero-delta branches covered)
- H-2 sentinel restructure semantically valid (proves config-driven dispatch с custom override)
- Lint / compile / stability all clean
- t176 / t177 shape evidence on disk matches strip checklist (ADR-0005 §3.5)
- BUG-019 end-to-end closure substantiated

Один minor nit — wording в task.md prompt о "prior 181 baseline" слегка misleading (master = 179, not 181) — но это не code/test issue, не блокирует merge.

No push back. Test surface готов к merge.
