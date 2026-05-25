# Индекс проекта code-generator (НАЧНИ ЗДЕСЬ)

**Обновлено:** 2026-05-25 (Phase B ✅ executed — TASK-022/023/024 merged; Active: 5-task cross-repo pipeline TASK-025..029 from weight TASK-019 review + TASK-030 BLOCKER chore ready for commit)

## Что это за проект

**VS Code расширение + CLI `codegen`** для генерации Serverpod/Flutter монорепо из шаблона t115 + микросервисов (Python/Node/Go).

Применение — генерация feature-слоёв по Clean Architecture из Serverpod YAML-моделей (`.spy.yaml`).

## Текущее состояние

**Phase 1.5 + Phase A + Phase B ✅ EXECUTED** (2026-05-03 → 2026-05-04).

- 181 unit tests passing на master (190 включая stashed TASK-025 unit tests)
- 21+ PRs merged (Phase 1.5 9 + handoff + HOTFIX-001 + TASK-020 + TASK-021 + chore stack-lock + TASK-022/023/024 Phase B)
- master `2437157` (scaffolding "1" commit для TASK-025..029 pack) + `03baa30` (post-Phase-B opt-in `--with-interfaces`)
- CI workflow active ([.github/workflows/test.yml](../../.github/workflows/test.yml))
- t115 template (`devabacus/t115`) — **deprecated path** (frozen)
- simplified template (`G:/Templates/flutter/simplified/`) — opt-in via `--template simplified` (Discussion #12 pivot 2026-05-04)
- sync_core 0.3.0 в master, validated multi-entity cross-device

**🔴 Active state (2026-05-25):** 5-task cross-repo pipeline TASK-025..029 (фиксы шаблонов из weight TASK-019 sync_core wire-up review) + **TASK-030 BLOCKER chore** (template `pubGet` drift fix через caret bump `custom_lint`). См. [status.md](status.md) Активные задачи + [handoff.prompt.md](../prompts/handoff.prompt.md) "Active pipeline" section для full detail.

**Architectural decisions still active:**

- **Clean-slate** (Discussion #9 amendment 2026-05-03): weight v1 НЕ в production, нет dual-running concerns.
- **⚠ CRITICAL Stack-lock** (Discussion #11 User_2 override 2026-05-03): стэк t115 baseline (Riverpod annotations + Drift + Clean directory + sync_core 0.3.0 + Serverpod) НЕ меняется без явного User approval. Versions update к latest stable.
- **Discussion #12 pivot** (2026-05-04): DEFAULT_TEMPLATE simplified → t115; simplified opt-in. Both templates долго-сохраняемые.

**Diagnostic lesson** (TASK-030, MUST remember): compare sibling templates (admin/server) **before** "cascade impossible" diagnosis. Pubspec comments rot at scale — verify через current lockfile evidence. См. [BUG-021](../bug-reports/021-pub-deps-drift-template-pubspec.md) для canonical pattern.

## Onboarding flow для нового teamlead

**Read in this order:**

1. **Этот файл** — overview + state snapshot
2. [agent_memory.md](agent_memory.md) — ОБЯЗАТЕЛЬНО, gotchas + invariants + architectural pivot context + stack-lock principle
3. [CLAUDE.md](../../CLAUDE.md) — agent guide (DoD)
4. [AGENTS.md](../../AGENTS.md) — глобальные правила (запреты, block-rules, PR/merge flow)
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

- ⭐ **Главный handoff prompt:** [ai/prompts/handoff.prompt.md](../prompts/handoff.prompt.md)
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
python ai/scripts/new_task.py "название"           # создать TASK (auto-ID active/+done/+blocked/)
python ai/scripts/task.py start <branch>           # feature branch
python ai/scripts/task.py pr                       # push + PR
python ai/scripts/task.py merge [-y]               # merge after CI

# Discussions
python ai/discussions/scripts/discuss.py new "тема"
python ai/discussions/scripts/discuss.py close <N>

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
| `devabacus/code-generator` | master `70650f7` (post stack-lock chore) | 163 tests, Phase 1.5 + Phase A ✅ closed, 11 discussions archived |
| `devabacus/t115` | master `148ddf1` | **Deprecated path** — frozen, removal планируется 6-12 месяцев. Stack lock applies — simplified inherits ALL t115 patterns. |
| `devabacus/sync_core` | master 0.3.0 | Validated multi-entity cross-device. Sub-A3 dual-running audit reference-only post clean-slate. |
| `devabacus/weight v1` | NOT в production | Clean-slate decision 2026-05-03 — нет real users, нет maintenance burden. |
| weight build (TBD) | TBD | Fresh Flutter app on simplified template. Starts only after Phase A-D gate close. ID = `<weight-build TASK>` placeholder. |

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

См. [CLAUDE.md → Definition of Done](../../CLAUDE.md) для полной DoD.

## История архитектурных решений

- **Discussion #1-#6** (Phase 1.5 sequence + parsers + DAO substitution + multi-template pivot)
- **Discussion #7** — Multi-template plurality (informal decision, formalized в ADR-0005)
- **Discussion #8** — Roadmap approval (superseded by #9)
- **Discussion #9** — Weight v2 fresh build pivot (TASK-018 cancelled) → **clean-slate amendment 2026-05-03** (no v1 in production)
- **Discussion #10** — Initiative Phase A organization (13-point Decision)
- **Discussion #11** — Initiative Phase B implementation strategy (12-point Decision) + **⚠ CRITICAL stack-lock User decision**

Полные тексты: `ai/discussions/archive/`.

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
