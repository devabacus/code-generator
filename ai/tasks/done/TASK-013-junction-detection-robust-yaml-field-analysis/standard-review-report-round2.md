# TASK-013 Standard Review Report Round 2

**Reviewer:** standard re-review (round 2 — verify cleanup blockers fixed)
**Date:** 2026-05-02
**Verdict:** **APPROVE WITH NITS** (clear для merge как detection-side closure)

Round 1 verdict был CHANGES REQUESTED + 3 process blockers. Cleanup commit `0e9a0c3` заполнил task.md / report.md / roadmap.md / BUG-010, статус TASK-013 переключён на 🟡 In Progress в status.md (legitimately). 5 из 5 verification points passed; 110 tests green reproducible. 2 minor NITs noted (stale TASK-011 entry в Active table + plan-of-work subsection unchecked) — recommend cleanup, не block.

---

## Round 1 → Round 2 transitions table

| Round 1 finding | Round 2 status | Evidence |
|---|---|---|
| Blocker #1 task.md acceptance checkboxes 0/24 | ✅ fixed | `task.md` Must-have lines 63-100 — 12× `[x]` (всё detection-side done items: Q1=C / Q2=A / Q3=A / 4 call-sites / 6 structural / negative / 4 boundary / dynamic regression / re-audit / audit doc / roadmap / sync-core-integration / report.md / 110 tests). Deferred section lines 104-111 — 4× `[~]` с reference на TASK-014 / BUG-010 (E2E generate-entity / verify --name / docstring hardcoded / code_formatter). Zero unchecked `[ ]` в Must-have для done items. |
| Blocker #2 report.md pristine template | ✅ fixed | `report.md` 106 строк, реально filled. Sections present: Резюме (8 lines), Phase tracking table (5 phases), Изменения (new/modified production + tests + docs), Тесты (22 added, 110 total, mocha workaround documented), DoD verify (Configuration baseline PASS / E2E deferred), Pre-existing limitations (BUG-010 + docstring hardcoded + BUG-007 + fixture fragility), Architectural concerns (5 risks), Status (Ready for review). Zero "Заполняется..." / "Что было реализовано." / "(количество или список)" placeholder strings. |
| Blocker #3 status.md duplicate TASK-011 typo | ⚠ partial — different defect now | `status.md:60` теперь содержит правильный `TASK-013 \| junction detection robust YAML field analysis \| 🟡 In Progress \| 2026-05-02`. Строка 59 с TASK-011 — НЕ duplicate (содержимое legitimate "sync_core 0.3.0 templates integration" entry для TASK-011), но stale: TASK-011 уже **merged via PR #2 commit `cc590e8`** и должна быть в "Недавно завершено" section, не в Active. Round 1 blocker (duplicate ID typo) технически closed (TASK-013 entry добавлена), но stale TASK-011 row остался в Active. Минор cleanup, не блокер для round 2 — это **не часть TASK-013 scope** (это часть TASK-011 closure hygiene). |
| roadmap.md hard gate updated | ✅ fixed | `roadmap.md` lines 40-77 содержат явную "Hard gate: TASK-013 junction detection — Detection-side resolved, file paths blocked by TASK-014 (2026-05-02)" section. Status: ⚠ Partial closure (Variant B split). Detection-side ✅ closed via TASK-013. Production migration weight TASK-018 BLOCKED by TASK-014 (line 44, 70-71, 77). TASK-014 mentioned (line 44, 64, 76, 77). BUG-010 mentioned (line 66). "Двойной gate (TASK-X2 + TASK-014)" wording: line 77 — "weight TASK-018 unblocked **только после двойного gate (TASK-X2 + TASK-014 closed)**". Premature "Resolved via TASK-013" claim **отсутствует**. |
| BUG-010 placeholder valid | ✅ fixed | `ai/bug-reports/010-code-formatter-field-name-includes-map-silent-data-loss.md` exists (53 lines). Содержит: симптом + код snippet (line 8-15) + affected field name patterns (lines 19-23: mapData/bitmapJson/mapboxToken/coordinatesMap) + root cause (lines 27) + scope distinction от TASK-013 (lines 31-33) + reproduction steps (lines 37-39) + fix options (lines 43-46). Не 1-line stub. |
| Issue #1 (file paths под task_tag_map/) → TASK-014 split | ✅ accepted | per User decision 2026-05-02 Variant B. Documented в task.md line 30, report.md lines 11-14, roadmap.md lines 64-65. |
| Bomb #3 (code_formatter) → BUG-010 | ✅ deferred | per User decision 2026-05-02 Variant B. BUG-010 placeholder создан (см. выше). |

