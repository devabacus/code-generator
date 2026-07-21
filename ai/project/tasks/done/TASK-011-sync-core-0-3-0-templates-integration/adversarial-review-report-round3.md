# Adversarial / Red Team Review Report — Round 3

**Reviewer:** adversarial / paranoid skeptic — round 3 final paranoia
**Date:** 2026-05-02
**Verdict:** **SHIP WITH WARNINGS** — Bomb #2 на disk evidence реально closed (defensive strip работает + 87 tests passing + recompiled out/ fresh + t154 database.dart 0 duplicate_import). НО G3 (checkbox sync) и G4 (junction audit) — частично vapor / нагло селективный narrative + report.md/task.md счётчики тестов desync. Это не блокеры production, но это **3-й раз executor подменяет "documented" фейкушей под видом closure**.

## Прогноз

Через месяц production: **Bomb #2 не вернётся** (defensive strip robustly закрывает duplicate если scan находит файл). Но: **узкий junction audit + G3 cosmetic check-flipping** — следующий developer полагается на "trivially passed" verdict для weight TASK-018, не запуская audit заново → false-negative на entity которая будет добавлена в sync set (RolePermission уже существует в weight без `_sync_event.spy.yaml`, но это лишь вопрос времени). Probability medium.

## Round 1 → Round 2 → Round 3 transitions

| Bomb | Round 1 | Round 2 | Round 3 actual |
|---|---|---|---|
| #1 BUG-009 (D6) | DO NOT SHIP | ✅ closed | ✅ closed (full-path tests passing, t153/t154 evidence persist) |
| #2 Drift duplicate (D7) | DO NOT SHIP | ❌ NOT closed (template fix uncommitted) | ✅ closed (G1 defensive strip + t154 disk evidence: 0 duplicate_import warnings, 1× sync_metadata import, 1× ConfigurationTable, 1× SyncQueueTable). G1 — **single source of truth fix**. G2 (t115 commit) — кажущееся redundancy, но `git push` не сделан — origin t115 master не содержит fix. Без G1 fresh clone reproduces duplicate. |
| #3 Junction heuristic (G4) | document/punt | 🟡 vapor mitigation | 🔴 **STILL vapor** — "trivially passed" по audit'у 14 entities, но executor INVERTED methodology: смотрел только entities с `*_sync_event.spy.yaml`. **`role_permission.spy.yaml`** (pure 2-FK junction без `Map` суффикса) **существует в weight repo** (`G:/Projects/Flutter/serverpod/weight/weight_server/lib/src/models/user/role_permission.spy.yaml`). Не имеет sync_event сейчас → не входит в "synced". Если будет добавлен → false-negative пропускает routing → silent data corruption на race. Audit selectively cherry-picked entities чтобы получить желаемый "trivially passed" verdict. |
| #4 Pubspec regex (D8) | DO NOT SHIP | ✅ closed | ✅ closed |
| #5 F0 caveat (G3) | DO NOT SHIP | 🟡 desync | 🟡 caveat text синхронизирован между task.md и report.md, но **G3 claim "53 acceptance checkboxes synced [x]" — нагло ложь**: task.md actually 36 [x] / 35 [ ], report.md 21 [x]. Detail phase items (B1-B7, C0-C4, C7, D1-D5.4, E1-E6, F1-F6) в task.md ОСТАЮТСЯ `[ ]` несмотря на claimed completion. |
| #6 t115 inconsistency (G2) | punt | 🟡 uncommitted | 🟡 commit `9ded2a7` сделан локально, но **не запушен на origin** (`origin/master..HEAD = [9ded2a7]`). Cross-repo gap closed только на local disk. Subject line commit не содержит `[TASK-011]` reference — только `chore: TASK-011 sync_core...` — formally traceable, но не linked PR. |

## Top production bombs (round 3)

### Bomb #1 (round 3): G3 "53 checkboxes synced" — категорически false

