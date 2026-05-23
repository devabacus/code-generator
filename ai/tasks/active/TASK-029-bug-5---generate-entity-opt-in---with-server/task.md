# TASK-029: Bug 5 — `generate-entity` opt-in `--with-server`, default OFF (+ create_project regression guard)

> Часть пакета 5 фиксов из TASK-019 weight ревью (Сессия 2). Порядок: 4→1→2→3 → **этот пятый (последний)**.
> Tracking origin: [weight TASK-021 handoff](../../../../../Flutter/serverpod/weight/ai/tasks/active/TASK-021-generator-root-followup/task.md) → Bug 5 / B2.
> Stack-lock invariant (Discussion #11) applies.
> **3 adversarial reviewers** (User decision Q5) — breaking-change scope.
>
> **NB (refined post-research):** create-project использует `manifest: ['startProject']`, фильтр применяется только к `entity` / `manyToMany`. Раннее опасение про create-project regression **снято** при условии корректной реализации фильтра по manifest — но **explicit regression test обязателен** (см. acceptance).

## Ветка

`feature/TASK-029-bug-5-opt-in-with-server`

## Цель

CLI команда `codegen generate-entity` по умолчанию **НЕ пишет** в `<project>_server/` директорию. Запись на server-side — opt-in через флаг `--with-server`. Default OFF из least-surprise (TASK-019 B2: vanilla `generate-entity` молча модифицировал 6 endpoint'ов в `weight_server/` + создал 6 snake-дублей — пришлось руками `git checkout HEAD -- weight_server/`).

**Со-фикс / regression guard:** `create-project` под капотом зовёт `GenerationService.generate(...)` с `manifest: ['startProject']`. Этот manifest сканирует `flutter/`, `server/`, `admin/`, `feature/` ([manifests.ts:4-13](../../../../src/features/generation/generators/manifests.ts#L4-L13)) — то есть **создание нового проекта генерит server baseline корректно** (это нужно, иначе пустой weight_server/). **Фильтр `withServer` применяется ТОЛЬКО к `entity` / `manyToMany` manifest'ам, НЕ к `startProject`.**

После Bug 5: `generate-entity --with-server` — explicit opt-in. `generate-entity` без флага — только client side (`feature/` scan_dir, без `server/`). `create-project` — generates server по-прежнему (regression test обязателен).

## Не-цели

- НЕ менять `create-project` поведение для server bootstrap (он должен генерить server baseline как раньше).
- НЕ trogать microservice flows (`pythonStart` / `goStart` / `nodeStart` manifest'ы — они независимы).
- НЕ trogать `deploy` manifest (не CRUD-related).
- НЕ менять semantics существующего `--skip-validation` или других флагов.
- НЕ trogать t115 шаблон.
- НЕ удалять файлы в `<project>_server/` которые **уже** написаны раньше — Bug 5 prevents future writes, but doesn't roll back history.

## Scope

**Разрешено редактировать:**

- `src/adapters/cli/commands/generate_entity.ts` — добавить `--with-server` flag, default `false`
- `src/features/generation/config/generation_config.ts` — поле `withServer: boolean` (default false)
- `src/features/generation/generators/generation_service.ts` — фильтрация scan_dirs: для `entity` / `manyToMany` manifest'ов skip `server/` когда `!config.withServer`
- `src/adapters/cli/commands/create_project.ts` — **только если** требуется defensive передача `withServer: true` явно (даже хотя startProject manifest exempt от фильтра, явная передача защищает от багов фильтра). Executor решает.
- `src/adapters/vscode/` — VS Code команда `generate-entity` тоже должна получить флаг (UI/CommandPalette prompt либо checkbox/quickPick). Executor решает дизайн.
- `src/test/` — unit + integration tests
- `ai/docs/agent_memory.md` — добавить gotcha про default OFF (breaking-change для callers)
- `CLAUDE.md` (project) — обновить пример `codegen generate-entity` команды если применимо

**Запрещено:**

- t115 шаблон / simplified шаблон — это CLI behavior fix, не template
- `create-project` server bootstrap logic (только сам флаг можно явно передавать defensive — поведение не меняется)
- Любые другие manifest'ы

## Критерии приёмки

- [ ] `generate_entity.ts` имеет флаг `.option('--with-server', 'Also write server-side endpoint/sync_event files (default: client-only)', false)`.
- [ ] `generation_config.ts` имеет поле `withServer: boolean` с default `false`.
- [ ] `generation_service.ts` фильтрует scan_dirs:
  - Для `entity` / `manyToMany` manifest'ов: если `!config.withServer` — `server/` исключается из `directoriesToScan`.
  - Для `startProject` manifest'а: фильтр НЕ применяется (server всегда генерится при create-project).
- [ ] `create-project` regression test (mandatory): `codegen create-project --name t184` всё ещё генерит `t184_server/` с baseline файлами (Configuration entity etc.) — без `--with-server` нужного, потому что startProject manifest exempt.
- [ ] VS Code команда `generate-entity` имеет UI флаг (checkbox/quickPick) для opt-in (если VS Code adapter trogается). Default = unchecked. **Если VS Code adapter откладывается** — flag в `report.md` + agent_memory как known технический долг (default ON в VS Code = inconsistent с CLI).
- [ ] Unit test `src/test/generators/with_server_filter_test.ts`:
  - Test 1: `entity` manifest + `withServer=false` → scan_dirs не содержит `server/`
  - Test 2: `entity` manifest + `withServer=true` → scan_dirs содержит `server/`
  - Test 3: `manyToMany` manifest + `withServer=false` → scan_dirs не содержит `server/`
  - Test 4: `startProject` manifest + `withServer=false` → scan_dirs всё ещё содержит `server/` (no filter)
  - Test 5: integration — mock filesystem + `generate-entity` без `--with-server` → no writes в `*_server/`
  - Test 6: integration — `--with-server` → writes в `*_server/` происходят
- [ ] `npm run compile` + `npm run lint` clean, mocha workaround passing.
- [ ] `codegen verify --name t184 --human` PASS (через create-project только, проверяет что server baseline по-прежнему генерится).
- [ ] На t184 manual evidence:
  - Без `--with-server`: `generate-entity` → snapshot `git status t184_server/` → **clean** (no changes).
  - С `--with-server`: `generate-entity` → snapshot `git status t184_server/` → **modified files** (endpoint + sync_event).
- [ ] Update [ai/docs/agent_memory.md](../../../docs/agent_memory.md) с записью про default OFF (breaking change для callers).
- [ ] `report.md` с CLI evidence + дизайн-решение по VS Code UI.
- [ ] **3 adversarial reviewers** (User decision Q5) до commit'а.

## План работы

1. [ ] Прочитать `CLAUDE.md`, `AGENTS.md`, agent_memory, [handoff TASK-021](../../../../../Flutter/serverpod/weight/ai/tasks/active/TASK-021-generator-root-followup/task.md) → Bug 5 / B2, [weight TASK-019 Сессия 2 → 🔴 B2](../../../../../Flutter/serverpod/weight/ai/tasks/done/TASK-019-phase-weight-2-sync-core-wire-up/task.md).
2. [ ] Прочитать существующие [generate_entity.ts](../../../../src/adapters/cli/commands/generate_entity.ts), [generation_service.ts](../../../../src/features/generation/generators/generation_service.ts), [manifests.ts](../../../../src/features/generation/generators/manifests.ts), [generation_config.ts](../../../../src/features/generation/config/generation_config.ts).
3. [ ] Добавить `withServer: boolean` в `IGenerationConfig` + `GenerationConfig` (default false).
4. [ ] Добавить флаг `--with-server` в `generate-entity` CLI option, default false.
5. [ ] Pass через CLI handler в `GenerationConfig` constructor.
6. [ ] В `GenerationService.generate(...)`:
   - после `directoriesToScan` сборки, если `(manifest === 'entity' || manifest === 'manyToMany') && !config.withServer` — удалить `server/` из set.
   - Альтернатива: фильтрация в самом scanning loop по prefix `'server/'`.
   - Executor выбирает (любой из двух approaches OK, главное — определённое поведение).
7. [ ] **Verify create-project regression:** test что startProject manifest не задевается, server baseline по-прежнему генерится.
8. [ ] **VS Code адаптер:** найти где `generate-entity` зовётся из `src/adapters/vscode/`. Добавить UI флаг для `withServer` (quickPick либо checkbox). Default — unchecked.
9. [ ] Unit test `src/test/generators/with_server_filter_test.ts` (6 кейсов выше).
10. [ ] `npm run compile` clean.
11. [ ] mocha workaround — passing.
12. [ ] `npm run lint` clean.
13. [ ] **STOP-gate:** перед verify — show:
    - diff CLI / generation_config / generation_service
    - VS Code UI решение
    - explicit регрессионный test для create-project
14. [ ] `codegen create-project --name t184 --human` → должен пройти без проблем (Configuration baseline в t184_server/).
15. [ ] Подготовить минимальный test entity YAML.
16. [ ] **Без `--with-server`:**
    - `generate-entity --yaml ... --workspace G:/Projects/Flutter/serverpod/t184 --template simplified --human` (default)
    - `cd t184 && git status t184_server/` → **clean** (только generated client side).
17. [ ] **С `--with-server`:**
    - `cd t184 && git checkout .`  (reset to baseline)
    - `generate-entity --yaml ... --workspace G:/Projects/Flutter/serverpod/t184 --template simplified --with-server --human`
    - `git status t184_server/` → **modified** (endpoint files created).
18. [ ] `codegen verify --name t184 --human` PASS (на post-step-17 state с `--with-server`, чтобы server есть и серверная сторона компилируется).
19. [ ] Update agent_memory.md с gotcha про default OFF.
20. [ ] **3 adversarial reviewers** до commit'а.
21. [ ] `report.md` с CLI evidence + VS Code UI screenshot/описание.

## STOP-gates

- [ ] **Перед verify create-project regression** (шаг 13-14) — если create-project ломается, фикс нужно пересмотреть (например conditional фильтр манифестов).
- [ ] **VS Code UI решение** (шаг 8) — show user'у дизайн (checkbox / quickPick / form) до реализации.
- [ ] **Если VS Code адаптер откладывается** — STOP, документировать в `report.md` + agent_memory как known технический долг (CLI ≠ VS Code default behavior).
- [ ] **Перед commit** (шаг 20) — 3 review результата + manual evidence показаны user'у.

**Destructive ops:** ожидаемо отсутствуют. **Breaking-change CLI behavior** — это **soft destructive** для callers (любой существующий каллер `generate-entity` без `--with-server` потеряет server-write поведение). User said в Q2 что callers в weight он сам обновит (отдельным doc-PR в weight). Документировать в agent_memory.md и в `report.md`.

## План тестирования

### Unit (обязательно)

`src/test/generators/with_server_filter_test.ts` — 6 кейсов выше. Plus расширить existing GenerationService test-suite если есть.

### Integration / Verify (обязательно, DoD-гейт)

```bash
codegen create-project --name t184  # должен пройти (create-project exempt)
codegen verify --name t184          # PASS (server baseline есть)

# Без флага — client-only
codegen generate-entity --yaml <ent.spy.yaml> --workspace G:/Projects/Flutter/serverpod/t184 --template simplified
cd G:/Projects/Flutter/serverpod/t184 && git status t184_server/  # clean

# С флагом — server тоже
codegen generate-entity --yaml <ent.spy.yaml> --workspace G:/Projects/Flutter/serverpod/t184 --template simplified --with-server
cd G:/Projects/Flutter/serverpod/t184 && git status t184_server/  # modified

codegen verify --name t184  # PASS на финале (с server)
```

### Runtime (не требуется)

Static CLI behavior fix. Verify через manual diff/status проверка.

### VS Code adapter

Если выбран UI change — `npm run compile`, переустановить `.vsix` локально, проверить новый UI элемент в Command Palette. Зона user'а если runtime smoke невозможен (executor должен flagdown).

## Релевантный контекст

- [src/adapters/cli/commands/generate_entity.ts](../../../../src/adapters/cli/commands/generate_entity.ts) — primary edit target
- [src/features/generation/config/generation_config.ts](../../../../src/features/generation/config/generation_config.ts) — поле `withServer` + IGenerationConfig
- [src/features/generation/generators/generation_service.ts](../../../../src/features/generation/generators/generation_service.ts) — scan_dirs фильтр
- [src/features/generation/generators/manifests.ts](../../../../src/features/generation/generators/manifests.ts) — где `entity` / `manyToMany` имеют `scan_dirs: ['feature/', 'server/']`
- [src/adapters/cli/commands/create_project.ts](../../../../src/adapters/cli/commands/create_project.ts) — verify no regression
- [src/adapters/vscode/](../../../../src/adapters/vscode/) — VS Code адаптер, найти `generate-entity` command registration
- [handoff TASK-021 Bug 5](../../../../../Flutter/serverpod/weight/ai/tasks/active/TASK-021-generator-root-followup/task.md)

## Заметки по реализации

- **Минимальный фикс** = 4 файла: `generate_entity.ts` (+CLI flag), `generation_config.ts` (+поле), `generation_service.ts` (+filter), VS Code адаптер (+UI). Если VS Code адаптер не trogается этим release — допустимо отложить (но тогда VS Code path остаётся с **default ON** behavior, что **рассогласовано** с CLI — это технический долг, исключение нужно явно обосновать в `report.md` + flagged user'у).
- Альтернативный design choice: вместо boolean field — массив `scope: Array<'client' | 'server'>` (default `['client']`). Более гибко для будущих микросервисов/админок, но overkill сейчас. Минимальный фикс лучше.
- Documentation: в `--help` output для `--with-server` написать ясно «**Also write to <project>_server/ (endpoint + sync_event files). Default: client-only. Reason: avoid silent scope creep (TASK-029)**».
- agent_memory entry должна объяснить **почему default OFF** (silent footgun + TASK-019 incident reference).

## Результаты

- 4-5 modified TS файлов в `src/`
- 1 new test file
- Возможно 1-2 modified в `src/adapters/vscode/`
- 1 modified `ai/docs/agent_memory.md`
- 1 new test project `t184/`
- `report.md` с CLI evidence (clean vs modified) + VS Code UI описание + дизайн-обоснование

## Журнал исполнения

*Только executor. Teamlead не редактирует.*
