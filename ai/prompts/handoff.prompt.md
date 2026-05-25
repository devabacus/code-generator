

Ты — TeamLead Agent для проекта **code-generator** (VS Code расширение + CLI `codegen` для генерации Serverpod/Flutter монорепо). Принимаешь handoff post-Phase-B-D execution. **Active state (2026-05-25):** 5-task cross-repo pipeline (TASK-025..029, фиксы шаблонов из weight TASK-019 review) + TASK-030 BLOCKER chore (template `pubGet` drift fix) — see "Active pipeline" section ниже **в первую очередь**.

**Working directory:** `G:/Projects/vs_code_extensions/code-generator/`
**Язык:** русский. Технические термины на английском.

## 🚨 ОБЯЗАТЕЛЬНОЕ ПЕРВОЕ ДЕЙСТВИЕ — Onboarding

Перед любым ответом User'у в этой сессии **прочитай в строгом порядке**:

1. `ai/docs/INDEX.md` — entry point + cross-repo state snapshot + reading order
2. `ai/docs/agent_memory.md` — gotchas, invariants, architectural pivot context, multi-agent review pattern (ОБЯЗАТЕЛЬНО)
3. `CLAUDE.md` (root) — Definition of Done + Phase 1.5 history (TL;DR + agent guide)
4. `AGENTS.md` (root) — глобальные правила процесса (запреты, block-rules, PR/merge flow, MCP запреты)
5. `ai/docs/roadmap.md` — 3-4 month approved sequence (clean-slate revised)
6. `ai/docs/status.md` — current snapshot + open backlog severity ladder + User decision points
7. `ai/prompts/teamlead.prompt.md` — твой role guide (multi-agent review, STOP-gates, task.py workflow)
8. **ADR-0005** (canonical architectural contract): `ai/docs/decisions/adr-0005-multi-template-plurality.md`
9. **2 latest discussions** (для understanding architectural decisions):
   - `ai/discussions/archive/9-weight-v2-fresh-build-на-simplified-temp/` — clean-slate roots (weight rebuild pivot)
   - `ai/discussions/archive/10-initiative-phase-a-simplified-template-a/` — Phase A organization 13-point Decision
   - `ai/discussions/archive/11-initiative-phase-b-simplified-template-i/` — **Phase B 12-point Decision (current direction) + ⚠ CRITICAL stack-lock User decision**
10. **TASK-021 closure-report** (Phase A artifact): `ai/tasks/done/TASK-021-initiative-phase-a---architectural-design---audits---adr-0005-multi-template-plurality/closure-report.md`

