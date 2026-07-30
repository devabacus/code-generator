# Индекс проекта code-generator (НАЧНИ ЗДЕСЬ)

**Обновлено:** 2026-07-29 (**master `e01b569`**, **459 tests**). BUG-029 закрыт для regen-пути: fail-closed guard + ledger (TASK-042) и per-file preserve с backup (TASK-043) — регенерация больше не может молча затереть пользовательский код. Контур проверен на **реальном** проекте: [weight-migration-probe-2026-07-28.md](weight-migration-probe-2026-07-28.md) — обязательное чтение перед планированием миграции weight, три части. **✅ TASK-047 закрыт:** новую сущность в weight можно добавлять сегодня — полный цикл с `--with-server`, `flutter analyze` errors=0, дельта от сущности нулевая. **✅ TASK-048 закрыт:** карта риска по всем 15 сущностям — под угрозой 13 файлов (все в `weighing`), 10 из 14 сущностей перезаписываются пакетно; ⚠ числа конфликтов в частях 1-2 разведки завышены вдвое ([BUG-031](../bug-reports/031-generate-entity-duplicates-conflict-report-in-output.md)): 19 на сущность, 271 всего. **Активно:** TASK-049 (миграция шаблонов на merge-дисциплину — главное улучшение), TASK-044/045/046 (гигиена ledger/CLI), TASK-041 (junction fail-fast — ждёт миграции simplified/weight владельцем). Подробности — [status.md](status.md).

## Что это за проект

**VS Code расширение + CLI `codegen`** для генерации Serverpod/Flutter монорепо из шаблона t115 + микросервисов (Python/Node/Go).

Применение — генерация feature-слоёв по Clean Architecture из Serverpod YAML-моделей (`.spy.yaml`).

## Текущее состояние (2026-07-29)

**master `90a0056`, 459 unit-тестов**, 0 failing. Compile clean, lint 0 errors / 18 pre-existing
warnings. CI (`.github/workflows/test.yml`) — compile + lint + mocha на ubuntu-latest.

**Главное за последнюю сессию: BUG-029 закрыт для regen-пути.** Регенерация больше не может
молча затереть пользовательский код:

- двухфазный `plan → apply` — при конфликте хотя бы в одном файле не записывается ни один;
- ledger `<project>/.codegen/ledger.json` (schema v1, SHA-256 без нормализации, для merge-файлов
  хеши регионов) как третья точка сравнения; самовосстановление при рассинхроне;
- разбор конфликтов **по файлу** (`--overwrite-existing <пути>`), backup прежнего содержимого
  в `.codegen/backup/<timestamp>/`;
- сохранённые файлы не трогает никто, включая патчеры.

**Контур впервые проверен на реальном проекте** —
[weight-migration-probe-2026-07-28.md](weight-migration-probe-2026-07-28.md). Оттуда же
уточнение прежних оценок: под codegen в weight **15 сущностей** (в старых доках было «13»).

**Шаблоны:** t115 — default, мигрирован на `# codegen:junction:` (запушен `41eeba6`);
simplified — opt-in через `--template simplified`, junction-YAML **ещё не мигрирован**
(блокирует TASK-041).

**Тест-проекты:** t115, t209–t212 на диске, следующий свободный — **t213**.

**⚠ Ограничение:** месячный лимит трат исчерпан — субагенты (executor, ревьюеры) не
запускаются. Проверить на старте сессии.

## Активные задачи

| Задача | Суть | Приоритет |
| --- | --- | --- |
| ~~TASK-047~~ | ~~полный цикл новой сущности на weight~~ | ✅ **закрыт 2026-07-29** — errors=0, дельта от сущности нулевая; новые сущности добавлять можно |
| ~~TASK-048~~ | ~~карта риска: прогон 11 оставшихся сущностей~~ | ✅ **закрыт 2026-07-29** — под угрозой 13 файлов, все в `weighing`; 10 из 14 сущностей перезаписываются пакетно |
| **TASK-049** | миграция шаблонов на merge-дисциплину (`:base`-регионы) | 3 — **главное улучшение**, поглощает BUG-007/013 |
| TASK-044/045/046 | гигиена ledger и CLI | 4 — пригодность инструмента не меняют |
| TASK-041 | junction fail-fast | **БЛОК** — ждёт миграции simplified + weight владельцем |

