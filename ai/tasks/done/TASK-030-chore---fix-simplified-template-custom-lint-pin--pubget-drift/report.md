# TASK-030 Report — Chore: fix simplified template `pubGet` drift

**Status:** Ready for re-review + commit decision. **NOT committed**, NOT pushed.

**Branch:** `chore/TASK-030-fix-template-custom-lint-pin`

**Final approach:** **Caret bump** (`custom_lint: 0.8.0` → `^0.8.0`) — single-character change in `G:/Templates/flutter/simplified/simplified_flutter/pubspec.yaml:100`. No `dependency_overrides` needed. Plus rotted comments cleanup (lines 75/85/88).

**Verify result on t184 (caret approach — FINAL):** ✅ PASS — `errors=0, warnings=0, infos=30` (full CLI output ниже).
**Verify result on t183 (extended A first-pass, kept as git-history reference):** ✅ PASS — same counts. Caret achieves identical outcome через minimal-disruptive single-char change.

---

## Summary

**Final fix** = `custom_lint: 0.8.0` → `^0.8.0` (caret) в `simplified_flutter/pubspec.yaml:100`. Pub solver auto-resolves к 0.8.1 → analyzer 8.4.0 cascade (verified pattern `analyzer 8.4.0 + custom_lint 0.8.1 + freezed 3.2.3 + build_runner 2.15.0 + json_serializable 6.11.2` все coexist). Параллельно обновлены 3 rotted comments в pubspec (lines 75/85/88) — claims "analyzer ^7 lockstep" empirically false.