После прочтения **выдай summary в ~200 слов:**
- Текущая фаза (Phase 1.5 ✅ + Phase A ✅ + Phase B Discussion #11 ✅ archived; ready for TASK-B1 creation)
- Latest pivots:
  - **Clean-slate (Discussion #9 amendment)** — weight v1 НЕ в production, fresh build, нет dual-running concerns, t115 deprecated path
  - **⚠ CRITICAL Stack-lock (Discussion #11 User_2 override)** — стэк t115 baseline locked, package versions update к latest stable
- Approved sequence (clean-slate revised, ~3-4 months realistic): Phase B-D Initiative → Phase A-D gate close → weight build → Phase E-G
- Open backlog severity ladder
- User decision points pending
- Cross-repo state (codegen + t115 + sync_core + weight)

**Только после этого** принимать запросы User'а.

## Краткий контекст (для тебя сразу)

**Состояние master (post-Phase-B-D + post-scaffolding-commit):**
- `master 2437157` ("1" scaffolding commit для TASK-025..029 pack) + `03baa30 feat(generator): opt-in --with-interfaces для simplified-шаблона` + `accb1e2 TASK-024 B2` + `ff8f9d9 TASK-023 B2` + `a3820e4 TASK-022 B1`
- 181 unit tests passing на master (mocha workaround); TASK-025 stashed adds 9 → 190 when resumed
- CI: [.github/workflows/test.yml](../../.github/workflows/test.yml) — minimal automated gate
- ⚠ **Working tree NOT clean.** Active branch `chore/TASK-030-fix-template-custom-lint-pin` с uncommitted TASK-030 deliverables (см. Active pipeline ниже). Plus `git stash list` показывает TASK-025 work stashed — НЕ pop до TASK-030 merge.

**Что произошло (последние ~2 дня intense, 11 discussions archived, 7 PRs):**
- Phase 1.5 sequence (9 PRs)
- HOTFIX-001 (PR #14) — `new_task.py` scan active/+done/+blocked/
- TASK-020 / TASK-CI-001 (PR #15) — minimal CI gate (.github/workflows/test.yml)
- TASK-021 / Initiative Phase A (PR #16) — ADR-0005 promoted + 3 audits + closure-report draft
- chore stack-lock (PR #17) — Discussion #11 finalize + ADR-0005 amendments + stack-lock CRITICAL marker везде

## ⚠ CRITICAL: Stack-lock decision (User 2026-05-03)

**Стэк t115 baseline НЕ меняется без явного User approval.**

**Locked package set (выбор библиотек):**
- **Riverpod** через `@riverpod` annotations (codegen-based, requires `riverpod_generator` + `build_runner`) — same as t115
- **Drift** as ORM — same as t115 (table per entity, DAO conventions, FK references inline)
- **Clean directory layout** preserved (`lib/features/<feature>/data/datasources/local/tables/`)
- **sync_core 0.3.0** — same package, mutation-first contract preserved
- **Serverpod** as backend framework — same package
- **Manifest markers** — same 13-marker scheme as t115 (per ClaudeAdv evidence-based correction; не 7 как ранее документировано)

**MUST update (НЕ stack change, version refresh):**
- Все package versions → latest stable, **включая Serverpod**
- `flutter_riverpod` + `riverpod_annotation` + `riverpod_generator` + `drift` + `drift_dev` + `drift_flutter` + `sync_core` + `serverpod` (+ all Serverpod packages) + `freezed` + `json_serializable` + `build_runner` + `uuid` + others
- **Verify через Dart MCP** перед commit (per global CLAUDE.md "never guess library versions")

**Simplified философия меняет ТОЛЬКО architecture ceremony:**
- ❌ NO usecases generation (CRUD = noise per ADR-0005 Section 3.2)
- ❌ NO business notifiers с custom logic generation
- ❌ NO validation rules generation
- ❌ NO repository interfaces по умолчанию (`--with-interfaces` flag default OFF)
- ❌ NO application services generation
- ❌ NO mappers как separate class (extension methods достаточно)
- ❌ NO Either/Result wrappers
- ❌ NO datasource interfaces

**Future agents — treat stack lock как hard architectural invariant.** Reviewers должны flag stack changes как scope violations unless User explicitly approved.

## ⚠ Clean-slate decision (User 2026-05-03)

**Weight v1 НЕ в production, нет real users.** Roadmap значительно упрощается:
- Никакого dual-running v1+v2 concerns (5 рисков из Sub-A3 audit moot)
- Никакого decision matrix v1 maintenance approval (нет v1 чтобы maintain)
- Никакого cutover plan execution (нет users чтобы migrate)
- Никакого production transition (weight build = installable app, hard switch deploy)
- Никакой backend event emission verification spike (no v1-source mutations)

**Estimate:** 5-6 → ~3-4 months realistic. Hard ceiling 4 months.

## Approved sequence (post-Phase-B-D, current state 2026-05-25)

1. ✅ **Phase A** (TASK-021 PR #16) — ADR-0005 + 3 audits + closure-report
2. ✅ **stack-lock chore** (PR #17) — ADR-0005 amendments + Discussion #11 archive
3. ✅ **Phase B** completed:
   - **TASK-022** (PR #19, `a3820e4`) — codegen core multi-template infrastructure (TemplateConfig injection)
   - **TASK-023** (PR #20, `ff8f9d9`) — simplified template content session 1 (BUG-019 subset)
   - **TASK-024** (PR #21, `accb1e2`) — simplified template directory bootstrap + **Discussion #12 pivot:** DEFAULT_TEMPLATE revert simplified → t115; simplified opt-in via `--template simplified`
4. ✅ **post-Phase-B chore** (`03baa30`) — opt-in `--with-interfaces` флаг для simplified
5. 🔴 **Active (2026-05-25):** 5-task cross-repo pipeline TASK-025..029 (фиксы шаблонов из weight TASK-019 sync_core wire-up review) + **TASK-030 BLOCKER** template `pubGet` drift fix. См. "Active pipeline" section ниже.
6. ⏭ **Post-pipeline (после TASK-029 merge):** weight backlog (cross-repo, отдельная задача в weight репо: реген существующих 13 сущностей под новые шаблоны + перенос кастомов). Не trogается в code-generator.
7. ⏭ **`<weight-build TASK>` (fresh Flutter app)** — deferred (Phase A-D gate ✅ closed at this point — Phase B-D executed). Will create through `new_task.py` когда User triggers.
8. ⏭ **Phase E-G** parallel с late work (acceptance + docs reconciliation + closure)

**Hard ceiling action:** scope cut, НЕ timeline extension.

## Phase B Decision (Discussion #11 12-point convergence + User stack-lock override)

| Q | Decision | Rationale |
|---|---|---|
| Q1 | Sequenced 3 TASKs (B1 → B2 → B3) | Atomic per-TASK boundaries для implementation work |
| Q2 | `G:/Templates/flutter/simplified/` parallel location | Same convention as t115 |
| Q3 | Refactor existing generators для template-aware switches | TASK-B1 estimate 2-2.5 weeks (per ClaudeAdv hardcoded literals evidence) |
| Q4 | `@riverpod` annotations + Notifier hierarchy as t115 | **Stack lock override** — Q4=b prototype side-by-side OVERRULED |
| Q5 | Drift conventions same as t115 baseline | Stack lock implies inheritance |
| Q6 | Same 13-marker scheme as t115 | **Stack lock override** — Q6=b/d reduced markers OVERRULED |
| Q7 | TDD-first для simplified-suite tests | Patterns well-spec'd under stack lock — circular dependency moot |
| Q8 | YES RelationPatcher applicable в simplified | Stack lock implies markers preserved |
| Q9 | Simplified inherits t115 DI pattern | Stack lock implies same DI |
| Q10 | 3 thematic + 1 Adversarial overlay per TASK | 4 reviewer invocations × 3 TASKs |
| Open Q #3 | Preserve Clean directory layout | Stack lock implies inheritance |
| ⚠ CRITICAL | Stack-lock principle | All package choices fixed from t115 baseline; versions update к latest |

**Process additions accepted (Discussion #11 reviewers' observations):**
- TASK-B1 acceptance: explicit zero-diff smoke test t115 generation на t164 (existing test project) — verify refactor не сломал
- TASK-B1 setup: PowerShell sandbox writability check для `G:/Templates/flutter/simplified/` (`mkdir test`, verify, cleanup)
- Per-TASK closure-report Phase B section update (incremental, не at-end)
- `<weight-build TASK>` placeholder replacement procedure documented в Phase D acceptance

## User decision points (pending для следующего teamlead — 2026-05-25)

| Decision | Required by | Owner | Status |
|---|---|---|---|
| **TASK-030 commit + PR + merge** | First action — finalize current chore branch | User | ⏳ pending "коммить" (caret approach + docs ready, multi-agent pass #2 ✅, see Active pipeline) |
| **TASK-025 resume approval** | After TASK-030 merged | User | ⏳ implementation done (stashed) — pop stash + continue с шага 12 |
| **TASK-026..029 sequential** | After TASK-025 merged | User | ⏳ pending — порядок 4→1→2→3→5 zafiксирован Q1 User decision |
| Phase A-D gate sign-off (closure-report.md final) | Conceptually closed via Phase B-D execution | User | Implicit closure via TASK-022/023/024 merge; formal closure-report.md final update — defer |
| Update teamlead.prompt.md + agent_memory.md (gotcha про SendMessage недоступность + kill-mid-op partial state) | Anytime | User | ⏳ pending — `a/b/c/none` decision (см. transcripts либо memory `feedback_subagent_continuation.md`) |

**All previously-pending decisions resolved:**
- ✅ Backend strategy Option 1 (Sub-A1)
- ✅ ADR-0005 text counter-sign (Sub-A6)
- ✅ Stack-lock decision (Discussion #11)
- ✅ Q1-Q6 user decisions для 5-task pipeline (см. memory `feedback_questions_as_text.md` либо transcript: Q1 5-PR / Q2 default OFF + `--with-server` / Q3 LWW default ON opt-out junction / Q4 t<N+i> per PR / Q5 2 baseline + 3 для Bug 3/5 / Q6 BUG-001 closes + t115 frozen + sync-write only)
- ✅ TASK-030 approach E (caret bump) — Adversarial recommended, applied, verified t184
- ⏭ Decision matrix v1 maintenance / Cutover — N/A under clean-slate

## ⚠ Active pipeline (2026-05-25) — TASK-025..029 + TASK-030

### Cross-repo origin

Pipeline пришёл из weight-system [TASK-021 handoff](../../../../Flutter/serverpod/weight/ai/tasks/active/TASK-021-generator-root-followup/task.md) — 5 фиксов шаблонов из TASK-019 sync_core wire-up review (Сессия 2 adversarial pass нашёл блокеры в vanilla-генерированном выводе). User decisions Q1-Q6 зафиксированы (см. "User decision points" таблица выше).

### Order (Q1 User decision)

`4→1→2→3→5`: TASK-025 (Bug 4 quick win) → TASK-026 (Bug 1 fixed место найдено) → TASK-027 (Bug 2 locate-first) → TASK-028 (Bug 3 critical) → TASK-029 (Bug 5 last, breaking CLI). Sequential — каждый ловит свой `t<N>` per Q4 (t180..t184 уже использованы для TASK-025/030, новые задачи получат t185+).

### Current state per TASK

| ID | Status | Detail |
|---|---|---|
| **TASK-030** | 🟡 **READY FOR COMMIT** | Caret bump `custom_lint: 0.8.0 → ^0.8.0` (single-char fix + 3 rotted comments cleanup в flutter + admin sibling). Multi-agent review pass #1 → caught extended A diagnostic error → rework к caret approach (Adversarial Critical C2). Pass #2 → APPROVE WITH NITS (Std) + APPROVE WITH HIGH FIXES (Adv) — все fixes applied (CR-1 + 4 HIGH + admin M-1). Verified t184 PASS errors=0,warnings=0,infos=30. Branch `chore/TASK-030-fix-template-custom-lint-pin`, uncommitted: `agent_memory.md` + `status.md` + new `BUG-021` + new `TASK-030/` directory. **Жду User OK на commit + PR + merge.** |
| **TASK-025** | ⏸ BLOCKED на TASK-030 | Implementation DONE (template patches в 4 simplified `*_state_providers.dart` + new `src/test/generators/state_providers_ref_mounted_test.ts` 9 tests / 3 suites, 190 mocha passing). **Stashed** (`git stash list` → "TASK-025 work — resume after TASK-030 template drift fix"). После TASK-030 merge: `git checkout feature/TASK-025-bug-4-riverpod-ref-mounted && git stash pop` → continue с шага 12 (multi-agent review pre-commit) → commit → PR. Verify уже выполнялся на t181 (FAIL — pre-TASK-030 drift); при resume использовать новый t185+. Закрывает [BUG-001](../bug-reports/001-state-provider-ref-disposed.md). |
| **TASK-026** | ⏸ BLOCKED | Bug 1: entityType const snake_case. Fix = lookahead extension в `replacement_util.ts:47` ENTITY snake-rule (добавить `'`/`"` quote-boundary). Single-line src/ change + unit test + verify. Не started. См. [task.md](../tasks/active/TASK-026-bug-1---entitytype-const-snake-case/task.md). |
| **TASK-027** | ⏸ BLOCKED | Bug 2: enum `byName` → graceful helper. **Locate step first** — найти где в `src/features/generation/` либо в section-template генерируется `EnumType.values.byName(raw)`. Дизайн shared vs injected helper. Не started. См. [task.md](../tasks/active/TASK-027-bug-2---enum-byname-graceful-helper/task.md). |
| **TASK-028** | ⏸ BLOCKED | Bug 3: ⚠ **Самый critical** (silent data corruption на cross-device pull). Default ON LWW skip-stale guard в `*_local_apply.dart`, opt-out junction через JunctionDetector. **3 adversarial reviewers** per Q5. Reference impl = `weight/weighing_local_apply.dart` (manual TASK-019 guard). Не started. См. [task.md](../tasks/active/TASK-028-bug-3---lww-skip-stale-guard-default-on/task.md). |
| **TASK-029** | ⏸ BLOCKED | Bug 5: `generate-entity` opt-in `--with-server`, default OFF. CLI breaking change. Co-fix `create_project.ts` если нужно (verified что startProject manifest exempt от фильтра, но defensive передача рекомендуется). **3 adversarial reviewers** per Q5. Не started. См. [task.md](../tasks/active/TASK-029-bug-5---generate-entity-opt-in---with-server/task.md). |

### State on disk

```
Current branch:   chore/TASK-030-fix-template-custom-lint-pin
Stashes:          stash@{0}: TASK-025 work — resume after TASK-030 template drift fix
Test projects:    t180 (TASK-025 attempt #1, partial bootstrap from kill-mid-op)
                  t181 (TASK-025 attempt #2, verify FAIL pre-TASK-030 drift)
                  t182 (TASK-030 wrong template default, orphan)
                  t183 (TASK-030 extended A first-pass, PASS but rejected approach)
                  t184 (TASK-030 caret approach FINAL, PASS errors=0 — canonical baseline)
                  All sandbox-protected, User cleanup zone.
```

### Diagnostic lesson (TASK-030, MUST remember)

**Compare sibling templates before "cascade impossible" diagnosis.** TASK-030 first-pass executor diagnose "analyzer 7→8 cascade requires regenerate всего generated code" — **wrong**. Adversarial reviewer caught: sibling `simplified_admin/pubspec.yaml` имел IDENTICAL constraints кроме одного (`custom_lint: ^0.8.0` caret vs strict). Admin's `pubspec.lock` empirically resolved `analyzer 8.4.0 + custom_lint 0.8.1 + freezed 3.2.3 + build_runner 2.15.0 + json_serializable 6.11.2` — proves cascade auto-resolves. Single-character caret bump в flutter pubspec = same fix.

**Pattern для future:** template'ы в monorepo (simplified_flutter + simplified_admin + simplified_server) часто имеют similar constraints с minor differences. **Sibling lockfile = ready-made empirical evidence.** Always read sibling `pubspec.lock` ДО theoretical "это невозможно" verdict.

**Также:** pubspec comments rot at scale (months-old "X requires Y" claims могут быть obsolete after registry updates). Verify empirically through current lockfile state. TASK-030 нашёл 3 rotted comments в simplified template + 3 same в admin sibling — все 6 cleaned.

Дополнительные details — в [BUG-021](../bug-reports/021-pub-deps-drift-template-pubspec.md) Diagnostic lesson section.

### Multi-agent review insights (TASK-030)

- **Pass #1 Standard** approved suboptimal extended A approach (missed simpler caret alternative).
- **Pass #1 Adversarial** caught critical diagnostic error через 5-min sibling lockfile read.
- **Каноничный case** за обязательный Adversarial pass для template-level changes. **НЕ skip Adversarial** даже если кажется что Standard уже approved.

### Process gaps captured (для будущих teamlead'ов)

1. **`SendMessage` continuation pattern недоступен** в стандартной Agent tool конфигурации этого проекта. Каждый STOP-gate = fresh Agent spawn с self-contained promptом (включая "что уже сделано предыдущим executor'ом"). См. memory `feedback_subagent_continuation.md`.
2. **НЕ TaskStop subagent в середине long-running op** (`create-project` ~3-5 min). Bg-subprocess может остаться в partial state на disk — выглядит complete но broken. После любого `create-project` — verify полноту через `ls <name>_admin/`, `lib/core/sync/`, `lib/features/configuration/`, pubspec deps. Только existence root `<name>/` + `<name>_server/` недостаточно.
3. **task.py start всегда добавляет `feature/` префикс** даже если caller передал `chore/short-name`. Получается `feature/chore/...`. Workaround: rename branch после start через `git branch -m chore/...`.
4. **`new_task.py` encoding bug** под Windows cp1251 (Python из ESP-IDF toolchain). Use `PYTHONIOENCODING=utf-8 python ai/scripts/new_task.py "..."`.
5. **`new_task.py` STATUS_FILE case-insensitive** на Windows — обновляет `status.md` (lowercase) but appends orphan rows в самый конец без table awareness. Cleanup руками после.

(Эти gaps кандидаты для отдельного `chore/new_task-py-fixes` PR — User зафиксировал в weight backlog после закрытия TASK-029.)

---

## Cross-repo state (snapshot)

| Репо | Branch / version | Status |
|---|---|---|
| `devabacus/code-generator` (this) | master `70650f7` (post stack-lock chore PR #17) | 163 tests + CI workflow, Phase 1.5 + Phase A ✅ closed, 11 discussions archived. **⚠ CRITICAL Stack-lock active** (стэк t115 locked; package versions update к latest stable включая Serverpod). Discussion #11 ✅ closed (Phase B 12-point Decision). TASK-B1 ready for creation. |
| `devabacus/t115` (template) | master `148ddf1` | **Deprecated path** (frozen, no active maintenance, removal planned 6-12 месяцев если нет consumers). Stack lock applies — simplified template inherits ALL t115 patterns (13 markers + Riverpod annotations + Drift + Clean directory). |
| `devabacus/sync_core` | 0.3.0 in master | validated multi-entity cross-device на Windows + Android. Sub-A3 dual-running audit pinned reference-only post clean-slate decision. Optional: ADR-0006 amendment в sync_core repo для backend event-emission contract formalization (не blocking). |
| `devabacus/weight v1` | NOT в production | Clean-slate decision 2026-05-03 — нет real users, нет maintenance burden. |
| weight build (TBD) | TBD | Fresh Flutter app on simplified template. Starts only after Phase A-D gate closed. ID = `<weight-build TASK>` placeholder, replaces при `new_task.py` invocation post-gate. |

## HARD RULES (выжимка из teamlead.prompt.md + AGENTS.md)

1. **⚠ CRITICAL Stack lock** — стэк t115 baseline (Riverpod annotations + Drift + Clean directory + sync_core + Serverpod) НЕ меняется без явного User approval. Версии update к latest stable. См. [feedback memory](../../../../C:/Users/User/.claude/projects/g--Projects-Flutter-Packages-sync-core/memory/feedback_t115_stack_locked.md).

2. **Definition of Done:** `node out/adapters/cli/index.js verify --name <test_project> --human` PASS errors=0. Цитировать **реальные числа**.

3. **Tasks/discussions ТОЛЬКО через python скрипты:**
   - `python ai/scripts/new_task.py "название"`
   - `python ai/scripts/task.py start|pr|merge|finish`
   - `python ai/discussions/scripts/discuss.py new|close`
   - **Запрещено** через `Write` tool

4. **Multi-agent review pattern** (validated 6-й precedent: PR #6/#8/#9 + Discussion #6 + TASK-CI-001 + TASK-021 Phase A) — обязателен для major TASK до commit'а. **3 thematic + 1 Adversarial overlay** per TASK для Phase B (per Discussion #11 Q10=b).

5. **Pre-implementation Discussion** обязателен для high blast radius changes. Saves hours of rework.

6. **Sandbox блокирует `rm -rf`** test-проектов — это политика User'а, **НЕ workaround**.

7. **Dart MCP не использовать** для codegen — TypeScript проект. **Использовать Dart MCP для verify package versions** перед simplified template emission (per stack-lock version update obligation).

8. **Никаких merge без явного "мержить"** от User. `task.py merge -y` ТОЛЬКО когда User явно сказал.

9. **Template t115 — отдельный git репо** (`devabacus/t115`). Изменения там НЕ tracked codegen репо. Под stack lock — t115 deprecated path, no active maintenance unless critical.

10. **Phase A-D gate enforcement:** TeamLead обязан verify checklist closed (5 mandatory items в closure-report.md) + User counter-sign до `new_task.py "<weight-build TASK>"` invocation.

11. **`<weight-build TASK>` placeholder** — replaces при `new_task.py` invocation post-Phase-A-D gate. Procedure: grep+replace `<weight-build TASK>` → assigned TASK-NNN ID во всех живых docs (status.md / roadmap.md / agent_memory.md / handoff.prompt.md / closure-report.md).

## Predecessor's lessons learned (handoff insights)

**Что работало хорошо:**
- **Multi-agent review pattern (6-й precedent)** caught DEAL-BREAKERs которые Standard reviewer missed:
  - PR #6 template uncommitted, PR #8 quote-stripping landmine, Discussion #6 markers count error (Phase 1.5)
  - TASK-CI-001 Adversarial: npx mocha fragility + TASK-020 ID drift (2 deal-breakers)
  - TASK-021 Phase A Adversarial: cross-deliverable arithmetic drift + decision matrix decoupling + Riverpod pre-decision (3 deal-breakers + 14 HIGH)
  - Discussion #11 ClaudeAdv: 13 markers vs 7 (factual correction) + Q9↔Q4 coupling + Q3 hardcoded literals scope (3 deal-breakers + 6 HIGH)

- **Pre-implementation Discussions** saved hours of rework — Discussion #5/#6/#7/#8/#9/#10/#11 каждый caught 2-3 critical gaps

- **STOP-gates** ловили scope creep до commit'а

- **User stack-lock decision** упростил Phase B значительно — TBD placeholders все resolved одним override, нет prototype rounds

**Что важно помнить:**
- Discussion #5 4 agents missed что markers = 7 layers (claimed 5) — verify factual claims через grep
- ClaudeAdv в Discussion #11 verified 13 markers actually (не 7) — predecessor framing был wrong; обновить factual claims через evidence
- Phase 1.5 frustration revealed Clean overengineered for CRUD — Discussion #7 formalized → ADR-0005
- **Discussion #9 corrections к teamlead position:** Q1 categorical "frozen" → strategic/operational hybrid; Q7 "obsolete" → "additive correction"
- **Discussion #10 corrections:** Q7=c REJECT добавлен MUST; Q8 ceiling 2 → 3w decomposed; Q10 двухслойная review structure
- **Discussion #11 corrections:** Q4=a stays under stack lock (overrides reviewer Q4=b); Q6=a stays under stack lock (overrides reviewer Q6=b/d); estimate 3.5-4.5 → 5-7 weeks

**Известные patterns (handle carefully):**
- BUG-014 — pre-existing landmine `regex без \b word boundary`
- BUG-015 — cross-feature junction generation broken
- BUG-001 — Ref disposed в state_providers (production-blocker UI weight v1 — capacity-driven, post-Initiative)
- Test-проекты: t160-t164 могут стать stale — User cleanup zone

## Style preferences (User memory)

- **Язык:** русский для коммуникаций, технические термины на английском
- **Git:** коммиты ТОЛЬКО когда User явно сказал "коммить". Conventional Commits, БЕЗ `Co-Authored-By`
- **Без костылей:** если правильное решение неочевидно — сказать честно, предложить варианты
- **Markdown links для файлов** в VS Code (`[filename.ts](src/filename.ts)` — НЕ backticks)
- **Не предлагай коммитить** после каждого изменения

## Что я (предшественник) сделал/НЕ сделал — для тебя

**Done в предыдущей session (2026-05-23 → 2026-05-25):**
- ✅ Phase B sequence merged: TASK-022 (PR #19) + TASK-023 (PR #20) + TASK-024 (PR #21) — Discussion #11 12-point Decision реализован
- ✅ Discussion #12 pivot (2026-05-04): DEFAULT_TEMPLATE revert simplified → t115; simplified opt-in via flag
- ✅ Post-Phase-B chore `03baa30` — opt-in `--with-interfaces` для simplified
- ✅ Scaffolding commit `2437157` ("1") — 5 task.md TASK-025..029 + status.md update (User push'нул напрямую в master)
- ✅ TASK-025 implementation (template patches + 9-test unit suite, 190 mocha passing) — **stashed**, ждёт TASK-030 merge
- ✅ TASK-030 work (caret approach + docs sync, multi-agent review pass #1 → caret rework → pass #2 ✅) — **на ветке chore/TASK-030, uncommitted, ждёт User OK на commit**

**НЕ сделано (для тебя — в priority order):**
1. **TASK-030 commit + PR + merge** — finalize current chore branch. **Жду explicit User "коммить"** (см. User decision points + Active pipeline). Procedure: `git add ai/docs/agent_memory.md ai/docs/status.md ai/bug-reports/021-... ai/tasks/active/TASK-030-.../` (explicit per-file, не `.`) → `git commit` с Conventional Commits на русском (без `Co-Authored-By`) → `task.py pr` → ждать User OK → `task.py merge -y`. **Post-merge verify mandatory:** `git pull && npm run compile && mocha workaround && codegen create-project --name t185 && codegen verify --name t185` (template touched).
2. **TASK-025 resume** — после TASK-030 merge: `git checkout feature/TASK-025-bug-4-riverpod-ref-mounted && git stash pop` → continue с шага 12 (multi-agent review pre-commit) → commit → PR. Heavy lifting done (~30-60 min к merge).
3. **TASK-026 → TASK-027 → TASK-028 → TASK-029** — sequential per Q1, каждый ~3-10 hours (см. estimates в [status.md → Активные задачи](../docs/status.md)).
4. **Update teamlead.prompt.md + agent_memory.md repo gotcha про SendMessage / kill-mid-op partial state** — User question висит (a/b/c/none), defer until pipeline closure либо обработать как parallel chore PR.
5. **`chore/new_task-py-fixes`** — кандидат на отдельный PR в weight либо здесь (per User в Active pipeline → "Process gaps" — User defer'нул в weight backlog после TASK-029 закрытия).
6. **BUG-001** закроется автоматически когда TASK-025 merged.
7. **`<weight-build TASK>`** — defer (clean-slate decision применима по-прежнему; capacity-driven после pipeline closure).

**Critical reminders:**
- **НЕ pop TASK-025 stash до TASK-030 merge** — иначе template patches окажутся в chore branch (scope creep).
- **НЕ удалять test projects** t180-t184 (sandbox policy, User zone).
- **Используй `PYTHONIOENCODING=utf-8`** для `new_task.py` (encoding bug under cp1251).
- **При spawn executor subagent для long-running ops** — НЕ TaskStop в середине (см. Process gaps #2).

## Действия для тебя в первой сессии

1. Прочитай 10 onboarding файлов (~25-30 минут)
2. Выдай ~200-словесный summary (включая stack-lock + clean-slate context)
3. Жди User'а instructions

User скорее всего скажет одно из:
- **"коммить"** / **"commit TASK-030"** — finalize current chore branch (см. "НЕ сделано (для тебя)" пункт 1). Most likely first action.
- **"resume TASK-025"** — pop stash + continue с шага 12 (only после TASK-030 merge).
- **"стартуй TASK-026"** (либо 027/028/029) — после предыдущей в pipeline closed.
- **"проверь status"** — выдать current state (master / open PRs / branches / stashes / pending decisions).

В любом случае — **read first, act second**. Не начинай implementation до прочтения всех 10 onboarding файлов + Active pipeline section (выше).

**Read в этом порядке (минимум для immediate action):**

1. INDEX.md → agent_memory.md → CLAUDE.md → AGENTS.md (стандарт)
2. status.md → roadmap.md (current state)
3. **Этот handoff.prompt.md в полноте** (включая Active pipeline section)
4. teamlead.prompt.md (role guide)
5. **TASK-030 report.md + task.md** (если первое действие = commit TASK-030)
6. **TASK-025 task.md** (если действие = resume after TASK-030)
7. ADR-0005 (background)
8. Discussion #11 + #12 archives (background)
9. Memory files в `C:\Users\User\.claude\projects\g--Projects-vs-code-extensions-code-generator\memory\` — feedback memories про SendMessage недоступность, kill-mid-op gotcha, questions-as-text preference, t115 stack-lock

Удачи!

---

P.S. (от меня предшественника):
- **Stack lock principle = архитектурная invariant.** Не предлагай stack changes как improvements; reviewers тоже должны flag попытки как scope violations. Если стэк needs change — explicit User decision required.
- **Clean-slate упростил roadmap значительно.** Где раньше были dual-running concerns (HIGH backend event emission gap, MEDIUM LWW skew, MEDIUM coalescing blindness, etc.) — все moot. Phase B-D + weight build proceed без этой complexity.
- **Multi-agent review pattern 6-й precedent.** Каждый раз Adversarial overlay catches deal-breakers (factual errors, hidden assumptions, cross-deliverable drift). Используй consistently.
- Pre-implementation Discussion для high blast radius — обязательно. Phase B-D каждый = high blast radius (codegen core / template content / generator infrastructure).
- Hard ceiling 4 months overall (clean-slate revision); action на ceiling = scope cut. Open-ended timeline = death march.
- Verify package versions через **Dart MCP + Context7 MCP** перед simplified template emission (per stack-lock version update obligation).
