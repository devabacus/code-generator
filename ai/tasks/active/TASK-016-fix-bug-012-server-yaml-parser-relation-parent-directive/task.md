# TASK-016: fix BUG-012 — server_yaml_parser relation(parent=X) directive parsing + consumer context normalization

**Phase:** 1.5 final gate prep — последний blocker перед re-acceptance TASK
**Blocking:** weight TASK-018 production migration (CustomerUser `defaultTerminalSetId, parent=terminal_set` confirmed landmine)
**Origin:** [Discussion #4 Decision](../../discussions/archive/4-pr-1-bug-013-blocks-reduced-scope-verify/) — PR 3 в sequence
**Pre-implementation design review:** [Discussion #5 Decision](../../discussions/archive/5-task-016-bug-012-parser-fix-pre-implemen/) — 4 agents consensus с **2 critical gaps caught**: parser parsing strategy + consumer context normalization

## Ветка

`feature/TASK-016-fix-bug-012-server-yaml-parser-relation-parent-directive`

## Цель

Исправить [BUG-012](../../bug-reports/012-server-yaml-parser-ignores-relation-parent-directive.md) — `server_yaml_parser.ts:106` использует `name.replace(/(.*)Id/, '$1')` для derivation `field.relatedModel`, **полностью игнорирует `parent=X` directive** в YAML.

**Critical Discussion #5 insight (consensus 4 agents):** parser fix sam недостаточен для closing BUG-012. Нужна **consumer context normalization** на всех 5+ layers (snake/camel/Pascal в зависимости от context). Без этого `relatedModel='terminalSet'` correct metadata, но `terminalSet_table.dart` broken filename — formal closure без production resolution.

После TASK-016 — re-acceptance TASK (PR 4) с full FK alias scenario → если PASS errors=0 → **weight TASK-018 unblocked**.

## Не-цели

- НЕ исправлять BUG-001 (Ref disposed)
- НЕ исправлять potential BUG-014 (parameter shadowing для `userId` business FK)
- НЕ менять template t115 (separate repo)
- НЕ автоматизировать cross-device runtime smoke
- НЕ исправлять HOTFIX-001 (`new_task.py` scan only `active/`) — отдельный mini-chore после TASK-016 + PR 4

## Scope

Разрешено:

- `src/features/generation/parsers/server_yaml_parser.ts`:
  - Add `fullDefinition` parsing strategy для `relation(...)` directive
  - Add `\brelation\s*\(` regex для `isRelation` detection (replaces `parts.toString().includes('relation')` — fixes string defaults containing 'relation' substring)
  - Add defensive `name.endsWith('Id') ? name.slice(0, -2) : name` fallback (replaces existing regex)
- `src/utils/text_work/text_util.ts` — add helper `snakeToLowerCamelCase` (throw на ill-formed input, validation regex `/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/`)
- 5+ consumer layer files (context normalization после Phase 1 grep+classify revealed):
  - `src/features/generation/generators/relation_generation.ts:19` (path context → `toSnakeCase`)
  - `src/features/generation/parsers/formatters/code_formatter.ts:186` (class context → `cap()`)
  - `src/features/generation/generators/relation_patcher.ts:84` (substitution context, varies)
  - `src/features/generation/generators/orchestrator_patcher.ts:300` (junction registration)
  - `src/features/generation/parsers/relation-analyzer.ts:39-42` (M2M detection)
- Unit tests:
  - `src/test/parsers/server_yaml_parser.test.ts` (NEW — parser ранее без тестов)
  - `src/test/utils/text_util.test.ts` (NEW or extend) — helper edge cases
  - Existing 5 layer test suites — extend для FK alias regression
- Update bug-report 012 status: Open → Resolved
- Multi-agent code review **до commit'а**: Standard + Adversarial fresh subagents (Phase 6)

Запрещено:

- Менять template t115 — separate concern
- Менять generated `*.spy.yaml` files
- Workaround'ы вместо корректного parsing
- Backwards-incompatible breaking changes без discussion
- Использовать Dart MCP — TypeScript проект
- Reuse Chatgpt_1/Claude_1 (discussion agents) для code review — нужны fresh subagents

## Критерии приёмки (10 items)

1. [ ] `parseField` парсит `relation(parent=X)` directive через `fullDefinition` подход — `field.relatedModel = X` (lowerCamelCase) если directive present
2. [ ] **snake_case parent → camelCase conversion:** `parent=cargo_type` → `relatedModel='cargoType'` через `snakeToLowerCamelCase` helper
3. [ ] **FK alias case** работает: `assigneeId: UuidValue?, relation(parent=member, ...)` → `relatedModel='member'`
4. [ ] Backwards compat: если `parent=` отсутствует → fallback на `name.endsWith('Id') ? name.slice(0, -2) : name` (defensive)
5. [ ] Unit tests `src/test/parsers/server_yaml_parser.test.ts` (NEW) — **5 mandatory cases**:
   - `assigneeId, parent=member` (simple FK alias)
   - `defaultTerminalSetId, parent=terminal_set` (snake production-shaped)
   - junction snake-snake: `roleId, parent=user_role` + `permissionId, parent=access_permission`
   - backwards compat: `projectId, parent=project` или relation без `parent=`
   - **Negative test:** `description: String, default='this relation is broken'` НЕ должно дать `isRelation=true`
6. [ ] Unit tests helper `snakeToLowerCamelCase` — edge cases: `terminal_set` → `terminalSet`, `cargo_type2`, `member` (no-op), throw на `_bad` / `bad_` / `double__bad` / `''`
7. [ ] **Consumer context normalization** на каждом из 5+ layers — apply context-appropriate transform:
   - Path context: `toSnakeCase(relatedModel)` (filenames `terminal_set_table.dart`)
   - Class context: `cap(relatedModel)` (`TerminalSetTable`)
   - Method names: `relatedModel` as-is (lowerCamel)
   - Comparison context audit (`.toLowerCase()` smell)
8. [ ] `npm test` PASS (122 baseline + new TASK-016 tests, target 135+)
9. [ ] **Side-fix:** `parts.toString().includes('relation')` → `\brelation\s*\(` regex — string defaults containing 'relation' substring НЕ activate FK detection
10. [ ] Local verify run на свежем `t<N+1>` с production-shaped FK alias entity (`defaultTerminalSetId, parent=terminal_set` или `assigneeId, parent=team_member`): `verify` PASS errors=0 + verify generated artifacts:
    - `<entity>_table.dart` import = `terminal_set_table.dart` (snake), refs `TerminalSetTable` (Pascal)
    - `<entity>_repository_impl.dart` имеет concrete `getXxxByDefaultTerminalSetId` (field name preserved)
- [ ] BUG-012 status update Open → Resolved с evidence cited
- [ ] Multi-agent code review до commit'а (Standard + Adversarial **fresh subagents**)
- [ ] report.md заполнен

## STOP-gates (8 items, combined 4-agent consensus)

1. **Output landmine:** `terminalSet_table.dart` или `terminalset` substring в generated output → STOP, не cosmetic, незакрытый BUG-012 для production case
2. **Semantic shift:** substitution semantics в `relation_patcher`/`orchestrator_patcher` shift wider чем targeted local normalizations → STOP, scope expansion
3. **Usage breadth:** Phase 1 grep+classify revealed **>7 distinct semantic usage sites** требующих normalization decision (path/class/method/docstring/comparison), ИЛИ usage за пределами 5 known layers → escalate Discussion #6
4. **Phase work crosses 90 min** без clear resolution → re-evaluate (per Phase, не cumulative)
5. **Total work crosses 16h hard ceiling** без видимого окончания → STOP, Discussion #6 (recommended scope split: parser fix vs consumer normalization separate PRs)
6. Менять template t115 — STOP, separate concern Discussion #4
7. Если breaking 122 baseline tests — STOP, root cause, не маскировать через test relaxation
8. Использовать Dart MCP / `mcp__dart__*` — STOP, TypeScript проект

## План работы

### Phase 1 — Audit + design (1-2h, mandatory artifact)

1. [ ] Прочитать [BUG-012](../../bug-reports/012-server-yaml-parser-ignores-relation-parent-directive.md) + [Discussion #5](../../discussions/archive/5-task-016-bug-012-parser-fix-pre-implemen/) полностью
2. [ ] Read `server_yaml_parser.ts` целиком — понять existing flow + caller chain
3. [ ] **Audit checklist (Claude_1):**
   - Кто вызывает `parseField`? (rg call sites)
   - Что именно `value` parameter — raw YAML scalar или processed?
   - Если processed — какие transformations до parser?
   - Test: исходный YAML `defaultTerminalSetId: UuidValue?, relation(parent=terminal_set, onDelete=SetNull)` дойдёт до `parseField` неизменённым?
4. [ ] **Mandatory deliverable — grep+classify report:**
   ```bash
   rg "relatedModel" src/features/generation src/shared --type ts -n
   ```
   Output table: usage_site x 4 contexts (path/class/method/comparison). Attach в task.md report.
5. [ ] **STOP-gate check:** если grep revealed >7 distinct semantic usage sites или usage за 5 layers → STOP, Discussion #6 (scope split)
6. [ ] Verify helper `snakeToLowerCamelCase` отсутствует в `text_util.ts` (если есть — re-use; если нет — design + add)
7. [ ] Select production-shaped fixture для regression tests + Phase 5 verify: `defaultTerminalSetId, parent=terminal_set` recommended

### Phase 2 — Parser fix + helper (1-2h)

8. [ ] Add helper `snakeToLowerCamelCase` в `text_util.ts`:
   ```ts
   export function snakeToLowerCamelCase(snake: string): string {
       const validRegex = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
       if (!validRegex.test(snake)) {
           throw new Error(`Invalid snake_case identifier: '${snake}'`);
       }
       return snake.replace(/_([a-z0-9])/g, (_, ch) => ch.toUpperCase());
   }
   ```
9. [ ] Add helper unit tests `src/test/utils/text_util.test.ts` (criterion #6)
10. [ ] Modify `parseField` в `server_yaml_parser.ts`:
    ```ts
    // существующий strip-Id → defensive fallback
    field.relatedModel = name.endsWith('Id') ? name.slice(0, -2) : name;

    // NEW: override через explicit parent= directive
    const fullDefinition = definition;  // raw value, до split
    const relationMatch = fullDefinition.match(/\brelation\(([^)]*)\)/);
    if (relationMatch) {
        const parentMatch = relationMatch[1].match(/(?:^|,\s*)parent\s*=\s*([a-z_][a-z0-9_]*)\b/);
        if (parentMatch) {
            try {
                field.relatedModel = snakeToLowerCamelCase(parentMatch[1]);
            } catch (e) {
                throw new Error(`Field '${name}' has malformed parent= directive: ${(e as Error).message}`);
            }
        }
    }
    ```
11. [ ] Side-fix: `parts.toString().includes('relation')` → `/\brelation\s*\(/.test(fullDefinition)` (criterion #9)
12. [ ] `npm run compile` — TS clean

### Phase 3 — Unit tests parser + helper (1-2h)

13. [ ] Create `src/test/parsers/server_yaml_parser.test.ts` (NEW — parser ранее без тестов!)
14. [ ] **5 mandatory test cases** (criterion #5):
    - `assigneeId, parent=member` → `relatedModel='member'`
    - `defaultTerminalSetId, parent=terminal_set` → `relatedModel='terminalSet'`
    - junction snake-snake (parser only — Chatgpt_2 split): `roleId, parent=user_role` → `'userRole'`, `permissionId, parent=access_permission` → `'accessPermission'`
    - Backwards compat: `projectId` без `parent=` → `relatedModel='project'` (strip-Id fallback)
    - Negative: `description: String, default='this relation is broken'` → `isRelation=false`
15. [ ] Run via mocha workaround: `npx mocha --ui tdd out/test/parsers/server_yaml_parser.test.js`

### Phase 4 — Consumer context normalization (2-4h, может expand если grep revealed wider)

16. [ ] Apply context normalization per Phase 1 grep+classify report:
    - **Path context** (filename, directory): wrap `relatedModel` in `toSnakeCase()` для file-resolution code
    - **Class context** (Dart class names): wrap in `cap()` для `${cap(relatedModel)}Table`-style refs
    - **Method names**: keep `relatedModel` as-is (already lowerCamel after parser fix)
    - **Comparison context** (`.toLowerCase()` smell): audit, fix or escalate
17. [ ] Extend existing test suites для каждого modified layer:
    - `relation_patcher.test.ts` — добавить FK alias tests (snake parent + class refs Pascal)
    - `orchestrator_patcher.test.ts` — junction registration с FK alias
    - `relation_generation.test.ts` (extend or NEW) — table import path snake_case
    - `code_formatter.test.ts` (extend or NEW) — class refs PascalCase
    - `relation-analyzer.test.ts` (extend or NEW) — M2M detection с FK alias
18. [ ] Target: 135+ tests passing (122 baseline + ~13 new)
19. [ ] **STOP-gate:** если modifications expand wider 5 known layers → STOP, Discussion #6

### Phase 5 — Local verify run (30-60m)

20. [ ] `node out/adapters/cli/index.js create-project --name t<N+1> --human` (выбрать N как max+1)
21. [ ] Add **single production-shaped FK alias entity** (Chatgpt_2 + Claude_2 split — junction snake-snake остаётся unit-level Phase 3, не fresh project):
    ```yaml
    # G:/Projects/Flutter/serverpod/t<N+1>/t<N+1>_server/lib/src/models/orders/order.spy.yaml
    class: Order
    table: order
    fields:
      id: UuidValue?, defaultPersist=random_v7
      userId: int
      customerId: UuidValue, relation(parent=customer, onDelete=Cascade)
      isDeleted: bool, default=false
      createdAt: DateTime
      lastModified: DateTime
      assigneeId: UuidValue?, relation(parent=team_member, onDelete=SetNull)  # FK alias snake-shaped
      title: String
    ```
   + парный sync_event YAML
22. [ ] `generate-entity --workspace t<N+1>` для Order entity
23. [ ] `verify --name t<N+1>` PASS errors=0
24. [ ] **Verify generated artifacts:**
    - `order_table.dart` import = `team_member_table.dart` (snake_case, НЕ `teamMember_table.dart`, НЕ `assignee_table.dart`)
    - `references(TeamMemberTable, ...)` (Pascal, НЕ `AssigneeTable`)
    - `order_repository_impl.dart` concrete `getOrdersByAssigneeId` (field name alias preserved, не `getOrdersByTeamMemberId`)
25. [ ] **STOP-gate:** если output contains `teamMember_table.dart` или `teammember` substring → STOP, BUG-012 НЕ closed для production case

### Phase 6 — Multi-agent code review (1-2h, fresh subagents)

26. [ ] Передать diff + task.md + Phase 5 evidence двум **fresh subagents** через Agent tool (Standard + Adversarial pattern, validated PR #6):
    - **Standard:** parser logic correctness, regex robustness, snake↔camel correctness, consumer normalization completeness
    - **Adversarial:** edge cases (empty `relation()`, malformed YAML, multiple `parent=` directives, nested parens, conflicting `parent=` semantics), что НЕ tested, что замаскировано
27. [ ] Apply technically valid corrections до commit'а
28. [ ] Re-run tests + verify после corrections
29. [ ] Если major findings (deal-breaker уровня PR #6) → return iteration перед commit

### Phase 7 — Closure (15-30m)

30. [ ] Update bug-report 012 status: Open → Resolved + evidence cited (verify counts, file paths, class refs)
31. [ ] Заполнить report.md
32. [ ] Update `ai/docs/agent_memory.md` — снять BUG-012 из active backlog
33. [ ] Commit с conventional commit message
34. [ ] `python ai/scripts/task.py pr` — push + PR — wait teamlead/User approval

## План тестирования

**Unit (parser + helper, NEW coverage):**
- `src/test/parsers/server_yaml_parser.test.ts` — 5 mandatory cases per acceptance criterion #5
- `src/test/utils/text_util.test.ts` — `snakeToLowerCamelCase` edge cases per acceptance criterion #6

**Unit (5+ consumer layers, regression):**
- Extended existing suites + new tests где coverage недостаточен
- Target: 135+ passing (122 baseline + ~13 new)

**Integration (verify gate):**
- `verify --name t<N+1> --human` PASS errors=0
- Generated artifacts checked (snake filenames, Pascal class refs, lowerCamel method names)

**Multi-agent review:**
- Standard + Adversarial fresh subagents (Phase 6, validated practice)

## Релевантный контекст

- `ai/bug-reports/012-server-yaml-parser-ignores-relation-parent-directive.md`
- `ai/discussions/archive/5-task-016-bug-012-parser-fix-pre-implemen/` — 4-agent design review
- `ai/discussions/archive/4-pr-1-bug-013-blocks-reduced-scope-verify/`
- `ai/tasks/done/TASK-012-todo-real-app-generation-cross-device-smoke/report.md`
- `src/features/generation/parsers/server_yaml_parser.ts` (lines 80-126 ключевые)
- 5 consumer layer files (см. Scope разрешено)
- `src/utils/text_work/text_util.ts` — helper location
- `src/test/generators/relation_patcher.test.ts` — pattern reference
- `weight_server/lib/src/models/user/customer_user.spy.yaml` — confirmed FK alias landmine

## Журнал исполнения

(Заполняется executor'ом по ходу работы.)
