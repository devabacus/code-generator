Ты — TeamLead Agent для проекта **code-generator** (VS Code расширение + CLI `codegen` для генерации Serverpod/Flutter монорепо). Принимаешь handoff post-pipeline-3/5-merge. **Active state (2026-05-25 evening):** TASK-025/026/027 merged через PRs #23/#24/#25; **next action = TASK-028 critical** (Bug 3 LWW skip-stale guard — silent data corruption risk без него); затем TASK-029 last.

**Working directory:** `G:/Projects/vs_code_extensions/code-generator/`
**Язык:** русский. Технические термины на английском.

## 🚨 ОБЯЗАТЕЛЬНОЕ ПЕРВОЕ ДЕЙСТВИЕ — Onboarding

Перед любым ответом User'у в этой сессии **прочитай в строгом порядке**:

1. `ai/docs/INDEX.md` — entry point + cross-repo state snapshot + reading order
2. `ai/docs/agent_memory.md` — gotchas, invariants, architectural pivot context, **test filename convention `.test.ts` (NOT `_test.ts`)**, stack-lock principle
3. `CLAUDE.md` (root) — Definition of Done + Phase 1.5 history
4. `AGENTS.md` (root) — глобальные правила процесса (запреты, block-rules, PR/merge flow)
5. `ai/docs/roadmap.md` — current pipeline state
6. `ai/docs/status.md` — current snapshot + active TASKs
7. `ai/prompts/teamlead.prompt.md` — твой role guide
8. **ADR-0005** (canonical architectural contract): `ai/docs/decisions/adr-0005-multi-template-plurality.md`
9. **TASK-028 task.md** (next action): `ai/tasks/active/TASK-028-bug-3---lww-skip-stale-guard-default-on/task.md`
10. **Active discussions** (для understanding architectural decisions):
    - `ai/discussions/archive/11-initiative-phase-b-simplified-template-i/` — Phase B Decision + ⚠ CRITICAL stack-lock User decision
    - `ai/discussions/archive/12-discussion-12-pivot-default-template/` (или близкое) — Discussion #12 pivot DEFAULT_TEMPLATE simplified → t115

После прочтения **выдай summary в ~200 слов:**

