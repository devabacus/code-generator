# TASK-030: Chore — fix simplified template `pubGet` drift (blocks TASK-025..029 verify)

> Discovered 2026-05-23 в ходе TASK-025 verify попытки на t181. Эскалировано teamlead → User decision (A) — fix TASK-030 first, потом resume TASK-025..029 pipeline. См. [TASK-025 task.md → Журнал](../TASK-025-bug-4---riverpod-ref-mounted-в-state-providers/task.md).
>
> **Verified affects baseline:** t179 (TASK-024 reference) тоже fail на `flutter pub get` — это pre-existing template drift из-за свежих pub registry updates после TASK-024 merge (2026-05-04). Не вина TASK-024.
>
> Stack-lock invariant (Discussion #11) applies — версии packages update OK, но **breaking version bumps** (analyzer 7→8) требуют дополнительной оценки blast radius на generated output.

## Ветка

`chore/TASK-030-fix-template-custom-lint-pin`

## Цель

Восстановить работоспособность `flutter pub get` для проектов созданных из simplified template (`G:/Templates/flutter/simplified/`). Сейчас `pubGet` FAIL на каждом свежем create-project, что блокирует **весь** DoD verify chain (`pubGet → serverpodGenerate → buildRunner → flutterAnalyze`) для всех 5 задач пакета TASK-025..029.

**Симптом** (verified на t179 + t181):
```
✗ pubGet — ~15s
  error: The lower bound of "sdk: '>=1.8.0 <3.0.0'" must be 2.12.0 or higher
  to enable null safety.
  ! flutter pub get failed
```

**Минимум 2 root причины** (executor должен diagnose обе):

1. **analyzer chain conflict** (verified): `serverpod_client 3.4.8 → web_socket_channel ^3.0.3 → test ≥1.31.1 → analyzer ≥8.0.0`. Template pinned `custom_lint: 0.8.0` требует `analyzer ^7.5.0`. → conflict.
2. **SDK constraint violation** (suspected from error message): какая-то transitive dep'а имеет старый SDK constraint `>=1.8.0 <3.0.0` (pre-null-safety era). Dart 3.x не resolve'ит зависимости без null safety.

Точные виновники нужно найти через `flutter pub deps --json` + `flutter pub deps --tree`.

## Не-цели

- НЕ менять stack-lock package set (Riverpod/Drift/sync_core/Serverpod — frozen per Discussion #11). Allowed: dev_dependencies version bumps, transitive `dependency_overrides`, drop единичных dev-only deps (custom_lint, riverpod_lint).
- НЕ trogать t115 шаблон (frozen, deprecated path).
- НЕ trogать generated файлы в test-проектах (t179/t181/...). Эти broken проекты остаются на диске (sandbox policy).
- НЕ fix'ить TASK-025..029 фиксы в той же задаче — этот PR **только** template pubspec drift.
- НЕ менять SDK constraints (`sdk: ^3.9.2`) — это design choice TASK-024.
- НЕ делать major refactor analyzer 7→8 lockstep если есть minimal-disruption alternative.

## Scope

**Разрешено редактировать:**

- `G:/Templates/flutter/simplified/simplified_flutter/pubspec.yaml` — primary edit target (dev_deps version bumps, `dependency_overrides`, drop single dev-only pkg)
- `G:/Templates/flutter/simplified/simplified_flutter/pubspec.lock` — может обновиться автоматически от `flutter pub get`
- `G:/Templates/flutter/simplified/simplified_admin/pubspec.yaml` + `pubspec.lock` — если same issue affect admin (verify через `cd simplified_admin && flutter pub get`)
- `G:/Templates/flutter/simplified/simplified_server/pubspec.yaml` + `pubspec.lock` — если same issue affect server (`cd simplified_server && dart pub get`)
- `src/test/` — если нужно расширить existing tests на template integrity
- `ai/bug-reports/` — register этот drift как BUG-021 (либо аналогичный ID) с reference к TASK-030 fix
- `ai/docs/agent_memory.md` — gotcha про pub registry drift как regression source

**Запрещено:**

- t115 шаблон
- `src/features/generation/**` — это **template-only** chore, генератор не trogается
- Test projects `t179/t181/...` — broken оставить, фиксить **только** в template source
- Stack-lock packages (Riverpod/Drift/sync_core/Serverpod) — runtime versions фиксированы

## Критерии приёмки

- [x] Identified single root cause (strict pin custom_lint 0.8.0 блокировал analyzer 8 cascade) — `flutter pub deps` error chain в `report.md` (secondary advisory "sdk >=1.8.0 <3.0.0" debunked как pub solver hint, не отдельный root cause). Diagnostic lesson — sibling admin's lockfile empirically доказал caret approach до того как extended A был applied.
- [x] Минимально-disruptive fix применён — caret bump `custom_lint: 0.8.0 → ^0.8.0` (single-char change, post-Adversarial revision). Extended A overrides reverted.
- [x] **`flutter pub get` в `G:/Templates/flutter/simplified/simplified_flutter/` PASS** (verified 2026-05-25 post-caret-bump).
- [x] Admin: pubspec.lock already had caret — no changes needed. Server: doesn't use custom_lint. Both PASS unchanged. Admin's 3 sibling rotted comments cleaned in same wave (M-1 Adv).
- [x] **Verify на свежем t-проекте PASS:** `codegen verify --name t184 --human` → `errors=0, warnings=0, infos=30` (Total 63572ms). Full CLI block в `report.md`.
- [x] `tsc -p ./` clean. `eslint src --ext ts` clean (0 errors, 18 pre-existing warnings). Mocha не запускался (template-only chore, no `src/test/` changes).
- [x] BUG-021 зарегистрирован — `ai/bug-reports/021-pub-deps-drift-template-pubspec.md` (full rewrite post-Adversarial с Diagnostic lesson section).
- [x] agent_memory.md обновлён — gotcha "Template pubspec pub deps drift" rewritten с diagnostic lesson (compare siblings, verify comments empirically); date bumped к 2026-05-25.
- [x] `report.md` написан с CLI evidence + Approach evaluation table (A pure/A extended/B/C/D-var-1/**E caret** FINAL) + post-Adversarial revision history + findings closure table.

## План работы

**Статусы:** `[ ]` не начат · `[~]` в работе · `[x]` готово · `[!]` блокер

### Шаг 1 — Диагностика

1. [x] done — 11:30 — Прочитан context: TASK-025 эскалация, executor #4 final report, simplified_flutter/pubspec.yaml.
2. [x] done — 11:35 — `flutter pub get` baseline reproduced. Full error chain captured (см. Журнал).
3. [x] done — 11:40 — Deps tree analyzed через pub.dev API (transitive deps + flutter SDK pins).
4. [x] done — 11:42 — SDK constraint "1.8.0 <3.0.0" identified как pub solver advisory hint, не отдельный root cause. Real root cause: `matcher 0.12.19` flutter SDK pin + `web_socket_channel ^3.0.3` (от serverpod_client) → boxing pub solver на `test >=1.28` → `analyzer >=8`.
5. [x] done — 11:45 — Findings документированы в report.md Diagnostic section.

### Шаг 2 — Дизайн (выбрать approach)

6. [x] reviewed — Approach A (минимальный `dependency_overrides`)
7. [x] reviewed — Approach B (drop custom_lint, tooling regression)
8. [x] reviewed — Approach C (analyzer 8 cascade, forbidden без teamlead OK)
9. [x] reviewed — Approach D (combined bump + overrides)
10. [x] done — 11:50 — Teamlead approve'нул Approach D вариант 1 (bump custom_lint) с fallback на Approach A. Документировано в report.md.

### Шаг 3 — Реализация

11. [x] PASS — 12:00 — Sub-step 3a: verified `custom_lint 0.8.1` (latest) всё ещё требует `analyzer ^8.0.0` через pub.dev API → D вариант 1 невозможен → fallback на extended Approach A.
12. [x] PASS — 12:05 — Sub-step 3b/3c: applied `dependency_overrides: matcher: 0.12.17 + test: 1.26.2 + test_api: 0.7.6` к simplified_flutter/pubspec.yaml. `flutter pub get` PASS, "Got dependencies!".
13. [x] PASS — 12:08 — Verified admin (`flutter pub get` PASS) + server (`dart pub get` PASS). Им overrides не нужны (нет custom_lint).
14. [x] N/A — Approach C не выбран, build_runner integrity check не требуется.

### Шаг 4 — E2E verify (User mandatory acceptance criterion)

15. [x] done — 12:15 — `create-project --name t182` запущен без `--template simplified` (default t115). PubGet FAILED на t115 (он тоже affected, но out of scope). Создан t183 с `--template simplified` → PASS.
16. [x] PASS — 12:18 — t183 directory structure verified: t183_admin/, t183_flutter/lib/core/sync/, t183_flutter/lib/features/configuration/ — all exist.
17. [x] PASS errors=0 — 12:20 — `codegen verify --name t183 --human` → PASS: pubGet 3746ms + serverpodGenerate 12716ms + buildRunner 3540ms + flutterAnalyze 46355ms (errors=0, warnings=0, infos=30).
18. [x] N/A — verify PASSED на t183 (incremental после default t115 attempt). t182 (broken t115 attempt) остаётся на disk per sandbox policy.

### Шаг 5 — Документация + finalize

19. [x] done — 12:22 — `tsc -p ./` clean. `eslint src --ext ts` clean (0 errors, 18 pre-existing warnings).
20. [x] done — 12:25 — BUG-021 registered: `ai/bug-reports/021-pub-deps-drift-template-pubspec.md`.
21. [x] done — 12:28 — agent_memory.md обновлён: gotcha "Template pubspec pub deps drift" + caveat про override flutter SDK pins.
22. [ ] STOP — multi-agent review запускает teamlead перед commit. Adversarial focus: hidden regressions в widget runtime tests из-за override matcher/test_api.
23. [x] done — 12:30 — report.md написан с CLI evidence + diagnostic + approach + verify PASS.

## STOP-gates

- [x] **После Шага 1 (диагностика)** — escalated к teamlead с error chain + approach evaluation (Шаг 2 в Журнал, 11:42-11:50).
- [x] **Дизайн approach (Шаг 2)** — teamlead approve'нул Approach D вариант 1 → fallback Approach A первой волной (12:00); post-Adversarial rework к Approach E (caret bump) — second wave (2026-05-25).
- [x] **Перед verify (Шаг 4)** — diff показан teamlead'у перед t183 verify (extended A) + перед t184 verify (caret approach, post-rework).
- [x] **Если verify FAIL на t182** — t182 failed (wrong default template, not drift); t183 (extended A) PASS на second attempt; t184 (caret) PASS final.
- [x] **Перед commit (Шаг 5)** — multi-agent review pass #1 + #2 results показаны teamlead'у (Standard + Adversarial каждый pass). Commit pending только после applying pass #2 findings.

**Destructive ops:** ожидаемо нет, кроме:
- Изменение `G:/Templates/flutter/simplified/` (template вне репо) — blast radius на все будущие `create-project`. **STOP-gate в дизайне (Шаг 2).**
- Если затронут admin/server pubspec — расширение scope, STOP до подтверждения.

## План тестирования

### Diagnostic (обязательно — Шаг 1)

```bash
cd G:/Templates/flutter/simplified/simplified_flutter
flutter pub get 2>&1 | head -50         # capture error
flutter pub deps --tree 2>&1 | head -100  # transitive analysis
flutter pub deps --json | jq ...        # SDK constraint culprit
```

### Local verify (обязательно — Шаг 3)

```bash
cd G:/Templates/flutter/simplified/simplified_flutter && flutter pub get  # PASS
cd G:/Templates/flutter/simplified/simplified_admin && flutter pub get    # PASS (if touched)
cd G:/Templates/flutter/simplified/simplified_server && dart pub get      # PASS (if touched)
```

### E2E verify (обязательно — Шаг 4, User mandatory)

```bash
node out/adapters/cli/index.js create-project --name t182 --human
# verify полнота через ls (admin/core/features)
node out/adapters/cli/index.js verify --name t182 --human
# PASS, errors=0
```

### Regression (обязательно — Шаг 5)

```bash
npm run compile         # tsc clean
node node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"  # 181+ passing baseline
npm run lint            # clean
```

## Релевантный контекст

Файлы для прочтения перед началом:

- [TASK-025 task.md → Журнал](../TASK-025-bug-4---riverpod-ref-mounted-в-state-providers/task.md) — original эскалация, контекст пакета 5 задач
- [G:/Templates/flutter/simplified/simplified_flutter/pubspec.yaml](../../../../../Templates/flutter/simplified/simplified_flutter/pubspec.yaml) — primary edit target, **читать комментарии** к pins (analyzer ^7 lockstep design choice — TASK-024 Session E3d)
- [G:/Templates/flutter/simplified/simplified_admin/pubspec.yaml](../../../../../Templates/flutter/simplified/simplified_admin/pubspec.yaml) — потенциально same issue
- [CLAUDE.md → Definition of Done](../../../../CLAUDE.md) — verify acceptance gate
- [AGENTS.md → Subagent rules + Runtime testing](../../../../AGENTS.md)
- [ai/docs/agent_memory.md](../../../docs/agent_memory.md) — gotchas (особенно Windows env + nodejs path)
- [TASK-024 Session E3d report](../../done/TASK-024-b2-simplified-template-directory-bootstrap/report.md) — design rationale за analyzer ^7 lockstep
- [Discussion #11 stack-lock decision](../../../discussions/archive/11-initiative-phase-b-simplified-template-i/) — **версии update к latest stable OK; breaking version bumps требуют дополнительной оценки**

## Заметки по реализации

- **Минимальный disruptive путь:** Approach A (dependency_overrides) — попробовать первым. Это **локальная заплатка** без bump верхнего уровня.
- **Approach C (analyzer 8 bump) — last resort.** Это потенциально нарушает stack-lock spirit (хоть и formally allowed), требует regenerate всего generated кода в template, может ломать tooling. Если выбран — обязательно **multi-agent review с Adversarial focus** на hidden regressions.
- **SDK constraint culprit** может быть в редко обновляемой transitive dep'е. После identifying — посмотреть существует ли newer version того package с null-safety SDK constraint, либо нужен dependency_overrides.
- **chopper 8.4.0 pinned** (см. line 45 + 80 pubspec) — НЕ trogать (TASK-024 знание: 8.5 ломает build).
- **mockito ^5.4.5 pinned** (line 92) — НЕ trogать аналогично.
- **Node binary location:** `/g/SDKs/nodejs/node.exe` (диск H недоступен — agent_memory.md gotcha).
- **Flutter env:** при invocation `flutter` нужен PowerShell wrapper если Bash сессия не имеет `$PATH` к flutter — `pwsh -NoProfile -Command "..."` или прямой path `C:\src\flutter\bin\flutter.bat` (или где он у тебя установлен).

## Результаты

- 1-N modified `G:/Templates/flutter/simplified/*/pubspec.yaml` (+ возможно `pubspec.lock`)
- 1 new test project `t182/` (либо `t183/` если первый fail)
- 1 new bug report `ai/bug-reports/021-pub-deps-drift-template.md` (или next ID)
- 1 modified `ai/docs/agent_memory.md` (gotcha)
- `report.md` с diagnostic findings + chosen approach + verify PASS evidence + multi-agent review summary

## Журнал исполнения

*Только executor. Teamlead не редактирует.*

### 2026-05-23 — Executor session (Шаги 3-5)

**11:30** — Прочитаны task.md + simplified_flutter/pubspec.yaml + контекст от предыдущего executor (Шаги 1-2 done + teamlead approve'нул Approach D вариант 1 → fallback Approach A).

**11:55 — Sub-step 3a (verify custom_lint 0.8.1+ compat):**

```text
GET https://pub.dev/api/packages/custom_lint
→ latest: 0.8.1
→ dependencies.analyzer: ^8.0.0
→ published: 2025-09-09
```

**Result:** D вариант 1 невозможен. TASK-024 Session E3d комментарий ВСЁ ЕЩЁ актуален. Fallback → Approach A.

**12:00 — Sub-step 3b (apply Approach A) — first attempt:**

Применил pure `dependency_overrides: test: 1.26.2` → `flutter pub get` FAIL:

```text
Because test 1.26.2 depends on test_api 0.7.6 and every version of flutter_test
from sdk depends on test_api 0.7.10, test 1.26.2 is incompatible with
flutter_test from sdk.
```

**Diagnosis:** flutter SDK 3.41.9 (Dart 3.11.5) сейчас pin'ит `test_api 0.7.10`. В t179 baseline flutter был older и pin'ил `test_api 0.7.6`. Pure-A не работает.

**12:03 — Investigation: nearest workable test version**

Проверил pub.dev API для test 1.26-1.31:

- test 1.26.2: test_api 0.7.6, analyzer <8.0.0 ← incompatible test_api
- test 1.27.0/1.28.0: test_api 0.7.8, analyzer >=8 ← incompatible analyzer
- test 1.30.0: test_api 0.7.10 ✓, analyzer >=8 ← incompatible analyzer

**Нет single test version compatible с test_api 0.7.10 (flutter SDK pin) AND analyzer ^7 (custom_lint 0.8.0 requirement).**

**12:05 — Sub-step 3b: extended Approach A**

Применил multi-package override (overriding flutter SDK hint pins matcher + test_api):

```yaml
dependency_overrides:
  matcher: 0.12.17
  test: 1.26.2
  test_api: 0.7.6
```

`flutter pub get` PASS: "Got dependencies! 57 packages have newer versions incompatible with dependency constraints."

**12:08 — Verify admin + server:** PASS, им overrides не нужны.

**12:15 — Шаг 4 (E2E verify) — first attempt:**

Запустил `create-project --name t182 --human` без `--template simplified` → default t115 template (per CLI --help). PubGet FAIL на t115 (он тоже affected drift, но out of scope per task brief).

**12:18 — Шаг 4 — retry с --template simplified:**

`create-project --name t183 --template simplified --human` → PASS. t183 pubspec получил `dependency_overrides` блок. Все 3 directory checks PASS.

**12:20 — verify t183:**

```text
PASS: verify t183
  ✓ flutterAnalyze — 46355ms (errors=0, warnings=0, infos=30)
  ✓ pubGet — 3746ms
  ✓ serverpodGenerate — 12716ms
  ✓ buildRunner — 3540ms
Total: 66360ms
```

**12:22-12:30 — Шаг 5:** TypeScript compile clean, ESLint clean (0 errors, 18 pre-existing warnings). BUG-021 + agent_memory.md updated. report.md написан.

**12:32 — STOP-gate Шаг 5 пункт 22:** multi-agent review (Standard + Adversarial focus) запускает teamlead перед commit. Особый focus adversarial: override flutter SDK hint pins matcher/test_api theoretically может ломать widget runtime tests (НЕ покрыты verify chain'ом).

**Управление возвращено teamlead'у.**

---

### 2026-05-25 — Multi-agent review pass #1 + rework к caret approach

**Standard reviewer verdict:** NEEDS REWORK (на основании Finding #1: report.md = empty stub). Stale finding — teamlead created proper report.md до того как reviewer прочитал файл (timing collision). Остальные findings: status.md attribution misrepresented + agent_memory date not bumped + minor nits.

**Adversarial reviewer verdict:** APPROVE WITH HIGH FIXES — **3 CRITICAL findings:**

- **C1:** report.md ложно claim "admin/server не требуют overrides — custom_lint у них отсутствует" → факт: admin's pubspec:80 имеет `custom_lint: ^0.8.0`. Real reason admin works = caret.
- **C2:** **caret approach `^0.8.0` никогда не tested.** Admin's pubspec.lock эмпирически доказывает что caret resolves к analyzer 8.4.0 cascade БЕЗ regenerate. Executor's "Approach D вариант 1 невозможен" verdict conflated strict 0.8.1 pin (forced cascade) с caret-allowing 0.8.1 (solver decides). Admin proves caret works.
- **C3:** **rotted pubspec comments lines 75/85/88** claim "analyzer ^7 lockstep" для build_runner/json_serializable/freezed — admin's lockfile resolved freezed 3.2.3 + analyzer 8.4.0 working вместе → claims FALSE. Documentation rot которая misleads future debugging.

**Teamlead actions (2026-05-25):**

1. **Verify admin's lockfile** (5-min read):
   ```
   analyzer: 8.4.0
   build_runner: 2.15.0
   custom_lint: 0.8.1
   freezed: 3.2.3
   json_serializable: 6.11.2  (strict pin works с analyzer 8)
   matcher: 0.12.19
   test: 1.30.0
   test_api: 0.7.10
   web_socket_channel: 3.0.3
   ```
   **C2 + C3 empirically confirmed.**

2. **One-char experiment** в flutter pubspec.yaml:100 — `custom_lint: 0.8.0` → `^0.8.0`. Removed `dependency_overrides` блок. `flutter pub get` PASS. Resolved versions **identical с admin's lockfile**. Caret approach works.

3. **Updated pubspec.yaml** — caret bump + 3 rotted comments rewritten с empirical evidence (build_runner / json_serializable / freezed).

4. **Updated docs sync** — `agent_memory.md` (gotcha rewritten с diagnostic lesson + date bump к 2026-05-25), `BUG-021` (caret approach + corrected root cause + Adversarial lesson section), `report.md` (major rewrite — Approach E table, post-Adversarial revision, all findings status).

5. **Spawn'нул fresh executor** для E2E verify на свежем `t184` (mandatory User criterion) — выполняется в background.

**Шаг 4 status переоткрыт:** t183 verify PASS (extended A first-pass) — kept as reference. t184 — caret approach E2E verify ⏳ in progress.

**После t184 PASS → re-spawn 2 reviewers** для approval caret approach (extended A approach был rejected, caret needs fresh review).

**Diagnostic lesson сохранена:** в `agent_memory.md` (Template pubspec drift gotcha) — **compare sibling templates before diagnosing "cascade impossible"**. Также в BUG-021 dedicated section "Diagnostic lesson (multi-agent adversarial review caught error)".

**Multi-agent value evidence:** Standard reviewer alone бы approve'нул suboptimal extended A approach. Adversarial reviewer caught diagnostic error через sibling lockfile evidence. Это canonical case за обязательный Adversarial pass для template-level changes.
