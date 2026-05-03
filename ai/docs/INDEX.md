# Индекс проекта code-generator (НАЧНИ ЗДЕСЬ)

**Обновлено:** 2026-05-03 (Phase 1.5 closure + handoff prep)

## Что это за проект

**VS Code расширение + CLI `codegen`** для генерации Serverpod/Flutter монорепо из шаблона t115 + микросервисов (Python/Node/Go).

Применение — генерация feature-слоёв по Clean Architecture из Serverpod YAML-моделей (`.spy.yaml`).

## Текущее состояние

**Phase 1.5 ✅ CLOSED** (2026-05-03). Codegen acceptance gate clean — verify PASS errors=0 на production-shaped FK alias scenarios.

- 163 unit tests passing
- 9 PRs merged в Phase 1.5 sequence (codegen master)
- t115 template (`devabacus/t115`) BUG-011/013 fixes pushed
- sync_core 0.3.0 в master, validated multi-entity cross-device

**Architectural pivot принят (Discussion #7):** Multi-template plurality. New "Simplified Template Initiative" — standalone parallel track post-Phase-1.5.

**Sequence approved (Discussion #8, next 3-5 months):**
1. TASK-019 closure (pending merge)
2. HOTFIX-001 (~30 min mini-chore)
3. TASK-018 Phase 0 preflight audit + production migration на Clean t115 path
4. TASK-CI-001 (minimal CI gate) before Initiative
5. Simplified Template Initiative — Phase A-G (~3-4 weeks calendar)

## Onboarding flow для нового teamlead

**Read in this order:**
1. **Этот файл** — overview + state snapshot
2. [agent_memory.md](agent_memory.md) — ОБЯЗАТЕЛЬНО, gotchas + invariants + architectural pivot context
3. [CLAUDE.md](../../CLAUDE.md) — agent guide (DoD, Definition of Done)
4. [AGENTS.md](../../AGENTS.md) — глобальные правила (запреты, block-rules, PR/merge flow)
5. [roadmap.md](roadmap.md) — 5-month sequence
6. [status.md](status.md) — current focus + active TASKs
7. **Latest discussions** (для context decisions): [Discussion #7 archive](../discussions/archive/7-clean-architecture-overhead-стоит-ли-упр/) + [Discussion #8 archive](../discussions/archive/8-roadmap-approval-sequence-phase-15-closu/)
8. [Prompts](../prompts/teamlead.prompt.md) — role guide

## Структура работы

- ⭐ **Основной процесс:** [workflow.md](workflow.md) (если existуют)
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
python ai/scripts/new_task.py "название"           # создать TASK
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

# Tests
npm run compile                                              # tsc
npx mocha --ui tdd "out/test/**/*.test.js"                  # tests (mocha workaround)
```

## Cross-repo state

| Репо | Branch / version | Status |
|---|---|---|
| `devabacus/code-generator` | master `530cd28` (post-PR #9) | 163 tests baseline, Phase 1.5 closed |
| `devabacus/t115` | master `148ddf1` | BUG-011/013 fixes pushed, 7 marker layers |
| `devabacus/sync_core` | master 0.3.0 | Validated multi-entity cross-device |
| `devabacus/weight` | master | TASK-018 unblocked, awaiting Phase 0 preflight |

## Роли

| Роль | Описание | Промпт |
|---|---|---|
| **User** | Финальные решения, одобрение merge | — |
| **TeamLead Agent** | Декомпозирует работу, ревьюит, оркестрирует | [../prompts/teamlead.prompt.md](../prompts/teamlead.prompt.md) |
| **Executor Agent** | Реализует задачи (через subagent или новый чат) | [../prompts/executor.prompt.md](../prompts/executor.prompt.md) |

> **Стратегические решения** через мульти-агентные дискуссии (`discuss.py`) и фиксируются в [decisions/](decisions/) или discussion archives.

## Золотые правила

- Репозиторий > память чата
- Задачи — это контракты (через `new_task.py`, не Write вручную)
- Никаких merge без одобрения User
- `src/core/*` НЕ импортирует `vscode` (только lazy `require` с fallback)
- Коммиты на русском, Conventional Commits, без `Co-Authored-By`
- **Multi-agent review** для major TASK обязателен (validated через 3 deal-breaker catches в Phase 1.5)
- **Pre-implementation Discussion** для high blast radius changes обязателен
- Sandbox блокирует `rm -rf` test-проектов — НЕ workaround

## Definition of Done (короткая версия)

Любое изменение в `src/features/generation/`, `src/adapters/cli/commands/{create_project,generate_entity}.ts`, или в `G:/Templates/flutter/t115/` НЕ готово пока:

1. `codegen verify --name <test_project>` вернул `success: true`
2. **Цитированы реальные числа** в ответе user'у: `errors: N, warnings: M`
3. **Не патчены руками** target-проекты для сокрытия багов

См. [CLAUDE.md → Definition of Done](../../CLAUDE.md) для полной DoD.

## Phase 1.5 closure summary (история)

Sequence (per Discussion #4):
- ✅ PR #6 BUG-013 (template markers fill 4 layers Approach A)
- ✅ PR #7 TASK-012 partial close (reduced scope verify PASS)
- ✅ PR #8 TASK-016 (parser FK alias support + helper + path/class normalization + quote-stripping landmine)
- ✅ PR #9 TASK-017 (DAO substitution rewrite Approach A — full BUG-012 closure)
- 🟡 TASK-019 (re-acceptance final gate, pending merge)

**Closed BUGs:** BUG-002/003/004/005/006/008/009/011/012/013.

**Open backlog (trigger-based):**
- BUG-001 (UI Ref disposed) — capacity-driven post-TASK-018
- BUG-014/015/016/017/018 — TASK-018 Phase 0 audit-driven or defer

См. [TASK-019 report](../tasks/active/TASK-019-re-acceptance-full-fk-alias-scenario-verify-phase-1-5-final-gate/report.md) для full closure evidence.