Открыт **PR #56** (docs-разведка), ждёт merge.

## Onboarding flow для нового teamlead

**Read in this order:**

1. **Этот файл** — overview + state snapshot
2. [weight-migration-probe-2026-07-28.md](weight-migration-probe-2026-07-28.md) — **обязательно перед разговорами о миграции weight**: замеры на реальном проекте
3. [agent_memory.md](agent_memory.md) — ОБЯЗАТЕЛЬНО, gotchas + invariants + architectural pivot context + stack-lock principle
3. [CLAUDE.md](../../../CLAUDE.md) — agent guide (DoD)
4. [AGENTS.md](../../../AGENTS.md) — глобальные правила (запреты, block-rules, PR/merge flow)
5. [roadmap.md](roadmap.md) — clean-slate revised sequence
6. [status.md](status.md) — current focus + active TASKs
7. **ADR-0005** ([decisions/adr-0005-multi-template-plurality.md](decisions/adr-0005-multi-template-plurality.md)) — canonical architectural contract
8. **Latest discussions** (для context decisions):
   - [Discussion #9 archive](../discussions/archive/9-weight-v2-fresh-build-на-simplified-temp/) — clean-slate roots
   - [Discussion #10 archive](../discussions/archive/10-initiative-phase-a-simplified-template-a/) — Phase A organization
   - [Discussion #11 archive](../discussions/archive/11-initiative-phase-b-simplified-template-i/) — **Phase B Decision + ⚠ CRITICAL stack-lock User decision**
9. [Prompts](../prompts/teamlead.prompt.md) — role guide
10. [TASK-021 closure-report](../tasks/done/TASK-021-initiative-phase-a---architectural-design---audits---adr-0005-multi-template-plurality/closure-report.md) — Phase A artifact

## Структура работы

- ⭐ **Главный handoff prompt:** [ai/project/prompts/handoff.prompt.md](../prompts/handoff.prompt.md)
- Стратегические решения: [decisions/](decisions/)
- Архитектура: [architecture.md](architecture.md)
- Дорожная карта: [roadmap.md](roadmap.md)
- Текущий статус: [status.md](status.md)
- Решение проблем: [troubleshooting.md](troubleshooting.md)
- Задачи: [../tasks/](../tasks/)
- Баг-репорты: [../bug-reports/](../bug-reports/)
- Архивированные дискуссии: [../discussions/archive/](../discussions/archive/)

## Ключевые инструменты

```bash
# Task management
python ai/core/scripts/new_task.py "название"           # создать TASK (auto-ID active/+done/+blocked/)
python ai/core/scripts/task.py start <branch>           # feature branch
python ai/core/scripts/task.py pr                       # push + PR
python ai/core/scripts/task.py merge [-y]               # merge after CI

# Discussions
python ai/core/discussions/scripts/discuss.py new "тема"
python ai/core/discussions/scripts/discuss.py close <N>

# CLI commands
node out/adapters/cli/index.js create-project --name <X>
node out/adapters/cli/index.js generate-entity --yaml <path> --feature-path ... --workspace ...
node out/adapters/cli/index.js verify --name <X> --human    # DoD-гейт

# Tests (CI mocha workaround — explicit binary path)
npm run compile                                                                                              # tsc
npm run lint                                                                                                 # eslint
node node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"  # 163 passing baseline
```

## Cross-repo state

| Репо | Branch / version | Status |
|---|---|---|
| `devabacus/code-generator` | master `0a91e2b` (post TASK-027 PR #25 merged 2026-05-25) | **218 tests**, Phase 1.5 + Phase A + Phase B ✅ closed, pipeline 3/5 done (TASK-025/026/027 merged), TASK-028/029 remaining |
| `devabacus/t115` | master `148ddf1` | **Deprecated path** — frozen, removal планируется 6-12 месяцев. Stack lock applies — simplified inherits ALL t115 patterns. |
| `devabacus/sync_core` | master 0.3.0 | Validated multi-entity cross-device. Sub-A3 dual-running audit reference-only post clean-slate. |
| `devabacus/weight v1` | NOT в production | Clean-slate decision 2026-05-03 — нет real users, нет maintenance burden. |
| weight build (TBD) | TBD | Fresh Flutter app on simplified template. Starts only after pipeline TASK-025..029 closure + Phase A-D gate close. ID = `<weight-build TASK>` placeholder. |

## Роли

| Роль | Описание | Промпт |
|---|---|---|
| **User** | Финальные решения, одобрение merge | — |
| **TeamLead Agent** | Декомпозирует работу, ревьюит, оркестрирует | [../prompts/teamlead.prompt.md](../prompts/teamlead.prompt.md) |
| **Executor Agent** | Реализует задачи (через subagent или новый чат) | [../prompts/executor.prompt.md](../prompts/executor.prompt.md) |

> **Стратегические решения** через мульти-агентные дискуссии (`discuss.py`) и фиксируются в [decisions/](decisions/) или discussion archives.

## Золотые правила

- **⚠ CRITICAL Stack-lock** — стэк t115 baseline НЕ меняется без явного User approval. См. [ADR-0005](decisions/adr-0005-multi-template-plurality.md) Section 7 + Discussion #11
- Репозиторий > память чата
- Задачи — это контракты (через `new_task.py`, не Write вручную)
- Никаких merge без одобрения User
- `src/core/*` НЕ импортирует `vscode` (только lazy `require` с fallback)
- Коммиты на русском, Conventional Commits, без `Co-Authored-By`
- **Multi-agent review (6-й precedent)** для major TASK обязателен — Adversarial overlay catches deal-breakers что Standard misses
- **Pre-implementation Discussion** для high blast radius changes обязателен
- Sandbox блокирует `rm -rf` test-проектов — НЕ workaround
- Dart MCP для verify package versions перед simplified template emission (per stack-lock version update obligation)

## Definition of Done (короткая версия)

Любое изменение в `src/features/generation/`, `src/adapters/cli/commands/{create_project,generate_entity}.ts`, или в `G:/Templates/flutter/t115/` НЕ готово пока:

1. `codegen verify --name <test_project>` вернул `success: true`
2. **Цитированы реальные числа** в ответе user'у: `errors: N, warnings: M`
3. **Не патчены руками** target-проекты для сокрытия багов

См. [CLAUDE.md → Definition of Done](../../../CLAUDE.md) для полной DoD.

## История архитектурных решений

- **Discussion #1-#6** (Phase 1.5 sequence + parsers + DAO substitution + multi-template pivot)
- **Discussion #7** — Multi-template plurality (informal decision, formalized в ADR-0005)
- **Discussion #8** — Roadmap approval (superseded by #9)
- **Discussion #9** — Weight v2 fresh build pivot (TASK-018 cancelled) → **clean-slate amendment 2026-05-03** (no v1 in production)
- **Discussion #10** — Initiative Phase A organization (13-point Decision)
- **Discussion #11** — Initiative Phase B implementation strategy (12-point Decision) + **⚠ CRITICAL stack-lock User decision**

Полные тексты: `ai/project/discussions/archive/`.

## Phase 1.5 + Phase A closure summary (история)

**Phase 1.5 sequence (9 PRs merged):**
- PR #6 BUG-013 (template markers)
- PR #7 TASK-012 partial close
- PR #8 TASK-016 (parser FK alias)
- PR #9 TASK-017 (DAO substitution)
- PR #10 TASK-019 (re-acceptance final gate)
- PR #11 handoff.prompt.md commit

**Closed BUGs Phase 1.5:** BUG-002/003/004/005/006/008/009/011/012/013.

**Post Phase 1.5 (5 PRs):**
- PR #14 HOTFIX-001 (`new_task.py` scan active/+done/+blocked/)
- PR #15 TASK-020 / TASK-CI-001 (minimal CI gate)
- PR #16 TASK-021 / Initiative Phase A (ADR-0005 + 3 audits + closure-report draft)
- PR #17 chore stack-lock (Discussion #11 archive + ADR-0005 amendments)
- (этот PR — full docs refresh handoff prep)

**Open backlog (trigger-based):**
- BUG-001 (UI Ref disposed) — capacity-driven post-Phase B-D
- BUG-014/015/016/017/018 — Phase B-D или weight build-driven

См. [TASK-021 closure-report](../tasks/done/TASK-021-initiative-phase-a---architectural-design---audits---adr-0005-multi-template-plurality/closure-report.md) для full Phase A closure evidence.
