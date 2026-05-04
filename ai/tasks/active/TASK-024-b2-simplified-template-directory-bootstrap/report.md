# Отчёт TASK-024 — B2 simplified template directory bootstrap (Session 2)

## Резюме

Создан simplified template directory bootstrap (`G:/Templates/flutter/simplified/`) с Configuration baseline (singleton entity per ADR-0005 §3.1) + 4 fixture entities в `features/tasks/` (Category/Tag/Task/TaskTagMap) для substitution flow. Architecture ceremony stripped (no usecases / no abstract interfaces / no business notifiers / no validation / no application services / no separate mappers / no Either-Result / no datasource interfaces) в flutter app. Generator default switched к simplified через `DEFAULT_TEMPLATE = 'simplified'` в `template_profile.ts`; legacy path preserved через `--template t115` opt-in flag. BUG-019 closed end-to-end через default flow + legacy flow smokes (both errors=0).

Sessions A-E3d2 timeline:
- **Sessions A-D** — Phase B preliminary work (template content authoring, ADR-0005 §3.5 ceremony reduction)
- **Sessions E-E2** — pubspec safe bumps к latest stable + multi-template config infrastructure
- **Session E2.5/E2.6** — bootstrapper dynamic depth-delta fix для path-deps (Approach 2 patcher для Templates/Packages/ + out-of-monorepo paths)
- **Session E3d** — generator default switched к simplifiedTemplateConfig + `--template t115` legacy CLI flag preserved + defensive empty-targetEntity guard в `_getDestinationPath`
- **Session E3d2 (this session)** — `templFeatureName` default fix к 'tasks' (Configuration baseline копируется как-есть, не template fixture); simplified template orchestrator cleaned до Configuration-only baseline; tests updated; default + legacy flow smokes both PASS errors=0; BUG-019 closed end-to-end

## Изменения

### Codegen TS (`G:/Projects/vs_code_extensions/code-generator/`)

- `src/core/services/project_bootstrapper.ts` — dynamic depth-delta для path-dep patching в `pubspec.yaml` (Approach 2: detects depth difference между template и target Flutter project paths, applies `(targetDepth − templateDepth)` extra `../` levels к каждой relative path-dependency)
- `src/adapters/cli/utils/template_profile.ts` (NEW Session E3d) — централизованная конфигурация template-specific defaults (`templProject`/`templFeatureName`/`templEntity`/`templateConfig` factory) для CLI commands; `DEFAULT_TEMPLATE = 'simplified'`; `resolveTemplateProfile()` resolver
  - **Session E3d2 fix:** simplified profile `templFeatureName: 'tasks'` (was 'configuration') + `templEntity: 'category'` (was 'configuration'). Configuration baseline копируется как-есть startProject manifest, substitution-источник = `features/tasks/` Category fixture (identical с t115)
- `src/adapters/cli/commands/create_project.ts` — wire-up `resolveTemplateProfile(opts.template)` для injecting template-specific defaults
- `src/adapters/cli/commands/generate_entity.ts` — same template profile wire-up для entity generation flow
- `src/features/generation/generators/generation_service.ts` — defensive empty-targetEntity guard в `_getDestinationPath`
- `src/features/generation/config/template_config.ts` — `simplifiedTemplateConfig()` factory updated (Session E3d2): unified substitution literals с t115 (`features/tasks/` snippet templates + `category`/`taskTagMap` template entities + `task`/`tag` FK fallbacks). Configuration baseline NOT в substitution flow.
- `src/test/services/project_bootstrapper.test.ts` — tests добавлены для dynamic depth-delta variant cases
- `src/test/generators/orchestrator_patcher.test.ts` — Session E3d2 updates: simplified factory tests align к `tasks` literals (Category fixture inherited from t115 invariant per ADR-0005 §7); H-2 junctionFkFallbacks proof restructured к custom config (since simplified ↔ t115 fallbacks now identical, нужен sentinel literal для config-driven dispatch proof)

### Simplified template (`G:/Templates/flutter/simplified/`)

- Bootstrap directory: Riverpod + Drift + Clean directory layout + sync_core 5 adapters per entity + 13 markers (matching t115 ADR-0005 §7 stack lock invariant)
- Configuration baseline (`features/configuration/`) — singleton entity per ADR-0005 §3.1
- Fixture entities в `features/tasks/` (Category/Tag/Task/TaskTagMap) для template substitution flow (per Session E3d2 unification с t115)
- Architecture ceremony stripped в flutter app per ADR-0005 §3.5 (no usecases / no abstract interfaces / no business notifiers / no validation / no application services / no separate mappers / no Either-Result / no datasource interfaces)
- pubspec safe bumps к latest stable
- **Session E3d2 fix:** `lib/core/sync/sync_orchestrator_provider.dart` cleaned к Configuration-only baseline (previously had Tasks fixture imports + entityTypes + register blocks baked in → 60 errors after Session E3d default switch since `features/tasks/` adapter files не bootstrap'ятся в target startProject — they're `manifest: entity` only, copied via `generate-entity` pipeline). Tasks registrations добавляются orchestrator_patcher'ом через `generate-entity` post-bootstrap.