**This is post-Adversarial-review revision.** First-pass attempt был **extended Approach A** (3-package `dependency_overrides: matcher + test + test_api`) — verified PASS на t183, но Adversarial review (multi-agent review pass #1) identified что simpler caret approach был никогда не tested и admin's lockfile эмпирически proves caret resolves cascade без regenerate.

## Diagnostic findings (Шаг 1)

### Initial error reproduce

```
cd G:/Templates/flutter/simplified/simplified_flutter && flutter pub get
```

```
Because test >=1.25.13 <1.28.0 depends on matcher >=0.12.16 <0.12.18 ...
And because every version of flutter_test from sdk depends on matcher 0.12.19
and test >=1.31.1 depends on analyzer >=8.0.0 <14.0.0 ...
And because test >=1.27.0 <1.29.0 depends on analyzer >=8.0.0 <10.0.0
and custom_lint >=0.8.0 <0.8.1 depends on analyzer ^7.5.0,
one of flutter_test from sdk or test >=1.24.3 or custom_lint >=0.8.0 <0.8.1
must be false.
...
So, because simplified depends on both flutter_test from sdk and
custom_lint 0.8.0, version solving failed.

The lower bound of "sdk: '>=1.8.0 <3.0.0'" must be 2.12.0 or higher to enable null safety.
```

### Root cause (corrected post-Adversarial)

**Single root cause** (not two, secondary advisory "sdk >=1.8.0 <3.0.0" = pub solver hint при failed resolve):

**Strict** pin `custom_lint: 0.8.0` (no caret) блокировал pub solver от выбора 0.8.1. Свежий transitive chain через flutter SDK hint pinned `matcher 0.12.19` + `web_socket_channel ^3.0.3` (от `serverpod_client 3.4.8`) → выталкивал solver на `test >=1.28` → требующий `analyzer >=8.0.0`. Conflict с `custom_lint 0.8.0 → analyzer ^7.5.0` lock.

**Critical mid-diagnosis correction (Adversarial review):**

First-pass executor (#5/#6) утверждал: "`custom_lint 0.8.1` requires `analyzer ^8.0.0` → bump impossible без regenerate всего generated code (analyzer 7→8 cascade ломает build_runner/json_serializable/freezed lockstep)."

**Это была ошибка** — pubspec comments на lines 75/85/88 содержали rotted claims, которые executor принял на веру без empirical verification.

**Adversarial reviewer poймал:**

Sibling `simplified_admin/pubspec.yaml` имел IDENTICAL constraints (включая `json_serializable: 6.11.2` strict, `freezed: ^3.0.6`, `build_runner: ^2.4.15`, `serverpod_flutter 3.4.8`) **кроме одного**: `custom_lint: ^0.8.0` (caret vs strict).

**Admin's `pubspec.lock` empirical evidence:**

```
analyzer: 8.4.0
build_runner: 2.15.0
custom_lint: 0.8.1
freezed: 3.2.3
json_serializable: 6.11.2
matcher: 0.12.19
test: 1.30.0
test_api: 0.7.10
web_socket_channel: 3.0.3
```

Все coexist. The "analyzer 7→8 cascade requires regenerate" mental model — **falsified**.

### Reference baseline t179 vs current state (registry drift)

| Package | t179 (TASK-024 lockfile, 2026-05-04) | Current resolve (flutter caret, 2026-05-25) |
|---|---|---|
| custom_lint | 0.8.0 | **0.8.1** (caret bump allows) |
| analyzer | 7.6.0 | **8.4.0** (cascade) |
| test | 1.26.2 | 1.30.0 |
| test_api | 0.7.6 | 0.7.10 |
| matcher | 0.12.17 | 0.12.19 (flutter SDK pin) |
| freezed | (3.0.x) | 3.2.3 |
| build_runner | (2.4.x) | 2.15.0 |
| json_serializable | 6.11.2 | 6.11.2 (strict, compatible с analyzer 8) |
| web_socket_channel | 3.0.3 | 3.0.3 |
| serverpod_flutter | 3.4.8 | 3.4.8 |

Stack-lock invariant сохраняется (Riverpod/Drift/sync_core/Serverpod runtime versions intact).

## Approach evaluation (Шаг 2 + post-Adversarial revision)

| Approach | Описание | Verdict | Reason |
|---|---|---|---|
| A (pure) | `dependency_overrides: test: 1.26.2` | ❌ insufficient | test 1.26.2 → test_api 0.7.6 конфликтует с flutter SDK pin |
| A (extended) | `dependency_overrides: matcher + test + test_api` к t179 baseline | ⚠ first-pass applied (PASS t183), then rejected post-Adversarial | Override flutter SDK hint pins — semantic violation stack-lock spirit; 3-package scope vs single-char alternative |
| B | Drop custom_lint + riverpod_lint | ❌ rejected | Tooling regression — потеря lint feature |
| C | analyzer 8 cascade — bump custom_lint к 0.8.1 + build_runner + json_serializable + freezed + riverpod_generator/lint | ❌ rejected (incorrect premise) | "Major refactor + regenerate generated code" claim was based on rotted comments. Sibling admin proves cascade auto-resolves без manual bump (только custom_lint caret нужен; остальные strict pins compatible с analyzer 8 already). |
| D-variant-1 | Bump `custom_lint: 0.8.1` (newer strict pin) | ❌ skip | Strict 0.8.1 forces analyzer 8 cascade like E, но **без forward-tolerance** (future 0.8.2 patches ignored, yank-vulnerable). E caret = same cascade + patch-forward-tolerant. |
| **E (caret bump)** | **`custom_lint: ^0.8.0` (allows 0.8.1) + cleanup rotted comments** | ✅ **FINAL** | Single-character change, forward-compatible, exactly matches admin's working pattern, no overrides, stack-lock spirit preserved ("update к latest stable"). |

## Implementation diff

### Template (outside repo, не tracked git'ом)

`G:/Templates/flutter/simplified/simplified_flutter/pubspec.yaml`:

**Line 75-76 (rotted comment removed):**

```diff
-  # Pin to ^2.4.15 to keep analyzer ^7 lockstep с custom_lint 0.8.0 + json_serializable 6.11.x + freezed 3.0.x
-  # (build_runner >=2.11.0 requires analyzer >=8.0.0). См. TASK-024 Session E3d journal.
+  # Caret — solver resolves to 2.15.0 (analyzer 8 cascade). TASK-030 verified.
   build_runner: ^2.4.15
```

**Line 85 (rotted comment corrected):**

```diff
-  # Pin to 6.11.2 — same analyzer ^7 lockstep
+  # Strict pin 6.11.2 — compatible с analyzer 8 (verified TASK-030: resolved
+  # alongside analyzer 8.4.0 + custom_lint 0.8.1 + freezed 3.2.3).
   json_serializable: 6.11.2
```

**Line 88 (rotted comment corrected):**

```diff
-  # Pin to ^3.0.6 — analyzer ^7 lockstep (3.1+ requires analyzer >=9)
+  # Caret — solver resolves to 3.2.3 (analyzer 8). TASK-030 verified empirically.
   freezed: ^3.0.6
```

**Line 98-100 (PRIMARY fix — caret bump):**

```diff
-  # ВОЗВРАЩАЕМ: 0.8.1 требует analyzer 8.0.0, что невозможно сейчас.
-  custom_lint: 0.8.0
+  # TASK-030 (2026-05-23): caret bump 0.8.0 → ^0.8.0 — allows custom_lint 0.8.1
+  # which forces analyzer 8 cascade (resolves к 8.4.0, NOT v9 как старые комментарии
+  # claimed). Verified empirically через admin's pubspec.lock pattern. Strict pin
+  # 0.8.0 ранее боксил pub solver на analyzer ^7, что конфликтовало со свежим
+  # flutter SDK hint pins (matcher 0.12.19 + test_api 0.7.10) → "version solving failed".
+  # Caret = forward-compatible, minimal-disruptive fix без overrides.
+  custom_lint: ^0.8.0
```

**No `dependency_overrides` block** (extended A overrides removed после Adversarial revision).

### Repo (git tracked)

```
git status:
 modified:   ai/docs/agent_memory.md   (gotcha rewritten с diagnostic lesson + bump date к 2026-05-25)
 modified:   ai/docs/status.md          (TASK-030 row + TASK-025..029 BLOCKED status)
 Untracked:  ai/bug-reports/021-pub-deps-drift-template-pubspec.md   (rewritten — caret approach + Adversarial lesson)
 Untracked:  ai/tasks/active/TASK-030-chore---fix-simplified-template-custom-lint-pin--pubget-drift/
              ├── task.md   (статусы Шаги 1-5 → [x], Журнал с full rework history)
              └── report.md (этот файл, rewritten)
```

## Local verify (post-caret-bump)

```
$ cd G:/Templates/flutter/simplified/simplified_flutter && flutter pub get
Resolving dependencies...
+ ... (218 packages resolved, analyzer 8.4.0 cascade like admin)
Changed 218 dependencies!
49 packages have newer versions incompatible with dependency constraints.
Try `flutter pub outdated` for more information.
$ echo $?
0
```

Resolved versions (verified через `pubspec.lock` post-bump):

```
analyzer: "8.4.0"
build_runner: "2.15.0"
custom_lint: "0.8.1"
freezed: "3.2.3"
json_serializable: "6.11.2"
matcher: "0.12.19"
test: "1.30.0"
test_api: "0.7.10"
web_socket_channel: "3.0.3"
```

**Matches admin's pattern exactly.** No SDK hint pin overrides needed.

`simplified_admin` + `simplified_server`: no changes needed (admin already had caret; server doesn't use custom_lint).

## E2E verify on fresh t184 (User mandatory acceptance criterion) — ✅ PASS

```bash
codegen create-project --name t184 --template simplified --human  # 256440ms ≈ 4.3min
codegen verify --name t184 --human                                  # 63572ms ≈ 1.1min
```

**create-project output (250 files created, 9 modified):** All intermediate steps PASS — `serverpod create`, `flutter create`, generation service, pubspec patching, agent infrastructure, AppDatabase, git init, 3× `flutter pub get` PASS, Drift WASM worker, `serverpod generate`, `serverpod create-migration`, `dart run build_runner build -d` (×2).

**Completeness check on t184 (all PASS):**

- `G:/Projects/Flutter/serverpod/t184/t184_admin/` exists ✓
- `G:/Projects/Flutter/serverpod/t184/t184_flutter/lib/core/sync/` exists ✓
- `G:/Projects/Flutter/serverpod/t184/t184_flutter/lib/features/configuration/` exists ✓
- `G:/Projects/Flutter/serverpod/t184/t184_flutter/pubspec.yaml` line 104: `custom_lint: ^0.8.0` (caret carried correctly into bootstrap) ✓
- **NO `dependency_overrides` block** in t184_flutter/pubspec.yaml — confirmed ✓

**`verify --name t184 --human` full output:**

```
PASS: verify t184
  project: G:\Projects\Flutter\serverpod\t184
  ✓ flutterAnalyze — 44460ms (errors=0, warnings=0, infos=30)
  ✓ pubGet — 3844ms
  ✓ serverpodGenerate — 12787ms
  ✓ buildRunner — 2480ms
Total: 63572ms
```

**Counts match t183 baseline exactly: `errors=0 warnings=0 infos=30`** — caret approach achieves identical result без overrides. Three-way lockfile match (template / admin sibling / fresh t184) = strong empirical proof.

**Historical reference (t183, extended A first-pass, kept for diff baseline — но extended A approach was REJECTED post-Adversarial; t184 is canonical):**

```
PASS: verify t183
  project: G:\Projects\Flutter\serverpod\t183
  ✓ flutterAnalyze — 46355ms (errors=0, warnings=0, infos=30)
  ✓ pubGet — 3746ms
  ✓ serverpodGenerate — 12716ms
  ✓ buildRunner — 3540ms
Total: 66360ms
```

## Regression checks

- `tsc -p ./` — clean (silent exit 0)
- `eslint src --ext ts` — clean (0 errors, 18 pre-existing warnings — `curly` rule на existing files, не trog'ались)
- mocha suite — НЕ запускался (template-only chore, no `src/test/` changes)

## Adversarial findings status (multi-agent review pass #1)

| # | Severity | Description | Status |
|---|---|---|---|
| C1 | CRITICAL | report.md ложно claim admin/server без custom_lint | ✅ FIXED — caret approach replaces extended A, report rewritten с corrected analysis |
| C2 | CRITICAL | Caret `^0.8.0` никогда не tested | ✅ FIXED — caret tested empirically, PASS. Applied как final approach. Extended A reverted. |
| C3 | CRITICAL | Rotted comments lines 75/85/88 about analyzer ^7 lockstep | ✅ FIXED — все 3 comments rewritten с empirical evidence |
| H4 | HIGH | status.md attribution misrepresented | ⚠ DEFERRED — это карry'нуто из prior session (TASK-025 BLOCKED status). Will be cleaned in commit message. |
| H5 | HIGH | Overrides drift again on `flutter upgrade` | ✅ FIXED — caret approach **eliminates** overrides entirely. Future SDK updates наоборот benefit (caret allows newer custom_lint). |
| H6 | HIGH | No verification admin/server overrides cleared | ✅ N/A — no overrides applied (caret approach). Admin already worked без changes (caret уже там); server doesn't use custom_lint. |
| H7 | HIGH | simplified template has no widget tests | ⚠ ACKNOWLEDGED — out-of-scope этой TASK. Tests могут add'ться later — caret approach actually **safer** для future tests (no SDK hint pin override). |
| M8 | MEDIUM | `custom_lint 0.8.0` strict pin unjustified | ✅ FIXED — caret bump applied |
| M9 | MEDIUM | Stack-lock spirit (backward pinning matcher 0.12.17) | ✅ FIXED — no overrides, no backward pinning. Forward "update к latest stable" принцип |
| M10 | MEDIUM | No regression test для template integrity | ⚠ DEFERRED — кандидат для follow-up TASK |
| M11 | MEDIUM | "57 packages have newer versions incompatible" warning | ⚠ ACKNOWLEDGED — same with caret approach (49 packages, listed в `flutter pub outdated`). Same long-term concern, не блокер. Quarterly audit per BUG-021. |
| L12 | LOW | BUG-015..018 missing from bug-reports | ⚠ OUT-OF-SCOPE — pre-existing numbering gap, не TASK-030 vина |
| L13 | LOW | Test project leakage (t180..t184) | ⚠ COMPLIANCE — sandbox policy, не моя зона |
| L14 | LOW | "Test plan" wording | ✅ FIXED в этой версии report — renamed к "Manual validation (post-merge recommended)" ниже |

## Manual validation (post-merge recommended)

- [ ] `cd G:/Projects/Flutter/serverpod/t184/t184_flutter && flutter test` — widget tests baseline (если они existed; currently template has no tests).
- [ ] `cd G:/Templates/flutter/simplified/simplified_flutter && flutter pub outdated` — snapshot для future drift detection. Should show ~49 outdated packages (acceptable baseline).
- [ ] `cd G:/Templates/flutter/simplified/simplified_admin && flutter pub outdated` — sibling cross-check.

## Re-verify после merge (post-merge teamlead obligation)

- [ ] `git checkout master && git pull` после merge
- [ ] `codegen create-project --name t185` + `codegen verify --name t185` — confirm master зелёный

## Files (absolute paths)

**Outside repo (template):**

- `G:/Templates/flutter/simplified/simplified_flutter/pubspec.yaml` (caret bump + 3 comments cleanup)

**Inside repo (git tracked / staged):**

- `g:/Projects/vs_code_extensions/code-generator/ai/bug-reports/021-pub-deps-drift-template-pubspec.md` (rewritten — caret approach + Adversarial lesson)
- `g:/Projects/vs_code_extensions/code-generator/ai/docs/agent_memory.md` (gotcha rewritten + date bump)
- `g:/Projects/vs_code_extensions/code-generator/ai/docs/status.md` (TASK-030 row + TASK-025..029 BLOCKED)
- `g:/Projects/vs_code_extensions/code-generator/ai/tasks/active/TASK-030-.../task.md` (Журнал + статусы)
- `g:/Projects/vs_code_extensions/code-generator/ai/tasks/active/TASK-030-.../report.md` (этот файл)

**Test projects (sandbox-protected, остаются на disk):**

- `G:/Projects/Flutter/serverpod/t184/` — ✅ caret approach canonical baseline (PASS errors=0, warnings=0, infos=30)
- `G:/Projects/Flutter/serverpod/t183/` — extended A reference (PASS errors=0, but ultimately rejected approach — diff baseline only)
- `G:/Projects/Flutter/serverpod/t182/` — wrong-template orphan (CLI default mistake — t115 не simplified, ignore)
- `G:/Projects/Flutter/serverpod/t181/` — pre-fix verify FAIL evidence
- `G:/Projects/Flutter/serverpod/t180/` — partial bootstrap evidence (kill-mid-op)

## Process notes (для future executors)

1. **Compare sibling templates pre-diagnosis.** TASK-030 first-pass took ~1.5h investigating "analyzer cascade impossible" when sibling admin's lockfile proved cascade auto-resolves в 5-minute read. Always check `<sibling>/pubspec.lock` для empirical evidence до theoretical analysis.
2. **Verify pubspec comments empirically.** Comments claiming "X requires Y" rot at scale. Cross-check current registry state ИЛИ sibling resolution до доверия комментарию.
3. **Multi-agent Adversarial review delivers.** Standard reviewer #1 missed the simpler-alternative concern. Adversarial reviewer #1 caught critical diagnostic error. This is canonical multi-agent review value evidence — single reviewer would have approved suboptimal fix.

## Decision required from teamlead

1. After E2E verify t184 PASS — re-spawn 2 reviewers (Standard + Adversarial) для approval caret approach (since extended A approach was reviewed but rejected, caret needs fresh review).
2. После reviewers approve — commit + PR + ждать User merge approval.
