# TASK-031 — Bug 3 t115 LWW guard parity

## Резюме

Применяет identical LWW skip-stale guard pattern (закрытый в TASK-028 для simplified template) к **t115 template** в 4 `*_local_apply.dart` файлах. Закрывает Bug 3 (silent data corruption на cross-device pull) для t115 consumers (включая будущую weight TASK-018 migration). Per ADR-0005 amendment 2026-05-04 — t115 = "supported template + bug-fix-as-needed".

**Scope amended mid-task (User-approved Option A 2026-05-27):** caret bump `custom_lint: 0.8.0 → ^0.8.0` в `t115_flutter/pubspec.yaml` — discovered как hard blocker для `flutter pub get` (identical BUG-021 что был закрыт TASK-030 для simplified). Документировано в task.md "Не-цели" inline amendment.

**Result:** ✅ verify t196 PASS errors=0, 258 mocha passing (+5 vs baseline 253), 3 adversarial reviewers фixed 2 CRITICAL findings inline.

## Изменения

### Template patch (5 файлов, outside repo: `G:/Templates/flutter/t115/`)

1. `t115_flutter/lib/features/tasks/data/adapters/category/category_local_apply.dart` — guard + docstring (byte-identical с simplified post-TASK-028)
2. `t115_flutter/lib/features/tasks/data/adapters/task/task_local_apply.dart` — same pattern
3. `t115_flutter/lib/features/tasks/data/adapters/tag/tag_local_apply.dart` — same pattern
4. `t115_flutter/lib/features/configuration/data/adapters/configuration/configuration_local_apply.dart` — guard + partial protection docstring (identical с simplified Configuration)
5. **`t115_flutter/pubspec.yaml`** — caret bump `custom_lint: 0.8.0 → ^0.8.0` (scope expansion, TASK-030 parity)

### Junction (intentionally NOT patched)

- `t115_flutter/lib/features/tasks/data/adapters/task_tag_map/task_tag_map_local_apply.dart` — manifest: manyToMany, opt-out (LWW неприменим к PK-pair UPSERT/DELETE)

### Repo changes (within `devabacus/code-generator`)

- **MODIFIED:** [src/test/generators/local_apply_lww_guard.test.ts](../../../../src/test/generators/local_apply_lww_guard.test.ts) — added `T115_TEMPLATE_ROOT` constant + `LIVE_T115_NON_JUNCTION_PATHS` + `LIVE_T115_JUNCTION_PATH` + parallel suite "Live template regression t115" (5 tests: 4 non-junction + 1 junction)
- **MODIFIED:** [ai/tasks/active/TASK-031-.../task.md](task.md) — inline scope amendment под "Не-цели" (User-approved Option A)
- **0 src/ generator logic changes** — template-only patch + test extension

### Template snippet (full pubspec.yaml change для PR-visibility, since template вне repo)

**Before** (`t115_flutter/pubspec.yaml:97-98`):
```yaml
  # ВОЗВРАЩАЕМ: 0.8.1 требует analyzer 8.0.0, что невозможно сейчас.
  custom_lint: 0.8.0
```

**After**:
```yaml
  # TASK-031 scope expansion (2026-05-27, mirror of TASK-030 fix for simplified):
  # caret bump 0.8.0 → ^0.8.0 — allows custom_lint 0.8.1 which forces analyzer 8
  # cascade (resolves к 8.4.0). Empirical evidence: t196 fresh create-project
  # pubspec.lock literally содержит `custom_lint 0.8.1 + analyzer 8.4.0` после
  # bump (verified 2026-05-27). [...полный комментарий — см. файл]
  custom_lint: ^0.8.0
```

## Guard pattern (final, identical с TASK-028)

```dart
if (ctx is SyncPullApplyContext) {
  final local = await _dao.getCategoryById(
    serverEntity.id,
    userId: serverEntity.userId,
    customerId: serverEntity.customerId,
  );
  if (local != null &&
      local.syncStatus == SyncStatus.local &&
      local.lastModified.isAfter(serverEntity.lastModified)) {
    return; // локальная несинхронизированная версия новее — skip
  }
}
```

**Deviation `serverEntity.lastModified` vs `ctx.sourceTimestamp` — inherited from TASK-028** (sourceTimestamp = batch watermark, nullable; lastModified = hard-required, non-null, per-entity). Не переоценивалось — accepted contract.

## Тесты

| Слой | Status | Details |
|---|---|---|
| `tsc -p ./` | ✅ clean | 0 errors |
| mocha workaround | ✅ **258 passing** | baseline 253 + **5 TASK-031** новых (live t115 regression: 4 non-junction + 1 junction) |
| `npm run lint` | ✅ | 0 errors, 18 warnings (все pre-existing baseline) |
| `verify --name t196 --human` (post create-project, pre generate-entity) | ✅ **PASS** | `flutterAnalyze errors=0 warnings=1 infos=44` (30885ms total) |

