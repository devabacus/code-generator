# TASK-026: Bug 1 — entityType const snake_case casing fix

> Часть пакета 5 фиксов из TASK-019 weight ревью (Сессия 2). Порядок: 4 → **этот второй** → 2→3→5.
> Tracking origin: [weight TASK-021 handoff](../../../../../Flutter/serverpod/weight/ai/tasks/active/TASK-021-generator-root-followup/task.md) → Bug 1.
> Stack-lock invariant (Discussion #11) applies.

## Ветка

`feature/TASK-026-bug-1-entitytype-snake-case`

## Цель

Для multi-word сущностей (`CargoType`, `WeighingPhoto`, `TerminalSet`, `CorrectionButton`, `CustomField`, `TerminalDevice`, `WeighingCorrection`) константа `_<entity>EntityType` в `*_repository_impl.dart` + `*_event_adapter.dart` должна генерироваться в **snake_case** (`'cargo_type'`), а не **camelCase** (`'cargoType'`).

**Корень бага** (verified чтением [src/features/generation/replacement/replacement_util.ts:39-49](../../../../src/features/generation/replacement/replacement_util.ts#L39-L49)):

```ts
return [
    { from: baseForms.Ds, to: newForms.Ds },
    { from: baseForms.ds, to: newForms.ds },
    { from: baseForms.D, to: newForms.D },
    // snake_case rule только для path/file context:
    { from: `${baseForms.d}(?=_|/|\\.dart\\b)`, to: newForms.dSnake },
    { from: baseForms.d, to: newForms.d },  // ← camelCase rule подхватывает 'category' в кавычках
];
```

В шаблонах:

- [category_repository_impl.dart:23](../../../../../Templates/flutter/simplified/simplified_flutter/lib/features/tasks/data/repositories/category_repository_impl.dart) — `const String _categoryEntityType = 'category';`
- [category_event_adapter.dart:5](../../../../../Templates/flutter/simplified/simplified_flutter/lib/features/tasks/data/adapters/category/category_event_adapter.dart) — `const String _categoryEntityType = 'category';`

Для template entity `category` literal `'category'` имеет за собой `'` (одинарную кавычку) — НЕ `_` / `/` / `.dart` — поэтому snake-rule НЕ срабатывает, применяется camelCase d-rule → `'cargoType'`. А `orchestrator_patcher.ts` использует `toSnakeCase(unCap(...))` для registration → `'cargo_type'`. **Mismatch → sync_core при flush/pull не находит bundle → push висит, delta-pull не срабатывает → 7 multi-word сущностей weight НЕ синхронизировались молча.**

**Фикс:** расширить lookahead snake-rule на quote-boundary:

```ts
{ from: `${baseForms.d}(?=_|/|\\.dart\\b|'|")`, to: newForms.dSnake },
```

Это безопасно: `'category'` и `"category"` всегда snake-context (entityType strings). Identifier `categoryTable` или `category.id` — следующий символ `T`/`.id`/etc. (не quote), не задеваются.

## Не-цели

- НЕ trogать orchestrator_patcher.ts — он уже корректно делает snake_case для registration (это эталон).
- НЕ менять шаблон template'ов (literal `'category'` в коде шаблона остаётся как есть — фикс через replacement rule, не через token).
- НЕ trogать t115 шаблон (frozen).
- НЕ trogать MANY_TO_MANY rules для junction (там literal `'task_tag_map'` уже snake, проблема не возникает — но симметрично расширить для consistency).
- НЕ trogать Dictionary structure / signature.

## Scope

**Разрешено редактировать:**

- `src/features/generation/replacement/replacement_util.ts` — расширить lookahead в ENTITY snake-rule (и симметрично в MANY_TO_MANY)
- `src/test/replacement/` — добавить test case для quote-boundary
- `src/test/generators/` — golden test на сгенерированной сущности

**Запрещено:**

- Шаблоны simplified `*_repository_impl.dart` / `*_event_adapter.dart` — фикс на стороне replacement, не template
- Любые другие правила в `replacement_util.ts` (только snake-rule lookahead'ы)
- t115 шаблон / orchestrator_patcher / generation_service

## Критерии приёмки

- [ ] `replacement_util.ts` ENTITY snake-rule расширен lookahead: `(?=_|/|\\.dart\\b|'|")` (либо escape `'` если regex требует).
- [ ] MANY_TO_MANY snake-rule (entity1/entity2) — симметрично расширен.
- [ ] Unit test в `src/test/replacement/entity_snake_quote_boundary_test.ts`:
  - input: `const x = 'category';` + target `cargoType`
  - expected: `const x = 'cargo_type';`
  - дополнительно: `categoryTable` → `cargoTypeTable` (camelCase rule не сломан)
  - дополнительно: `category.id` → `cargoType.id` (identifier context preserved)
  - regression: single-word target `Member` → `'category'` → `'member'` (snake=camel для single-word)
- [ ] `npm run compile` clean.
- [ ] mocha workaround — все passing (baseline 163 + новый).
- [ ] `npm run lint` clean.
- [ ] `codegen verify --name t181 --human` PASS, цитировать `errors=N, warnings=M`.
- [ ] На t181 прогнать `generate-entity` для multi-word сущности (например `CargoType`), затем:
  - `grep "_cargoTypeEntityType" repository_impl + event_adapter` → литерал в кавычках = `'cargo_type'`
  - сравнить с orchestrator_patcher registration в `sync_orchestrator_provider.dart` — entityType key = `'cargo_type'`
  - **strings совпадают** (это сам критерий устранения бага)
- [ ] `report.md` с реальным CLI-выводом + grep'ами.

## План работы

1. [ ] Прочитать `CLAUDE.md`, `AGENTS.md`, agent_memory, [handoff TASK-021](../../../../../Flutter/serverpod/weight/ai/tasks/active/TASK-021-generator-root-followup/task.md) → Bug 1, [replacement_util.ts](../../../../src/features/generation/replacement/replacement_util.ts), [orchestrator_patcher.ts](../../../../src/features/generation/generators/orchestrator_patcher.ts) (для понимания эталона snake_case).
2. [ ] Locate ENTITY snake-rule в [replacement_util.ts:47](../../../../src/features/generation/replacement/replacement_util.ts#L47).
3. [ ] Расширить lookahead: добавить `'` и `"` quote-boundary к существующему `(?=_|/|\\.dart\\b)`.
4. [ ] Аналогично для MANY_TO_MANY snake-rule в [replacement_util.ts:105/112](../../../../src/features/generation/replacement/replacement_util.ts#L105) (для consistency с junction'ами).
5. [ ] Создать `src/test/replacement/entity_snake_quote_boundary_test.ts`:
   - Test 1: `'category'` + target `cargoType` → `'cargo_type'`
   - Test 2: `"category"` + target `cargoType` → `"cargo_type"` (double quote)
   - Test 3: `categoryTable` → `cargoTypeTable` (identifier context — НЕ изменён на snake)
   - Test 4: `category.id` → `cargoType.id` (.field context)
   - Test 5: regression — single-word target `Member` (`category` → `member`) — literal `'category'` → `'member'` (correct, snake = camel для single-word)
6. [ ] `npm run compile` clean.
7. [ ] mocha workaround — passing.
8. [ ] `npm run lint` clean.
9. [ ] **STOP-gate:** перед verify — show diff replacement_util.ts user'у.
10. [ ] `codegen create-project --name t181 --human`.
11. [ ] Подготовить `<test_multiword.spy.yaml>` для multi-word сущности (например `CargoType` с полями id/userId/customerId/isDeleted/createdAt/lastModified + name + парный `*_sync_event.spy.yaml`).
12. [ ] `codegen generate-entity --yaml <yaml> --feature-path ... --workspace G:/Projects/Flutter/serverpod/t181 --template simplified --human`.
13. [ ] Grep на t181:
    ```bash
    grep -E "_cargoTypeEntityType\s*=\s*'[^']+'" t181/.../repository_impl + .../event_adapter
    grep -E "entityType.*'cargo_type'" t181/.../sync_orchestrator_provider.dart
    ```
    Strings совпадают = `'cargo_type'` в обоих местах.
14. [ ] `codegen verify --name t181 --human` PASS.
15. [ ] **Multi-agent review (2 ревьюера)** до commit'а.
16. [ ] `report.md` с CLI-выводом + grep evidence.

## STOP-gates

- [ ] **Перед verify** (шаг 9-10) — show diff user'у (1 файл, ~2 строки).
- [ ] **Перед commit** (шаг 15) — review результат показан user'у.

**Destructive ops:** ожидаемо отсутствуют.

## План тестирования

### Unit (обязательно)

`src/test/replacement/entity_snake_quote_boundary_test.ts` — 5 кейсов выше. Покрытие: quote-context (`'`/`"`), identifier-context (camelCase preserved), regression на single-word.

Также **расширить existing test-suite** [src/test/replacement/replacement_util.test.ts](../../../../src/test/replacement/) (если есть) — добавить assertion на новый lookahead pattern.

### Verify (обязательно, DoD-гейт)

```bash
node out/adapters/cli/index.js create-project --name t181 --human
node out/adapters/cli/index.js generate-entity --yaml <multiword.spy.yaml> --feature-path ... --workspace G:/Projects/Flutter/serverpod/t181 --template simplified --human
node out/adapters/cli/index.js verify --name t181 --human
```

Plus manual grep на t181 — `_<entity>EntityType` в repository_impl/event_adapter должен совпадать с registration в orchestrator.

### Runtime (не требуется)

Static template + dictionary fix, runtime sync behavior проверяется через verify + grep equality.

## Релевантный контекст

- [src/features/generation/replacement/replacement_util.ts](../../../../src/features/generation/replacement/replacement_util.ts) — целевой файл
- [src/features/generation/generators/orchestrator_patcher.ts](../../../../src/features/generation/generators/orchestrator_patcher.ts) — эталон snake_case применения (читать чтобы понять что мы выравниваемся)
- [src/utils/text_work/text_util.ts](../../../../src/utils/text_work/text_util.ts) — `toSnakeCase`, `unCap` helpers
- 4 файла simplified template `*_repository_impl.dart` / `*_event_adapter.dart`
- [weight TASK-019 task.md Сессия 2 → 🔴 B1](../../../../../Flutter/serverpod/weight/ai/tasks/done/TASK-019-phase-weight-2-sync-core-wire-up/task.md) — original report (14 констант → snake для weight)
- agent_memory `Главные инварианты генератора → Файловые имена snake_case` (BUG-002 — related casing context)

## Заметки по реализации

- Lookahead в JavaScript regex: `(?=...)` non-consuming. `(?=_|/|\\.dart\\b|'|")` валидно. В replacement-rule `from` это `string` который потом обёртывается в `new RegExp(rule.from, 'g')` — так что character class `'` / `"` нужны без экранирования внутри alternation.
- Альтернативный (и опасный) подход — character class `[_/.'"]`. Не использовать — это **consuming** char, заменит сам `'` тоже. Точно нужен **lookahead** `(?=...)`.
- Если возникнут regression'ы на других литералах в snake-context (например `'category':` в JSON-payload string-key) — это `'`-boundary тоже снейкает. Это ожидаемо корректно (JSON keys тоже snake-case в Serverpod payload conventions).
- M2M junction snake-rule fix (шаг 4) — `templEntity1` / `templEntity2` для junction'ов в литералах вряд ли встречаются, но симметрия делает паттерн coherent.

## Результаты

- 1 modified `src/features/generation/replacement/replacement_util.ts` (~2 строки изменения)
- 1 new test file `src/test/replacement/entity_snake_quote_boundary_test.ts`
- 1 new test project `t181/`
- `report.md` с CLI-выводом + grep evidence о совпадении strings

## Журнал исполнения

*Только executor. Teamlead не редактирует.*
