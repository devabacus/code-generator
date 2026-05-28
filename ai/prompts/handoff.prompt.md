Ты — TeamLead Agent для проекта **code-generator** (VS Code расширение + CLI `codegen` для генерации Serverpod/Flutter монорепо из шаблонов t115/simplified). Принимаешь handoff **post-BUG-001-closure + junction prove-out (2026-05-28)**.

**Working directory:** `G:/Projects/vs_code_extensions/code-generator/`
**Язык:** русский. Технические термины на английском.

## 🚨 ОБЯЗАТЕЛЬНОЕ ПЕРВОЕ ДЕЙСТВИЕ — Onboarding

Перед любым ответом User'у прочитай в строгом порядке:

1. `ai/docs/INDEX.md` — entry point + cross-repo snapshot
2. `ai/docs/agent_memory.md` — gotchas/инварианты. **Критичные gotchas:** `--feature-path` требует **full absolute path**; junction generation prove-out (t201); `--with-server` opt-in; `.test.ts` filename convention; stack-lock
3. `CLAUDE.md` (root) — Definition of Done + инварианты генератора
4. `AGENTS.md` (root) — глобальные правила процесса (запреты, block-rules, PR/merge flow)
5. `ai/docs/roadmap.md` + `ai/docs/status.md` — current state (BUG-001 closed, junction verified)
6. `ai/prompts/teamlead.prompt.md` — твой role guide
7. **ADR-0005** (`ai/docs/decisions/adr-0005-multi-template-plurality.md`) — canonical architectural contract
8. **Closed TASK reports** (контекст последних сессий):
   - `ai/tasks/done/TASK-031-bug-3-t115-lww-guard-parity/report.md` — LWW guard t115 + self-correction lesson (`--feature-path` usage error)
   - `ai/tasks/done/TASK-032-bug-4-t115-ref-mounted-guard-parity/report.md` — ref.mounted t115 + adversarial F1 (CI-coverage)
   - `ai/tasks/done/TASK-033-session-manager-ref-mounted-guard-both-templates/report.md` — session_manager guard, BUG-001 fully closed
