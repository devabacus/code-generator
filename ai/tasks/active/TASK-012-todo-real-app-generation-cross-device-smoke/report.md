# Отчёт TASK-012 (partial close)

## Резюме

TASK-012 закрывается как **partial acceptance gate** на reduced scope (drop `assigneeId`, ≥1 FK + 1 junction вместо ≥2 FK) per [Discussion #3 Decision](../../discussions/archive/3-phase-15-scope-reconsideration-acceptanc/) (2026-05-03) + [Discussion #4 re-sequence](../../discussions/archive/4-pr-1-bug-013-blocks-reduced-scope-verify/).

**Phase 1.5 НЕ closed.** TASK-012 partial closure ≠ Phase 1.5 done. Weight TASK-018 stays blocked до:
- BUG-012 (parser `relation(parent=X)` directive parsing) closed
- Re-acceptance TASK с full FK alias scenario passing

**BUG-013 closed via PR #6** (sequence corrected per Discussion #4 — PR 2 first потому что reduced scope ≥1 FK не может PASS verify до BUG-013 fix).

## Verify evidence (final, после rebase + re-generate TodoItem)

```
PASS: verify todo
  project: G:\Projects\Flutter\serverpod\todo
  ✓ flutterAnalyze — 3680ms (errors=0, warnings=1, infos=67)
  ✓ pubGet — 5141ms
  ✓ serverpodGenerate — 9466ms
  ✓ buildRunner — 17715ms
Total: 36003ms
```

**Counts:** errors=0, warnings=1 (unrelated unused local в developer_tools_page.dart), infos=67. **success: true.**

⚠ **BUG-012 не exercised этим acceptance.** Reduced scope не покрывает FK alias scenario (`fieldId` ≠ `parentName+Id`). Production landmine confirmed в weight `customer_user.spy.yaml defaultTerminalSetId, parent=terminal_set` — сломает migration без BUG-012 fix.

## Reduced scope evidence

**4 entities в `todo` target:**
- `Project` (simple entity)
- `Member` (FK на user через `userId: int`)
- `ProjectMember` (junction без `Map` суффикса — TASK-013/014 regression check ✅)
- `TodoItem` (1 FK `projectId, parent=project` — field=parent matching, **НЕ FK alias**)

**Парные `*_sync_event.spy.yaml`** для каждой ✅.

## Sequence iteration history

1. Executor #1 (шаги 1-4): baseline checks (compile clean, 119 tests).
2. Executor #2 (first attempt): stale `todo/` dir → User удалил.
3. Executor #3 (second attempt): create-project + 4 entities + generate-entity × 4 → verify FAIL (BUG-011 hardcoded `t.title`).
4. Teamlead BUG-011 template fix (`t.title` → `t.lastModified`).
5. Executor #4 (re-generate ProjectMember + verify): errors=3 → drop assigneeId workaround → errors=1 (BUG-013 на `projectId`).
6. **Discussion #3** (4 agents): Q1=c hybrid, Q2=a drop assigneeId.
7. **Discussion #4** (3 agents): Decision contradiction → re-sequence PR 2 → PR 1.
8. **PR #6 (chore/bug-013-template-markers-fill, merged):** BUG-013 Approach A в 4 layers + 3 regression tests + multi-agent code review.
9. **PR 1 (this — TASK-012 closure):** rebase from master + re-generate TodoItem + re-verify → **PASS errors=0**.

## Regression checks (всё PASS)

- ✅ Junction routing (TASK-013/014): ProjectMember в `features/project/data/adapters/project_member/`, БЕЗ `Map` суффикса
- ✅ BUG-008 (database.dart scan): SyncQueueTable + Configuration + 4 entity tables
- ✅ BUG-009 (orchestrator imports): все на `features/project/`, `features/todo/`
- ✅ BUG-013 fix propagation: `todo_item_repository_impl.dart:189-200` имеет marker block + concrete impl `getTodoItemsByProjectId`
- ✅ Junction FK docstring: `junction FK→project+member`

## Изменения

**Modified (codegen):** CLAUDE.md, agent_memory.md, roadmap.md, status.md, TASK-012 task.md.

**Created (codegen):** bug-reports 011/012/013, discussions #3/#4 archives + prompts.

**Modified (target todo, вне репо):** todo_item.spy.yaml (dropped assigneeId), 24 generated файлов re-generated.

**Modified (template t115 repo, отдельный `devabacus/t115`):** committed + pushed:
- `6c5d96f` BUG-011 fix endpoint hardcoded `t.title`
- `148ddf1` BUG-013 fix markers fill в 4 layers (Approach A)

## Тесты

- `npm test`: **122 passing 0 failing** (119 baseline + 3 new BUG-013 regression tests in PR #6)
- `npm run compile`: clean
- `codegen verify --name todo`: PASS errors=0

## Manual cross-device smoke инструкция для User

⚠ **На reduced scope** (без FK alias coverage). Для full smoke нужна re-acceptance TASK после BUG-012 closed.

1. **Build todo_flutter:** `flutter pub get` + `flutter build windows --release` + `flutter build apk --release`
2. **Запустить Serverpod backend:** `cd todo_server && docker compose up -d && dart bin/main.dart --apply-migrations` + `curl http://localhost:8080/` HTTP 200
3. **CRUD cross-device:** Project (Windows) → sync to Android → Member (Android) → sync back → ProjectMember junction → sync → TodoItem с FK → sync. Update/delete bidirectional.
4. **Ожидание:** все CRUD propagate через Serverpod sync_core 0.3.0 в течение секунд.

## Discussion + Multi-agent review

- **Discussion #3** (4 agents): Q1=c hybrid scope, Q2=a drop assigneeId
- **Discussion #4** (3 agents): re-sequence enforcement, 5-min audit gate + 90-min ceiling, Gemini_1 critical placement requirements
- **PR #6 multi-agent code review:**
  - Standard ✅ MERGE
  - Adversarial caught **deal-breaker** template uncommitted state (resolved через t115 commits) + flagged pre-existing parameter shadowing landmine для `userId` business FK (backlog как potential BUG-014)

## Риски / Заметки

- **HOTFIX-001:** `new_task.py` сканирует только `active/` → ID collision risk при создании BUG-012 + re-acceptance TASKs
- **BUG-012 production landmine** weight CustomerUser
- **Potential BUG-014** parameter shadowing для `userId` business FK (out of scope PR 1)

## Статус

Ready for review (PR 1 — TASK-012 partial close).

**Next per Discussion #4:**
- PR 3 — BUG-012 parser fix (feature branch, ~1-2 days, multi-agent code review)
- PR 4 — Re-acceptance new TASK (после PR 3 merged): full FK alias scenario. **После PR 4 → weight TASK-018 unblocked.**
