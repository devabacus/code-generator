# Дорожная карта проекта

Высокоуровневый план развития code-generator.

**Обновлено:** 2026-04-26

---

## Текущая фаза

**Фаза:** Фаза 1 — Стабилизация (около 80% завершена)
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

---

## Заметки

- Roadmap — живой документ, обновляется по мере развития
- Изменения требуют одобрения User
- Strategy Agent / дискуссии могут предлагать изменения, но не принимают решения
- Маркеры задач: `[ ]` — TODO, `[~]` — in progress, `[x]` — done
