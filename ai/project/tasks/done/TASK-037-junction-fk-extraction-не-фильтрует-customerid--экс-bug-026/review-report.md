# Reviewer report — TASK-037 (junction explicit-parents директива, экс-BUG-026)

**Date:** 2026-07-21
**Reviewer:** independent reviewer (Opus 4.8)
**Verdict:** APPROVE WITH MINOR

## Summary

Реализация соответствует контракту и не-целям. Директива `junction: [a, b]` парсится
файлово, порядок авторитетен (entity1=a, entity2=b), fail-fast на некорректной форме и
несопоставимых элементах. Blanket exclude `customerId`/`userId` НЕ вводился (проверено по
диффу). Поведение без директивы байт-в-байт прежнее (fallback `?? field-derivation`).
CustomerUser-тесты `orchestrator_patcher.test.ts:619-671` не тронуты (пустой дифф), зелёные.
Все три checks профиля ts-generator зелёные, числа executor'а подтверждены самостоятельным
прогоном: compile exit 0, lint exit 0 (0 errors / 18 pre-existing warnings), unit 314 passing / 0 failing.

Единственный minor: директива `junction: [task, task]` (дубликат / self-junction) принимается
silently и даёт коррумпированную пару `entity1=entity2=task`. Не блокер (authoring error, вне
исходного scope, pre-existing эвристика тоже не защищала), но стоит зафиксировать/добавить guard.

## Проверка не-целей и scope (контракт)

- **Разрешённые файлы:** дифф трогает только `server_yaml_parser.ts` (+129/−2),
  `orchestrator_patcher.ts` (+13/−5), `src/test/parsers/junction_directive.test.ts` (+224),
  `docs-code-generator/sync-core-integration.md`, bug-report 026, `status.md`, task-доки.
  Шаблоны `G:/Templates/flutter/*` и target-проекты `G:/Projects/Flutter/serverpod/*` НЕ тронуты. ✓
- **НЕТ blanket exclude customerId/userId:** orchestrator по-прежнему фильтрует
  `f.isRelation === true` без исключения по имени; парсер `extractManyToManyEntities` не изменён.
  Исключения `customerId`/`userId` нигде не добавлено. ✓
- **Нет изменения поведения без директивы:** `orchestrator_patcher.ts:331-332` использует
  `model.entity1 ?? (fkFields... fallback)`. Модели, построенные напрямую в тестах
  (`makeJunctionModel`, без entity1/2), падают в fallback → byte-identical. Подтверждено
  прогоном: `orchestrator_patcher.test.ts` CustomerUser-тест (`junction FK→customer+role`,
  `deleteCustomerUserByCustomerAndRole`) зелёный. ✓
- **CustomerUser-тесты `:619-671` не изменены:** `git diff master...HEAD --numstat` для
  `orchestrator_patcher.test.ts` — пусто (0/0). ✓

## Согласованность трёх junction-кодопутей

Проверено по коду (`junction_detector.ts` прочитан целиком):

- `JunctionDetector` производит **только классификацию** (`isJunction: boolean`), не пару
  entity1/entity2. Array-форма директивы выставляет `explicitJunction = true`
  (`server_yaml_parser.ts:29-35`) → JunctionDetector классифицирует как junction. Остаточной
  «старой эвристики» в JunctionDetector, влияющей на пару, нет — он пару не вычисляет.
