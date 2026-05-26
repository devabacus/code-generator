# TASK-029 — Bug 5: `generate-entity --with-server` opt-in (default OFF)

## Резюме

Закрывает **Bug 5 (последний в 5-task TASK-019 weight handoff pipeline)** — breaking-change CLI behaviour для `generate-entity`: по умолчанию **НЕ пишет** в `<project>_server/`, запись на server-side opt-in через `--with-server` flag. Default OFF из least-surprise: TASK-019 B2 incident (vanilla `generate-entity` молча модифицировал 6 endpoint'ов в `weight_server/` + создал snake-дубли — пришлось ручной `git checkout HEAD -- weight_server/`).

**Filter scope:** для manifests `entity` и `manyToMany` — `server/` scan_dir исключается из `directoriesToScan` когда `withServer=false`. **`startProject` exempt** (`create-project` всегда генерит server baseline — иначе пустой `<project>_server/`). Microservice manifests (`pythonStart`, `goStart`, `nodeStart`) + `deploy` тоже exempt.

**Co-fix (RelationPatcher leak — adversarial caught):** RelationPatcher также применяет filter на `server/` scan_directories когда `!withServer` (предотвращает regen leak когда server endpoint marker block уже существует).

**3 adversarial reviewers** (Q5 User decision — повышенный bar для breaking CLI change) выявили 1 CRITICAL + 7 HIGH findings; решения по каждому в секции "Findings table".

**Pipeline 5/5 closed** ✅ после merge этого PR.

## Изменения

### Core (4 файла + 1 secondary)

1. [src/features/generation/config/generation_config.ts](../../../../src/features/generation/config/generation_config.ts) — `+withServer: boolean` field (default `false`)
2. [src/features/generation/generators/generation_service.ts](../../../../src/features/generation/generators/generation_service.ts):
   - `+shouldScanDir(manifestName, dir, withServer): boolean` — pure filter helper
   - `+computeScanDirs(manifestNames, withServer): Set<string>` — aggregate filter
   - Refactor `generate()` метод для использования `computeScanDirs`
3. [src/adapters/cli/commands/generate_entity.ts](../../../../src/adapters/cli/commands/generate_entity.ts):
   - `+--with-server` CLI flag, default `false`
   - `+logger.info('Scope: ...')` после entity parse — visible scope confirmation (R1 H1 fix)
4. [src/adapters/vscode/commands/create_data_files_by_replacement.ts](../../../../src/adapters/vscode/commands/create_data_files_by_replacement.ts):
   - `+quickPick` prompt с двумя options (`Client only (default)` / `Client + Server`)
   - quickPick **БЕФОРЕ** `pickPath` (R1 H3 UX fix — abort scope раньше, не теряем feature)
   - `ignoreFocusOut: true` (R1 H2 fix — focus loss не dismiss'нет prompt)
   - `showInformationMessage('Generation cancelled')` на abort (R1 M1 UX fix)
   - Placeholder rewording из technical jargon (`TASK-029: silent scope creep`) в end-user friendly (R1 H1 fix)
5. **[src/features/generation/generators/relation_patcher.ts](../../../../src/features/generation/generators/relation_patcher.ts)** — **adversarial caught leak fix** (R2 C-1):
   - `scanDirectories.filter(dir => dir !== 'server/' || config.withServer)` — RelationPatcher теперь тоже skip'ает server scan когда `!withServer`. Без этого regen scenario мог записать в existing `<project>_server/.../foo_endpoint.dart` с `:oneToManyMethods` marker block

### Tests + Docs

- **NEW:** [src/test/generators/with_server_filter.test.ts](../../../../src/test/generators/with_server_filter.test.ts) — **20 unit tests, 4 suites:**
  - `shouldScanDir` helper (8 tests — все combinations manifest × dir × withServer)
  - `computeScanDirs` aggregate (5 tests — entity/M2M/startProject/combined)
  - Integration via GenerationService + MockFileSystem (3 tests — Scenario A no-writes + Scenario B specific path assertion + Test 5 positive control)
  - Defensive: undefined / missing withServer field (4 tests — `withServer || false` correctness для legacy callers)
- [ai/docs/agent_memory.md](../../../docs/agent_memory.md) — `+gotcha` section про default OFF (breaking change для callers, migration guide для CLI/VS Code)

## Тесты

| Слой | Status | Details |
|---|---|---|
| `tsc -p ./` | ✅ clean | 0 errors |
| mocha workaround | ✅ **253 passing** | baseline 233 + **20 TASK-029** новых, 0 failing |
| `npm run lint` | ✅ | 0 errors, 18 warnings (все pre-existing) |
| `verify --name t194` (baseline post create-project) | ✅ PASS | `flutterAnalyze errors=0 warnings=0 infos=30` (27s) — **regression test: startProject exempt** |
| `verify --name t194` (post Scenario B with --with-server) | ✅ PASS | `errors=0 warnings=0 infos=30` (35s) — server endpoint компилируется |
| `verify --name t194` (post all fixes + regen scenario) | ✅ PASS | `errors=0 warnings=0 infos=30` (26s) — RelationPatcher fix verified |

### Scenario evidence на t194

**Scenario A (без `--with-server`):**
```
Created (18):  # все в t194_flutter/...
  + .../projects/data/adapters/project/project_event_adapter.dart
  + .../projects/data/adapters/project/project_payload_codec.dart
  + .../projects/data/adapters/project/project_local_apply.dart
  ... (15 more client-side)
Modified (2):
  ~ .../core/sync/sync_orchestrator_provider.dart  (client)
  ~ .../core/data/datasources/local/database.dart  (client)
Duration: 36ms
```
**ZERO writes в `t194_server/`.** Compare к TASK-028 same project: 19 files (1 server endpoint), здесь 18 (server endpoint omitted). **Filter works.**

**Scenario B (`--with-server`):**
```
Created (1):
  + t194_server/lib/src/endpoints/project_endpoint.dart  ← THE blocked file appears
Modified (20):  # rest are re-writes of client-side
```
Server endpoint created on opt-in. **Filter unlocked correctly.**

**Regen scenario (post all fixes, без --with-server после Scenario B уже создал server endpoint):**
```
Scope: client-only (TASK-029 default — use --with-server to also write server-side files)
SUCCESS: generate-entity
Modified (20):  # все client-side, NO server file modifications
```
**RelationPatcher leak fix verified:** даже когда `project_endpoint.dart` существует, RelationPatcher теперь skip'ает server scan без `--with-server`. **Closes R2 C-1.**

## 3 adversarial reviewers — findings table

Q5 User decision: 3 adversarial reviewers (vs standard 2) для повышенного bar breaking-change.

### Applied / addressed pre-commit

| Severity | Source | Finding | Action |
|---|---|---|---|
| **CRITICAL C-1** | Reviewer 2 | RelationPatcher bypasses filter — writes к `<project>_server/...` на regen с existing `:oneToManyMethods` marker | **APPLIED** — [relation_patcher.ts:39-43](../../../../src/features/generation/generators/relation_patcher.ts#L39) — `scanDirectories.filter(...)` skip'ает 'server/' когда `!withServer`. Regen scenario t194 verifies fix (no project_endpoint.dart modification). |
| HIGH H1 (R1) | Reviewer 1 | Silent UX — нет logger feedback про scope | **APPLIED** — [generate_entity.ts](../../../../src/adapters/cli/commands/generate_entity.ts) `+logger.info('Scope: ...')` после entity parse |
| HIGH H1 (R1) | Reviewer 1 | VS Code placeholder содержит technical jargon (`TASK-029: silent scope creep`) | **APPLIED** — placeholder reword'ен в end-user friendly `'Choose what to generate: client-only (recommended) or client + server'` |
| HIGH H2 (R1) | Reviewer 1 | VS Code quickPick без `ignoreFocusOut` — focus loss = silent abort | **APPLIED** — `+ignoreFocusOut: true` |
| HIGH H3 (R1) | Reviewer 1 | UX order — quickPick должен быть ДО `pickPath` | **APPLIED** — re-ordered: scope quickPick first, feature pickPath second |
| MEDIUM M1 (R1) | Reviewer 1 | VS Code abort без сообщения user'у | **APPLIED** — `+window.showInformationMessage('Generation cancelled (scope not selected)')` |
| HIGH H1 (R3), C-2 (R2) | Reviewers 2+3 | Test 6 loose assertion (`length > 0`) — может pass для wrong reason | **APPLIED** — tightened: `assert.ok(newFiles.some(p => p === expectedServerPath))` — specific path |
| HIGH H2 (R3) | Reviewer 3 | No test для undefined `withServer` field (legacy caller scenario) | **APPLIED** — **+4 defensive tests:** missing field / undefined / explicit true / explicit false |
| HIGH H1 (R2) | Reviewer 2 | Filter — silent whitelist of 2 names (future drift risk) | **APPLIED** — `+docstring` explaining design intent + trade-off comment in `shouldScanDir` |
| Sanity (R2 C-2) | Reviewer 2 | Test 5 may vacuously pass if mock incomplete | **APPLIED** — `+Test 5 positive control` — asserts feature/ writes happen (proves generate() reached writes, не early-exit) |

### Deferred — known limitations / out-of-scope

| Severity | Source | Finding | Rationale for deferral |
|---|---|---|---|
| MEDIUM M1 (R2) | Reviewer 2 | `RelationPatcher` warning log когда патчит server без withServer | **N/A после fix** — patcher теперь не патчит server без opt-in вообще |
| MEDIUM M1, M2, M3 (R3) | Reviewer 3 | Integration tests для manyToMany flow + edge cases empty/unknown manifest | **Defer-acceptable** — pure helper tests cover logic; integration repeat для junction = низкий marginal benefit. Empty/unknown manifest cases — defensive but tested implicitly через empty Set return. |
| MEDIUM M2 (R1) | Reviewer 1 | Filter exact-string fragility к будущим nested `server/` paths | **Defer.** Сейчас manifests.ts whitelisted (всё `server/` exact). Future расширение требует обновление shouldScanDir — задокументировано в docstring trade-off comment. |
| MEDIUM M3 (R1) | Reviewer 1 | Нет CLI parsing test (`--with-server` → config field) | **Defer.** Commander integration тестируется через e2e Scenario A/B на t194. Unit test on parsing = low marginal value. |
| MEDIUM M4 (R1) | Reviewer 1 | Localization mismatch — VS Code labels EN, comments RU | **Defer.** Codebase convention = EN UI strings, RU comments. Consistent с existing patterns. |
| MEDIUM M2 (R3) | Reviewer 3 | Test 6 — substitution `category→category` no-op (identity), не proof для real rename | **Acceptable.** Mock proves filter blocks/unlocks server scan; rename logic covered отдельным `state_providers_ref_mounted.test.ts` precedent + e2e на t194. |
| LOW items (all reviewers) | various | Comments/style/markdown nits | Cosmetic, не block merge. |
| C-2 (R3) | Reviewer 3 | M5 JunctionDetector independence не asserted | **Defer.** JunctionDetector tested separately в `junction_detector.test.ts`. Cross-contract assertion = future enhancement. |

## CLI usage examples (для CHANGELOG / migration guide)

```bash
# Default: client-only (TASK-029 new behaviour)
node out/adapters/cli/index.js generate-entity \
  --yaml entity.spy.yaml \
  --feature-path G:/.../lib/features/X \
  --workspace G:/.../project_root \
  --template simplified

# Opt-in: client + server (previous default behaviour)
node out/adapters/cli/index.js generate-entity \
  --yaml entity.spy.yaml \
  --feature-path G:/.../lib/features/X \
  --workspace G:/.../project_root \
  --template simplified \
  --with-server
```

**VS Code:** при invocation `createDataFilesByReplacement` — появляется quickPick со scope choice (`Client only (default)` / `Client + Server`). Esc на quickPick → abort с info message. quickPick стоит ПЕРЕД feature pickPath — abort scope не теряет work по feature selection.

## Стэк-lock compliance (Discussion #11)

✅ 0 template changes
✅ 0 marker scheme changes (13 markers preserved)
✅ 0 package version changes
✅ 0 Clean directory layout changes
✅ sync_core 0.3.0 contract preserved
✅ Drift conventions preserved

## Pipeline 5/5 status (post merge этого PR)

| ID | Bug | Status |
|---|---|---|
| TASK-030 | Template pubGet drift | ✅ merged (PR #22) |
| TASK-025 | Bug 4 ref.mounted guard | ✅ merged (PR #23) |
| TASK-026 | Bug 1 entityType snake | ✅ merged (PR #24) |
| TASK-027 | Bug 2 enum tryParseEnum | ✅ merged (PR #25) |
| TASK-028 | Bug 3 LWW skip-stale guard | ✅ merged (PR #27) |
| **TASK-029** | **Bug 5 --with-server opt-in** | ⏳ **этот PR** |

## Risks / Notes

- **Breaking change для existing callers** — все existing scripts/CI/agent workflows вызывающие `generate-entity` без `--with-server` теперь получат только client-side. User confirmed Q2 в TASK-021 handoff: "callers в weight он сам обновит (отдельным doc-PR в weight)". Migration documented в agent_memory.md gotcha section.
- **VS Code adapter** — пользователи createDataFilesByReplacement увидят новый quickPick prompt каждый раз. Default selection ("Client only") = safe.
- **Bug 5 incident learning** preserved в agent_memory.md — почему default OFF (TASK-019 B2 reference).
- **3 adversarial reviewers value validated** — 1 CRITICAL (RelationPatcher leak) caught что 0 baseline reviewers поймали. Pattern continues per Q5 повышенный bar.

## Статус

Ready for review. Pipeline 5/5 ready to close после merge.