---

## Bonus checks

### `npm test` mocha workaround

Reproducible: `node node_modules/mocha/bin/mocha.js --ui tdd --reporter spec --timeout 20000 --recursive out/test/parsers out/test/generators out/test/replacement out/test/services out/test/verify out/test/mocks` →

```
110 passing (39ms)
```

Точное соответствие claim в report.md (88 baseline + 22 new). Mocha direct workaround documented в report.md lines 59-66. ✅

### task.md "План работы" subsection (lines 213-246)

Phase 1-5 plan-of-work sub-checkboxes (15 items, lines 216-246) **all `[ ]` unchecked**. Это NIT (not Must-have) — реальный workflow tracking happens в Must-have section + Phase tracking table в report.md. Recommend mark всё как `[x]` либо удалить subsection (она избыточна с Must-have).

---

## Findings (новые, минорные)

### Finding R2-#1 (NIT, не блокер): stale TASK-011 entry в Active section status.md

`status.md:59` содержит `| TASK-011 | sync_core 0.3.0 templates integration | 🟡 In Progress | 2026-05-02 |`.

TASK-011 **уже merged** в master (commit `cc590e8` — `TASK 011 sync core 0 3 0 templates integration (#2)`, merged 2026-05-02). Должна быть в "Недавно завершено" section, не в Active.

Это **не часть TASK-013 scope** — это housekeeping hygiene для TASK-011 closure. Round 1 reviewer flagged "duplicate TASK-011 typo" на 59 строке как duplicate of intended TASK-013 — после cleanup commit добавилась корректная строка 60 для TASK-013, но stale TASK-011 entry на 59 остался. Recommend remove либо move в "Недавно завершено" в **отдельном** cleanup PR (либо в TASK-014 spec opening).

### Finding R2-#2 (NIT, не блокер): "План работы" subsection checkboxes unchecked

`task.md` lines 216-246 — Phase 1-5 plan-of-work sub-checkboxes all `[ ]`. Реальный tracking в:
- Must-have section (lines 63-100) — все checked `[x]` ✅
- Phase tracking table в `report.md` (5 rows, status=done/partial)

Sub-section избыточна. Recommend либо mark как `[x]` после fact либо удалить (consistency с другими `done` task'ами).

---

## Final verdict

**APPROVE WITH NITS — ready for merge как detection-side TASK-013 closure.**

Round 1 3 blockers все cleanup'ом `0e9a0c3` resolved (1 partial — но не TASK-013 scope, см. R2-#1). Acceptance reformulation (12 done + 4 deferred с TASK-014/BUG-010 references) корректна и matches User Variant B decision. report.md содержит full DoD evidence + architectural risks. roadmap.md hard gate language корректно отражает "detection-side closed, production migration BLOCKED by TASK-014" — premature unblock запрещён explicitly.

**Detection logic в lib/ ✅** ready for production (round 1 confirmation, deep code review не повторяю). 110 tests green reproducible. Cross-repo блокировка weight TASK-018 правильно gated — agents в weight repo прочитают roadmap.md и не начнут prep work до TASK-014 closure.

**Recommendations (не блокеры для merge):**
1. **TASK-014 spec creation** должна follow merge TASK-013. Spec должна reference: (a) `replacement_util.ts MANY_TO_MANY` two-entity rename для file paths/filenames, (b) `_getDestinationPath` (`generation_service.ts:213-221`) для two-entity scope, (c) docstring hardcoded `task+tag` literals в `_JUNCTION_REGISTER_TEMPLATE` (orchestrator_patcher.ts:386,389) — все три bundle'я в TASK-014.
2. **status.md cleanup** (R2-#1): убрать stale TASK-011 entry либо переместить в "Недавно завершено". В отдельном PR или с TASK-014 spec opening.
3. **task.md План работы subsection** (R2-#2): mark `[x]` либо drop — consistency с другими closed tasks.
4. **BUG-010 follow-up** — определить priority + assign в backlog после TASK-014 closure (silent data loss landmine, должен закрыться до weight TASK-018).

**Adversarial round 1 verdict ("DO NOT SHIP AS-IS")** обработан через User Variant B split decision: scope честно re-narrowed до detection-side, file path issues moved в TASK-014, code_formatter в BUG-010. Acceptance больше не "fabricated" — explicitly deferred с references. Trust в audit trail восстановлен.

**Готов к merge.**