- Пара entity1/entity2 течёт из **единого источника** `model.entity1`/`model.entity2`:
  продюсер — парсер (директива → `resolveJunctionDirective`, иначе → `extractManyToManyEntities`);
  консьюмер — orchestrator (читает `model.entity1/2`). Рассинхрон BUG-026 (orchestrator
  независимо re-derive'ил FK) устранён. Тест `orchestrator reads directive-resolved pair`
  подтверждает: customerId-first + директива → `junction FK→task+tag` / `deleteTaskTagMapByTaskAndTag`,
  эвристика customer+task НЕ протекает. ✓

Замечание к формулировке в docs: «три junction-кодопути» смешивает классификацию
(JunctionDetector) и pair-extraction (parser+orchestrator). Текст docs это учитывает
(«JunctionDetector классификация»), фактической неточности нет.

## Критерии приёмки

Все выполнены. Regression BUG-026 (customerId first + директива → task/tag),
CustomerUser с/без директивы, backward-compat (2 варианта), валидация (2 варианта — missing
поле + не-relation поле), FK-alias маппинг (`terminal_set` → `terminalSet`), orchestrator
single-source — покрыты 8 тестами, все зелёные.

## Critical issues

Нет.

## Major issues

Нет.

## Minor / nitpicks

**MINOR-1. Дубликат/self-junction `junction: [task, task]` принимается silently.**
`server_yaml_parser.ts` `parseJunctionDirective`/`resolveJunctionElement` — проверяют форму
(2 непустых строки) и сопоставимость каждого элемента, но НЕ проверяют, что элементы
различны. Adversarial-прогон:
```
[dup [task,task]] OK isRelation=true entity1=task entity2=task
```
Результат — коррумпированная пара (downstream: `deleteTaskTagMapByTaskAndTask`, дублирующиеся
substitution-токены). Это authoring error и вне исходного scope (директива объявлена
«авторитетной»), а pre-existing эвристика тоже не имела такой защиты, поэтому не блокер.
Рекомендация: добавить fail-fast (`entity1 === entity2` → ошибка) — дёшево и в духе остальных
валидаций. На усмотрение teamlead'а.

**MINOR-2 (info, не требует действия).** Регистр элементов чувствителен: `junction: [Task, Tag]`
(PascalCase) → внятный throw, а не silent. Owner зафиксировал форму как lowerCamel/snake
(`[task, tag]`), поэтому корректно; error explicit. Стоит лишь упомянуть case-sensitivity в
docs, если директива уедет в публичный шаблон.

## Adversarial-прогон (все входы отработали ожидаемо)

| Вход | Результат |
|---|---|
| `[task, task]` | OK task/task (см. MINOR-1) |
| `[task]` (1 элемент) | THROW «must have exactly 2 elements … got 1» ✓ |
| `[task, tag, customer]` (3) | THROW «… got 3» ✓ |
| `junction: true` | OK task/tag (эвристика, backward-compat) ✓ |
| `junction: false` | OK task/tag (structural detection, pre-existing) ✓ |
| директива в не-junction (1 relation) | THROW «junction:true but only 1 relation field» ✓ |
| `["", tag]` | THROW «elements must be non-empty strings» ✓ |
| `junction: task` (string) | THROW «expected boolean or 2-element array, got string» ✓ |
| `[Task, Tag]` (PascalCase) | THROW с понятным сообщением (см. MINOR-2) ✓ |

## Hard checks (реальные выводы, самостоятельный прогон из корня репо)

```
npm run compile   → COMPILE_EXIT: 0   (tsc -p ./, без ошибок)

npm run lint      → LINT_EXIT: 0
                    ✖ 18 problems (0 errors, 18 warnings)
                    Все 18 — pre-existing curly / unused-disable warnings.
                    Новый код новых warnings НЕ вводит: два warning'а в
                    server_yaml_parser.ts (217-218) — в pre-existing isEnumType,
                    вне диффа TASK-037.

unit (mocha tdd)  → TEST_EXIT: 0
                    314 passing (71ms), 0 failing
                    = 306 baseline + 8 новых junction_directive.
                    Все 8 TASK-037 тестов зелёные.
```

Числа совпадают с report.md executor'а (314 passing, 0 errors, 18 warnings).

## Что хорошо сделано

- Единый источник пары (`model.entity1/2`) с `?? fallback` — минимальная, корректная развязка
  рассинхрона; byte-identical для непокрытых директивой фикстур by construction.
- Fail-fast валидация формы и маппинга — никакой silent-деградации до эвристики.
- FK-alias маппинг через уже-резолвленный `relatedModel` — не дублирует snake→camel, не чинит
  BUG-012 попутно (контракт соблюдён).
- TDD, тесты на MockFileSystem, покрыты все 4 плановых сценария + FK-alias + orchestrator single-source.
