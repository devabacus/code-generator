# Дорожная карта проекта

Высокоуровневый план развития code-generator.

**Обновлено:** 2026-04-18

---

## Текущая фаза

**Фаза:** Фаза 1 — Стабилизация
**Фокус:** починка критических багов генератора, покрытие тестами entity-генератора, документация для AI-агентов
**Критерии завершения:**
- BUG-001 и BUG-002 закрыты
- Unit-тесты покрывают `code_formatter`, `server_yaml_parser`, `relation_generation`, `app_database_generator`
- `ai/docs/` заполнен (TASK-001)
- Вопрос с мержем `feature--create-cli` → `master` закрыт

---

## Фазы

### Фаза 1: Стабилизация (текущая)

**Цель:** генератор без известных критических багов, базовое тестовое покрытие, документация.

**Включает:**

- [~] TASK-001 — заполнить базовую документацию (`ai/docs/`) — **in progress, ждёт approval**
- [ ] TASK-002 — fix BUG-001 (Ref disposed в state_providers) — **High**
- [ ] TASK-003 — fix BUG-002 (camelCase → snake_case имён файлов) — **Medium**
- [ ] TASK-004 — unit-тесты для entity-генератора (code_formatter, server_yaml_parser, relation_generation, app_database_generator)
- [ ] ADR-0001 (реальный) — перенести `docs-code-generator/decisions/adr-0001-logger-in-templates.md` в `ai/docs/decisions/` и утвердить
- [ ] Merge `feature--create-cli` → `master` (или решить, что жить с dev-веткой)

**Уже сделано до создания этого roadmap:**

- [x] CLI-адаптер + 10 команд (`out/adapters/cli/index.js`)
- [x] Decoupling `src/core/*` от vscode (lazy require)
- [x] Unified `addMicroservice` команда для любого языка
- [x] Регистрация всех 11 VS Code команд в `extension.ts`
- [x] Тесты для openapi-bridge, template-service, openapi-parser
- [x] Замена `antigravity` на `code` для открытия нового окна
- [x] `.vscode/settings.json` → workspace TypeScript 5.9.3

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

---

## Заметки

- Roadmap — живой документ, обновляется по мере развития
- Изменения требуют одобрения User
- Strategy Agent / дискуссии могут предлагать изменения, но не принимают решения
- Маркеры задач: `[ ]` — TODO, `[~]` — in progress, `[x]` — done
