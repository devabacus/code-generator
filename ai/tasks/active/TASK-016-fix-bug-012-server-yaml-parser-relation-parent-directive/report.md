# Отчёт TASK-016 (Path C partial close)

## Резюме

TASK-016 закрывается **partial** per Path C scope decision (User approved 2026-05-03) после triggering Discussion #5 STOP-gate #2 (substitution semantics shift).

**Closed в этом PR:**
- Parser `relation(parent=X)` directive parsing через `fullDefinition` подход (bypass naive split)
- Helper `snakeToLowerCamelCase` в `src/utils/text_work/text_util.ts` (throw на ill-formed, strict regex `/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/`)
- Defensive fallback `name.endsWith('Id') ? name.slice(0, -2) : name`
- Side-fix `\brelation\s*\(` anchored regex для FK detection
- **Adversarial post-Phase-6 fix:** quote-stripping ДО `relation(` matching — protects against `notes: String, default='See relation(parent=foo) docs'` landmine (production-impacting silent String→FK miscategorization)
- Path context normalization в `relation_generation.ts:19` (`toSnakeCase` wrap → `terminal_set_table.dart`)
- Comparison context audit fix в `server_yaml_parser.ts:62` + `orchestrator_patcher.ts:300` (removed `.toLowerCase()` smells)

**Deferred to TASK-017:**
- `relation_patcher.ts:78-91` ENTITY substitution semantics rewrite (preserve field name в method/parameter/column references)
- weight TASK-018 production migration blocked до TASK-017 closure

**BUG-012 status:** Open → 🟡 Partially Resolved.

## Path C scope decision

Phase 5 verify revealed что `relation_patcher.ts` ENTITY substitution dictionary заменяет `categoryId → teamMemberId` indiscriminately в method/parameter/column references — это **substitution semantics shift** which is Discussion #5 STOP-gate #2.

