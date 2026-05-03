# TASK-017: DAO substitution rewrite — preserve field name в method/parameter/column references

**Phase:** 1.5 final blocker — после TASK-016 closure (Path C split per Discussion #5 STOP-gate #2)
**Blocking:** weight TASK-018 production migration (CustomerUser `defaultTerminalSetId, parent=terminal_set` → broken DAO column reference compile error)
**Origin:** [TASK-016 Path C split](../../done/TASK-016-fix-bug-012-server-yaml-parser-relation-parent-directive/) — Phase 5 verify revealed что parser fix недостаточен; `relation_patcher.ts` substitution semantics shift required separate scope
**Pre-implementation review:** [Discussion #6 Decision](../../discussions/archive/6-task-017-dao-substitution-rewrite-pre-im/) — 3-agent consensus (Chatgpt_1 + Claude_1 + teamlead_claude_4) approved 2026-05-03

## Ветка

`feature/TASK-017-dao-substitution-rewrite-preserve-field-name-in-method-body`

## Цель

Rewrite `relation_patcher.ts:71-94` substitution sequence через **order swap** (Approach A): move field-Id preservation (Step 3) ABOVE related entity ENTITY rules (Step 2). После fix:

- Method names: `getInvoicesByAssigneeId` (field name preserved)
- Parameters: `String assigneeId` (field name preserved)
- Column references: `t.assigneeId.equals(assigneeId)` (field name preserved)
- Table references: `references(TeamMemberTable, ...)` (parent-derived for FK foreign table)
- Table imports: `team_member_table.dart` (parent-derived snake_case)

После TASK-017 — re-acceptance new TASK с full FK alias scenario → если PASS errors=0 → **weight TASK-018 unblocked**.

## Не-цели

- НЕ менять template t115 (отдельный repo)
- НЕ исправлять nested parens edge case `relation(check=(...), parent=bar)` (out of scope — silent corruption rare, backlog)
- НЕ исправлять PascalCase parent value silent fallback (out of scope, backlog)
- НЕ исправлять BUG-010 (`code_formatter.ts:81 includes('Map')`) — pre-existing, отдельная TASK
- НЕ автоматизировать cross-device runtime smoke
- НЕ менять `server_yaml_parser.ts` (closed TASK-016)
- НЕ менять `replacement_util.ts` dictionary semantics (broader blast radius — STOP-gate)

## Scope

Разрешено:

- `src/features/generation/generators/relation_patcher.ts:71-94` — substitution sequence reorder (Approach A)
- Add `cap` import из `src/utils/text_work/text_util.ts` (existing helper, NO second helper)
- Existing test suites — extension для FK alias method body coverage:
  - `src/test/generators/relation_patcher.test.ts` — 5 mandatory test groups (per Discussion #6)
  - `src/test/generators/relation_generation.test.ts` — extend если path/class normalization affected (likely no-op)
- Update bug-report 012: Partially Resolved → Resolved
- Multi-agent code review **до commit'а** (Standard + Adversarial fresh subagents с explicit focus checklist)

Запрещено:

- Менять template t115 — separate concern Discussion #4
- Менять `server_yaml_parser.ts` — closed TASK-016
- Менять `replacement_util.ts` dictionary semantics — broader blast radius, STOP-gate
- Workaround'ы вместо корректного substitution
- Backwards-incompatible breaking changes без Discussion #7
- Использовать Dart MCP — TypeScript проект
- Создавать second `capitalize`/`cap` helper — reuse existing

## Критерии приёмки (12 items per Discussion #6 Decision)

1. [ ] `relation_patcher.ts` substitution sequence reordered: Step 1 (mainEntity) → Step 2 NEW (field-Id preservation lowerCamel + Pascal) → Step 3 (relatedEntity rules)
2. [ ] PascalCase variant explicit: `${cap(templateRelatedEntity)}Id` → `targetIdNamePascal` substitution added
3. [ ] Use existing `cap` from `text_util.ts` (verify import added) — NO second helper
4. [ ] Backwards compat identity case (`categoryId, parent=category`) — output identical to current behavior (positive + negative assertions)
5. [ ] **5 mandatory test groups** в `relation_patcher.test.ts`:
   - Group 1: simple FK alias (`assigneeId, parent=member`) — method/param/column = `assigneeId`, table/class = `member`/`MemberTable`
   - Group 2: snake production-shaped (`defaultTerminalSetId, parent=terminal_set`) — method `ByDefaultTerminalSetId`, param/column `defaultTerminalSetId`, class `TerminalSet*`, snake_case path
   - Group 3: multiple FK aliases (Receipt-style 2-3 fields) — verify processedBodies preservation, all methods present
   - Group 4: backwards compat identity (`categoryId, parent=category`) — exact output preservation + negative `!teamMemberId` etc.
   - Group 5: all marker-layer body contexts smoke на **7 layers** (verified per Discussion #6)
6. [ ] **Mandatory positive + negative assertions** в каждом test group (PR #8 paranoid pattern)
7. [ ] `npm test` PASS — 158 baseline + new TASK-017 tests, target 168+
8. [ ] `npm run compile` clean
9. [ ] Local verify run на свежем `t<N+1>` с production-shaped FK alias entity:
   - `<entity>_dao.dart` имеет `t.assigneeId.equals(assigneeId)` (column ref preserved)
   - `<entity>_repository_impl.dart` имеет `getInvoicesByAssigneeId(String assigneeId)` (field alias preserved)
   - `<entity>_table.dart` import = `team_member_table.dart` + refs `TeamMemberTable` (parent-derived)
   - `verify --name t<N+1>` PASS errors=0
10. [ ] BUG-012 status update: Partially Resolved → **Resolved** с evidence cited
11. [ ] Multi-agent code review до commit'а (Standard + Adversarial **fresh subagents** с **explicit focus checklist**)
12. [ ] report.md заполнен с Path B (full fix) reasoning + 7-layer evidence + multi-agent review summary

## STOP-gates (8 items, Discussion #6 Decision)

1. **Backwards compat regression:** order swap ломает existing 158 baseline tests на field=parent matching entities → STOP, root cause analysis
2. **Hidden coupling:** test fixtures need >5 файлов update → STOP, scope expansion review
3. **Phase work crosses 90 min** без clear resolution → re-evaluate per Phase
4. **Total work crosses 12h hard ceiling** → STOP, Discussion #7 (scope split recommendation)
5. Менять `server_yaml_parser.ts` — STOP (closed TASK-016)
6. Менять template t115 — STOP, separate concern
7. Использовать Dart MCP — STOP, TypeScript проект
8. **Dictionary semantics shift в `replacement_util.ts`** — STOP, new discussion (broader blast radius чем relation_patcher-only)

## Per-phase hard ceilings (Claude_1 expansion)

- Phase 1 (audit + design): ≤ 1h
- Phase 2 (order swap + cap import): ≤ 1h
- Phase 3 (5 test groups): ≤ 3h
- Phase 4 (local verify t<N+1>): ≤ 1.5h
- Phase 5 (multi-agent review + iterate): ≤ 2h
- Phase 6 (closure docs): ≤ 30 min
- **Sum: 9h, Total ceiling 12h = 3h buffer**

Crosses any single Phase hard → STOP, re-evaluate Discussion #7.

## План работы

### Phase 0 — Pre-implementation Discussion #6 ✅ DONE

Discussion #6 archived 2026-05-03. 3-agent consensus + verified factual correction (7 markers consumers, не 5).

### Phase 1 — Audit + design (≤ 1h, mandatory artifact)

1. [ ] Прочитать [BUG-012](../../bug-reports/012-server-yaml-parser-ignores-relation-parent-directive.md) Partially Resolved status + [Discussion #6 Decision](../../discussions/archive/6-task-017-dao-substitution-rewrite-pre-im/)
2. [ ] **Mandatory executable audit deliverable** (Claude_1 #1):
   ```bash
   rg -l ":oneToManyMethods" G:/Templates/flutter/t115 --type dart > audit/marker-consumers.txt
   ```
   Expected output (per Discussion #6 verified): 7 files в `t115_flutter/lib/features/tasks/`. Если discrepancy с 7 — flag перед Phase 2.
3. [ ] Read `relation_patcher.ts:71-94` целиком — verify current substitution sequence matches Discussion #6 audit
4. [ ] Verify `cap` exists в `text_util.ts` (added TASK-016)
5. [ ] Select production-shaped fixture для regression: `defaultTerminalSetId, parent=terminal_set` recommended

### Phase 2 — Order swap + cap import (≤ 1h)

6. [ ] Add `cap` import в `relation_patcher.ts`:
   ```ts
   import { toSnakeCase, unCap, cap } from '../../../utils/text_work/text_util';
   ```
7. [ ] Reorder substitution sequence в `relation_patcher.ts:71-94`:
   ```ts
   for (const relationField of relationFields) {
       if (!relationField.relatedModel) continue;
       let body = innerBody;

       // STEP 1: ENTITY rules для mainEntity (unchanged)
       const mainEntityConfig = new GenerationConfig({...config, templEntity: relationTemplateEntity, targetEntity: model.className});
       const mainEntityRules = getDictionaryRules(DictionaryPresets.ENTITY, mainEntityConfig);
       for (const rule of mainEntityRules) body = body.replace(new RegExp(rule.from, 'g'), rule.to);

       // STEP 2 (NEW POSITION): field-Id preservation FIRST
       const targetIdName = relationField.name.endsWith('Id') ? relationField.name : `${relationField.name}Id`;
       const targetIdNamePascal = cap(targetIdName);  // 'AssigneeId'
       body = body.replace(new RegExp(`${templateRelatedEntity}Id`, 'g'), targetIdName);
       body = body.replace(new RegExp(`${cap(templateRelatedEntity)}Id`, 'g'), targetIdNamePascal);

       // STEP 3 (was Step 2): ENTITY rules для relatedEntity
       const relatedEntityConfig = new GenerationConfig({...config, templEntity: templateRelatedEntity, targetEntity: relationField.relatedModel});
       const relatedEntityRules = getDictionaryRules(DictionaryPresets.ENTITY, relatedEntityConfig);
       for (const rule of relatedEntityRules) body = body.replace(new RegExp(rule.from, 'g'), rule.to);

       processedBodies += '\n' + body.replace(/^\n+|\n+$/g, '') + '\n';
   }
   ```
8. [ ] Remove old line 90-91 (field-Id substitution after Step 3 — now redundant)
9. [ ] `npm run compile` — TS clean
10. [ ] Run `npm test` — verify 158 baseline pass (no regression на existing identity-case fixtures)

### Phase 3 — 5 mandatory test groups (≤ 3h)

11. [ ] Extend `src/test/generators/relation_patcher.test.ts` с 5 mandatory groups (Discussion #6 Q4):

    **Group 1 — Simple FK alias `assigneeId, parent=member`:**
    - Positive: method `getInvoicesByAssigneeId(String assigneeId)`, column `t.assigneeId.equals(assigneeId)`, class `MemberTable`
    - Negative: НЕТ `teamMemberId`, НЕТ `categoryId`, НЕТ `MemberId`

    **Group 2 — Snake production-shaped `defaultTerminalSetId, parent=terminal_set`:**
    - Positive: method `getInvoicesByDefaultTerminalSetId`, parameter `String defaultTerminalSetId`, column `t.defaultTerminalSetId`, class `TerminalSetTable`, snake_case file path
    - Negative: НЕТ `terminalSetId` без `default` prefix, НЕТ `terminal_setId` (snake leak)

    **Group 3 — Multiple FK aliases (Receipt-style 2 fields):**
    - 2 relationFields в одной model (e.g., `assigneeId, parent=member` + `cargoTypeId, parent=cargo_type`)
    - Verify processedBodies содержит BOTH methods preserved field name aliases
    - Negative: НЕТ перекрёстного contamination (assigneeId не leaks в cargoType method)

    **Group 4 — Backwards compat identity `categoryId, parent=category`:**
    - Positive: method `getInvoicesByCategoryId(String categoryId)`, column `t.categoryId.equals(categoryId)`, class `CategoryTable`, repeated regen idempotent
    - Negative: НЕТ alias artifacts (`teamMemberId`, `assigneeId`, `TeamMember`)

    **Group 5 — All marker-layer body contexts smoke на 7 layers** (verified Discussion #6):
    - MockFs setup с mini-files для всех 7 markers consumers
    - One FK alias scenario (`assigneeId, parent=member`)
    - Verify each destination получает correct field-alias-preserved body

12. [ ] Run via mocha workaround:
    ```bash
    npx mocha --ui tdd "out/test/generators/**/*.test.js" "out/test/parsers/**/*.test.js" "out/test/utils/**/*.test.js"
    ```
    Target: 168+ passing (158 baseline + ~10 new)

### Phase 4 — Local verify (≤ 1.5h)

13. [ ] `node out/adapters/cli/index.js create-project --name t<N+1> --human` (выбрать N как max+1, e.g. t161)
14. [ ] Add production-shaped FK alias entity (Order/Invoice с `assigneeId, parent=team_member`):
    ```yaml
    class: Invoice
    table: invoice
    fields:
      id: UuidValue?, defaultPersist=random_v7
      userId: int
      customerId: UuidValue, relation(parent=customer, onDelete=Cascade)
      isDeleted: bool, default=false
      createdAt: DateTime
      lastModified: DateTime
      assigneeId: UuidValue?, relation(parent=team_member, onDelete=SetNull)
      title: String
    ```
    + парный sync_event YAML
15. [ ] `generate-entity` для Invoice
16. [ ] **Verify generated artifacts (must all PASS):**
    - `invoice_dao.dart`: `t.assigneeId.equals(assigneeId)` ✅ (НЕ `teamMemberId`)
    - `invoice_repository_impl.dart`: `getInvoicesByAssigneeId(String assigneeId)` ✅
    - `invoice_local_data_source.dart`: `getInvoicesByAssigneeId(String assigneeId, ...)` ✅
    - `invoice_table.dart`: import `team_member_table.dart`, refs `TeamMemberTable` ✅
17. [ ] `verify --name t<N+1>` PASS errors=0
18. [ ] **STOP-gate check:** если broken column/method refs detected → STOP, root cause analysis (не маскировать через manual patches)

### Phase 5 — Multi-agent code review (≤ 2h, fresh subagents с explicit focus)

19. [ ] **STOP перед commit'ом** — записать в journal `⚠ STOP: ready for multi-agent review`
20. [ ] Spawn 2 fresh subagents (Standard + Adversarial pattern, validated PR #6, PR #8) с **explicit Adversarial focus checklist** (Claude_1 #3):
    - Substitution order edge cases (multi-line strings, escaped chars, raw strings в template body)
    - Multiple FK aliases interaction (iteration N не корректирует output N-1)
    - Backwards compat regression (158 baseline tests pass)
    - Marker consumer coverage (7 layers, не 5)
21. [ ] Apply technically valid corrections до commit'а
22. [ ] Re-run tests + verify после corrections

### Phase 6 — Closure (≤ 30 min)

23. [ ] Update bug-report 012 status: Partially Resolved → **Resolved** + evidence cited (verify counts, file paths, generated artifacts)
24. [ ] Заполнить report.md: Approach A reasoning, 7-layer evidence, test counts, multi-agent review summary
25. [ ] Update `ai/docs/agent_memory.md` — снять BUG-012 из active backlog, mark TASK-017 closure
26. [ ] Update `ai/docs/roadmap.md` — Phase 1.5 progress (re-acceptance TASK next)
27. [ ] **НЕ commit, НЕ push, НЕ task.py pr** — это zone teamlead'а после review approved

## План тестирования

**Unit (relation_patcher, NEW coverage для FK alias):**
- 5 mandatory test groups per Discussion #6 (acceptance #5)
- Mandatory positive + negative assertions per group (acceptance #6)
- Target: 168+ passing (158 baseline + ~10 new)

**Integration (verify gate):**
- `verify --name t<N+1> --human` PASS errors=0
- Generated artifacts manual check (DAO column refs, repository_impl method names)

**Multi-agent review (Phase 5):**
- Standard + Adversarial fresh subagents
- Explicit Adversarial focus checklist (substitution edges, multi FK, backwards compat, 7 layers)

## Релевантный контекст

- `ai/bug-reports/012-server-yaml-parser-ignores-relation-parent-directive.md` — Partially Resolved (TASK-016) + что deferred TASK-017
- `ai/discussions/archive/6-task-017-dao-substitution-rewrite-pre-im/` — Discussion #6 Decision (3-agent consensus + 7 markers verified)
- `ai/discussions/archive/5-task-016-bug-012-parser-fix-pre-implemen/` — Discussion #5 Path C trigger context
- `ai/tasks/done/TASK-016-fix-bug-012-server-yaml-parser-relation-parent-directive/report.md` — TASK-016 Path C closure evidence
- `src/features/generation/generators/relation_patcher.ts:71-94` — substitution sequence (Approach A target)
- `src/features/generation/replacement/replacement_util.ts` — substitution dictionary (NO change scope, STOP-gate)
- `src/utils/text_work/text_util.ts` — `cap`, `toSnakeCase`, `snakeToLowerCamelCase` (TASK-016) helpers
- 7 marker consumers in `G:/Templates/flutter/t115/t115_flutter/lib/features/tasks/` (Phase 1 audit deliverable)
- `weight_server/lib/src/models/user/customer_user.spy.yaml` — confirmed FK alias landmine (`defaultTerminalSetId, parent=terminal_set`)

## Журнал исполнения

- [Phase 1 / audit] `rg -l ":oneToManyMethods"` returned **7 files в `t115_flutter/lib/features/tasks/`** — exact match с Discussion #6 expected set. Output committed в `audit/marker-consumers.txt`. No discrepancy → proceed Phase 2 без re-evaluate.
- [Phase 1 / audit] Verified `cap` exists в `text_util.ts:9-11` — single source of truth для PascalCase, no second helper нужен.
- [Phase 1 / audit] Baseline `npm test` = **158 passing** (matches task.md baseline). Confirmed pre-change state.
- [Phase 2 / impl] Added `cap` to import line `text_util.ts` import in `relation_patcher.ts`.
- [Phase 2 / impl] Reordered substitution sequence в `relation_patcher.ts:71-94`. STEP 2 (field-Id preservation, lowerCamel + PascalCase) теперь идёт ПЕРЕД STEP 3 (relatedEntity ENTITY rules). Старые lines 90-91 (`targetIdName` substitution after Step 3) replaced inline в новый Step 2, и расширены PascalCase variant `${cap(templateRelatedEntity)}Id → targetIdNamePascal`.
- [Phase 2 / impl] `npm run compile` → clean (no TS errors).
- [Phase 2 / impl] `npx mocha --ui tdd out/test/**/*.test.js --ignore out/test/extension.test.js` → **158 passing** (no regression). Backwards compat для existing identity-case fixtures preserved.
- [Phase 3 / tests] Добавил 5 mandatory test groups в `relation_patcher.test.ts`:
  - Group 1 (simple FK alias `assigneeId, parent=member`): production-shaped DAO template + positive (method/param/column = `assigneeId`) + negative (no `MemberId`/`categoryId`/`teamMemberId` leaks).
  - Group 2 (snake production-shaped `defaultTerminalSetId, parent=terminalSet`): positive multi-word preservation + negative snake leak `terminal_setId` guard.
  - Group 3 (multiple FK aliases `assigneeId` + `cargoTypeId`): both methods preserved, no cross-contamination, idempotency check (1 occurrence each).
  - Group 4 (backwards compat identity `categoryId, parent=category`): exact preservation + idempotent regen check.
  - Group 5 (7 marker layers smoke): mini-fixtures для всех 7 layers (repository interface/impl, lds interface/concrete, dao, usecases, providers), per-layer positive (`getWeighingsByAssigneeId`) + negative (`!getWeighingsByMemberId`, `!categoryId`, `!CategoryId`).
- [Phase 3 / tests] Initial test failure caught: existing `TASK_DAO_TEMPLATE` shared fixture был minimal (`_db.select(taskTable)`) без column refs. Per-test override `mockFs.setFile(TASK_DAO_PATH, TASK_DAO_PROD_TEMPLATE)` с production-shaped body (`t.categoryId.equals(categoryId)`) добавлен в Groups 1-4. Group 5 имеет свои custom multi-layer templates.
- [Phase 3 / tests] `npx mocha --ui tdd out/test/**/*.test.js --ignore out/test/extension.test.js` → **163 passing** (158 baseline + 5 new TASK-017). Target 168+ был оптимистичен (Discussion #6 предполагал ~10 new); reality — 5 well-isolated groups покрывают все мандатные сценарии без duplication.
- [Phase 4 / verify] Создал t161 через `create-project` (~3 min). Latest existing был t160, скипнул t150-t154 (отсутствуют), использовал t161.
- [Phase 4 / verify] Создал TeamMember entity (parent для FK alias) + Invoice entity с `assigneeId, parent=team_member, onDelete=SetNull`. Production-shaped FK alias scenario per task.md acceptance #9.
- [Phase 4 / verify] `generate-entity` для TeamMember + Invoice → SUCCESS. Invoice: 24 created + 9 modified (включая всех 7 marker consumers: dao, local_data_source, local_datasource_interface, repository_impl, usecase_providers, repository, usecases).
- [Phase 4 / verify] **Generated artifacts verified:**
  - `invoice_dao.dart:183-195` — `getInvoicesByAssigneeId(String assigneeId, ...)` + `t.assigneeId.equals(assigneeId)` ✅
  - `invoice_repository_impl.dart:193` — `Future<List<InvoiceEntity>> getInvoicesByAssigneeId(String assigneeId) async` ✅
  - `invoice_local_data_source.dart:274` — `Future<List<InvoiceModel>> getInvoicesByAssigneeId(...)` ✅
  - `invoice_local_datasource_service.dart:25` — interface declaration ✅
  - `invoice_repository.dart:17` — interface declaration `getInvoicesByAssigneeId(String assigneeId)` ✅
  - `invoice_usecases.dart:74` — `_repository.getInvoicesByAssigneeId(assigneeId)` ✅
  - `invoice_usecase_providers.dart:66` — `GetInvoicesByAssigneeIdUseCase? getInvoicesByAssigneeIdUseCase(Ref ref)` ✅
  - `invoice_table.dart:6,12` — `import 'team_member_table.dart'` + `references(TeamMemberTable, #id, onDelete: KeyAction.setNull)` ✅
- [Phase 4 / verify] Negative grep `teamMemberId|TeamMemberId|getInvoicesByTeamMemberId|getInvoicesByMemberId` в invoices feature → **No matches found**. Никакого leak parent-derived names.
- [Phase 4 / verify] **DoD gate: `verify --name t161` PASS**. flutterAnalyze: errors=**0**, warnings=1, infos=44. pubGet/serverpodGenerate/buildRunner все clean. Total 43s.
- [Phase 4 / verify] STOP-gate Phase 5 trigger: `⚠ STOP: ready for multi-agent review`. НЕ commit, НЕ subagent spawn, НЕ task.py pr — это zone teamlead'а.
