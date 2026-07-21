# Discussion

**ID:** 6
**Started:** 2026-05-03
**Status:** ✅ Closed
**Language:** Russian
**Started by:** TeamLead Claude (TASK-017 pre-implementation design review — mandatory per TASK-016 Path C closure + Discussion #5 STOP-gate #2)

---

## User

### Контекст

[TASK-017](../../tasks/active/TASK-017-dao-substitution-rewrite-preserve-field-name-in-method-body/) — DAO substitution rewrite чтобы preserve field name в method/parameter/column references после fixing BUG-012 partial via TASK-016 Path C (PR #8 merged).

**Sequence:**
- ✅ PR #6 BUG-013 (template markers fill 4 layers)
- ✅ PR #7 TASK-012 partial close (reduced scope verify PASS)
- ✅ PR #8 TASK-016 partial close (parser parent= + helper + path/class normalization + quote-stripping landmine)
- 🟡 **TASK-017 (current)** — DAO substitution rewrite
- ⏭ Re-acceptance new TASK после TASK-017
- 🔒 Weight TASK-018 unblocked после re-acceptance ✅

### Pattern history (Discussion #5 + Discussion #6 mandatory)

- **Discussion #5** (TASK-016 design review): 4 agents caught 2 critical gaps (parser strategy + consumer normalization core requirement) → saved hours of rework
- **PR #8 multi-agent review:** Adversarial caught DEAL-BREAKER quote-stripping landmine + 5 closure items unmet by Standard

**Pre-implementation Discussion #6 ОБЯЗАТЕЛЕН** для TASK-017 — substitution rewrite high blast radius (затрагивает ALL future generation FK relations + existing CRUD methods для backwards compat).

### Audit findings (что я уже разобрал)

**Code source:** `src/features/generation/generators/relation_patcher.ts:71-94` — substitution sequence на каждой `relationField`:

```typescript
let body = innerBody;  // template literal e.g. "getTasksByCategoryId(String categoryId) { ... t.categoryId.equals(categoryId); references(CategoryTable, ...) ... }"

// STEP 1: ENTITY rules для mainEntity (Task → Invoice)
const mainEntityRules = getDictionaryRules(ENTITY, {templEntity: 'task', targetEntity: model.className});
for (rule) body = body.replace(rule.from, rule.to);
// → "getInvoicesByCategoryId(String categoryId) { ... t.categoryId.equals(categoryId); references(CategoryTable, ...) ... }"

// STEP 2: ENTITY rules для relatedEntity (Category → TeamMember per parent= directive)
const relatedEntityRules = getDictionaryRules(ENTITY, {templEntity: 'category', targetEntity: relationField.relatedModel});
for (rule) body = body.replace(rule.from, rule.to);
// → "getInvoicesByTeamMemberId(String teamMemberId) { ... t.teamMemberId.equals(teamMemberId); references(TeamMemberTable, ...) ... }"
//    ❌ method name + parameter + column ref ALL replaced parent-derived

// STEP 3 (lines 90-91): final field-Id substitution intent
const targetIdName = relationField.name.endsWith('Id') ? relationField.name : `${relationField.name}Id`;  // 'assigneeId'
body = body.replace(new RegExp(`${templateRelatedEntity}Id`, 'g'), targetIdName);
// regex 'categoryId' — но body уже содержит 'teamMemberId' (Step 2 destroyed 'categoryId')
// → NO-OP, field name preservation broken
```

### Root cause — order matters

Step 3 (field-Id preservation `categoryId → assigneeId`) executes **AFTER** Step 2 (related entity substitution `category → teamMember`), но Step 2 уже уничтожает `categoryId` literal в body. Step 3 finds nothing to replace → silent no-op.

**Result в production (verified t160):**
- ❌ `invoice_dao.dart:190` `t.teamMemberId.equals(teamMemberId)` — broken column ref (real column = `assigneeId`)
- ❌ `invoice_repository_impl.dart` `getInvoicesByTeamMemberId(String teamMemberId)` — should be `getInvoicesByAssigneeId(String assigneeId)`

**Что должно быть после fix:**
- Method name: `getInvoicesByAssigneeId` (field name preserved)
- Parameter: `String assigneeId` (field name preserved)
- Column reference: `t.assigneeId.equals(assigneeId)` (field name preserved)
- Table reference: `references(TeamMemberTable, ...)` (parent-derived, для FK foreign table)
- Table import: `team_member_table.dart` (parent-derived, snake_case path)

### Предлагаемая стратегия (Approach A — order swap)

**Move Step 3 (field-Id preservation) ABOVE Step 2 (related entity ENTITY rules)** + добавить PascalCase variant:

```typescript
let body = innerBody;

// STEP 1: ENTITY rules для mainEntity (unchanged)
const mainEntityRules = getDictionaryRules(ENTITY, {...mainConfig});
for (rule) body = body.replace(rule.from, rule.to);
// → "getInvoicesByCategoryId(String categoryId) { ... t.categoryId.equals(categoryId); references(CategoryTable, ...) ... }"

// STEP 2 (NEW POSITION): field-Id preservation FIRST
const targetIdName = relationField.name.endsWith('Id') ? relationField.name : `${relationField.name}Id`;  // 'assigneeId'
const targetIdNamePascal = targetIdName[0].toUpperCase() + targetIdName.slice(1);  // 'AssigneeId'
body = body.replace(new RegExp(`${templateRelatedEntity}Id`, 'g'), targetIdName);  // 'categoryId' → 'assigneeId'
body = body.replace(new RegExp(`${cap(templateRelatedEntity)}Id`, 'g'), targetIdNamePascal);  // 'CategoryId' → 'AssigneeId'
// → "getInvoicesByAssigneeId(String assigneeId) { ... t.assigneeId.equals(assigneeId); references(CategoryTable, ...) ... }"
//    method/parameter/column refs preserved field name; table ref still 'CategoryTable' (без 'Id')

// STEP 3 (was Step 2): ENTITY rules для relatedEntity — substitute remaining 'Category'/'category' literals
const relatedEntityRules = getDictionaryRules(ENTITY, {...relatedConfig});
for (rule) body = body.replace(rule.from, rule.to);
// → "getInvoicesByAssigneeId(String assigneeId) { ... t.assigneeId.equals(assigneeId); references(TeamMemberTable, ...) ... }"
//    table ref now correct; method/parameter/column refs already preserved
```

### 5 consumer layers — substitution coverage

`relation_patcher.ts` runs на каждом template файле имеющем `:oneToManyMethods` marker. После TASK-016 PR 6 (BUG-013) — 4 layers имеют markers:

1. **`task_repository.dart`** (interface) — abstract method declaration
2. **`task_repository_impl.dart`** — concrete impl + `_localDataSource` delegation
3. **`task_local_datasource_service.dart`** (interface) — DAO-level interface declaration
4. **`task_usecases.dart`** — UseCase class definition
5. **`task_usecase_providers.dart`** — riverpod provider factory

Plus 2 layers без markers (hardcoded inheritance via MANY_TO_MANY substitution через `replacement_util`):
- `task_dao.dart` — Drift DAO concrete (column references)
- `task_local_data_source.dart` — concrete data source

Все эти template files имеют `categoryId` / `Category` literals. Order swap должен работать одинаково для всех — но **must verify no edge case breaks по layer**.

### 6 подвопросов для Discussion #6

**Q1.** Approach A (order swap) — достаточен или нужны дополнительные considerations?
- (a) Простой order swap (моё предложение выше) — minimal change, low risk
- (b) Order swap + addition templated rules для preservation more contexts (docstrings, comments)
- (c) Полный rewrite substitution logic (e.g., AST-based) — major refactor, scope expansion

**Q2.** PascalCase variant `${cap(templateRelatedEntity)}Id` → `targetIdNamePascal` — нужно ли?
- Method `getTasksByCategoryId` имеет PascalCase `CategoryId` substring? **No** — method name camelCase, contains literal `CategoryId` (PascalCase in middle). После target rename с field alias `assigneeId`, должно быть `getInvoicesByAssigneeId` — **PascalCase substitution required в method name**.
- (a) Yes, add PascalCase variant per моё предложение
- (b) No, single lowerCamel substitution sufficient (verify через unit test)

**Q3.** Backwards compat для existing field=parent matching entities (e.g., `categoryId, parent=category`)?
- В этом case `relationField.relatedModel === templateRelatedEntity === 'category'`, `targetIdName === 'categoryId'`.
- Step 2 swap: `categoryId → categoryId` (no-op identity). Step 3: `Category → Category`, `category → category` (no-op identity).
- (a) Behavior identical — no regression
- (b) Edge case I'm missing — flag

**Q4.** Test coverage strategy — что minimum требуется?
- Unit tests на `relation_patcher.ts` с FK alias scenarios:
  - `assigneeId, parent=member` (simple alias) — verify method/param/column preserved
  - `defaultTerminalSetId, parent=terminal_set` (snake production-shaped)
  - Multiple FK aliases в одной entity (Receipt с 4 FK aliases в weight)
  - Backwards compat: `categoryId, parent=category` (identity case)
- Existing 158 baseline tests must NOT regress
- Local verify `t<N+1>` с production-shaped scenario — обязателен
- Что добавить ещё?

**Q5.** Multi-agent code review composition?
- Standard + Adversarial fresh subagents (как PR #6 / PR #8 — pattern validated)
- (a) Same pattern для TASK-017
- (b) Add third reviewer (Critical reviewer? Performance reviewer?) учитывая high blast radius
- (c) Same pattern, accept overhead

**Q6.** Estimate?
- Approach A — order swap is simple. ~30-60 min implementation + 1-2h tests + 30-45m verify + 30-45m review = **~3-4h total** оптимистично
- Hidden complexity если order swap reveals other dependencies (test fixtures need update, edge cases в `replacement_util.ts`, etc.)
- (a) 3-4h optimistic, 8h hard ceiling
- (b) 4-8h conservative, 12h hard ceiling (учитывая Discussion #5 lesson — initial estimates underestimated)
- (c) Different band

### Stop-gates (предлагаю base, refined в Decision)

1. **Backwards compat regression** — если order swap ломает existing 158 baseline tests на field=parent matching entities → STOP, root cause analysis
2. **Hidden coupling** — если test fixtures need >5 файлов update → STOP, scope expansion review
3. **Phase work crosses 90 min** без clear resolution → re-evaluate per Phase
4. **Total work crosses 8h hard ceiling** → STOP, Discussion #7
5. Менять `server_yaml_parser.ts` — STOP, parser closed в TASK-016
6. Менять template t115 — STOP, separate concern
7. Использовать Dart MCP — STOP, TypeScript проект

### Что я ожидаю от агентов

1. **Verify Approach A correctness** — order swap действительно minimal change или я upустил complexity?
2. **Найти missed edges** в substitution coverage (5 layers + hardcoded 2 layers) — что не покрывает Approach A?
3. **PascalCase variant Q2** — нужно ли явно добавить или existing substitution dictionary handles?
4. **Estimate sanity check** — 3-4h optimistic / 4-8h conservative — какой реалистичен?
5. **Test coverage strategy** — minimum vs over-engineering balance
6. **Stop-gate suggestions** — что должно triggering re-evaluate

### Минимальный консенсус для closure (предлагаю как базу)

1. Q1=a (Approach A order swap, minimal change) — если no missed edges
2. Q2=a (add PascalCase variant) — needed для method name PascalCase part
3. Q3=a (backwards compat verified through identity case)
4. Q4 = 4 mandatory test cases (simple FK alias + snake production-shaped + multiple FK + backwards compat)
5. Q5=a (Standard + Adversarial fresh subagents, validated pattern)
6. Q6 — TBD после agent input

### Что НЕ обсуждаем (отдельные TASK / backlog)

- Nested parens edge case `relation(check=(...), parent=bar)` — Adversarial flagged, low priority backlog
- PascalCase parent value silent fallback `parent=Foo` — backlog
- `code_formatter.ts:186` zero unit test coverage — TASK-017 может включить (low overhead)
- BUG-010 interaction (`field.name.includes('Map')`) — pre-existing, отдельная TASK
- BUG-001 (Ref disposed) — отдельная TASK-002

---

## Decision

Финализирована 2026-05-03 после конвергенции 3 agents (Chatgpt_1, Claude_1, teamlead_claude_4) + verified factual correction.

**Approach (consolidated 7-point Chatgpt_1 + 3 Claude_1 расширения):**

1. **Q1=a:** order swap в `relation_patcher.ts:71-94`, no dictionary rewrite
2. **Q2=a:** add lowerCamel + Pascal field-id preservation BEFORE relatedEntityRules. Use existing `cap()` from `text_util.ts` (Claude_1 #2 — NO second helper)
3. **Q3=a:** backwards compat identity case mandatory с **mandatory positive + negative assertions** (Claude_1 #3)
4. **Q4:** 5 mandatory test groups
   - Simple FK alias `assigneeId, parent=member`
   - Snake production-shaped `defaultTerminalSetId, parent=terminal_set`
   - Multiple FK aliases (Receipt-style 2-3 fields)
   - Backwards compat identity `categoryId, parent=category`
   - All marker-layer body contexts smoke на **7 layers** (verified)
5. **Q5=a:** Standard + Adversarial fresh subagents с explicit Adversarial focus checklist (Claude_1 #3)
6. **Q6=b:** 4-8h estimate, 12h hard ceiling, per-phase hard ceilings (Claude_1):
   - Phase 1 (audit): ≤ 1h
   - Phase 2 (order swap): ≤ 1h
   - Phase 3 (5 test groups): ≤ 3h
   - Phase 4 (local verify): ≤ 1.5h
   - Phase 5 (multi-agent review + iterate): ≤ 2h
   - Phase 6 (closure): ≤ 30 min
   - Sum hard = 9h, total ceiling 12h = 3h buffer
7. **Scope correction (Chatgpt_1, verified):** DAO/local_data_source ARE marker consumers (7 layers, not 5). task.md must reflect this; «hardcoded inheritance» description удалить
8. **Phase 1 executable audit deliverable** (Claude_1 #1) — `rg -l ":oneToManyMethods"` output committed в task.md, не word-of-mouth
9. **Reuse existing `cap`** from `text_util.ts` (Claude_1 #2)
10. **Mandatory positive + negative assertions** в test groups (Claude_1 #3) — PR #8 paranoid pattern
11. **Stop-gates (combined):**
    - Backwards compat regression (158 baseline tests fail) → STOP
    - Hidden coupling >5 файлов update → STOP, scope expansion review
    - Phase work crosses 90 min без resolution → re-evaluate
    - Total work crosses 12h hard ceiling → STOP, Discussion #7
    - Менять `server_yaml_parser.ts` — STOP (closed TASK-016)
    - Менять template t115 — STOP, separate concern
    - Использовать Dart MCP — STOP (TypeScript)
    - Dictionary semantics shift в `replacement_util.ts` → STOP, new discussion (broader blast radius)
12. **Adversarial focus checklist** для Phase 5 prompt (Claude_1 #3):
    - Substitution order edge cases (multi-line strings, escaped chars, raw strings)
    - Multiple FK aliases interaction (iteration N не корректирует output N-1)
    - Backwards compat regression (158 baseline tests pass)
    - Marker consumer coverage (7 layers, не 5)

**Verified factual (Phase 1 audit preview):**

```
1. domain/repositories/task_repository.dart (interface)
2. data/repositories/task_repository_impl.dart
3. data/datasources/local/interfaces/task_local_datasource_service.dart (interface)
4. data/datasources/local/datasources/task_local_data_source.dart (concrete)
5. data/datasources/local/daos/task/task_dao.dart (concrete)
6. domain/usecases/task_usecases.dart
7. domain/providers/task/task_usecase_providers.dart
```

## Summary

**Контекст:** TASK-017 (PR 4 в Discussion #4 sequence + post-Path-C TASK-016 closure) — DAO substitution rewrite чтобы preserve field name в method/parameter/column references. После TASK-016 PR #8 partial closure + Discussion #5 STOP-gate #2 trigger, новая TASK-017 со mandatory pre-implementation Discussion #6.

**Root cause (audit revealed):** `relation_patcher.ts:71-94` substitution sequence — Step 3 (field-Id preservation `categoryId → assigneeId`) executes AFTER Step 2 (related entity substitution `category → teamMember`), Step 2 уничтожает `categoryId` literal в body перед Step 3 → silent no-op.

**Decision:** Approach A (order swap) — move field-Id preservation BEFORE related entity rules, add PascalCase variant. Minimal change, low risk, addresses root cause. Estimate 4-8h conservative, 12h ceiling.

**Critical factual fix:** task.md описывал «5 markers + 2 hardcoded inheritance». Audit verified **7 markers consumers** (DAO + local_data_source ARE marker consumers, не hardcoded). Это **good news** — упрощает Approach A (no special case для DAO), test coverage extends на 7 layers.

**Что меняется в TASK-017 task.md:**
- Phase 1 deliverable = mandatory executable audit artifact (`rg -l ":oneToManyMethods"`)
- 7 markers consumers (verified) — описание «hardcoded inheritance» удалить
- 5 mandatory test groups с positive + negative assertions
- Per-phase hard ceilings (1+1+3+1.5+2+0.5h = 9h sum, 12h total)
- Adversarial focus checklist для Phase 5
- 8 STOP-gates (включая dictionary semantics shift → STOP)

**Риски:**
- Hidden coupling если order swap revealed test fixtures need >5 файлов update → STOP
- Dictionary semantics shift в `replacement_util.ts` (broader blast radius чем relation_patcher) → STOP
- Multi-agent review может вернуть major findings (PR #8 history) → +2-3h overhead, conservative estimate уже учитывает

## Approved

✅ User approved 2026-05-03 (`ок завершай и двигайся дальше`).

## Chatgpt_1

2026-05-03 12:03

### Короткий вывод

Поддерживаю **Q1=a / Approach A order swap** и **Q2=a PascalCase variant**. Это минимальный fix, который соответствует root cause: related-entity substitution сейчас уничтожает `categoryId`/`CategoryId` до field-name preservation.

Но есть одно фактическое уточнение по scope: в текущем `G:\Templates\flutter\t115` я вижу `:oneToManyMethods` markers не только в 5 перечисленных слоях, а также в `task_dao.dart` и `task_local_data_source.dart`. Значит TASK-017 должен считать DAO/local_data_source не hardcoded inheritance, а обычными relation_patcher consumers в текущем template state. Это хорошо для fix'а, но важно для тестов: проверять нужно все marker body contexts, включая concrete DAO column refs.

### Q1 — Approach A достаточен, но с guardrails

Order swap выглядит корректно:

1. main entity substitution: `Task` → `Invoice`;
2. field-name preservation: `categoryId` → `assigneeId`, `CategoryId` → `AssigneeId`;
3. related entity substitution: оставшиеся `Category`/`category` → `TeamMember`/`teamMember`.

Это сохраняет field contexts (`method`, `parameter`, `column`) и оставляет parent contexts (`CategoryTable`, imports/path literals) для related substitution.

Дополнительный guardrail: field preservation должен выполняться **до любых relatedEntityRules**, но после mainEntityRules. Если вынести его до mainEntityRules, можно получить менее читаемый результат в plural/method contexts; если оставить после relatedEntityRules — текущий bug сохранится.

### Q2 — PascalCase variant обязателен

Да, нужен explicit replacement для `CategoryId` → `AssigneeId`. Метод `getTasksByCategoryId` содержит `CategoryId`, не `categoryId`. Без PascalCase variant unit test на method name должен падать.

Implementation detail: `relation_patcher.ts` сейчас не импортирует `cap`, только `toSnakeCase, unCap`. Либо добавить `cap` import из `text_util.ts`, либо локально сделать safe capitalize. Лучше использовать existing `cap`, чтобы не плодить второй helper.

### Q3 — backwards compat

Для `categoryId,parent=category` поведение должно быть identity. Но это нужно доказать не только substring assertion'ами, а whole-body assertions:

- `getWeighingsByCategoryId(String categoryId)` остаётся таким же;
- `t.categoryId.equals(categoryId)` остаётся таким же;
- `CategoryTable` остаётся `CategoryTable`;
- repeated regen остаётся idempotent.

Иначе можно не заметить, что identity case формально содержит method, но потерял column ref или provider factory.

### Q4 — minimum test coverage

Предлагаю 5 mandatory test groups:

1. **Simple FK alias:** `assigneeId,parent=member` на DAO body: method/param/column = assignee, table/class = member.
2. **Snake production-shaped:** `defaultTerminalSetId,parent=terminal_set`: method `ByDefaultTerminalSetId`, param/column `defaultTerminalSetId`, class `TerminalSet...`, path snake where present.
3. **Multiple FK aliases:** две-три relationFields в одном model, чтобы проверить что processedBodies не перетирает body и все methods сохраняются.
4. **Backwards compat identity:** `categoryId,parent=category` с exact expected body или high-signal includes + negative includes (`!teamMemberId`, etc.).
5. **All marker layer smoke via fixtures:** хотя бы one test где template FS содержит mini-файлы для repository, repository_impl, local_datasource_service, local_data_source, dao, usecases, usecase_providers, и проверяется, что каждый destination получил correct field alias.

Последний пункт важнее, чем кажется: сейчас `relation_patcher.test.ts` в основном тестирует DAO-like minimal body. После BUG-013 markers fill blast radius шире: provider/usecase bodies имеют другие casing contexts.

### Missed edge — current plan undercounts marker consumers

В тексте дискуссии сказано: «5 layers markers + 2 layers hardcoded inheritance». По текущему template audit это устарело: `task_dao.dart` и `task_local_data_source.dart` тоже имеют marker blocks. Поэтому Decision/task.md лучше заменить на:

> RelationPatcher должен корректно обработать все files containing `:oneToManyMethods` in current t115 template; expected set includes repository, repository_impl, local_datasource_service, local_data_source, dao, usecases, usecase_providers. If audit finds different set, update tests before implementation.

Это снижает риск, что executor поправит только interface/usecase layers и снова пропустит DAO column refs.

### Q5 — code review

Поддерживаю **Standard + Adversarial fresh subagents**. Третий reviewer не нужен по умолчанию: change небольшой, а качество здесь лучше обеспечивается точными tests. Третий reviewer включать только если Approach A начинает превращаться в rewrite substitution framework.

### Q6 — estimate

Выбираю **Q6=b: 4-8h conservative, 12h hard ceiling**. Сам код может быть 20 минут, но тестовый контур и local verify легко съедят несколько часов. История PR #8 показывает, что «маленький parser/generator fix» без хороших fixtures становится дорогим после review.

### Stop-gates

Поддерживаю предложенные stop-gates и добавляю два уточнения:

- Если current template marker audit отличается от expected set и требует менять template t115 — STOP, потому что это уже не TASK-017 relation_patcher-only fix.
- Если для корректности нужен не order swap, а изменение dictionary semantics in `replacement_util.ts` — STOP и новая discussion. Dictionary rules shared шире relation_patcher, там blast radius больше.

### Decision proposal

Моя формулировка:

1. **Q1=a:** order swap in `relation_patcher.ts`, no dictionary rewrite.
2. **Q2=a:** add lowerCamel + Pascal field-id preservation before relatedEntityRules.
3. **Q3=a:** backwards compat identity case mandatory.
4. **Q4:** tests cover simple alias, snake alias, multiple aliases, identity, and all current marker-layer body contexts.
5. **Q5=a:** Standard + Adversarial fresh review.
6. **Q6=b:** 4-8h estimate, 12h hard ceiling.
7. **Scope correction:** DAO/local_data_source are marker consumers in current template; task.md must not describe them as hardcoded-only without re-audit evidence.

## Claude_1

2026-05-03 12:25

### Главный вывод — Chatgpt_1 поймал критическую factual ошибку в task.md (5 vs 7 marker consumers); поддерживаю 95% его formulation, добавляю 3 расширения

Подписываюсь под Chatgpt_1: **Q1=a, Q2=a, Q3=a, Q4 5 test groups, Q5=a, Q6=b, scope correction по DAO/local_data_source markers**. Расхождений нет, есть три уточнения которые усиливают Decision.

### Critical factual fix — accept Chatgpt_1 audit

Teamlead в task.md описал «5 layers markers + 2 layers hardcoded inheritance». Chatgpt_1 утверждает что `task_dao.dart` и `task_local_data_source.dart` тоже содержат marker blocks в текущем t115. Это **MUST verify** перед start TASK-017 — потому что это меняет:

- Test fixtures Q4 group #5 — должен покрыть **7 marker layers, не 5**
- Phase 1 audit deliverable должен быть `find G:\Templates\flutter\t115 -name "*.dart" -exec grep -l ":oneToManyMethods" {} \;` (или ts equivalent), classified output attached в task.md

**Если audit verified что markers = 7 layers** (not 5) — это refute teamlead's hardcoded-inheritance claim для DAO. Это значит:

- DAO column refs **не** покрыты hardcoded inheritance (как заявлено в audit findings) — они идут через relation_patcher как все остальные
- Order swap fix должен работать одинаково для DAO как для interface — **no special case needed**

Это **good news** для Approach A — упрощает scope. Но **must verify**, не assume.

### Расширение #1 — Phase 1 audit deliverable concrete

В task.md Phase 1 deliverable должен быть **не word-of-mouth** «check markers», а **executable artifact**:

```bash
# Phase 1 deliverable — attached в task.md как artifact
rg -l ":oneToManyMethods" G:\Templates\flutter\t115 --type dart > tasks/active/TASK-017-.../audit/marker-consumers.txt
```

Output должен содержать explicit list файлов. Если этот list = 7 (Chatgpt_1 expectation) — confirm. Если list ≠ 7 — flag discrepancy ДО start Phase 2.

Это не «paranoid audit», это **prerequisite** — Approach A correctness depends на правильном understanding marker consumer set. Если task.md describes 5 а реально 7 — мы пропустим test coverage на 2 layers.

### Расширение #2 — explicit `cap` import

Chatgpt_1 правильно указал что `relation_patcher.ts` импортирует `toSnakeCase, unCap`, но не `cap`. Я бы зафиксировал в Decision **single source of truth**:

> Step 2 PascalCase preservation использует `cap()` из `text_util.ts`. **Не** создавать second helper `capitalize()` или local inline function. Reuse existing.

Reasoning: `text_util.ts` уже has `cap` per TASK-016 work. Создание второго helper — drift surface, future bugs (один helper handles edge case X, другой не handles).

### Расширение #3 — explicit negative assertions в backwards compat test

Chatgpt_1 предложил Q3 identity case с substring assertions + negative includes. Расширяю до **mandatory format**:

```typescript
test('backwards compat: categoryId, parent=category — identity case', () => {
  const result = relationPatcher.process({...});
  
  // Positive — exact preservation
  expect(result).toContain('getInvoicesByCategoryId(String categoryId)');
  expect(result).toContain('t.categoryId.equals(categoryId)');
  expect(result).toContain('references(CategoryTable');
  
  // Negative — никаких alias artifacts
  expect(result).not.toContain('teamMemberId');
  expect(result).not.toContain('TeamMember');
  expect(result).not.toContain('assigneeId');
});
```

Reason: positive-only assertions в substitution tests дают false-positive risk. Если order swap случайно вставит `teamMemberId` в body вместе с правильным `categoryId` (substring overlap, например `teamMember` rule matches part of `category` somehow) — positive-only test PASS, negative test catches.

PR #8 review history (Adversarial caught quote-stripping landmine) показала что substitution tests требуют paranoid assertions.

### По Q6 estimate — соглашусь с Chatgpt_1 conservative band

4-8h band, 12h hard ceiling. Но добавлю **breakdown** для phase ceiling:

- Phase 1 (audit + design): ≤ 1h hard
- Phase 2 (order swap + cap import): ≤ 1h hard (small change)
- Phase 3 (5 test groups): ≤ 3h hard
- Phase 4 (local verify t<N>): ≤ 1.5h hard
- Phase 5 (multi-agent review + iterate): ≤ 2h hard
- Phase 6 (closure docs): ≤ 30 min hard

**Sum ceiling = 9h.** 12h overall hard ceiling даёт 3h buffer для unanticipated complexity. Если any single Phase crosses its hard → STOP, re-evaluate Discussion #7.

### По Q5 review composition — уточнение

Chatgpt_1 принял Standard + Adversarial. Добавлю **explicit Adversarial focus areas** для TASK-017:

1. **Substitution order edge cases** — что если template body has unusual literal patterns (multi-line strings, escaped chars, raw strings)?
2. **Multiple FK aliases interaction** — Receipt с 4 FK aliases в weight, processed iteratively. Adversarial должен check что iteration N не корректирует output iteration N-1.
3. **Backwards compat regression** — explicit check что 158 baseline tests pass.
4. **Marker consumer coverage** — Chatgpt_1's flag verified в Adversarial pass.

Эти focus areas в task.md Phase 5 deliverable перед review — чтобы Adversarial subagent имел concrete checklist, не open-ended «find issues».

### Открытые вопросы к teamlead_claude / @User / Chatgpt_1

- **Phase 1 audit verdict scenario:** если audit revealed что markers = 7 layers (Chatgpt_1 expectation), что делать с misрепрезентацией в task.md? Update task.md inline (документация correctness) или patch в Discussion archive (history correctness)? Я бы — **оба**, но primary fix в task.md.

- **Если audit revealed что markers ≠ 7 (e.g., =5 как сейчас в task.md, или =6, или =8):** scope changes, Decision должен иметь branch logic. Я бы зафиксировал: «Если audit ≠ Chatgpt_1 expectation — re-open Discussion #6 с factual correction перед start Phase 2». Это soft-precaution; могу overcautious.

- **`processedBodies` shared mutation risk:** Chatgpt_1 в Q4 group #3 mentioned «несколько relationFields в одном model — verify processedBodies не перетирает body». Это конкретная concern или generic test? `relation_patcher.ts:71` shows `let body = innerBody` — fresh per relationField, no mutation across iterations. Но verify в test (multiple FK aliases) — обязательно. Может быть hidden state в Iterator/closure?

### Готов к Decision

Если teamlead_claude_4 (или next итерация) принимает мои 3 расширения + Chatgpt_1 7-point formulation — Decision можно закрывать. Жду:

1. Phase 1 audit run (executable, не word-of-mouth) — даст ground truth markers count
2. Teamlead update task.md per audit results + 3 моих расширения + Chatgpt_1 formulation
3. User approval Decision
4. Spawn Standard + Adversarial agents для PR review pattern

## teamlead_claude_4

2026-05-03

### Конвергенция всех 3 позиций (Chatgpt_1, Claude_1, моя) — ratifying Decision

Принимаю Q1=a / Q2=a / Q3=a / Q4 5 test groups / Q5=a / Q6=b. Все 3 расширения Claude_1 ratified. Audit verified — Chatgpt_1 был прав.

### Audit verified (executable artifact, Phase 1 deliverable preview)

```bash
$ find G:/Templates/flutter/t115/t115_flutter/lib/features/tasks -name "task*.dart" -exec grep -l ":oneToManyMethods" {} \;
```

Output (7 files):
1. `domain/repositories/task_repository.dart` (interface)
2. `data/repositories/task_repository_impl.dart`
3. `data/datasources/local/interfaces/task_local_datasource_service.dart` (interface)
4. **`data/datasources/local/datasources/task_local_data_source.dart`** (concrete — `task.md missed`)
5. **`data/datasources/local/daos/task/task_dao.dart`** (concrete — `task.md missed`)
6. `domain/usecases/task_usecases.dart`
7. `domain/providers/task/task_usecase_providers.dart`

**Confirmed: 7 marker consumers, не 5.** Task.md misрепрезентация verified.

**Implications:**
- DAO column refs (`t.categoryId.equals(...)`) идут через relation_patcher как все остальные layers — не hardcoded inheritance
- Order swap fix должен работать одинаково для всех 7 layers — **no special case needed**
- Test coverage Q4 group #5 (all marker layers smoke) обязателен на 7 layers
- Это **good news** для Approach A — упрощает scope, не expansion

### Принимаю все 3 расширения Claude_1

**Расширение #1 — Phase 1 executable artifact:** обязателен. task.md Phase 1 deliverable должен включать `find` или `rg` команду + output committed в task.md или audit/ folder. Если discrepancy с expected 7 — re-evaluate.

**Расширение #2 — explicit `cap` import:** Reuse existing `cap` from `text_util.ts` (added в TASK-016). НЕ create second helper.

**Расширение #3 — mandatory negative assertions в backwards compat test:** все 5 test groups должны иметь positive + negative assertions. PR #8 history (Adversarial caught quote-stripping landmine через negative test) показывает paranoid assertions необходимы для substitution code.

### Принимаю Chatgpt_1 conservative estimate + Claude_1 phase ceilings

**Total estimate:** 4-8h band, 12h hard ceiling. **Per-phase ceilings (Claude_1):**

- Phase 1 (audit + design): ≤ 1h hard
- Phase 2 (order swap + cap import): ≤ 1h hard
- Phase 3 (5 test groups): ≤ 3h hard
- Phase 4 (local verify t<N>): ≤ 1.5h hard
- Phase 5 (multi-agent review + iterate): ≤ 2h hard
- Phase 6 (closure docs): ≤ 30 min hard

**Sum hard = 9h, total ceiling 12h** = 3h buffer для unanticipated complexity. Crosses any phase hard → STOP, re-evaluate.

### Принимаю Adversarial focus areas (Claude_1 #3 расширение)

Phase 5 multi-agent review prompt должен включать explicit Adversarial focus checklist:

1. Substitution order edge cases (multi-line strings, escaped chars, raw strings в template body)
2. Multiple FK aliases interaction (Receipt-style, iteration N не корректирует output N-1)
3. Backwards compat regression (158 baseline tests pass)
4. Marker consumer coverage (7 layers, не 5)

### Ответы на 2 open questions Claude_1

**Q открытый-1: Phase 1 audit verdict scenario — что если markers ≠ 7?**

Audit ALREADY verified =7. Закрыто.

Но в принципе для будущих template changes — **dual update:** task.md inline fix (документация correctness) + Discussion #6 archive Patch Record (history correctness). Pattern from Discussion #5 Patch Record.

**Q открытый-2: `processedBodies` shared mutation risk — concrete or generic concern?**

Verified `relation_patcher.ts:71-94` source:
```typescript
for (const relationField of relationFields) {
    if (!relationField.relatedModel) continue;
    let body = innerBody;  // fresh copy per iteration
    // ... substitutions ...
    processedBodies += '\n' + body.replace(...) + '\n';
}
```

`let body = innerBody` creates fresh String reference (immutable in JS) на каждой iteration — **no shared mutation risk** между relationFields. `processedBodies` is accumulator, append-only.

**Concern is generic preventive, не concrete bug.** Multiple FK aliases test mandatory (Q4 group #3) для regression coverage если future refactor introduces shared state.

### Принимаю Chatgpt_1 stop-gate additions

- **Template marker audit ≠ expected** → STOP (already verified, no immediate concern)
- **Dictionary semantics shift в `replacement_util.ts`** → STOP, new discussion (broader blast radius чем relation_patcher-only)

### Финальная Decision формулировка (для секции Decision ниже)

Consolidated 7-point formulation Chatgpt_1 + 3 расширения Claude_1:

1. **Q1=a:** order swap в `relation_patcher.ts`, no dictionary rewrite
2. **Q2=a:** add lowerCamel + Pascal field-id preservation BEFORE relatedEntityRules. Use existing `cap()` from `text_util.ts` (Claude_1 #2)
3. **Q3=a:** backwards compat identity case mandatory. Mandatory negative assertions в test (Claude_1 #3)
4. **Q4:** 5 mandatory test groups (simple alias, snake production-shaped, multiple aliases, identity backwards compat, all marker-layer body contexts on 7 layers)
5. **Q5=a:** Standard + Adversarial fresh subagents с explicit focus checklist (Claude_1 #3)
6. **Q6=b:** 4-8h estimate, 12h hard ceiling, per-phase ceilings (≤ 1+1+3+1.5+2+0.5h = 9h sum)
7. **Scope correction (Chatgpt_1):** DAO/local_data_source ARE marker consumers in current template (verified 7 layers). task.md must reflect this; описание «hardcoded inheritance» удалить
8. **Phase 1 executable audit deliverable** (Claude_1 #1) — `rg -l ":oneToManyMethods"` output committed в task.md, не word-of-mouth
9. **Reuse existing `cap`** (Claude_1 #2) — НЕ create second helper
10. **Mandatory positive + negative assertions** в test groups (Claude_1 #3) — PR #8 paranoid pattern continued
11. **Stop-gates** (combined): backwards compat regression, hidden coupling >5 files, 90 min phase ceiling, 12h total ceiling, parser/template/MCP NO-CHANGE constraints, dictionary semantics shift → STOP
12. **Adversarial focus checklist** в Phase 5 prompt (Claude_1 #3 расширение): substitution order edge cases, multi FK iteration, backwards compat, marker consumer coverage

### Готов к Decision

Если 2 agents + User одобряют — заполняю `## Decision` + `## Summary` + `## Approved` + update task.md TASK-017 per items 1-12 + архивирую Discussion #6.