Per [Discussion #5 Decision](../../discussions/archive/5-task-016-bug-012-parser-fix-pre-implemen/) (4-agent consensus + Chatgpt_2/Claude_2 ratification), STOP-gate #2 requires escalation, не in-task expansion.

**User approved Path C** (2026-05-03):
- TASK-016 closes на текущем scope (parser + helper + path/class normalization + side-fix + quote-stripping)
- TASK-017 separate с pre-implementation Discussion #6 обязателен (high blast radius — substitution rewrite затрагивает ALL future generation FK relations)

## Изменения

**Modified (codegen):**
- `src/features/generation/parsers/server_yaml_parser.ts` — `fullDefinition` parsing, `parent=` directive extraction, defensive fallback, side-fix regex, quote-stripping landmine fix, comparison context normalization
- `src/utils/text_work/text_util.ts` — `snakeToLowerCamelCase` helper added
- `src/features/generation/generators/relation_generation.ts` — `toSnakeCase(field.relatedModel)` wrap для path context (filename derivation)
- `src/features/generation/generators/orchestrator_patcher.ts` — removed `.toLowerCase()` в junction FK extraction
- `src/test/generators/orchestrator_patcher.test.ts` — fixtures aligned (Pascal → lowerCamel parser convention) + new BUG-012 multi-word junction test
- `ai/bug-reports/012-...md` — status Open → Partially Resolved + resolution evidence

**Created (codegen):**
- `src/test/parsers/server_yaml_parser.test.ts` (NEW) — 15 cases (5 mandatory + 8 edge + 2 quote-stripping landmine)
- `src/test/utils/text_util.test.ts` (NEW) — 14 helper edge cases (6 happy + 8 throw)
- `src/test/generators/relation_generation.test.ts` (NEW) — 6 BUG-012 path normalization regression
- `ai/tasks/active/TASK-017-...` — stub для DAO substitution rewrite (Discussion #6 обязателен)

**Modified (target test project, вне репо):**
- `G:/Projects/Flutter/serverpod/t160/` — Phase 5 verify project (partial PASS на disk + WARNING.md mark)

## Тесты

- **Добавлено тестов:** 36 new
  - 15 parser cases (5 mandatory Discussion #5 + 8 edge + 2 quote-stripping)
  - 14 helper edge cases (snake → camel happy + throw на malformed)
  - 6 path normalization regression
  - 1 orchestrator junction multi-word
- **Total:** 158 passing, 0 failing (122 baseline + 36 new)
- **Compile:** clean (`npm run compile`)
- **Запуск:**
  ```bash
  npx mocha --ui tdd "out/test/generators/**/*.test.js" "out/test/parsers/**/*.test.js" "out/test/replacement/**/*.test.js" "out/test/services/**/*.test.js" "out/test/verify/**/*.test.js" "out/test/utils/**/*.test.js"
  ```
  (vscode-test runner blocked Inno Setup mutex per TASK-013/014 lessons; mocha workaround validated.)

## Verify evidence (t160 partial PASS)

```
node out/adapters/cli/index.js verify --name t160 --human
errors=1, warnings=1, infos=44
```

**Что PASS** (BUG-012 narrow scope closed):
- `invoice_table.dart` import = `'../../../../../team_member/data/datasources/local/tables/team_member_table.dart'` ✅ snake_case path
- `references(TeamMemberTable, ...)` ✅ Pascal class ref

**Что FAIL** (TASK-017 scope, deferred):
- `invoice_dao.dart:190` `t.teamMemberId.equals(teamMemberId)` ❌ broken column ref (real column = `assigneeId` потому что generated from YAML field name)
- `invoice_repository_impl.dart` имеет `getInvoicesByTeamMemberId` (parent-derived) вместо `getInvoicesByAssigneeId` (field alias preserved)

## Multi-agent review (Phase 6)

- **Standard reviewer:** ✅ MERGE с conditions (5 post-merge requirements: BUG-012 status update, TASK-017 creation, agent_memory update, re-acceptance behind TASK-017, weight TASK-018 behind both)
- **Adversarial reviewer:** caught DEAL-BREAKER (parens-inside-string-default landmine) + 4 Phase 7 closure items unmet → все resolved в этом PR

**Adversarial-caught issues (resolved):**

1. ✅ Quote-stripping fix для `relation(...)` substring inside string defaults — 2 new negative tests (case 5c, 5d single+double quotes)
2. ✅ BUG-012 status updated Open → Partially Resolved
3. ✅ report.md filled (этот файл)
4. ✅ TASK-017 stub created
5. ✅ Discussion #5 archive получает Patch Record про Path C deviation
6. ✅ t160 marked WIP (`WARNING.md` в root)

**Adversarial-defer-able (out of scope, TASK-017 candidates):**
- Nested parens edge `relation(check=(...), parent=bar)` — outer `[^)]*` truncation
- PascalCase parent value silent fallback `parent=Foo`
- `code_formatter.ts:186` zero unit test coverage (FK alias через class context)
- BUG-010 interaction (`field.name.includes('Map')` — pre-existing landmine, compounds с FK alias)

## Риски / Заметки

- **Master может стать broken AT REST между PR 3 merge и TASK-017 merge.** Anyone клонирующий master в этом окне получит broken DAO compile если попытается `generate-entity` с FK alias. **Mitigation:** TASK-017 как hard immediate next gate — pre-implementation Discussion #6 + multi-agent review.
- **t160 на disk остаётся** с broken DAO. Sandbox блокирует `rm -rf` — User удалит когда сочтёт нужным. Marked `WARNING.md` в root для context warning.
- **Weight TASK-018 НЕ unblocked** этим PR. Hard prerequisites: TASK-017 closed + re-acceptance TASK PASS errors=0 на full FK alias scenario.
- **Pattern history:** Discussion #5 поймал 2 critical gaps в initial plans, Phase 6 multi-agent review поймал 1 DEAL-BREAKER + 4 closure items. Multi-agent review pattern proven valuable — должен continuue для TASK-017 (substitution rewrite — высокий blast radius).

## Time spent

- Phase 1 audit (grep+classify): 30m
- Phase 2 parser + helper: 15m
- Phase 3 unit tests: 30m
- Phase 4 consumer normalization: 60m
- Phase 5 local verify (Path C STOP-gate triggered): 60m
- Phase 6 multi-agent review (Standard + Adversarial): 15m wait + ~10m apply fixes (quote-stripping + 2 negative tests)
- Phase 7 closure: 30m

**Total:** ~3h45m / 16h budget — well within ceiling.

## Статус

Ready for review.

**Next per Discussion #4 + #5 sequence:**
- TASK-017 (DAO substitution rewrite) — pre-implementation Discussion #6 mandatory, multi-agent review до commit
- After TASK-017 merged → re-acceptance new TASK с full FK alias scenario
- After re-acceptance ✅ → weight TASK-018 unblocked
