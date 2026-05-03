# BUG-012: server_yaml_parser игнорирует `relation(parent=X)` directive — FK alias resolution broken

**Статус:** 🟡 Partially Resolved (parser + helper + path/class normalization closed via TASK-016 Path C, 2026-05-03; **method body substitution rewrite deferred to TASK-017** per Discussion #5 STOP-gate #2)

## Resolution evidence (TASK-016 Path C, 2026-05-03)

**Closed:**
- Parser `relation(parent=X)` directive parsing через `fullDefinition` подход
- Helper `snakeToLowerCamelCase` в `text_util.ts` (throw на ill-formed, strict regex)
- Defensive fallback `name.endsWith('Id') ? name.slice(0, -2) : name`
- Side-fix `\brelation\s*\(` regex (anchored detection)
- **Adversarial post-Phase-6 fix:** quote-stripping для skip `relation(...)` substring inside string defaults (DEAL-BREAKER — silent String→FK miscategorization)
- Path context normalization в `relation_generation.ts:19` (`toSnakeCase` → `terminal_set_table.dart`)
- Comparison context audit fix в 2 sites (removed `.toLowerCase()` smells)
- 158 tests passing (122 baseline + 36 new)

**Verify evidence (t160 partial PASS):**
- ✅ `invoice_table.dart` import correct snake_case
- ✅ Pascal class refs correct
- ⚠ Method body parent-derived names (deferred TASK-017)

**Что НЕ closed (TASK-017 scope):** `relation_patcher.ts:78-91` ENTITY substitution заменяет field name indiscriminately → broken DAO column refs. Pre-implementation Discussion #6 mandatory. weight TASK-018 blocked до TASK-017.


**Обнаружено:** 2026-05-03 (TASK-012 executor шаг 8 verify FAIL)
**Источник:** TASK-012 executor + Standard/Adversarial multi-agent review
**Критичность:** High (production blocker для weight TASK-018 на CustomerUser migration)

## Симптом

YAML с FK alias (field name НЕ совпадает с parent name):

```yaml
assigneeId: UuidValue?, relation(parent=member, onDelete=SetNull)
```

Generated `<entity>_table.dart` импортирует НЕ ту таблицу:

```dart
import 'assignee_table.dart';   // ❌ должно member_table.dart
TextColumn get assigneeId => text().nullable().references(AssigneeTable, ...); // ❌ MemberTable
```

Каскад: 7 errors на flutter analyze (`uri_does_not_exist` + `undefined_identifier` + downstream `non_abstract_class_inherits_abstract_member`).

## Корневая причина

[`src/features/generation/parsers/server_yaml_parser.ts:106`](../../../src/features/generation/parsers/server_yaml_parser.ts#L106):

```typescript
field.relatedModel = name.replace(/(.*)Id/, '$1');  // strip Id suffix
```

`parseField` loop lines 109-123 покрывает только:
- `default=`
- `defaultPersist=`
- `scope=`

**`parent=` directive вообще НЕ парсится.** Codegen использует strip-Id field name для derivation `relatedModel`, игнорируя YAML declaration.

## Каскад на 5 consumer layers

`relatedModel` используется в:

1. [`generators/relation_generation.ts:19`](../../../src/features/generation/generators/relation_generation.ts#L19) — table import filename derivation
2. [`parsers/formatters/code_formatter.ts:186`](../../../src/features/generation/parsers/formatters/code_formatter.ts#L186) — class reference (`AssigneeTable` vs `MemberTable`)
3. [`generators/relation_patcher.ts:84`](../../../src/features/generation/generators/relation_patcher.ts#L84) — one-to-many target derivation
4. [`generators/orchestrator_patcher.ts:300`](../../../src/features/generation/generators/orchestrator_patcher.ts#L300) — junction registration
5. [`parsers/relation-analyzer.ts:39-42`](../../../src/features/generation/parsers/relation-analyzer.ts#L39-L42) — M2M detection

Любой fix в parser требует regression tests на каждый из 5 layers.

## Production impact на weight TASK-018

Verified scan all 51 weight YAMLs (2026-05-03):

**Confirmed FK alias landmine:** `customer_user.spy.yaml`:
```yaml
defaultTerminalSetId: UuidValue?, relation(parent=terminal_set, onDelete=SetNull)
```
Strip-Id = `defaultTerminalSet`, parent = `terminal_set` — НЕ match даже после snake↔camel.

**Edge cases (snake↔camel pseudo-match):** `terminalSetId/cargoTypeId/customFieldId/...` — strip-Id matches parent после camelCase conversion, **зависит от того делает ли codegen эту conversion при file resolution**. Текущий код берёт camelCase strip и идёт прямо в `${field.relatedModel}_table.dart` (relation_generation.ts:19) — на Linux/Mac case-sensitive это landmine, на Windows работает случайно.

**Минимум 1 confirmed broken entity** (CustomerUser) → weight TASK-018 не unblocked до закрытия BUG-012.

## Почему TASK-011/013/014 acceptance не поймали

- TASK-011: Configuration baseline без relations
- TASK-013: junction detection (структурный check, без runtime FK validation)
- TASK-014: t157 ProjectMember junction с `projectId/memberId` — coincidental match field=parent

TASK-012 — first acceptance test на realistic FK relations с разными именами полей.

## Acceptance criteria для fix

- [ ] `parseField` loop парсит `parent=X` directive
- [ ] Если `parent=` указан → `relatedModel` = parent (snake_case → camelCase conversion)
- [ ] Если `parent=` не указан → fallback на strip-Id behavior (backwards compat)
- [ ] Unit-тесты на server_yaml_parser для:
  - field name = `<entity>Id`, parent = `<entity>` (existing convention)
  - field name = `<alias>Id`, parent = `<other_entity>` (FK alias case)
  - field name = `<entity>Id`, parent = `<entity_in_snake_case>` (snake↔camel mismatch)
  - field name без `Id` suffix + parent= (если допустимо)
- [ ] Regression tests на 5 consumer layers — `relatedModel` правильно propagates
- [ ] Verify на todo (with `assigneeId, parent=member`) PASS errors=0
- [ ] Backward compat: existing entity_yaml без `parent=` директивы → identical output

## Estimate

Standard reviewer: 5-10 LOC parser changes, но регрессионные тесты на 5 layers. **Realistic 1-2 days** with edge cases (case conversion, junction handling, M2M detection).
Adversarial reviewer: 2-3 days с полным coverage.

## Связанные

- BUG-007 (relation_patcher misses template без markers) — не дубликат, отдельная проблема markers gap
- BUG-013 (template markers gap на repository_impl + usecases) — extension BUG-007
- TASK-013 ([JunctionDetector](../../src/features/generation/parsers/junction_detector.ts)) — не охватывал FK alias semantics
- weight TASK-018 — **blocked** до BUG-012 closed