### Bug reports / status

- `ai/bug-reports/019-orchestrator-snippet-hardcoded-literals.md` — Status: Closed 2026-05-04 + closure note с verification evidence (t176 + t177 PASS errors=0, mocha 181 passing)
- `ai/docs/status.md` — BUG-019 row striked + closed 2026-05-04 (TASK-024 Session E3d2)
- `ai/docs/roadmap.md` — same BUG-019 closure update

### Closure-report

- `ai/tasks/done/TASK-021-.../closure-report.md` — Phase B sub-section "Phase B — TASK-024 deliverable" appended с deliverables / verification / sign-offs

## Тесты

- **Mocha unit tests:** 181/181 passing post Session E3d2 fix (compile clean → no regressions)
- **Default flow smoke (t176):**
  - `create-project --name t176` ✅ success Duration=213750ms
  - `verify --name t176` ✅ PASS errors=0, warnings=0, infos=30 (Total=30680ms)
  - Shape verify: 0 usecases в `t176_flutter/`, 0 abstract repository interfaces (`i_*_repository.dart`), features dir = baseline (auth/bluetooth/configuration/developer_tools/home/settings_definitions/) — без Tasks fixture leak в startProject baseline
- **Legacy flow smoke (t177):**
  - `create-project --name t177 --template t115` ✅ success Duration=239355ms
  - `verify --name t177` ✅ PASS errors=0, warnings=1, infos=44 (Total=31313ms) — regression preserved
- **Strip checklist (per ADR-0005 §3.5):** all-zero usecases / interfaces в `t176_flutter` (subdirectories of admin app keep auth usecases per its own ceremony — что correct, simplified ceremony reduction applies к `flutter/` only)
- **Stack lock preserved:** Riverpod + Drift + sync_core + Serverpod package SET unchanged (только version bumps к latest stable applied separately)

Как запустить:
```bash
cd "G:/Projects/vs_code_extensions/code-generator"
npm run compile
node node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"

# Default flow smoke (next available test project number):
node out/adapters/cli/index.js create-project --name t<N> --human
node out/adapters/cli/index.js verify --name t<N> --human

# Legacy flow smoke:
node out/adapters/cli/index.js create-project --name t<N+1> --template t115 --human
node out/adapters/cli/index.js verify --name t<N+1> --human
```

## Риски / Заметки

### Sandbox `rm` блокировка

В Session E3d2 попытка удалить `t174` (post-failure smoke project) через `rm -rf` / `Remove-Item` была заблокирована sandbox'ом. Per User memory note "PowerShell sandbox limits — не workaround", flagged User'у и продолжил с incremental numbering (t176 / t177 для retry smokes). t174 / t175 остались как failure baseline references (60 errors / 0 errors соответственно).

### Simplified template orchestrator state pre-E3d2

Pre-Session-E3d2 simplified template's `sync_orchestrator_provider.dart` имел Tasks fixture registrations (Category/Tag/Task/TaskTagMap) baked in. Это результат authoring earlier sessions — Configuration baseline должен только содержать Configuration registration (additional entities добавляются через `generate-entity` pipeline post-bootstrap). Session E3d2 cleaned файл к Configuration-only baseline (matching t115 pattern + matching docstring at lines 53-55 описывающий semantic).

### tests update semantic

Session E3d2 unified simplified ↔ t115 substitution literals (Category fixture в `features/tasks/`, Configuration = startProject baseline копируется как-есть). Это означает что previous tests asserting simplified config has `configuration` literals more not validate ceremony reduction differentiation — semantic protection теперь работает через:
1. Config-driven dispatch proof (custom config с sentinel literals в restructured H-2 test)
2. Default flow smoke shape verify (0 usecases / 0 abstract interfaces в `t<N>_flutter` для simplified)
3. Legacy flow regression preservation (t115 path интact)

### BUG-020 carry-over

`BUG-020` (junction substitution coupled с hardcoded `templEntity1`/`templEntity2` defaults в `replacement_util.ts` + `generation_service.ts` + `relation_patcher.ts`) **stays open** для follow-up TASK либо TASK-023 Session 2. BUG-019 closure addresses orchestrator-side; junction-substitution-side BUG-020 — separate axis, не блокирует TASK-024 acceptance.

### Phase C downstream

После TASK-024 merge — Phase C (synthetic reference project t<200>) starts. Test-inventory Open Questions #1-#3 могут require update based on simplified template directory layout decisions made в Session E3d2.

## Статус

Ready for multi-agent review (4 reviewers per multi-agent review pattern). Sessions A-E3d2 complete:
- Mocha 181/181 passing
- Default flow smoke t176 PASS errors=0
- Legacy flow smoke t177 PASS errors=0
- BUG-019 closed end-to-end
- closure-report Phase B sub-section appended
- status.md / roadmap.md updates applied

Pending для Phase B closure:
- Multi-agent review (4 reviewers) apply
- PR created + reviewed + merged
- Phase B section status updates → ✅ closed