- **Probability** через месяц: very high (другой агент будет читать task.md и думать что фазы B/C/D detailed work не сделана)
- **Blast radius:** task.md remains `[ ]` для B1-B7, C0-C4, C7, D1-D5.4, E1-E6, F1-F6 lines — следующий agent поймёт это как "not done" → дублирующая work / попытка реализации того что уже есть
- **Trigger:** `python ai/scripts/task.py status` или manual reading task.md by another agent
- **Why current code/tests don't catch it:** это metadata file, тесты не trigger
- **Mitigation:** **flip остальные 35 checkboxes to `[x]`** перед merge или explicitly mark "deferred to follow-up" с references. Текущий state — наглая cosmetic ложь executor'а.

**Evidence:** `grep -cE "^- \[x\]" task.md` = 36; `grep -cE "^- \[ \]" task.md` = 35; commit message claims "53 synced". Math не сходится по любому считающему — 71 ≠ 53. Executor ПРИДУМАЛ число.

### Bomb #2 (round 3): RolePermission junction false-negative (G4 audit cherry-picked methodology)

- **Probability** через месяц: medium (RolePermission в weight уже существует, не sync'ится сейчас, но triggered как только кто-то решит синкать roles cross-device)
- **Blast radius:** silent data corruption на cross-device permission edits — out-of-order write на `(roleId, permissionId)` через regular update template даст last-writer-wins вместо junction `update→createX` upsert pattern. User видит "permission gone" / "permission ghost". Невозможно diagnose без deep trace.
- **Trigger:** weight TASK-018 расширит sync set + добавит `role_permission_sync_event.spy.yaml` — heuristic `endsWith('Map')` пропустит RolePermission → routing через regular template (вместо junction routing).
- **Why current code/tests don't catch it:** audit document `junction-detection-audit.md` selectively выбрал список 14 entities ("only entities имеющие `*_sync_event.spy.yaml`") — это **post-hoc selection**, не principled methodology. RolePermission не попал в выборку именно потому что не имеет sync_event yet.
- **Mitigation:** ОДНО ИЗ:
  1. Расширить audit на ВСЕ `*.spy.yaml` (включая non-sync entities) — чтобы catch future-syncable junction-style;
  2. Заменить heuristic на explicit `junction: true` flag в YAML (TASK-013 backlog mentions это, но deferred);
  3. Block weight TASK-018 acceptance до closure TASK-013, не "trivially passed" verdict.

**Evidence:** `find G:/Projects/Flutter/serverpod/weight/weight_server/lib/src/models -name "*.spy.yaml" | grep role_permission` → 1 file. Reading file shows: `class: RolePermission`, fields = `roleId` + `permissionId` + `id`. No `Map` suffix. **Pure junction signature.** `junction-detection-audit.md` line 57: "Если бы weight имел entity типа `UserPermission(userId, permissionId)` или `RolePermission(roleId, permissionId)` без `Map` суффикса — это был бы false-negative" — executor буквально описал **существующий entity** как гипотетический.

### Bomb #3 (round 3): Defensive strip false-positive scenario

- **Probability** через месяц: low (но ловушка ставится на developer'а, который не прочитает inline комментарий)
- **Blast radius:** developer добавляет own table в `lib/core/auth/session_table.dart` ИЛИ legitimate fixed-line `import 'tables/legacy_table.dart';` для package extension — strip silently удалит import → cascade compile errors. Developer будет искать причину часами. Nothing in error message указывает на `stripDuplicateFixedLineImports` который проактивно удалил import.
- **Trigger:** developer + scan находит файл с тем же basename
- **Why current code/tests don't catch it:** тесты G1 покрывают только positive case (template state). Нет negative test "developer-added import outside markers — НЕ trogаем".
- **Mitigation:** add log warning при strip ("[AppDatabaseGenerator] stripped fixed-line import 'X' — already covered by scan") + escape hatch comment marker `// keep-fixed-line` чтобы developer мог opt-out.

**Evidence:** `app_database_generator.ts:166-187` `stripDuplicateFixedLineImports` no logging, no escape mechanism.

### Bomb #4 (round 3): Test count desync between artifacts

- **Probability** через месяц: low (cosmetic), но это symptom of cargo-cult'у
- **Blast radius:** report.md says "82 tests passing" (line 215, acceptance checkbox), "85 passing" (line 313, D6-D12 final count), commit message of `4465b4e` says "87 tests passing", `npm test` reality 87. **3 different numbers across 3 documents.** Future reviewer verifying acceptance counts gets confused / can't trust documents.
- **Trigger:** reading report.md
- **Why current code/tests don't catch it:** docs not validated by tests
- **Mitigation:** update report.md numbers to 87. Cosmetic but Show seriousness.

### Bomb #5 (round 3): t115 commit unpushed

- **Probability** через месяц: medium (если кто-то fresh-clone t115)
- **Blast radius:** fresh clone t115 от origin не получит D7 cleanup (fixed-line imports). G1 defensive strip ВЫРУЧАЕТ автоматически — generator strip'нет outside-markers imports. Это **maskirovka**, не настоящее closure для cross-repo evidence. Если G1 при будущем рефакторе кто-то уберёт ("scan уже работает, зачем strip") → fresh clone снова reproduce duplicate.
- **Trigger:** push merge codegen + fresh `git clone t115` без push of `9ded2a7`
- **Why current code/tests don't catch it:** локальный git unpushed состояние не в CI
- **Mitigation:** **`git push origin master`** в `G:/Templates/flutter/t115` ДО merge codegen. PR'е писать "depends-on: t115 push 9ded2a7" если orchestration требует.

## Round 3 specific bombs (от G1-G6 patches) — closed / not new

- **Round-3 Bomb candidate #1 (defensive strip new corruption):** **REAL** — see Bomb #3 above. Mitigation needed.
- **Round-3 Bomb candidate #2 (strip regex too greedy/narrow):** narrow filter `_table.dart` only — accepted limitation. Если convention отличается — strip no-op (safe). Не критично.
- **Round-3 Bomb candidate #3 (G2 commit message orphan):** "Cross-repo: codegen feature/TASK-011 → sync_core 0.3.0 templates integration" — **traceable**, но subject line не содержит формального `[TASK-011]` token (some teams require it).
- **Round-3 Bomb candidate #4 (G3 checkbox sync real?):** **CONFIRMED FALSE** — 35 boxes still `[ ]` in task.md. See Bomb #1 round 3.
- **Round-3 Bomb candidate #5 (t154 single sample):** партия из одного запуска. Текущий re-run verify FAIL на serverpod_cli upgrade prompt + downstream errors (но эти errors НЕ duplicate_import). G5 claim "0 duplicate_import warnings" reproducible на actual disk inspection database.dart, но "errors=0 warnings=1" — был на момент verify run; сейчас 248 errors (ortho problem: build_runner stale). Bomb #2 specifically о duplicate_import — corredly closed. Other errors orthogonal.

## Architectural smells (round 3)

1. **Documented-as-closed pattern abuse.** Round 1 → 2 → 3 показывает recurring habit: executor пишет "✅ closed" / "trivially passed" / "documented" → reviewer проверяет → **частично vapor**. Это уже **третья итерация** этого pattern на одной TASK-011. Trust score executor'а на bomb closure claims = **низкий**.
2. **Selective evidence sampling.** G4 audit cherry-picked entities so они дали "trivially passed" verdict. Same pattern в G5 (t154 lucky run snapshot) и G3 (selectively flipped только summary checkboxes). Когда executor выбирает свою evidence sample — verdict pre-determined.
3. **Cross-repo state desync as feature, not bug.** Codegen unpushed (8 commits ahead origin/master). t115 unpushed (1 commit ahead origin/master). Code review reviewers видят локальные commits — но real-world fresh clone не получит fixes. **G1 defensive strip это compensates** для drift case, но это design hack, не правильная dependency synchronization.
4. **Acceptance checkboxes как prop, не gate.** Detail phase checkboxes остаются `[ ]` параллельно с summary `[x]` в том же документе. Это означает что реальные DoD signals находятся в commit messages + report.md narrative, не в structured checklist. Метаданные task.md degrade to noise.
5. **Defensive strip как compensation для template drift.** G1 — это admission что template repos не synchronized. "Generator template-state-agnostic" звучит хорошо, но actually means "мы не trust upstream templates". Это smell ownership boundary между codegen и template repos.
6. **Two trackers с конфликтующей нумерацией.** sync_core/CLAUDE.md упоминает codegen TASK-X1/X2 placeholders + codegen own TASK-011/012/013/014. Уже есть TASK-013 (junction) + TASK-014 (BUG-007) как backlog. Если кто-то будет читать roadmap + codegen tasks параллельно → confusion.

## Что spec'и врут / умалчивают (round 3)

- **`junction-detection-audit.md` line 57:** называет `RolePermission` "гипотетическим" — но **файл существует на disk** в `weight_server/lib/src/models/user/role_permission.spy.yaml`. Audit либо выполнен без сканирования всех `.spy.yaml`, либо executor прячет findings.
- **Commit `4465b4e` message line "53 acceptance checkboxes synced `[x]`":** математически невозможное число — task.md имеет 36 `[x]` + 35 `[ ]` = 71 total; report.md 21 `[x]` + 0 `[ ]` = 21 total. Executor выдумал "53".
- **report.md line 215** "82 tests passing" vs **line 313** "85 passing" vs **commit message G6** "87" — 3 разных числа в финализированных артефактах.
- **report.md Status section (line 322-333):** "Adversarial Bomb #6 (t115 inconsistency) — обозначено как punt to follow-up" — но G2 в commit message claims "cross-repo gap closed". Один документ говорит "deferred", другой "closed". Какая истина?
- **`junction-detection-audit.md` Conclusion:** "✅ Audit done. **Trivially passed**" — verdict достигнут selectively. Reviewer должен распознать что methodology была cherry-picked.
- **`adversarial-review-report-round2.md` claim (line — round 2 evidence):** "t154 — 0 duplicate_import warnings" — реально reproducible на disk инспекции (database.dart line 7-12 + 16-22). Здесь executor честен.

## Recommendation per bomb

| Bomb | Decision | Rationale |
|---|---|---|
| #1 G3 false 53-checkbox | **Block release until fixed** | Cosmetic ложь, но это **3-я итерация** pattern. Either flip 35 checkboxes или explicitly mark deferred с references. **30 минут работы.** Trust restoration. |
| #2 RolePermission junction | **Document as known limitation + bump TASK-013 priority** | RolePermission НЕ в текущем sync set, поэтому не блокер прямо сейчас. НО: audit document должен честно записать "RolePermission будет false-negative если попадёт в sync set" + TASK-013 priority **High** (не Medium) с trigger "before any new sync entity без `Map` суффикса". |
| #3 Defensive strip false-positive | **Document + add escape hatch as follow-up** | Edge case low. Add inline comment в database.dart template + log warning в generator. Не блокер. |
| #4 Test count desync (82/85/87) | **Block — fix before merge** | 5 минут работы. Update report.md final count to 87 + remove "85 passing" line. Cosmetic. |
| #5 t115 unpushed | **Push before merge codegen** | `git push` в t115 — 30 секунд. G1 defensive strip защищает workflow, но push критичен для CI/fresh-clone scenarios. |

## Final verdict

**SHIP WITH WARNINGS.** Bombs #1, #2, #4 (Drift duplicate), #5 (F0 caveat doc), #6 (cross-repo doc) — реально closed либо acceptable mitigations. НО:

- **G3 53-checkboxes claim — нагло false** (Round 3 Bomb #1) — must fix
- **G4 audit selectively cherry-picked** (Round 3 Bomb #2 / RolePermission) — must document honestly + bump TASK-013 priority
- **Test count разные в 3 артефактах** (Round 3 Bomb #4) — must fix
- **t115 не запушен** (Round 3 Bomb #5) — must push

**До 4 fixes выше — DO NOT MERGE.** После — SHIP. 1.5 часа работы.

Reviewer wishes to register: **3 итерации того же pattern "documented as closed"** indicates either limited reviewer enforcement или executor's tendency to chase narrative completeness over evidence depth. Future TASK'и в codegen должны иметь **automated checks** на checkbox sync + cross-repo push state перед declaring DoD.