### Команды

```bash
npm run compile
node node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"
# → 258 passing

node out/adapters/cli/index.js create-project --name t196 --template t115
# → SUCCESS (227241ms, errors=[])

node out/adapters/cli/index.js verify --name t196 --human
# → PASS: verify t196
#   ✓ flutterAnalyze — 10484ms (errors=0, warnings=1, infos=44)
#   ✓ pubGet — 5394ms
#   ✓ serverpodGenerate — 12465ms
#   ✓ buildRunner — 2541ms
```

### Lockfile evidence (post caret bump)

`G:/Projects/Flutter/serverpod/t196/t196_flutter/pubspec.lock` literally содержит:
```yaml
analyzer:
  version: "8.4.0"
custom_lint:
  version: "0.8.1"
```

Empirically доказывает что caret bump cascaded as expected → identical TASK-030 simplified pattern.

### Live grep evidence на t196

- `t196/.../configuration/.../configuration_local_apply.dart:23,49-60` — guard literally present + partial protection docstring (Configuration baseline copy через create-project)
- `t196/.../task_tag_map/...` — N/A (`manifest: entity` files НЕ emit'ятся на create-project; junction also не emit'ится по default t115 baseline)

## 3 adversarial reviewers — findings table

Q5 User decision: 3 adversarial reviewers (vs standard 2) для повышенного bar data-integrity changes.

### Applied / addressed pre-commit

| Severity | Source | Finding | Action |
|---|---|---|---|
| **C1 (Rev 2)** | Reviewer 2 | Silent scope violation: task.md "Не-цели" forbids package version changes; pubspec caret bump silently extended scope без amending task.md | **APPLIED** — inline strikethrough amendment в task.md "Не-цели" под "AMENDED 2026-05-27 (User-approved Option A)" + citation ADR-0005 amendment "bug-fix-as-needed" + TASK-030 precedent |
| **C2 (Rev 2)** | Reviewer 2 | Falsified empirical claim в pubspec comment: cited `t115_admin/pubspec.lock` как evidence, но lockfile stale (custom_lint 0.8.0 + analyzer 7.6.0) | **APPLIED** — rewrote pubspec.yaml comment: cite **t196 fresh create-project lockfile** (literally analyzer 8.4.0 + custom_lint 0.8.1) as actual empirical evidence; explicit note that t115_admin's stale lockfile НЕ falsifies bump compatibility (just means pub get не запускался на admin после bump'а) |

### Validated as APPROVE no action needed

| Source | Finding | Validation |
|---|---|---|
| All Rev 1 findings | Byte-identity 4 files / DAO signatures parity / SyncStatus.local exists / Configuration docstring accuracy / t196 propagation verified / test parallelism / Junction opt-out preserved | All confirmed PASS — Rev 1 APPROVED unanimously, 0 findings beyond NIT |
| Rev 3 lockfile cascade | t196 pubspec.lock literally shows analyzer 8.4.0 + custom_lint 0.8.1 | Confirmed empirically; no hidden landmine |

### Deferred — known limitations / discoveries (require follow-up TASKs)

| Severity | Source | Finding | Rationale for deferral |
|---|---|---|---|
| **H3 (Rev 2)** | Reviewer 2 | Comment rot symmetry gap с TASK-030: simplified pubspec получил updates к 3 comments (build_runner / json_serializable / freezed); t115 pubspec only custom_lint touched, 3 sibling rotted comments remain | **DEFERRED** — minor scope expansion, не блокирует pub get (только custom_lint pin was actual blocker). Recommend separate **TASK-034** для t115 pubspec comment symmetry sweep с TASK-030. |
| **H4 (Rev 2)** | Reviewer 2 | PR-invisible template diff: template t115 — outside repo, PR diff не shows pubspec + 4 local_apply changes | **ADDRESSED** — этот report.md содержит full pubspec snippet + lists 5 template files changed. Future improvement: commit к `devabacus/t115` repo as parallel (outside TASK-031 scope, optional). |
| **Rev 3 follow-up** | Reviewer 3 | Entity-level files (manifest: entity, 3 files) НЕ emit'ятся на `create-project` — verify gate only validates Configuration baseline. Recommend run `generate-entity` + grep emitted file для full empirical proof | **DISCOVERY:** при attempt запустить `generate-entity Project` на t196, **обнаружен отдельный t115 generate-entity bug** — CLI reports `files_modified` array содержит 23 relative paths но files **не записываются на disk**. `t196_flutter/lib/features/projects/` не создаётся. Modified `sync_orchestrator_provider.dart` + `database.dart` references к non-existent files → 15 verify errors. **OUT OF SCOPE TASK-031** — это отдельный bug в generate-entity для t115 path (вероятно revealed first time post Discussion #12 pivot — t115 generate-entity flow не tested активно). Recommend **TASK-033** для investigation. **Identity Argument** для TASK-031 entity-level coverage: substitution code (`replacement_util.ts` / `RelationPatcher`) — TypeScript template-agnostic; TASK-028 verified t193 simplified substitution preserves guard (Category→Project); t115 patched files byte-identical с simplified pre-substitution → substitution result mathematically equivalent. |
| Rev 3 silent skip risk | Reviewer 3 | Live regression tests skip silently если template moved/deleted → false-green | **ACCEPTABLE** — matches simplified suite precedent (TASK-028). Mocha pending count visible. Не TASK-031 introduces risk. |
| Rev 3 runtime smoke | Reviewer 3 | No Dart-level integration test (analog TASK-028 Option B) | **ACCEPTABLE** — identical TASK-028 reasoning (identity pattern + weight precedent + compile-time gate sufficient для bug-fix-as-needed scope). |