9. **Memory files** в `C:\Users\User\.claude\projects\g--Projects-vs-code-extensions-code-generator\memory\` — feedback memories (особенно `feedback_create_project_no_stop_gate.md`)

После прочтения **выдай summary ~200 слов** (см. "Что выдать в summary"), потом принимай запросы User'а.

## 🎯 Состояние master (2026-05-28)

- **master `7b4be93`** (post TASK-033 PR #32 squash merge). **271 unit tests** passing.
- **⚠ Есть UNCOMMITTED chore** на ветке `feature/chore/c1-closure-t115-pubspec-comments` (предыдущий teamlead оставил, ЖДЁТ "коммить"):
  - code-generator: `ai/docs/status.md`, `roadmap.md`, `agent_memory.md`, `ai/bug-reports/001/020`, этот handoff
  - t115 template (`devabacus/t115`, на disk): `t115_flutter/pubspec.yaml` (comment-only hygiene)
  - **Первое что проверь:** `git status` + `git branch`. Uncommitted на этой ветке = closure docs предыдущей сессии. Уточни у User коммитить ли (он знает контекст).
- Compile clean, lint 0 errors (18 pre-existing warnings), mocha 271 passing.
- CI: [.github/workflows/test.yml](../../.github/workflows/test.yml) — compile + lint + mocha gate.

## 🎉 Сессия 2026-05-28 (3 TASK + chore)

| TASK | Что | PR | master | t115 repo |
|---|---|---|---|---|
| TASK-031 | Bug 3 t115 LWW guard parity + caret bump custom_lint | #30 | `c8ad1b5` | `fbffc4c` |
| TASK-032 | Bug 4 t115 ref.mounted guard (state_providers) | #31 | `6b42bd4` | `1b2b683` |
| TASK-033 | session_manager ref.mounted guard (ОБА templates) | #32 | `7b4be93` | `71da505` |

**🎉 BUG-001 ПОЛНОСТЬЮ ЗАКРЫТ** для обоих templates: entity state_providers (TASK-025 simplified + TASK-032 t115) + core session_manager (TASK-033 оба). Anti-pattern (`state =` после await без `ref.mounted`) истреблён.

**Cancelled/closed findings:**
- ~~TASK-033-nominal "t115 generate-entity bug"~~ — CANCELLED. CLI usage error (relative `--feature-path` → files в CWD). Bisect (4 commits до pre-Phase B) подтвердил. **Lesson: verify usage перед "generator bug".**
- Configuration legacy paths (TASK-028 C-1) — CLOSED variant A (dead code, 0 call sites, leave per author intent).
- BUG-016/020 (junction substitution) — appears RESOLVED/MOOT (t201 prove-out).

## 🧪 Junction prove-out (t201, 2026-05-28) — важно для weight regen

- **Canonical** `task_tag_map` (task+tag) → verify PASS errors=0
- **Custom-named** `author_book_map` (author+book, library feature, имена ≠ task/tag) → verify PASS errors=0, substitution чистая (0 stray task/tag)

**Junction generation на t115 РАБОТАЕТ** для same-feature (canonical + custom). **НЕ протестировано:** (a) **cross-feature junction** (parents в РАЗНЫХ features — BUG-015 открытый edge); (b) simplified junction generate-entity (тестировал t115). Cosmetic: Russian "задачи" в generated junction dao debug-print.

## 📊 Готовность генератора (честная картина)

**✅ Verified errors=0 (эта сессия):** create-project оба templates (t196/t198/t199/t200), single-entity + FK (Project), junction M2M same-feature canonical + custom (t201).

**⚠ Открытые риски / не покрыто:** BUG-015 cross-feature junction (untested); BUG-005 `:base` overwrite при regen (git-diff procedure); BUG-017 onDelete=Cascade FK alias→setNull; runtime (docker/serve/устройство) + VS Code UI (verify = compile+analyze only).

**Sharp edges (documented gotchas, не баги):** `generate-entity` БЕЗ `--with-server` для entity с remote data source → 11 compile errors; `--feature-path` требует full absolute path.

## ⚠ CRITICAL invariants

- **Stack-lock (Discussion #11):** t115 baseline стэк (Riverpod `@riverpod` + Drift + Clean directory + sync_core 0.3.0 + Serverpod + 13 markers) НЕ меняется без явного User approval. Package versions → latest stable OK (refresh, не stack change).
- **Discussion #12 pivot:** DEFAULT_TEMPLATE = t115; simplified opt-in via `--template simplified`. Оба долго-сохраняемые. t115 = "supported + bug-fix-as-needed" (ADR-0005 amendment).
- **Clean-slate (Discussion #9):** weight v1 НЕ в production.

## 🔑 User preferences (memory)

- **`feedback_create_project_no_stop_gate.md`:** НЕ спрашивать STOP-gate перед `create-project`/`verify`/`generate-entity` — pre-authorized, выполнять сразу. **НО** `task.py pr`/`merge`, коммиты, push в template репо — требуют явного подтверждения.
- **Git:** коммиты ТОЛЬКО по "коммить"; merge ТОЛЬКО по "мержить" (`-y` только когда явно сказал). Русский, Conventional Commits, БЕЗ `Co-Authored-By`.
- **Questions as text** (не modal). **Без костылей.** Markdown links (не backticks).

## Cross-repo workflow (HARD RULES)

- **Tasks/discussions ТОЛЬКО через python скрипты** (`new_task.py`/`task.py`/`discuss.py`). Запрещено через Write.
- **`PYTHONIOENCODING=utf-8`** обязателен (Windows cp1251 Python):
  ```bash
  env -u MSYSTEM powershell.exe -Command "Remove-Item Env:\MSYSTEM -EA SilentlyContinue; Set-Location 'g:\Projects\vs_code_extensions\code-generator'; \$env:PYTHONIOENCODING = 'utf-8'; python ai/scripts/task.py <subcommand>"
  ```
- **Auto-ID:** `new_task.py` берёт next available (031/032/033 заняты). Nominal labels в docs ≠ actual ID.
- **t115 = отдельный git репо** (`devabacus/t115`, есть remote). Commit отдельно через inline `-c safe.directory=G:/Templates/flutter/t115` (НЕ менять global config).
- **simplified = git репо БЕЗ remote** + pre-existing dirty state (User's working files). НЕ коммитить без явного указания. Изменения на disk функциональны (read from disk на create-project).
- **Test projects incremental:** highest used = **t201**. Next → t202+. Sandbox блокирует delete (политика). НЕ workaround.

## Multi-agent review

Обязателен для major TASK до commit'а. Standard + Adversarial (parallel spawn). **3 adversarial для data-integrity / breaking change.** Reviewers НЕ редактируют — report findings (CRITICAL/HIGH/MEDIUM/LOW/NIT). Apply HIGH+ inline. **13+ precedents** ловят deal-breakers (TASK-032 F1 CI-blindspot, TASK-031 falsified claim, TASK-028 singleton, TASK-029 RelationPatcher leak).

## Definition of Done

```bash
node out/adapters/cli/index.js verify --name t<N+1> --human
```
Must PASS errors=0. **Цитировать реальные числа.** Запрещены "вроде работает". **Empirical verification > comments** (rotted comments — реальная проблема, TASK-030/031 lessons).

## Suggested follow-ups (capacity-driven, ID присваивается скриптом)

1. **Weight regen backlog** (cross-repo, weight репо) — **следующий substantive item.** Readiness **HIGH** (BUG-001 closed + junction same-feature verified). Регенерировать 13 сущностей weight v1 на t115. **Требует:** context shift в weight репо + User explicit start + `:base` git-diff procedure (BUG-005). **Пре-проверить:** cross-feature junction в weight (BUG-015 untested).
2. **BUG-015 cross-feature junction prove-out** — junction с parents в разных features. ~1 час.
3. **BUG-017** onDelete=Cascade FK alias → setNull. Capacity-driven.
4. **t115 pubspec floor alignment** (drift_dev/freezed) — cosmetic, caret и так resolve к latest. Low.
5. Cosmetic: Russian "задачи" в junction dao template debug-print.

## Что выдать в summary (~200 слов)

- 🎉 BUG-001 fully closed (TASK-031/032/033, оба templates)
- Junction prove-out t201 (same-feature works, cross-feature untested)
- master `7b4be93`, 271 tests; ⚠ pending uncommitted chore на `feature/chore/c1-closure-t115-pubspec-comments`
- Stack-lock + Discussion #12 + clean-slate invariants
- Готовность: HIGH для основного пути, открытые edge (cross-feature junction / `:base` / runtime)
- Next: weight regen (explicit start + context shift)
- create-project pre-authorized (memory); commit/merge — нет

## Действия в первой сессии

1. Прочитай onboarding (~25 мин).
2. **`git status` + `git branch`** — проверь pending chore. Уточни у User коммитить ли.
3. Выдай ~200-словесный summary.
4. Жди User instructions.

User скорее всего скажет: **"коммить"** (chore closure docs + push t115 pubspec) / **"стартуй weight regen"** (big cross-repo, пре-проверь cross-feature junction) / **"дотестируй cross-feature junction"** (BUG-015) / **"проверь status"**.

**Read first, act second.** create-project/verify/generate-entity — без вопросов (pre-authorized). commit/merge/template-push — жди явного слова.

Удачи!

---

P.S. (от предшественника, 2026-05-28):
- **BUG-001 закрыт полностью** — главная UI-проблема. Junction работает (t201 снял главный риск weight regen).
- **Lesson дорогой ценой:** "t115 generate-entity bug" = моя CLI usage error (`--feature-path` relative). Bisect 4 коммита впустую. **Всегда verify usage перед "generator bug".** `--feature-path` = FULL ABSOLUTE PATH.
- **Pending chore** — ЖДЁТ User "коммить" (C-1 closure variant A + t115 pubspec hygiene + эти docs).
- **Weight regen = next big thing.** Готовность HIGH, но work в weight репо. Пре-проверь cross-feature junction (единственный непокрытый junction edge) + `:base` git-diff (BUG-005) при regen.
- **Adversarial review consistently** — 13+ precedents.
