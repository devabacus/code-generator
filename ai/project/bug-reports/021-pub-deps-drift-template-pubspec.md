# BUG-021: Template pubspec.yaml pub deps drift class

## Status: Closed (TASK-030, 2026-05-25)

## Описание

**Strict** pinned version (`X.Y.Z` без caret) на key package в `G:/Templates/flutter/simplified/*/pubspec.yaml` блокирует cascade resolution к newer compatible versions. Specifically, `custom_lint: 0.8.0` (strict) требовал `analyzer ^7.5.0`, но newer transitive chain через flutter SDK hint pinned `matcher 0.12.19` + `web_socket_channel ^3.0.3` (forced by `serverpod_client 3.4.8`) боксил pub solver на `test >=1.28`, который требует `analyzer >=8.0.0`. Class regression — same pattern может повторяться для других strict pinned packages при future SDK / pub registry updates.

## Симптом

`flutter pub get` FAIL с error "version solving failed" + secondary advisory "sdk >=1.8.0 <3.0.0" (pub solver hint, не отдельный root cause).

Full error chain:

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
```

## Discovered

2026-05-23 в ходе TASK-025 verify попытки на t181. Verified affects t179 baseline (TASK-024 reference) — pre-existing drift из-за pub registry / flutter SDK updates после TASK-024 merge (2026-05-04). Не вина TASK-024.

## ⚠ Diagnostic lesson (multi-agent adversarial review caught error)

**First-pass diagnosis** (TASK-030 executor #5/#6) утверждал: "`custom_lint 0.8.1` requires `analyzer ^8.0.0` → bump impossible без regenerate всего generated code (analyzer 7→8 cascade). Apply extended Approach A — `dependency_overrides: matcher + test + test_api`."

**Adversarial reviewer** (TASK-030 multi-agent review pass #1) поймал critical error:

> Sibling `simplified_admin/pubspec.yaml` имел IDENTICAL constraints кроме одного — `custom_lint: ^0.8.0` (caret vs strict). Admin's `pubspec.lock` empirically доказал что caret allows pub solver to resolve `analyzer 8.4.0 + custom_lint 0.8.1 + freezed 3.2.3 + build_runner 2.15.0 + json_serializable 6.11.2` — все coexist. The "analyzer 7→8 cascade requires regenerate" mental model — **falsified by sibling evidence.**

**Lesson:** **Compare sibling templates (admin/server) BEFORE diagnosing "cascade impossible".** Templates within same monorepo often have similar constraints with minor differences — sibling lockfile = ready-made empirical evidence.

## Root cause (corrected)

Strict pin `custom_lint: 0.8.0` (no caret) блокировал pub solver от выбора 0.8.1. 0.8.1 requires `analyzer ^8.0.0` — но this is **fine** для template (json_serializable 6.11.2 + freezed 3.2.3 + build_runner 2.15.0 + riverpod_generator/lint 3.x все compatible с analyzer 8.4.0, despite rotted comments claiming "analyzer ^7 lockstep" necessities).

## Resolution

Применён **caret bump approach** (TASK-030, post-Adversarial-review revision):

**Single-character change** в `G:/Templates/flutter/simplified/simplified_flutter/pubspec.yaml:100`:

```yaml
# Before (broken после registry drift)
custom_lint: 0.8.0

# After (TASK-030 fix)
custom_lint: ^0.8.0
```

Pub solver auto-resolves к 0.8.1 → analyzer 8.4.0 cascade. **No `dependency_overrides` needed** (extended Approach A first-pass attempt был unnecessarily invasive).

Параллельно обновлены rotted comments в pubspec.yaml (lines 75/85/88) — claims "analyzer ^7 lockstep" для build_runner / json_serializable / freezed были proven empirically false per admin's lockfile evidence (post-Adversarial rework включает sibling-template `simplified_admin/pubspec.yaml` — те же 3 rotted comments тоже cleaned).

Verified `flutter pub get` PASS + `codegen verify --name t184 --human` PASS (errors=0 — final E2E gate).

Stack-lock invariant (Discussion #11) сохраняется — Riverpod/Drift/sync_core/Serverpod runtime versions не trog'ались. Caret bump = "update к latest stable" принцип ADR-0005 Section 7 (forward motion, не backward pinning).

## Rejected approach (post-mortem)

**Extended Approach A** (`dependency_overrides: matcher: 0.12.17 + test: 1.26.2 + test_api: 0.7.6`) — first-pass attempt teamlead-approved до Adversarial review. Rejected reasons:
- Override flutter SDK hint pins (matcher/test_api) — semantic violation stack-lock "update к latest" принципа (backward pinning).
- Three-package scope vs single-character caret bump = unnecessarily invasive.
- Brittle к future SDK updates (overrides могут drift или break flutter_test runtime expectations).

Sibling-template empirical evidence (admin's lockfile) опровергло necessity. Adversarial review caught diagnostic error.

## Prevention pattern

1. **Compare sibling templates** до diagnosing "cascade impossible" — admin/server могут empirically prove caret bump works.
2. **Verify pubspec comments through lockfile evidence** — рекоментированные "X requires Y" claims могут rot post-comment-write. Period `flutter pub outdated` + cross-check siblings.
3. **Periodic audit:**
   ```bash
   cd G:/Templates/flutter/simplified/simplified_flutter && flutter pub outdated
   cd G:/Templates/flutter/simplified/simplified_admin && flutter pub outdated
   ```
   Quarterly review recommended; consider CI cron долгосрочно.

См. [TASK-030 report.md](../tasks/active/TASK-030-chore---fix-simplified-template-custom-lint-pin--pubget-drift/report.md) для full diagnostic + design rationale + Adversarial review findings.
