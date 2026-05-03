# Дорожная карта проекта

Высокоуровневый план развития code-generator.

**Обновлено:** 2026-05-02

---

## Текущая фаза

**Фаза:** Фаза 1.5 — sync_core 0.3.0 templates integration (новая, blocking для weight TASK-018)
**Фокус:** обновить codegen чтобы `create-project` + `generate-entity` производили sync_core 0.3.0 multi-entity patterns (5-adapter-per-entity bundle, mutation-first Repository, orchestrator registration patching)

**Контекст (cross-repo):** sync_core 0.3.0 в master, t115/TASK-001 ✅ done 2026-05-02 (5 entities cross-device sync на Windows + Android). t115 template на disk (`G:/Templates/flutter/t115/`) уже содержит validated sync_core 0.3.0 patterns после TASK-001 — но **БЕЗ codegen manifest markers**. Подтверждено сканом 2026-05-02:

- 8 файлов в `lib/core/sync/` (`sync_orchestrator_provider.dart` etc.) — нет `// manifest: startProject` → не копируются при `create-project`
- 25 adapter файлов в `lib/features/*/data/adapters/<entity>/` — нет `// manifest: entity` / `manyToMany` → не генерируются при `generate-entity`
- `sync_orchestrator_provider.dart` — нет marker блоков для патчинга `register<X>` + `syncEntityTypes`

