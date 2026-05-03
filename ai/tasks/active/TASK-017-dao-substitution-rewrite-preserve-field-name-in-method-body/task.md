# TASK-017: DAO substitution rewrite — preserve field name в method/parameter/column references

**Phase:** 1.5 final blocker — после TASK-016 closure (Path C split per Discussion #5 STOP-gate #2)
**Blocking:** weight TASK-018 production migration (CustomerUser `defaultTerminalSetId, parent=terminal_set` → broken DAO column reference compile error)
**Origin:** [TASK-016 Path C split](../TASK-016-fix-bug-012-server-yaml-parser-relation-parent-directive/) — Phase 5 verify revealed что parser fix недостаточен; `relation_patcher.ts` substitution semantics shift required separate scope
**Pre-implementation review:** **Discussion #6 ОБЯЗАТЕЛЕН** перед start (high blast radius — substitution rewrite затрагивает ALL future generation FK relations)

## Ветка

`feature/TASK-017-dao-substitution-rewrite-preserve-field-name-in-method-body`

## Цель

Rewrite `relation_patcher.ts:78-91` ENTITY substitution dictionary чтобы **preserve field name** в method/parameter/column references — text-replace не должен заменять `categoryId → teamMemberId` indiscriminately, должен resolve based on context (template literal source).

После TASK-017 — full FK alias scenario работает end-to-end:
- `assigneeId, parent=team_member` → method `getInvoicesByAssigneeId(String assigneeId)` (field name preserved, parent для table import only)
- DAO body: `t.assigneeId.equals(assigneeId)` (column reference matches actual column generated from YAML field name)

## Не-цели

- НЕ менять template t115 (отдельный repo)
- НЕ исправлять nested parens edge case `relation(check=(...), parent=bar)` (out of scope — silent corruption rare, можно backlog как TASK-018+)
- НЕ исправлять PascalCase parent value silent fallback (out of scope)
- НЕ исправлять BUG-010 (`code_formatter.ts:81 includes('Map')`) — pre-existing landmine, отдельная TASK
- НЕ автоматизировать cross-device runtime smoke

## Scope

Разрешено:

- `src/features/generation/generators/relation_patcher.ts:78-91` — ENTITY substitution dictionary rewrite
- Возможно `src/features/generation/replacement/replacement_util.ts` (если substitution rules централизованы)
- Existing test suites — extension для FK alias method body coverage:
  - `src/test/generators/relation_patcher.test.ts` — FK alias scenario tests (method/parameter/column refs preserved)
  - `src/test/generators/relation_generation.test.ts` — extend если path/class normalization affected
- `src/test/generators/code_formatter.test.ts` (NEW or extend) — FK alias через class context
- Update bug-report 012: Partially Resolved → Resolved
- Multi-agent code review **до commit'а** (Standard + Adversarial fresh subagents, не reuse Discussion #6 agents)

Запрещено:

- Менять template t115 — separate concern Discussion #4
- Менять `server_yaml_parser.ts` — closed в TASK-016, не должно нужно
- Workaround'ы вместо корректного substitution semantics
- Backwards-incompatible breaking changes без Discussion #6 approval

## Pre-implementation Discussion #6 (ОБЯЗАТЕЛЕН)

**До любых code changes** — открыть Discussion #6 для design review. Substitution semantics rewrite — high blast radius (затрагивает ALL future generation FK relations + existing weight CRUD methods для backwards compat). Pattern history:

- Discussion #5 (TASK-016 design review): 4 agents caught 2 critical gaps в initial plan → saved hours of rework
- Phase 6 multi-agent review (TASK-016): caught DEAL-BREAKER (quote-stripping landmine)
- TASK-017 без pre-implementation review → high risk похожих gaps

Discussion #6 должна explore:

- **Substitution ordering options** — sequence rules, какие fire first (template literal `task` substitution, target field name preservation, related entity table refs)
- **Pascal-level field-name rules** — нужны ли отдельные rules для class-context vs method-context vs column-context?
- **Template literal isolation** — relation_patcher reads body из marker block в `task_repository_impl.dart`. Body содержит literals `task`, `category`, `categoryId`, `Task`, `Category`. Substitution sequence:
  1. `category` → `<related parent>` (e.g., `team_member` snake-case ИЛИ `teamMember` lowerCamel ИЛИ `TeamMember` Pascal в зависимости от context)
  2. `categoryId` → `<actual field name>` (e.g., `assigneeId` — preserve YAML field name, не parent-derived)
  3. `task` → `<target entity>` (e.g., `invoice`)
  4. Order matters: `categoryId` substitution должна быть ДО `category` substitution (иначе `category` → `team_member` first, потом `categoryId` regex не matches → broken)
- **Test coverage strategy** для existing entities (Configuration, Task с `categoryId`-style FK) — must not regress на field=parent matching cases

## Критерии приёмки (placeholder — refined в Discussion #6)

- [ ] Substitution preserves field name (`assigneeId`) в method names, parameter names, column references
- [ ] Substitution заменяет class refs (`CategoryTable` → `TeamMemberTable`)
- [ ] Substitution заменяет table import path (`category_table.dart` → `team_member_table.dart`)
- [ ] Backwards compat: existing entities с field=parent matching (`categoryId, parent=category`) → identical output
- [ ] Production-shaped fresh project verify: `assigneeId, parent=team_member` → DAO compile clean
- [ ] BUG-012 status update Partially Resolved → Resolved
- [ ] Multi-agent code review до commit'а
- [ ] (refined в Discussion #6)

## STOP-gates

- Substitution rewrite ломает existing 158 baseline tests → STOP, root cause analysis
- Phase work crosses 90 min без clear resolution → re-evaluate
- Total work crosses 16h hard ceiling → STOP, Discussion #7 (scope split recommendation)
- Pre-implementation Discussion #6 НЕ закрыта approved status → STOP, не start implementation
- Менять `server_yaml_parser.ts` — STOP, parser closed в TASK-016
- Использовать Dart MCP — STOP, TypeScript проект

## План работы (high-level, refined post-Discussion #6)

### Phase 0 — Pre-implementation Discussion #6 (mandatory)

1. [ ] Создать Discussion #6 через `discuss.py new "TASK-017 DAO substitution rewrite — pre-implementation design review"`
2. [ ] Author User-секцию: context (TASK-016 Path C closure), audit findings (substitution code in `relation_patcher.ts:78-91`), 4-5 design Q's:
   - Q1: substitution ordering strategy
   - Q2: backwards compat для existing field=parent matching entities
   - Q3: template literal isolation pattern
   - Q4: test coverage strategy
   - Q5: multi-agent review composition (Standard + Adversarial fresh)
3. [ ] Wait для Chatgpt_1 + Claude_1 (+ возможно Gemini_1) responses
4. [ ] teamlead_claude finalize Decision + User approve
5. [ ] Archive Discussion #6 + Patch Record в TASK-017 task.md

### Phase 1-7 — refined post-Discussion #6

(High-level placeholder; refined в task.md update после Discussion #6 closure.)

- Phase 1: audit substitution dictionary rules + grep+classify deliverable
- Phase 2: implement Decision (substitution ordering rewrite)
- Phase 3: extend existing test suites + new tests (FK alias method body coverage)
- Phase 4: local verify run на свежем `t<N+1>` с FK alias entity
- Phase 5: multi-agent code review (Standard + Adversarial)
- Phase 6: closure (BUG-012 status, report.md, agent_memory)

## Релевантный контекст

- `ai/bug-reports/012-server-yaml-parser-ignores-relation-parent-directive.md` — Partially Resolved status (TASK-016) + что deferred TASK-017
- `ai/discussions/archive/5-task-016-bug-012-parser-fix-pre-implemen/` — Discussion #5 Decision (Path C trigger context)
- `ai/tasks/done/TASK-016-...` (после merge) — TASK-016 closure evidence + Path C reasoning
- `src/features/generation/generators/relation_patcher.ts:78-91` — substitution dictionary
- `src/features/generation/replacement/replacement_util.ts` — substitution rules
- `weight_server/lib/src/models/user/customer_user.spy.yaml` — confirmed FK alias landmine

## Журнал исполнения

(Заполняется executor'ом после Discussion #6 approval.)