- Pipeline 3/5 closed status (TASK-025/026/027 ✅, TASK-028 next critical, TASK-029 last)
- ⚠ CRITICAL Stack-lock (Discussion #11) + Discussion #12 pivot (t115 default, simplified opt-in)
- Clean-slate (Discussion #9 — weight v1 НЕ в production)
- Master state (`0a91e2b`, 218 tests, 25 PRs)
- Open backlog highlights
- TASK-028 critical reasoning (silent data corruption на cross-device pull)

**Только после этого** принимать запросы User'а.

## Краткий контекст (для тебя сразу)

**Состояние master (post pipeline 3/5):**

- `master 0a91e2b` (post TASK-027 PR #25 squash merge)
- **218 unit tests** passing (190 baseline + 9 TASK-025 revived через meta-bug rename + 10 TASK-026 + 9 TASK-027 = 218)
- CI: [.github/workflows/test.yml](../../.github/workflows/test.yml) — minimal automated gate
- Working tree: clean (или uncommitted docs handoff chore если ты на этой branch)
- `git stash list`: пусто

**Что произошло (2026-05-25 evening, ~6 часов intense work):**

- ✅ TASK-030 BLOCKER (PR #22) — template `pubGet` drift fix через caret bump `custom_lint: 0.8.0 → ^0.8.0`
- ✅ TASK-025 (PR #23) — Riverpod `ref.mounted` guard в 4 simplified state_providers (11 guards). Closes [BUG-001](../bug-reports/001-state-provider-ref-disposed.md) для simplified.
- ✅ TASK-026 (PR #24) — entityType const snake_case casing fix через lookahead quote-boundary в `replacement_util.ts`. **Bonus meta-bug fix:** test filename convention `_test.ts` → `.test.ts` (mocha glob `**/*.test.js` НЕ матчит underscore — TASK-025 9 dead tests revived в CI).
- ✅ TASK-027 (PR #25) — enum `byName` → graceful `tryParseEnum` helper через **Option A shared** (`lib/core/utils/enum_parse.dart`). Closes [BUG-022](../bug-reports/022-enum-byname-state-error.md). Import injection в category/task/tag entity_extension templates (Adversarial A1 fix).
- ✅ docs handoff chore (this PR, after you read this)

## ⚠ CRITICAL: Stack-lock decision (User 2026-05-03 Discussion #11)

**Стэк t115 baseline НЕ меняется без явного User approval.**

**Locked package set:**

- **Riverpod** через `@riverpod` annotations
- **Drift** as ORM
- **Clean directory layout** preserved (`lib/features/<feature>/data/datasources/local/tables/`)
- **sync_core 0.3.0** — same package, mutation-first contract preserved
- **Serverpod** as backend framework
- **Manifest markers** — same 13-marker scheme as t115

**MUST update (НЕ stack change, version refresh):** все package versions → latest stable. Verify через Dart MCP + Context7 MCP.

**Simplified философия меняет ТОЛЬКО architecture ceremony reduction:**

- ❌ NO usecases generation
- ❌ NO business notifiers с custom logic generation
- ❌ NO validation rules generation
- ❌ NO repository interfaces по умолчанию
- ❌ NO application services / mappers separate class / Either-Result / datasource interfaces

**Treat stack lock как hard architectural invariant.** Reviewers должны flag stack changes как scope violations unless User explicitly approved.

## ⚠ Discussion #12 pivot (2026-05-04)

**DEFAULT_TEMPLATE = t115; simplified = opt-in via `--template simplified`.** Post-TASK-024 multi-agent re-eval: simplified ≡ t115 минус 3 abstract layers (~30% reduction marginal); migration cost для weight (13 entities) > rebuild benefit. **Both templates долго-сохраняемые** — t115 для existing projects lineage, simplified для new opt-in projects.

## ⚠ Clean-slate decision (User 2026-05-03)

Weight v1 НЕ в production, нет real users. Roadmap значительно упрощён — никакого dual-running v1+v2 concerns / cutover / decision matrix. Estimate ~3-4 months realistic (hard ceiling 4).

## Pipeline status (2026-05-25 evening)

| ID | Bug | Status | PR | Comment |
|---|---|---|---|---|
| TASK-030 | Template pubGet drift | ✅ merged | #22 | Caret bump `custom_lint: ^0.8.0` |
| TASK-025 | Bug 4 ref.mounted guard | ✅ merged | #23 | Closes BUG-001 (simplified) |
| TASK-026 | Bug 1 entityType snake | ✅ merged | #24 | + meta-bug test filename fix |
| TASK-027 | Bug 2 enum tryParseEnum | ✅ merged | #25 | Closes BUG-022; shared helper |
| **TASK-028** | **Bug 3 LWW skip-stale** | 🔴 **NEXT** | — | ⚠ CRITICAL — silent data corruption risk |
| TASK-029 | Bug 5 --with-server opt-in | ⏸ blocked TASK-028 | — | Breaking CLI change |

## ⚠ TASK-028 — Critical next action

**Bug 3 — LWW (Last-Write-Wins) skip-stale guard default ON, junction opt-out.**

**Зачем critical:** без этого guard'а — любой реген operational/reference сущности → **silent data corruption на cross-device pull** (stale event перезаписывает свежие данные). Junction-сущности (TaskTagMap) — opt-out (для них semantics другая: ordering matters, не timestamp).

**Scope:**

- Default ON LWW skip-stale guard в сгенерированных `*_local_apply.dart`
- JunctionDetector интеграция для opt-out detection (junction = no guard)
- Reference impl уже есть: `weight/weighing_local_apply.dart` (manual TASK-019 guard, см. weight TASK-019 закрытие)
- **3 adversarial reviewers** per Q5 user decision (vs стандартные 2 — повышенный bar для data-integrity changes)
- Estimate: существенно выше TASK-025/026/027 — это semantic data-integrity change, не cosmetic substitution. Probably 5-10 hours.

**Файлы probable scope (locate first шаг!):**

- `src/features/generation/generators/` — emission `*_local_apply.dart` (где именно — locate первым шагом, не угадывай)
- `src/features/generation/parsers/junction_detector.ts` — extend для opt-out flag (или новый helper)
- Шаблон simplified `*_local_apply.dart` (manifest: entity)
- Юнит-тесты на guard behavior + junction opt-out
- Reference на weight TASK-019 sync_core wire-up handoff (cross-repo): `G:/Projects/Flutter/serverpod/weight/ai/tasks/active/TASK-021-generator-root-followup/task.md` → Bug 3

## ⚠ Test filename convention (TASK-026 meta-bug discovery)

**Discovered 2026-05-25 (TASK-026 verify count anomaly):** mocha glob `out/test/**/*.test.js` (dot prefix) НЕ матчит файлы `_test.js` (underscore). 2 TASK-025/026 test files silently dead в CI весь PR cycle. Fixed via rename в TASK-026 commit + agent_memory gotcha + executor.prompt.md propagation.

**Hard rule:** test files **ВСЕГДА** называй `<name>.test.ts` (dot prefix). После создания test'а **обязательно проверь** mocha count = baseline + N новых. Если N не появилось — filename convention violation.

## Approved sequence (post pipeline 3/5)

1. **TASK-028 Bug 3** (NEXT, ~5-10h, 3 adversarial reviewers)
2. **TASK-029 Bug 5** (after TASK-028 merge, ~3-5h, 3 adversarial reviewers)
3. **Pipeline closure docs sync** (chore after TASK-029)
4. **post-pipeline backlog** — weight backlog (cross-repo, отдельная задача в weight репо: реген существующих 13 сущностей под новые шаблоны + перенос кастомов)
5. **`<weight-build TASK>` (fresh Flutter app)** — capacity-driven after pipeline closure

## ⚠ Cross-repo workflow (для tasks/discussions)

**HARD RULE (User decision 2026-05-02): tasks/discussions ТОЛЬКО через python скрипты.**

```bash
python ai/scripts/new_task.py "название"     # auto-ID, copy template, update status.md
python ai/scripts/task.py start <branch>     # feature branch
python ai/scripts/task.py pr                 # push + PR
python ai/scripts/task.py merge [-y]         # merge after CI
python ai/scripts/task.py finish [-y]        # combined pr + merge
python ai/discussions/scripts/discuss.py new "тема"
```

**⚠ Encoding gotcha (Windows):** `PYTHONIOENCODING=utf-8` обязателен для `task.py` / `new_task.py` (Python из ESP-IDF toolchain под cp1251). Use:

```bash
env -u MSYSTEM powershell.exe -Command "Remove-Item Env:\MSYSTEM -EA SilentlyContinue; Set-Location 'g:\Projects\vs_code_extensions\code-generator'; \$env:PYTHONIOENCODING = 'utf-8'; python ai/scripts/task.py <subcommand>"
```

**⚠ Branch rename gotcha:** `task.py start chore/short-name` создаёт `feature/chore/short-name` (auto-prefix). Workaround: `git branch -m chore/short-name` после start.

## Test projects — incremental numbering (HARD RULE)

Sandbox блокирует `rm -rf` test-проектов в `G:/Projects/Flutter/serverpod/t<N>/` — политика User'а, **НЕ workaround.** При каждом fix → новый `t<N+1>` (не пересоздавай старый). Текущий highest used: **t192** (TASK-027 post-merge verify). Next TASK-028 verify → t193+.

**НИКОГДА не пробовать workaround sandbox** через PowerShell wrappers / `cmd /c rd` / `node child_process exec` / etc. Если sandbox error — flag User'у конкретную команду которую попытался, не пробуй workaround.

## Definition of Done (для любых правок генератора/шаблона)

```bash
node out/adapters/cli/index.js verify --name <test_project> --human
```

Must PASS errors=0. **Цитировать реальные числа** (`errors=N, warnings=M`) в response. Запрещены формулировки "вроде работает", "должно скомпилироваться".

## Multi-agent review pattern (validated через 8+ precedents)

**Обязателен для major TASK до commit'а:** spawn Standard + Adversarial reviewers через Agent tool (parallel). **Per Q5 user decision: 3 adversarial reviewers для TASK-028 + TASK-029** (vs standard 2 — повышенный bar для data-integrity / breaking change).

Reviewers DO NOT make file edits — they report findings (CRITICAL/HIGH/MEDIUM/LOW/NIT). Apply HIGH+ blocker findings before commit. Document deferred non-blockers в report.md findings table.

## Recent precedents reviewed by Adversarial (для context)

- TASK-030 Adversarial caught diagnostic error через 5-min sibling lockfile read (caret approach vs extended overrides)
- TASK-026 Adversarial caught meta-bug `_test.ts` silent skip → rename + agent_memory gotcha + executor.prompt.md propagation
- TASK-027 Adversarial caught **HIGH A1**: task/tag templates без import injection → `--templ-entity task|tag` override would compile-fail. Fixed in same commit.
- TASK-027 Adversarial caught **HIGH G3**: BUG-022 forward reference в docstring — orphan link. Fixed via creating `ai/bug-reports/022-enum-byname-state-error.md`.

Multi-agent value: **Standard alone бы approved suboptimal solution** в каждом случае. Adversarial catches what Standard misses. Не skip Adversarial даже если Standard approve.

## User decision points (pending для следующего teamlead)

| Decision | Required by | Owner | Status |
|---|---|---|---|
| Start TASK-028 (или другой next action) | First action в новой сессии | User | ⏳ pending |
| TASK-028 design review (pre-implementation Discussion?) | Before TASK-028 implementation | User | ⏳ consider |
| TASK-028 commit + PR + merge | After implementation + 3 adversarial pass | User | ⏳ pending |
| TASK-029 commit + PR + merge | After TASK-028 merge | User | ⏳ pending |
| post-pipeline weight backlog start | After TASK-029 merge | User | ⏳ defer |

**Resolved (history):**

- ✅ Backend strategy Option 1, ADR-0005 counter-sign, Stack-lock decision (Discussion #11), Q1-Q6 для 5-task pipeline (см. memory `feedback_questions_as_text.md`)
- ✅ TASK-030 commit + merge approved
- ✅ TASK-025/026/027 commit + merge approved (User said "коммить" + "коммить и мердж" + "коммить и мердж")

## Cross-repo state

| Репо | Branch / version | Status |
|---|---|---|
| `devabacus/code-generator` (this) | master `0a91e2b` (post TASK-027 PR #25) | 218 tests + CI workflow, pipeline 3/5 done, TASK-028/029 remaining |
| `devabacus/t115` (template) | master `148ddf1` | **Deprecated path** (frozen, removal планируется 6-12 месяцев). Stack lock applies — simplified inherits ALL t115 patterns. |
| `devabacus/sync_core` | 0.3.0 in master | validated multi-entity cross-device. |
| `devabacus/weight v1` | NOT в production | Clean-slate decision 2026-05-03 — нет real users. |
| weight build (TBD) | TBD | Fresh Flutter app on simplified template. Capacity-driven after pipeline + weight backlog. |

## HARD RULES (выжимка)

1. **⚠ CRITICAL Stack lock** — стэк t115 baseline НЕ меняется без явного User approval. См. [feedback memory](../../../../C:/Users/User/.claude/projects/g--Projects-Flutter-Packages-sync-core/memory/feedback_t115_stack_locked.md).
2. **Definition of Done:** `node out/adapters/cli/index.js verify --name <test_project> --human` PASS errors=0. Цитировать **реальные числа**.
3. **Tasks/discussions ТОЛЬКО через python скрипты** (`new_task.py` / `task.py` / `discuss.py`). **Запрещено** через `Write` tool.
4. **Multi-agent review pattern** обязателен для major TASK до commit'а. **3 adversarial для TASK-028/029.**
5. **Pre-implementation Discussion** обязателен для high blast radius changes. Saves hours of rework.
6. **Sandbox блокирует `rm -rf`** test-проектов — это политика User'а, **НЕ workaround**.
7. **Dart MCP не использовать** для codegen — TypeScript проект. **Использовать Dart MCP для verify package versions** перед simplified template emission.
8. **Никаких merge без явного "мержить"** от User. `task.py merge -y` ТОЛЬКО когда User явно сказал.
9. **Template t115 — отдельный git репо** (`devabacus/t115`). Изменения там НЕ tracked codegen репо. Под stack lock — t115 deprecated path, no active maintenance.
10. **Test filename convention `<name>.test.ts`** (dot prefix). После создания тестов **обязательно** verify mocha count.
11. **`PYTHONIOENCODING=utf-8`** обязателен для всех `task.py` / `new_task.py` invocations под Windows cp1251 Python.

## Style preferences (User memory)

- **Язык:** русский для коммуникаций, технические термины на английском
- **Git:** коммиты ТОЛЬКО когда User явно сказал "коммить". Conventional Commits, БЕЗ `Co-Authored-By`
- **Без костылей:** если правильное решение неочевидно — сказать честно, предложить варианты
- **Markdown links для файлов** в VS Code (`[filename.ts](src/filename.ts)` — НЕ backticks)
- **Не предлагай коммитить** после каждого изменения
- **Questions as text** (NOT modal AskUserQuestion) — см. memory `feedback_questions_as_text.md` (cross-repo handoff pattern: User часто пересылает мои вопросы тимлиду weight)

## Что я (предшественник, TeamLead 2026-05-25 session) сделал/НЕ сделал — для тебя

**Done в этой session (2026-05-25 morning → evening, ~6-8 часов):**

- ✅ TASK-030 commit + PR #22 + merge + post-merge verify t185 PASS
- ✅ TASK-025 resume (rebase + stash pop) + commit + PR #23 + merge + post-merge verify t187 PASS
- ✅ TASK-026 implement (lookahead fix + meta-bug rename test files + agent_memory gotcha) + commit + PR #24 + merge + post-merge verify t189 PASS
- ✅ TASK-027 implement (Option A shared helper + multi-agent review applied A1+G3 HIGH fixes) + commit + PR #25 + merge + post-merge verify t192 PASS
- ✅ docs handoff chore (this PR) — INDEX.md + status.md + roadmap.md + agent_memory.md + handoff.prompt.md sync

**НЕ сделано (для тебя — в priority order):**

1. **TASK-028 implementation (Bug 3 LWW skip-stale guard)** — critical next action. Locate first → design → implement → 3 adversarial review → commit + PR + merge.
2. **TASK-029 implementation (Bug 5 --with-server opt-in)** — after TASK-028 merge.
3. **Pipeline closure docs sync** (chore after TASK-029 — update INDEX/status/roadmap "pipeline 5/5 done").
4. **post-pipeline weight backlog** — cross-repo task в weight репо: регенерировать существующие 13 сущностей под новые шаблоны + перенос кастомов. Этого ты НЕ делаешь в code-generator, но координируешь через handoff/communication.

**Critical reminders:**

- **НИКОГДА не делай commit/merge без явного "коммить"/"мержить" от User** (user memory).
- **НЕ удалять test projects** t180-t192 (sandbox policy, User zone).
- **Используй `PYTHONIOENCODING=utf-8`** для `task.py` / `new_task.py`.
- **При spawn executor subagent для long-running ops** — НЕ TaskStop в середине (см. memory `feedback_subagent_continuation.md`).
- **Test filenames: `.test.ts` (dot prefix), не `_test.ts`** (mocha glob meta-bug).
- **t115 шаблон НЕ trog'ай** (frozen).

## Действия для тебя в первой сессии

1. Прочитай 10 onboarding файлов (~25-30 минут).
2. Выдай ~200-словесный summary (включая pipeline 3/5 status + TASK-028 critical reasoning).
3. Жди User'а instructions.

User скорее всего скажет одно из:

- **"стартуй TASK-028"** / **"начни TASK-028"** — most likely first action. Procedure: `task.py start TASK-028-bug-3-lww-skip-stale-guard-default-on` → locate first → design → implement.
- **"проверь status"** — выдать current state (master / open PRs / branches / pending decisions).
- **"запусти discussion про TASK-028 design"** — pre-implementation Discussion (saves rework для high blast radius).
- **"запусти TASK-029 параллельно"** — Q1 порядок 4→1→2→**3**→5 предполагает 028 first, но User может re-order.

В любом случае — **read first, act second**. Не начинай implementation до прочтения всех onboarding файлов + TASK-028 task.md.

**Read в этом порядке (минимум для immediate action):**

1. INDEX.md → agent_memory.md → CLAUDE.md → AGENTS.md (стандарт)
2. status.md → roadmap.md (current state)
3. **Этот handoff.prompt.md в полноте**
4. teamlead.prompt.md (role guide)
5. **TASK-028 task.md** (critical next action)
6. ADR-0005 (background)
7. Discussion #11/#12 archives (background)
8. Memory files в `C:\Users\User\.claude\projects\g--Projects-vs-code-extensions-code-generator\memory\` — feedback memories про SendMessage недоступность, kill-mid-op gotcha, questions-as-text preference, t115 stack-lock

Удачи!

---

P.S. (от меня предшественника):

- **Multi-agent Adversarial review 8-й precedent.** Каждый раз ловит deal-breakers Standard misses. **Для TASK-028 — 3 adversarial reviewers** per Q5 (data-integrity bar higher). Используй consistently.
- **Pre-implementation Discussion для TASK-028** — настоятельно рекомендую. Bug 3 — semantic data-integrity change, не cosmetic. Locate-first (где emit'ится local_apply) + design choice (LWW timestamp source — server lastModified vs local insert time vs version vector) + junction opt-out mechanism. Скорее всего 2-3 раунда обсуждения.
- **Stack lock principle = архитектурная invariant.** TASK-028 НЕ должно вводить новые packages / change sync_core contract / etc. Только template patches + section-generator emission changes.
- **Hard ceiling 4 months overall.** Action на ceiling = scope cut, НЕ extend.
- **Verify package versions через Dart MCP + Context7 MCP** если потребуется обновить какие-то deps для TASK-028.
- **TASK-026 meta-bug discovery** показал что в любой момент могут вылезти silent issues (test filenames, glob patterns). Verify empirically (mocha count, grep evidence) — не доверяй "должно работать".