**Pipeline (approved sync_core teamlead 2026-05-02; updated 2026-05-03 per Discussion #3):**

```
[codegen TASK-X1] sync_core 0.3.0 templates integration ✅ done (PR #2)
   ▼
[codegen TASK-013] junction detection robust YAML field analysis ✅ done (PR #3)
   ▼
[codegen TASK-014] junction adapter file path generation для non-Map entities ✅ done (PR #4)
   ▼
[codegen BUG-013] template markers fill (Approach A — marker block seed)
   🟡 PR 2 — re-sequenced first per Discussion #4 (BUG-013 blocks reduced-scope verify)
   ─ Approach A: marker block seed в task_repository_impl.dart + task_usecases.dart
   ─ Provider plumbing в task_usecase_providers.dart если audit need
   ─ 5-min audit gate ДО start + 90-min hard ceiling
   ─ Marker в usecases на top-level (EOF), не в class — критично для relation_patcher
   ▼
[codegen TASK-012] todo real app generation — partial close
   🟡 PR 1 — после PR 2 merge: TASK-012 ветка rebase + re-verify должен PASS errors=0
   ─ Reduced scope: drop assigneeId, ≥1 FK + 1 junction
   ─ Runtime evidence в report.md (verify counts, regression checks)
   ─ TASK-012 active → done partial, явная пометка: BUG-012 не exercised
   ▼
[codegen BUG-012] parser relation(parent=X) directive parsing
   ─ PR 3 — independent от PR 2/1, ~1-2 days
   ─ 5-layer regression tests, multi-agent code review
   ─ Closes weight TASK-018 production landmine (defaultTerminalSetId)
   ▼ (after BUG-013 + BUG-012 BOTH merged)
[codegen TASK-XXX re-acceptance] full FK alias scenario
   ─ Fresh project + entity с FK alias (assigneeId, parent=member)
   ─ codegen verify PASS errors=0 без manual patches
   ─ flutter analyze clean на template directly (BUG-013 DoD verified)
   ─ cross-device runtime smoke (2 устройства sync через Serverpod)
   ▼ acceptance gate ✅ (Phase 1.5 finally closes)
```

**Cross-repo blocking:** weight TASK-018 (13 entities production migration) **не стартует** до закрытия **re-acceptance TASK** (НЕ TASK-012 partial). Hard gate без Soft Launch.

**Phase 1.5 status — НЕ closed.** TASK-012 partial closure ≠ Phase 1.5 done. Confirmed production landmine в weight: `customer_user.spy.yaml defaultTerminalSetId, parent=terminal_set` (strip-Id ≠ parent) точно сломает migration без BUG-012 fix.

**Doc corrections (2026-05-03, Discussion #3 finalization):**
- CLAUDE.md L118 + agent_memory.md убрали ложь про «8 layers patcher» — реально 1 layer markers (interface) + 4-5 hardcoded inheritance + **2 broken** (repository_impl, usecases). См. [BUG-013](../bug-reports/013-template-markers-gap-repository-impl-usecases.md).
- См. [BUG-012](../bug-reports/012-server-yaml-parser-ignores-relation-parent-directive.md) re parser gap.

### Hard gate: TASK-013 + TASK-014 junction detection — ✅ Resolved (2026-05-02)

**Status:** ✅ **Fully closed via TASK-013 + TASK-014 (Variant B split per User decision 2026-05-02).**
- **Detection-side ✅ closed via TASK-013** — junction detection refactored через `JunctionDetector.isJunctionEntity()` shared utility. Discussion #2 unanimous consensus (Q1=C / Q2=A / Q3=A) approved by User 2026-05-02.
- **File path generation ✅ closed via TASK-014** — `MANY_TO_MANY` parametrization + `_getDestinationPath` junction-aware two-entity rewrite + `_JUNCTION_REGISTER_TEMPLATE` FK placeholders. DoD verify PASS errors=0 на t157 (E2E ProjectMember junction generate-entity flow). 119 tests passing (110 baseline + 9 new TASK-014 regression).
- **Production migration weight TASK-018 unblocked** после `[codegen TASK-X2]` (todo smoke) acceptance ✅.

**Original problem:** `OrchestratorPatcher` использовал heuristic `model.className.endsWith('Map')` для детекции junction (many-to-many) entities. Если weight имеет junction-style entity (2+ FK + минимум domain полей) БЕЗ `Map` суффикса → false-negative routing через regular template → silent data divergence на out-of-order writes.

**Audit результат (TASK-011 Phase G4 + round 3 follow-up, 2026-05-02):**
- Initial audit (Phase G4) проверил 14 sync entities (имеют `*_sync_event.spy.yaml`) — verdict "trivially passed".
- **Round 3 adversarial follow-up: failed — 2 false-negative cases confirmed.**
  - `RolePermission` — pure 2-FK junction (`roleId` + `permissionId`), file `weight_server/lib/src/models/user/role_permission.spy.yaml`.
  - `CustomerUser` — 3-FK + 1 nullable FK junction-style, file `weight_server/lib/src/models/user/customer_user.spy.yaml`.

**TASK-013 fix (2026-05-02, detection-side only):** replaced `endsWith('Map')` / `includes('Map')` heuristics на shared `JunctionDetector.isJunctionEntity()` utility (single source of truth) в 4 production decision-paths (3 required + 1 bonus from grep audit):
- `parsers/server_yaml_parser.ts:13→32` (model.isRelation flag, dependency ordering fix: parseFields() ДО isRelation evaluation)
- `parsers/entity_yaml_validator.ts` (junction skip pattern в validate() + validateSyncEvent())
- `generators/orchestrator_patcher.ts:52→58` (template selection)
- `generators/relation_patcher.ts:32` (bonus 4th call-site discovered through grep audit)

Detection rules: structural (2+ FK relations + 0 non-FK fields outside base whitelist) OR explicit `junction: true` YAML field. Nullable FK = FK. См. [`ai/bug-reports/junction-detection-audit.md`](../bug-reports/junction-detection-audit.md) re-audit section (2026-05-02).

**Re-audit verification (37 weight YAML files programmatic scan через JunctionDetector):** обе false-negative cases (RolePermission + CustomerUser) **correctly classified as junction** через structural detection. **No new false-negatives** discovered. **No false-positives** introduced.

**TASK-014 ✅ done 2026-05-02:** "junction adapter file path generation для non-Map entities (RolePermission case + general M2M two-entity rename)". Bug был в **отдельном code path**: `replacement_util.ts MANY_TO_MANY` словарь не заменял template entity name (`taskTagMap`) на target entity (`rolePermission`) в file paths/filenames + class name `Map` суффикс leak. После TASK-014 — параметризованы `templEntity1/templEntity2` + `targetJunctionClassName` для substitution `task_tag_map/TaskTagMap/taskTagMap` → `<target>/...` literals; `_getDestinationPath` детектит junction context через `model.isRelation` и применяет two-entity rewrite; `_JUNCTION_REGISTER_TEMPLATE` использует `__FK1__/__FK2__` placeholders для docstring (`junction FK→role+permission` вместо hardcoded `task+tag`).

**DoD evidence TASK-014:**
- t157 verify PASS errors=0 после E2E generate-entity flow (Project + Member + ProjectMember junction)
- 119 tests passing (110 baseline + 9 new — replacement_util / generation_service / orchestrator_patcher regression)
- ProjectMember adapter files в `t157_flutter/lib/features/projects/data/adapters/project_member/` (НЕ `task_tag_map/`) с `ProjectMember*.dart` class refs (НЕ `ProjectMemberMap`)
- Backward compat verified: TaskTagMap target → identical output (no-op substitution chain)

**BUG-010 placeholder (создан в TASK-013 backlog):** `code_formatter.ts:81 !field.name.includes('Map')` — silent data loss landmine для fields с "Map" в имени (mapData, bitmapJson, mapboxToken, coordinatesMap). НЕ junction detection (separate concern, field-name filter в Drift Value wrapper). Out-of-scope TASK-013 + TASK-014.

**Hard gate status для weight TASK-018:**
- Detection-side ✅ closed (TASK-013) — junction routing correct at migration time.
- File path generation ✅ closed (TASK-014) — non-Map junctions (RolePermission, CustomerUser) генерируются в правильную directory с правильными class refs.
- **Production migration weight TASK-018 unblocked** после TASK-X2 (todo smoke) acceptance ✅.

**Критерии завершения Фазы 1.5 (updated 2026-05-03 per Discussion #3):**
- ✅ TASK-X1/TASK-011 merged
- ✅ TASK-013 (junction detection) merged
- ✅ TASK-014 (junction file path generation) merged
- 🟡 TASK-012 partial (reduced scope, drop assigneeId — НЕ exercises FK alias)
- ❌ BUG-012 (parser parent= directive) — **pending**, blocking
- ❌ BUG-013 (template markers gap) — **pending**, blocking
- ❌ Re-acceptance TASK с full FK alias scenario — **pending**, blocking
- weight TASK-018 unblocked **только после** re-acceptance TASK closed ✅ (НЕ после TASK-012 partial)

---

## Фаза 1 — Стабилизация (около 80% завершена)

**Фокус:** починка критических багов генератора, расширение тестового покрытия, runtime-DoD-гейт
**Критерии завершения:**
- BUG-001 закрыт (BUG-002, 003, 004, 005, 006 уже закрыты на 2026-04-26)
- TASK-010 закрыта (`codegen verify --runtime` для runtime-гарантий)
- Unit-тесты покрывают `code_formatter`, `server_yaml_parser` (62 passing — остальные части генератора уже покрыты)
- Merge `feature--fix-codegen-regen-bugs` → `master`

---

## Фазы

### Фаза 1: Стабилизация (текущая, ~80% done)

**Цель:** генератор без известных критических багов, базовое тестовое покрытие, документация.

**Включает:**

- [~] TASK-001 — заполнить базовую документацию (`ai/docs/`) — **in progress, ждёт approval**
- [ ] TASK-002 — fix BUG-001 (Ref disposed в state_providers) — **High**, единственный открытый High баг
- [x] TASK-003 — fix BUG-002 (camelCase → snake_case имён файлов) — закрыта 2026-04-25
- [x] TASK-008 — fix BUG-003 (relation_patcher идемпотентный) — закрыта 2026-04-25
- [x] TASK-009 — fix BUG-004 (pre-flight YAML валидация) — закрыта 2026-04-25
- [x] BUG-005 (AppDatabaseGenerator scan-based) — закрыт 2026-04-26
- [x] BUG-006 (migration append, найден внешними агентами TASK-015 в weight) — закрыт 2026-04-26
- [~] TASK-010 — `codegen verify --runtime` + sync_smoke_test шаблон — **active**
- [ ] TASK-004 — unit-тесты для оставшихся `code_formatter`, `server_yaml_parser`
- [ ] ADR-0001 (реальный) — перенести `docs-code-generator/decisions/adr-0001-logger-in-templates.md` в `ai/docs/decisions/` и утвердить
- [ ] Merge `feature--fix-codegen-regen-bugs` → `master` (14 коммитов)

**Уже сделано до создания этого roadmap:**

- [x] CLI-адаптер + **11 команд** включая `verify` (`out/adapters/cli/index.js`)
- [x] Decoupling `src/core/*` от vscode (lazy require)
- [x] Unified `addMicroservice` команда для любого языка
- [x] Регистрация всех 11 VS Code команд в `extension.ts`
- [x] Тесты для openapi-bridge, template-service, openapi-parser
- [x] Замена `antigravity` на `code` для открытия нового окна
- [x] `.vscode/settings.json` → workspace TypeScript 5.9.3
- [x] **`autoGenerateTasksFeature` + `patchPubspecPackagePaths`** в `create-project` — свежий проект сразу компилируется
- [x] **`codegen verify` команда** + Definition of Done в CLAUDE.md
- [x] **62 passing tests** (relation_patcher, entity_yaml_validator, replacement_util, app_database_generator, verify_analyzer_parser)

### Фаза 2: Масштабирование микросервисов

**Цель:** унифицированная поддержка микросервисов на всех языках на уровне эталона.

**Включает:**

- [ ] Feature parity: Python / Node / Go микросервисы дают одинаковый набор /health, /ready, / endpoints и одинаковую интеграцию с Serverpod
- [ ] Добавить новый язык (кандидаты: Rust, Java, .NET) — проверить расширяемость `MicroserviceLanguage`
- [ ] Тесты для workflow-модулей (`core/services/workflow/*`): modifyForMonorepo, moveWorkflowToRepoRoot, updateK8sManifests и т.д.

### Фаза 3: UX и DevEx

**Цель:** инструмент можно использовать без знания внутренностей.

**Включает:**

- [ ] README.md проекта с полным примером workflow (create project → add microservice → deploy)
- [ ] CLI `--help` с живыми примерами для каждой команды (сейчас только signatures)
- [ ] Плагинная архитектура: шаблоны (`t115`) подключаются как packages, а не хардкодятся в `create_new_project.ts:36` / `create_project.ts:44`
- [ ] Поддержка нескольких версий шаблона (`t115`, `t120`, ...) с выбором через CLI/UI
- [ ] Cross-platform пути (убрать хардкод `G:/Templates`, `G:/Projects/Flutter/serverpod`)

### Фаза 4: CI/CD и публикация

**Цель:** расширение ставится из VS Code Marketplace, CLI — из npm.

**Включает:**

- [ ] GitHub Actions: автотесты + lint на PR
- [ ] Автогенерация CHANGELOG через git-cliff (Conventional Commits уже используем)
- [ ] Публикация VS Code расширения в Marketplace
- [ ] Публикация CLI `codegen` в npm

---

## История изменений

| Дата | Что изменилось | Причина |
|---|---|---|
| 2026-04-18 | Создана первая версия roadmap.md (TASK-001) | Заполнение `ai/docs/` |
| 2026-04-18 | Добавлен блок "Уже сделано" в Фазу 1 | User попросил освежить доки, многое из старого roadmap уже реализовано |
| 2026-04-25 | TASK-008/009 — закрыты BUG-002/003/004 | Фикс багов генератора, найденных в weight-проекте |
| 2026-04-26 | BUG-005 (scan-based) и BUG-006 (migration append) закрыты | t141→t142→t143 цикл итераций; BUG-006 найден внешними агентами TASK-015 в weight |
| 2026-04-26 | Добавлены `codegen verify`, `autoGenerateTasksFeature`, `patchPubspecPackagePaths`, Definition of Done в CLAUDE.md | t143 PASS с первого create-project + runtime HTTP 200 |
| 2026-04-26 | TASK-010 заведена | Закрыть DoD-дыру для runtime-проверки |
| 2026-05-02 | Добавлена Фаза 1.5 — sync_core 0.3.0 templates integration | Cross-repo gate: t115/TASK-001 ✅ done в sync_core ecosystem; codegen TASK-X1/X2 blocking weight TASK-018 (13 entities production migration). Скан t115 template показал отсутствие manifest markers на 8 core/sync + 25 adapter файлах — codegen не покрывает sync_core 0.3.0 generation. |

---

## Заметки

- Roadmap — живой документ, обновляется по мере развития
- Изменения требуют одобрения User
- Strategy Agent / дискуссии могут предлагать изменения, но не принимают решения
- Маркеры задач: `[ ]` — TODO, `[~]` — in progress, `[x]` — done
