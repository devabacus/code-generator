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
| **Rev 3 follow-up** | Reviewer 3 | Entity-level files (manifest: entity, 3 files) НЕ emit'ятся на `create-project` — verify gate only validates Configuration baseline. Recommend run `generate-entity` + grep emitted file для full empirical proof | **RESOLVED — entity-level evidence получен напрямую (2026-05-28).** Первоначальная попытка `generate-entity Project --feature-path projects` записала файлы в codegen repo CWD, что я ошибочно диагностировал как "t115 generate-entity bug" (предлагал TASK-033). **Bisect (4 commits до pre-Phase B) + root cause analysis показали: это была usage error, НЕ баг генератора.** CLI `--feature-path` ожидает **full absolute path** (`<workspace>/<project>_flutter/lib/features/<feature>`), а я передал relative `projects`. VS Code adapter ([create_data_files_by_replacement.ts:80-83](../../../../src/adapters/vscode/commands/create_data_files_by_replacement.ts)) передаёт full path из `pickPath(config.featuresPath)` — поэтому в нормальном flow проблемы нет. Повтор с full path → файлы корректно записаны в `t196_flutter/lib/features/projects/`, **guard preserved через Category→Project substitution** ([project_local_apply.dart:45-53](../../../../../../Flutter/serverpod/t196/t196_flutter/lib/features/projects/data/adapters/project/project_local_apply.dart): `if (ctx is SyncPullApplyContext)` + `getProjectById` + `syncStatus == SyncStatus.local` + `isAfter(serverEntity.lastModified)`). **TASK-033 CANCELLED — нет генераторного бага.** Optional nice-to-have: CLI мог бы reject/normalize relative `--feature-path` (low-priority UX papercut, не bug). |
| Rev 3 silent skip risk | Reviewer 3 | Live regression tests skip silently если template moved/deleted → false-green | **ACCEPTABLE** — matches simplified suite precedent (TASK-028). Mocha pending count visible. Не TASK-031 introduces risk. |
| Rev 3 runtime smoke | Reviewer 3 | No Dart-level integration test (analog TASK-028 Option B) | **ACCEPTABLE** — identical TASK-028 reasoning (identity pattern + weight precedent + compile-time gate sufficient для bug-fix-as-needed scope). |

## Entity-level patch validation — ACTUAL evidence (2026-05-28)

Изначально entity-level coverage опиралась на Identity Argument (substitution code template-agnostic). После root-cause analysis Rev 3 "discovery" (= моя CLI usage error, не баг) получено **прямое empirical evidence**:

`generate-entity` с **full absolute** `--feature-path` на t196 → `t196_flutter/lib/features/projects/data/adapters/project/project_local_apply.dart` содержит guard preserved через Category→Project substitution:

```dart
if (ctx is SyncPullApplyContext) {
  final local = await _dao.getProjectById(        // ← getCategoryById substituted
    serverEntity.id,
    userId: serverEntity.userId,
    customerId: serverEntity.customerId,
  );
  if (local != null &&
      local.syncStatus == SyncStatus.local &&
      local.lastModified.isAfter(serverEntity.lastModified)) {
    return;
  }
}
```

Substitution preserves guard literals + correctly renames DAO method (`getCategoryById` → `getProjectById`). Это закрывает Rev 3 entity-level gap **напрямую** (не via Identity Argument). Identity Argument остаётся valid как теоретическое обоснование, но теперь есть actual disk evidence.

**End-to-end verify** (t196 с сгенерённым Project entity): `verify --name t196 --human` → **PASS errors=0 warnings=1 infos=44** (57500ms; pubGet + serverpodGenerate + buildRunner + flutterAnalyze все ✓). Доказывает что t115 generate-entity flow (с full `--feature-path`) производит компилируемый проект с guard'ом intact.

### ⚠ Self-correction note (честность)

Первоначальный report заявлял "обнаружен отдельный t115 generate-entity bug" + предлагал TASK-033. **Это было неверно.** Bisect (4 commits до pre-Phase B `ce3c7ca`) показал что симптом воспроизводится везде → не регрессия. Root cause analysis ([generate_entity.ts:128](../../../../src/adapters/cli/commands/generate_entity.ts) + [generation_config.ts:111](../../../../src/features/generation/config/generation_config.ts)): CLI `--feature-path` ожидает full absolute path, я передал relative `projects` → files написались relative к CWD (codegen repo). VS Code adapter передаёт full path корректно. **TASK-033 CANCELLED.** Lesson: verify usage перед заявлением "generator bug" — empirical verification поймал бы это раньше bisect'а.

## Stack-lock compliance (Discussion #11)

✅ Marker scheme preserved (13 markers unchanged, `manifest: entity` / `manifest: manyToMany` / `manifest: startProject` invariant)
✅ Clean directory layout preserved (`lib/features/<feature>/data/adapters/<entity>/`)
✅ sync_core 0.3.0 contract preserved (`SyncApplyContext` sealed hierarchy used per documented API)
✅ Drift conventions preserved (`insertOrReplace` UPSERT pattern)
✅ 0 generator src/ logic changes (template-only patch + test extension)
✅ Package version change = bug fix (BUG-021 for t115), не stack element change — per ADR-0005 amendment 2026-05-04 "bug-fix-as-needed" classification

## Follow-up TASKs recommended (post-merge TASK-031)

1. ~~**TASK-033** t115 generate-entity disk write bug~~ — **CANCELLED 2026-05-28.** Не баг, моя CLI usage error (relative `--feature-path`). См. self-correction note выше.
2. **TASK-034** (suggested name): t115 pubspec rotted comments symmetry sweep — apply TASK-030 simplified comment updates к t115 (build_runner / json_serializable / freezed). Mirror TASK-030 пакет.
3. **TASK-032** (existing suggestion, остаётся): Configuration legacy paths consolidation — `configuration_local_data_source.dart` `handleSyncEvent` + `insertOrUpdateFromServer`. Не TASK-031 территория.
4. **Optional (low-priority UX):** `generate-entity` CLI мог бы reject/normalize relative `--feature-path` (resolve against `config.featuresPath` или error на relative). Защита от usage error что я допустил. Не bug, papercut.

## Риски / Заметки

- **t196 state post-test:** dirty (был entity-level test + первоначальная usage error). Sandbox blocks delete (User policy incremental numbering). User волен удалить когда сочтёт нужным. TASK-031 DoD-гейт relied на **pre-test verify** (errors=0).
- **Entity-level guard validation** — получено прямое disk evidence (`project_local_apply.dart` preserves guard через substitution); Identity Argument остаётся valid теоретическим backup.
- **TASK-033 CANCELLED** — заявленный "t115 generate-entity bug" оказался моей CLI usage error (relative `--feature-path`). Bisect + root cause confirmed. Не блокирует closure.
- **Weight backlog readiness implication:** removal TASK-033 blocker means generate-entity works для new feature dirs **если caller передаёт full absolute `--feature-path`** (VS Code adapter делает это корректно). Weight regen scenario НЕ blocked генераторным багом.
- **Configuration partial protection** — known limitation, identical docstring как simplified, follow-up TASK-032 уже suggested.
- **Comment rot symmetry gap** — TASK-034 suggested для t115 pubspec parity с TASK-030 simplified comment sweep.
- **Adversarial review value 11-й precedent:** 3 reviewers fixed 2 CRITICAL inline. Rev 3 entity-level recommendation корректно подтолкнул к actual validation — что вскрыло мою usage error (изначально mislabeled как generator bug). Lesson: multi-agent review value подтверждён, но verify usage перед "generator bug" claim.

## Статус

Ready for review.
