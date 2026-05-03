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
10. [x] Local verify run на свежем `t160` с `assigneeId, parent=team_member`: **partial PASS** per Path C (User decision 2026-05-03):
    - ✅ `invoice_table.dart` import = `team_member_table.dart` (snake), refs `TeamMemberTable` (Pascal)
    - ⚠ `invoice_repository_impl.dart`/`invoice_dao.dart` method bodies используют parent-derived names (`getInvoicesByTeamMemberId` / `t.teamMemberId`) вместо field-alias preserved (`getInvoicesByAssigneeId` / `t.assigneeId`) — column reference compile error
    - **Deferred to TASK-017:** DAO substitution rewrite (`relation_patcher.ts:78-91` substitution order). См. Path C reasoning ниже.
- [ ] BUG-012 status update Open → **Partially Resolved** (path/class normalization closed, method body substitution deferred to TASK-017)
- [ ] Multi-agent code review до commit'а (Standard + Adversarial **fresh subagents**)
- [ ] report.md заполнен с Path C reasoning + TASK-017 follow-up
- [ ] Создать TASK-017 для DAO substitution rewrite (после PR 3 merge) — pre-implementation Discussion #6 обязателен (substitution semantics shift = high blast radius)

### Path C scope decision (2026-05-03, User approved)

Phase 5 verify revealed что `relation_patcher.ts:78-91` ENTITY substitution dictionary заменяет `categoryId → teamMemberId` indiscriminately в method/parameter/column references — это **substitution semantics shift** which is STOP-gate #2 в this task.

User authorized **Path C split:**
- TASK-016 (this) closes на текущем scope — parser + helper + path/class normalization + side-fix + 5+ comparison `.toLowerCase()` audit fixes. **156 tests passing.**
- TASK-017 (separate) — `relation_patcher.ts` substitution rewrite (preserve field-name в method/parameter/column refs). Pre-implementation Discussion #6 обязателен (high blast radius — затрагивает все будущие generation FK relations).

**Justification:** holding Discussion #5 stop-gate #2 (semantic shift = scope expansion). Pattern history: Discussion #5 caught 2 critical gaps в initial plans — pre-implementation review pattern proven valuable. Smaller PRs cleaner для multi-agent review.

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

### 2026-05-03 — Phase 1 audit (executor)

- [10:00] **Phase 1 read** — task.md, BUG-012, Discussion #5, agent_memory, server_yaml_parser.ts (146 lines), text_util.ts, 5 consumer files.
- [10:10] **Caller chain confirmed:** `parseField(name, value)` вызывается через `parseFields(fieldsObj)` (line 68-72) — `value` это **raw YAML scalar string** прямо из `js-yaml.load(yamlContent)` через `Object.entries()`. Никаких upstream transformations. `definition === value` — гарантировано.
- [10:15] **Helper `snakeToLowerCamelCase` отсутствует** в `text_util.ts` — нужно добавить новый.
- [10:20] **Grep+classify report** (mandatory deliverable):

  **8 production usage sites:**

  | Site | File:Line | Context | Issue |
  |---|---|---|---|
  | 1 | `server_yaml_parser.ts:62-63` | Comparison/lookup (`extractEntityNameFromField`) | `.toLowerCase()` smell для FK alias snake parent: `relatedModel='terminalSet'` → `'terminalset'` (ломает junction docstring/M2M). |
  | 2 | `server_yaml_parser.ts:106` | **Source** assignment (strip-Id) | Core of BUG-012 — fix here. |
  | 3 | `relation-analyzer.ts:39-42` | Output values M2M.table1/table2 | Uses lowerCamel as-is. After parser fix — будет camelCase, ок. |
  | 4 | `relation_generation.ts:11` | Filter truthy guard | OK, no normalization needed. |
  | 5 | `relation_generation.ts:19` | **Path context** filename `${field.relatedModel}_table.dart` | **BROKEN landmine** для `terminalSet` → `terminalSet_table.dart` (нужен `toSnakeCase()`). |
  | 6 | `code_formatter.ts:186-187` | **Class context** (`${field.relatedModel}Table` + `cap(...)` wrap) | Already wrapped в `cap()` — works для lowerCamel. После parser fix будет `cap('terminalSetTable')='TerminalSetTable'`. ✅ |
  | 7 | `relation_patcher.ts:84` | **Substitution context** (passed как `targetEntity` в GenerationConfig) | Dictionary применяет cap/toSnakeCase к `targetEntity` — нужен audit что multi-word `terminalSet` → `terminal_set`/`TerminalSet` корректно substitute'ится. |
  | 8 | `orchestrator_patcher.ts:300-303` | Comparison/lookup `_extractEntityNameFromField` (junction FK extraction) | Same `.toLowerCase()` smell — `terminalset` для junction docstring. |

  **Distinct semantic decision points:** 5 (Path, Class, Comparison×2 sites 1+8, Substitution, Output) — **within 7 ✅**.
  **Within 5 known layers ✅** — все 8 production sites попадают в 5 layers per task.md scope.
  **STOP-gate Phase 1: PASS, продолжаю Phase 2.**