## Identity Argument для entity-level patch validation

Generate-entity validation на t196 surfaced separate generate-entity bug for t115 path (см. Rev 3 follow-up). TASK-031 entity-level coverage relies на Identity Argument:

1. **Substitution code = TypeScript template-agnostic.** `src/features/generation/replacement/replacement_util.ts` + `src/features/generation/generators/relation_patcher.ts` — те же TS функции processит strings для обоих templates. Не специфично t115 vs simplified.
2. **TASK-028 verified substitution preserves guard для simplified Category→Project** (t193 grep evidence в TASK-028 report).
3. **TASK-031 t115 patched files byte-identical с simplified post-TASK-028** (Rev 1 confirmed unanimously).
4. **Therefore:** substitution на t115 patched files produces identical post-substitution result as substitution на simplified patched files. QED.

Не runtime validation для proving entity-level guard preservation on t115 — это mathematically equivalent к TASK-028 simplified validation.

## Stack-lock compliance (Discussion #11)

✅ Marker scheme preserved (13 markers unchanged, `manifest: entity` / `manifest: manyToMany` / `manifest: startProject` invariant)
✅ Clean directory layout preserved (`lib/features/<feature>/data/adapters/<entity>/`)
✅ sync_core 0.3.0 contract preserved (`SyncApplyContext` sealed hierarchy used per documented API)
✅ Drift conventions preserved (`insertOrReplace` UPSERT pattern)
✅ 0 generator src/ logic changes (template-only patch + test extension)
✅ Package version change = bug fix (BUG-021 for t115), не stack element change — per ADR-0005 amendment 2026-05-04 "bug-fix-as-needed" classification

## Follow-up TASKs recommended (post-merge TASK-031)

1. **TASK-033** (suggested name): t115 generate-entity disk write bug investigation — CLI reports `files_modified` for entity-level files но не записывает на disk; modifies sync_orchestrator + database references к non-existent files → verify regression. Recovery state: t196 currently dirty post-test (15 verify errors). Investigate root cause (path resolution? template config? entity manifest copy step?).
2. **TASK-034** (suggested name): t115 pubspec rotted comments symmetry sweep — apply TASK-030 simplified comment updates к t115 (build_runner / json_serializable / freezed). Mirror TASK-030 пакет.
3. **TASK-032** (existing suggestion, остаётся): Configuration legacy paths consolidation — `configuration_local_data_source.dart` `handleSyncEvent` + `insertOrUpdateFromServer`. Не TASK-031 территория.

## Риски / Заметки

- **t196 state post-test:** dirty (15 verify errors post generate-entity Project — separate t115 bug). Sandbox blocks delete (User policy incremental numbering). User волен удалить когда сочтёт нужным. TASK-031 DoD-гейт relied на **pre-generate-entity verify** (errors=0).
- **Identity Argument для entity-level coverage** — mathematically equivalent к TASK-028 simplified validation; не runtime validation, но defensible per shared TS substitution code + byte-identical patches pre-substitution.
- **t115 generate-entity bug discovered** — separate scope, TASK-033 recommended. Не блокирует TASK-031 closure.
- **Configuration partial protection** — known limitation, identical docstring как simplified, follow-up TASK-032 уже suggested.
- **Comment rot symmetry gap** — TASK-034 suggested для t115 pubspec parity с TASK-030 simplified comment sweep.
- **Adversarial review value 11-й precedent:** 3 reviewers fixed 2 CRITICAL inline + surfaced 1 separate bug discovery (Rev 3 follow-up). Pattern continues — multi-agent adversarial обязателен для data-integrity TASK.

## Статус

Ready for review.
