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

**Pipeline (approved sync_core teamlead 2026-05-02):**

```
[codegen TASK-X1] sync_core 0.3.0 templates integration
   ─ Phase A: manifest markers в t115 template (STOP-gate, прогон create-project + verify regression)
   ─ Phase B: orchestrator marker блоки (:syncImports / :syncRegistrations / :syncEntityTypes)
   ─ Phase C: orchestrator_patcher.ts (analog relation_patcher) + tests
   ─ Phase D: patchPubspecPackagePaths fix (sync_core вне Packages monorepo)
   ─ Phase E: codegen agent_memory + architecture cleanup (drop R1 stack)
   ─ DoD: create-project --name t<N+1> + verify --name t<N+1> PASS errors=0
   ▼
[codegen TASK-X2] todo real app generation + smoke
   ─ create-project --name todo + generate-entity для 3-5 entities (FK + junction)
   ─ flutter analyze 0 errors
   ─ cross-device runtime smoke (2 устройства sync через Serverpod)
   ▼ acceptance gate ✅ (двойной gate перед weight TASK-018)
```

**Cross-repo blocking:** weight TASK-018 (13 entities production migration) **не стартует** до закрытия codegen TASK-X2 acceptance. Это hard gate без Soft Launch — sync_core teamlead координирует через `G:/Projects/Flutter/Packages/sync_core/ai/docs/roadmap.md`.

### Hard gate: TASK-013 junction detection (revised post round 3)

**weight TASK-018 НЕ стартует пока TASK-013 не closed.**

`OrchestratorPatcher` использует heuristic `model.className.endsWith('Map')` для детекции junction (many-to-many) entities. Если weight имеет junction-style entity (2+ FK + минимум domain полей) БЕЗ `Map` суффикса → false-negative routing через regular template → silent data divergence на out-of-order writes.

**Audit результат (TASK-011 Phase G4 + round 3 follow-up, 2026-05-02):**
- Initial audit (Phase G4) проверил 14 sync entities (имеют `*_sync_event.spy.yaml`) — verdict "trivially passed".
- **Round 3 adversarial follow-up: failed — 2 false-negative cases confirmed.** Initial audit использовал leaky selection criterion (только existing sync entities) и не учёл junction-style entities которые уже на disk но не в sync set yet.
  - `RolePermission` — pure 2-FK junction (`roleId` + `permissionId`), file `weight_server/lib/src/models/user/role_permission.spy.yaml`.
  - `CustomerUser` — 3-FK + 1 nullable FK junction-style, file `weight_server/lib/src/models/user/customer_user.spy.yaml`.
- См. [`ai/bug-reports/junction-detection-audit.md`](../bug-reports/junction-detection-audit.md) — секция "False-negative discovered post-audit (round 3 adversarial)".

**Hard gate (revised):** TASK-018 blocking until TASK-013 closed. Это fixed gate, не trigger-based. Без TASK-013 fix RolePermission/CustomerUser получают broken routing на момент migration в sync set.

**TASK-013 priority bumped Medium → High** ([backlog.md](../tasks/backlog.md)). Scope: replace `endsWith('Map')` heuristic на YAML field analysis (2+ FK + ≤1 non-FK поле → junction) ИЛИ explicit `junction: true` flag в YAML.

**Критерии завершения Фазы 1.5:**
- TASK-X1 merged → t115 regression PASS (existing template работает после маркеров + патчер)
- TASK-X2 merged → fresh todo app sync working cross-device
- Junction detection audit done (✅ TASK-011 Phase G4) + post-audit findings documented (✅ round 3, 2026-05-02)
- **TASK-013 closed** (junction false-negative fix shipped)
- weight TASK-018 unblocked

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