- [10:25] **Production-shaped fixture для Phase 5:** `assigneeId, parent=team_member` (per task.md preferred). Снарядить Order entity с этим FK + customerId baseline.
- [10:30] **Plan для Phase 2-4:**
  - **Phase 2:** Add helper, parser `fullDefinition` strategy, side-fix `\brelation\s*\(`, defensive fallback `endsWith('Id')`.
  - **Phase 3:** Unit tests parser (5 cases) + helper edge cases.
  - **Phase 4:** Targeted normalizations:
    - Site #5 (`relation_generation.ts:19`): wrap `field.relatedModel` в `toSnakeCase()` для filename.
    - Sites #1, #8 (`server_yaml_parser.ts:62-63`, `orchestrator_patcher.ts:300-303`): replace `.toLowerCase()` с `toSnakeCase()` (правильное поведение — `terminalSet` → `terminal_set` для junction docstring; `terminal_set` matches `tplSnake` substitution pattern).
    - Site #6 (`code_formatter.ts:186-187`): already correct (`cap()` wraps lowerCamel).
    - Site #7 (`relation_patcher.ts:84`): test, может быть OK через GenerationConfig dictionary.

### Phase 2 — parser fix + helper

- [10:35] Helper `snakeToLowerCamelCase` добавлен в `src/utils/text_work/text_util.ts` с throw-on-malformed semantics + validation regex `/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/`.
- [10:40] Parser `parseField` модифицирован per Discussion #5 design:
  - `fullDefinition = definition` (raw before split — bypass naive comma split landmine inside `relation(...)` parens).
  - Side-fix #9: `parts.toString().includes('relation')` → `/\brelation\s*\(/.test(fullDefinition)` — anchored regex предотвращает false-positives на string defaults containing 'relation' substring.
  - Defensive fallback: `name.endsWith('Id') ? name.slice(0, -2) : name` (acceptance #4) — replaces previous regex который странно вёл себя на names с `Id` НЕ в конце.
  - Override через `parent=` directive — regex extracts parent= identifier из directive's parameter list, конвертирует в lowerCamel через helper, throws с descriptive error на malformed input + attaches field-name context.
- [10:45] `npm run compile` clean. Phase 2 done.

### Phase 3 — unit tests parser + helper

- [10:55] Created `src/test/utils/text_util.test.ts` — 14 cases для `snakeToLowerCamelCase` (6 happy path + 8 throw cases). All passing.
- [11:00] Created `src/test/parsers/server_yaml_parser.test.ts` — **13 cases** (covers 5 mandatory + 8 edge cases). Tests use full `ServerpodYamlParser.parse()` pipeline для exercise полный flow.
- [11:05] **`npx mocha --ui tdd out/test/utils/text_util.test.js out/test/parsers/server_yaml_parser.test.js`: 27/27 passing.**
- [11:10] **Full suite:** 122 baseline + 27 new = **149 passing.** Phase 3 done.

### Phase 4 — consumer context normalization

- [11:15] **Site #5** (`relation_generation.ts:19`) — wrap `field.relatedModel!` в `toSnakeCase()`. Critical landmine fix.
- [11:18] **Site #1** (`server_yaml_parser.ts:62-66`) `extractEntityNameFromField` — removed `.toLowerCase()`. Returns `relatedModel` напрямую (lowerCamel, после parser fix). Fallback `name.endsWith('Id')`-based для consistency. Reason: downstream MANY_TO_MANY dictionary применяет `cap()`/`unCap()`/`toSnakeCase()` к `targetEntity1/2` — нужен lowerCamel input для produce correct PascalCase/snake_case variants. `.toLowerCase()` ломает multi-word entities (`'terminalSet'` → `'terminalset'`, `cap()` → `'Terminalset'` ≠ `'TerminalSet'`).
- [11:20] **Site #8** (`orchestrator_patcher.ts:300-303`) `_extractEntityNameFromField` — same fix, mirror site #1. Используется для junction docstring (`__FK1__`/`__FK2__` placeholders). После fix `cap('terminalSet')='TerminalSet'` для method name `ByCustomerAndTerminalSet`.
- [11:22] **Site #6** (`code_formatter.ts:186-187`) — already correct via `cap(...)` wrap. No changes needed.
- [11:23] **Site #7** (`relation_patcher.ts:84`) — already correct via `GenerationConfig.ENTITY` dictionary which applies cap/unCap/toSnakeCase. No changes needed.
- [11:25] `npm run compile` clean.
- [11:30] **3 baseline tests broke** (orchestrator_patcher.test.ts: TASK-013/014 docstring expectations). **Root cause:** test fixtures used Pascal `relatedModel: 'Customer'/'Role'/etc` чтобы `.toLowerCase()` нормализовало. Production parser даёт lowerCamel — это test-side anti-fixture, не behavioral regression. Fixed test fixtures (Pascal → lowerCamel) — соответствует production reality. Updated 7 fkField calls + 1 inline TerminalSet field. Same expected outputs (`junction FK→customer+role`, `ByCustomerAndRole`) — produced via `cap('customer')='Customer'` + `cap('role')='Role'`.
- [11:35] Added new BUG-012 regression test `BUG-012: junction с multi-word snake parent (terminalSet) → docstring/methods используют lowerCamel form` в orchestrator_patcher.test.ts — verifies multi-word lowerCamel handling end-to-end.
- [11:40] Created `src/test/generators/relation_generation.test.ts` — **6 cases** для `generateDriftTableImports` snake-case path normalization (single-word, multi-word landmine, three-word, multiple FKs dedup, customerId excluded, empty).
- [11:45] **Full suite:** 122 baseline + 34 new (27 Phase 3 + 7 Phase 4) = **156 passing.** Phase 4 done.

### Phase 5 — local verify run

- [12:00] `node out/adapters/cli/index.js create-project --name t159 --human` — t159 created (~3.4 min, 204464ms).
- [12:05] Selected production-shaped fixture: **assigneeId, parent=team_member** (per task.md preferred). Создал 2 entities: TeamMember (FK target) + Order (FK source).
- [12:10] **TeamMember generated** — 24 files created via `generate-entity --yaml team_member.spy.yaml --feature-path features/team_member`. orchestrator_patcher + database.dart updated.
- [12:12] **Order generated** — 28 files (24 created + 4 modified for relation_patcher). orchestrator + database updated. Acceptance criteria #10 partial verification:
  - ✅ `order_table.dart` line 6: `import '../../../../../team_member/data/datasources/local/tables/team_member_table.dart';` — **snake_case path** (НЕ `teamMember_table.dart`, НЕ `assignee_table.dart`).
  - ✅ `order_table.dart` line 12: `references(TeamMemberTable, #id, ...)` — **PascalCase ref** (НЕ `AssigneeTable`).
  - ⚠️ `order_repository_impl.dart` line 193: `Future<List<OrderEntity>> getOrdersByTeamMemberId(String teamMemberId)` — **method name использует parent name** (`TeamMember`/`teamMember`), **НЕ field name alias** (`Assignee`/`assignee`).

- [12:15] **🛑 STOP — acceptance criterion #10 vs current design fundamentally mismatched.**

  **Acceptance #10 (task.md line 79-83 + bug-report 012 acceptance criteria):**
  > `<entity>_repository_impl.dart` имеет concrete `getOrdersByDefaultTerminalSetId` (field name preserved, не `getOrdersByTeamMemberId`)

  **Current design** (`relation_patcher.ts:78-91`):
  1. Step 1 — ENTITY rules для mainEntity: `Tasks` → `Orders` (PascalCase plural), `task` → `order` (lowerCamel).
  2. Step 2 — ENTITY rules для relatedEntity: `Category` → `TeamMember` (PascalCase), `category` → `teamMember` (lowerCamel).
  3. Step 3 — explicit field-Id replacement: `categoryId` → `assigneeId` (line 91).

  **Template body:** `getTasksByCategoryId(String categoryId)`. After substitution flow:
  - `Tasks` → `Orders` (step 1 mainEntity)
  - `Category` → `TeamMember` (step 2 relatedEntity, PascalCase rule fires внутри `getTasksByCategoryId` substring)
  - `category` → `teamMember` (step 2 lowerCamel) — но к этому моменту `category` уже частично затронут step 2's PascalCase rule
  - Step 3 regex `categoryId` уже не matches (replaced)
  - Result: `getOrdersByTeamMemberId(String teamMemberId)` — **parent-derived method name**.

  **Чтобы получить `getOrdersByAssigneeId(String assigneeId)`** требуется:
  - Reorder substitution: field-Id rules (step 3 expanded) **ДО** relatedEntity ENTITY rules (step 2).
  - Add Pascal field-name rule: `By${cap(templateRelatedEntity)}Id` → `By${cap(fieldNameStripId)}Id` (Pascal level).
  - Add lowerCamel field-name rule: `${templateRelatedEntity}Id` → `${fieldNameStripId}Id` (already exists на line 91 но порядок неправильный).
  - This changes semantic foundation of `relation_patcher` — wider чем "targeted local normalization".

  **Trips STOP-gate #2 (task.md line 89):**
  > **Semantic shift:** substitution semantics в `relation_patcher`/`orchestrator_patcher` shift wider чем targeted local normalizations → STOP, scope expansion

  **Trips also Phase 5 STOP-gate #25 на subtle margin** — output **does** contain `teamMember` substring в method names (`getOrdersByTeamMemberId`), но **filename** correct (`team_member_table.dart`). Если "BUG-012 closed for production case" интерпретируется narrowly как "no broken file paths", criterion is met. Если расширяется до "method names preserve field aliases", current behavior fails.

  **Решение требуется от User'а:**
  - **(A)** Accept narrow scope: filenames + class refs корректны (current state). Method names используют parent-derived form `getOrdersByTeamMemberId`. PRO: BUG-012 закрыт по symptoms из bug-report (file paths/class refs). CON: acceptance #10 strict text не выполнен.
  - **(B)** Expand scope: implement field-name preserving method names. Reorder + extend `relation_patcher` substitution. PRO: full acceptance #10 text. CON: scope creep into TASK-016 estimated 2-4h дополнительно (rewrite test fixtures + 5 layer regressions). Risk: PR #6 multi-agent review may catch additional edge cases (semantic shift territory).
  - **(C)** Update acceptance #10 text: parent-derived method names is acceptable behavior; preserved method names — separate TASK (e.g. TASK-017). Current PR closes BUG-012 in narrow sense.

  **Time spent so far:** ~2.5h (Phase 1: 30min + Phase 2: 15min + Phase 3: 30min + Phase 4: 60min + Phase 5: 30min). Total budget 8-16h, plenty headroom для (B). Но это требует User decision — это не Executor scope.

  **Текущие artifacts уже на disk:**
  - parser fix in `server_yaml_parser.ts` ✅
  - helper `snakeToLowerCamelCase` ✅
  - 27 new unit tests + 6 BUG-012 regression + 1 multi-word junction test = **156 passing**
  - consumer normalizations on 3 sites (5, 1, 8) ✅
  - filename + class ref BUG-012 landmines closed ✅
  - method name field-alias preservation — **deferred pending User decision**

  ⚠ STOP: ready for User decision on acceptance #10 method-name interpretation. Готов продолжить любым из путей A/B/C по указанию.

- [12:30] **t159 verify FAIL** — `Order` entity name collides с `package:serverpod/src/database/concepts/order.dart` (`ambiguous_import`). Это unrelated naming issue (выбрал unfortunate fixture name). Recreated с `Invoice` instead в t160.
- [12:50] **t160 verify FAIL** — flutter analyze: errors=1, warnings=1, infos=44. **Single error revealed concrete production landmine:**

  ```
  error - The getter 'teamMemberId' isn't defined for the type '$InvoiceTableTable'
   - lib/features/invoices/data/datasources/local/daos/invoice/invoice_dao.dart:190:19
   - undefined_getter
  ```

  **DAO body (line 190):**
  ```dart
  Future<List<InvoiceTableData>> getInvoicesByTeamMemberId(
    String teamMemberId, ...
  ) => (select(invoiceTable)..where(
    (t) => t.teamMemberId.equals(teamMemberId) & ...  // ❌ t.teamMemberId не существует
                                                     // ✅ должно быть t.assigneeId
  ))
  ```

  **Корневая причина** ровно та проблема которую выявил Phase 5 step 24:
  - Column name in `invoice_table.dart` = `assigneeId` (preserved field name from YAML).
  - DAO method generated через relation_patcher's ENTITY substitution: template `t.categoryId` → `t.teamMemberId` (parent-derived).
  - **Mismatch:** column = `assigneeId`, but DAO body references `teamMemberId` getter → undefined_getter compile error.

  **Это не cosmetic — это HARD compile error.** Acceptance #10 strict text ("field name preserved in `getOrdersByDefaultTerminalSetId`") теперь оказывается **functionally required** для proper compilation, не "nice-to-have".

  **STOP-gate #1 теперь triggered explicitly** (task.md line 88):
  > **Output landmine:** `terminalSet_table.dart` или `terminalset` substring в generated output → STOP, не cosmetic, незакрытый BUG-012 для production case

  Output не содержит `teamMember_table.dart` (filenames ok), но contains broken `t.teamMemberId.equals(teamMemberId)` reference в DAO. Это **same severity** для production — generated project не compileable.

  **Без full acceptance #10 implementation:**
  - filename + class refs — fixed by current TASK-016 changes ✅
  - DAO method bodies — broken by relation_patcher's parent-derived substitution для FK aliases ❌

  **Реальный путь forward:**
  - **Path B (full fix):** rewrite `relation_patcher.ts:78-91` substitution order — apply field-name targeted rules ДО ENTITY relatedEntity rules. Add Pascal-level `By${cap(templateRelatedEntity)}` → `By${cap(fieldNameStripId)}` substitution. Estimate: 2-4h дополнительно (rewrite + test fixtures + Phase 5 re-verify). Total budget remaining ~13h, easily fits.
  - **Path A (narrow scope):** acceptance #10 не fully met. BUG-012 partially closed (file path/class ref landmines), но method body remains broken для FK aliases. Production landmine not closed.

  **Recommendation:** Path B (full fix) — STOP-gate #1 triggered, narrow scope не closes production blocker. Acceptance #10 текст match precisely fixed result. Time budget allows.

- [13:00] ⚠ **STOP: requesting User decision A vs B before proceeding to Path B implementation OR closing PR на narrow scope.**

### Verify on t160 — final state перед STOP

```
FAIL: verify t160
  project: G:\Projects\Flutter\serverpod\t160
  ✗ flutterAnalyze — 5607ms (errors=1, warnings=1, infos=44)
  ✓ pubGet — 10462ms
  ✓ serverpodGenerate — 9312ms
  ✓ buildRunner — 20350ms
```

**1 error** = `teamMemberId` getter undefined в `invoice_dao.dart:190` (described above).
**0 errors** в server (after using `Invoice` instead of conflict-prone `Order`).

### Time spent

| Phase | Min |
|---|---|
| 1 audit | 30 |
| 2 parser+helper | 15 |
| 3 unit tests | 30 |
| 4 consumer norm | 60 |
| 5 verify run | 60 |
| **Total** | **~3h15m** |

Within 16h ceiling — **plenty headroom для Path B (~3-5h).**



