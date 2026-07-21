# Отчёт TASK-037: junction FK extraction — explicit-parents директива (экс-BUG-026)

**Статус:** Ready for review (DONE)

## Резюме

Устранён silent misgeneration junction-пары (BUG-026): добавлена опциональная **файловая**
директива `junction: [a, b]` в `*_map.spy.yaml`, дающая явный авторитетный сигнал
junction-родителей (`entity1 = a`, `entity2 = b`) вместо эвристики «первые 2 relation-поля».

- **С директивой** — пара берётся из неё во всех трёх junction-кодопутях единообразно
  (единый источник `model.entity1`/`model.entity2`, populated парсером).
- **Без директивы** — поведение байт-в-байт прежнее (эвристика сохранена как fallback).
- **Невалидная директива** (ссылка на несуществующее relation-поле / некорректная форма
  массива) → внятная ошибка валидации, не silent.

Форма директивы (файловая, порядок `[a, b]` авторитетен) зафиксирована владельцем — не менял.
В парсер она встала без сопротивления (YAML top-level ключ `junction` уже читался как boolean;
расширил на array-форму без конфликта) — **BLOCKED не потребовался**.

## Изменения

### Код (scope)

- **`src/features/generation/parsers/server_yaml_parser.ts`**
  - `parse()`: `junction` распознаёт две формы — boolean `junction: true` (существующий explicit
    override, не изменён) и array `junction: [a, b]` (новая директива; array подразумевает
    junction-классификацию → `explicitJunction = true`).
  - Единый источник пары: директива → `resolveJunctionDirective`, иначе → прежний
    `extractManyToManyEntities`. Результат → `model.entity1`/`model.entity2`.
  - Новый `parseJunctionDirective` — валидирует форму (ровно 2 непустых строки), fail-fast.
  - Новые `resolveJunctionDirective`/`resolveJunctionElement` — сопоставляют элемент с
    relation-полем по имени `<element>Id` **или** по `relatedModel` (FK-alias `parent=X`),
    возвращают `relatedModel` (canonical lowerCamel). Несопоставимый элемент → ошибка.

- **`src/features/generation/generators/orchestrator_patcher.ts`**
  - `_buildRegisterSnippet`: junction FK-выбор читает `model.entity1`/`model.entity2` (единый
    источник) с fallback `?? field-derivation`. Ранее orchestrator независимо re-derive'ил FK —
    это был рассинхрон BUG-026. Fallback сохраняет byte-identical поведение для тест-фикстур
    без entity1/2.

### Тесты

- **`src/test/parsers/junction_directive.test.ts`** (новый, 8 тестов).

### Документация

- **`docs-code-generator/sync-core-integration.md`** — секция «Junction FK extraction» переписана
  (директива, маппинг, валидация, heuristic fallback, взаимодействие с BUG-012).
- **`ai/project/bug-reports/026-*.md`** — DEFERRED → RESOLVED; ссылка на PR = `PR #TBD`.

## Дизайн-решения (обоснование)

1. **Единый источник = `model.entity1`/`model.entity2`.** Парсер уже был единственным продюсером
   пары; orchestrator — единственным рассинхроном. Направил его на тот же источник → все три
   пути согласованы by construction. Альтернатива (протаскивать директиву в каждый путь) плодит
   логику и риск нового рассинхрона.
2. **Array-форма подразумевает junction=true** — директива родителей без классификации
   бессмысленна; симметрично `junction: true`.
3. **Fallback orchestrator'а сохранён** (`?? `) — иначе сломались бы фикстуры `makeJunctionModel`
   без entity1/2, которые по контракту трогать нельзя (`:619-671`). Даёт byte-identical без директивы.
4. **Маппинг через `relatedModel`** (уже резолвлен парсером из `parent=X`, TASK-016/017) — даёт
   FK-alias поддержку без дублирования snake→camel.
5. **Fail-fast на невалидной директиве** — молчаливая деградация до эвристики скрыла бы опечатку.

## Тесты

- Добавлено тестов: **8** (`src/test/parsers/junction_directive.test.ts`):
  1. BUG-026 regression: `customerId` ПЕРВЫМ + `junction: [task, tag]` → task/tag.
  2. CustomerUser: `junction: [customer, role]` → customer/role.
  3. Backward-compat: TaskTagMap без директивы (taskId/tagId first) → task/tag.
  4. Backward-compat: customerId-first без директивы → эвристика customer/task (сохранено).
  5. Валидация: `junction: [task, missing]` → ошибка с именем `missing`.
  6. Валидация: элемент на не-relation поле (`note`) → ошибка.
  7. FK-alias: `junction: [terminal_set, role]` при `parent=terminal_set` → terminalSet/role.
  8. Orchestrator single-source: customerId-first + директива → docstring/method `task+tag`
     (эвристика customer+task НЕ протекает).
- TDD: тесты написаны ДО реализации, подтверждено красное (4 падали), затем зелёное.
- Существующие CustomerUser-тесты (`orchestrator_patcher.test.ts:619-671`) **не изменены**, зелёные.
- Все проходят: **Да**.

### Реальные выводы checks (профиль ts-generator) — скопированы

```
### compile   →  npm run compile
exit=0

### lint      →  npm run lint
exit=0
✖ 18 problems (0 errors, 18 warnings)

### unit      →  node node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"
exit=0
314 passing (182ms)
```

- **compile:** exit 0.
- **lint:** exit 0, **0 errors**, 18 warnings — все pre-existing (baseline ~18–20; сдвинулись
  номера строк). Новый код `curly`-warnings не вводит (все `if` с фигурными скобками).
- **unit:** exit 0, **314 passing** = 306 baseline + 8 новых, **0 регрессий, 0 failing**.

## Риски / Заметки (известные ограничения)

- **BUG-012 FK-alias — НЕ чинился попутно** (контракт). Маппинг опирается на `relatedModel`
  (парсер резолвит из `parent=X`, TASK-016/017 закрыты); новых ошибок не вносит. Зафиксировано.
- **blanket exclude `customerId`/`userId` — не вводился** (отклонён в BUG-026 Update, ломает
  CustomerUser). Только explicit-directive.
- **Миграция шаблонов** t115/simplified и `task_tag_map` на директиву — **вне scope** (отдельная
  задача после приёмки). Шаблоны без директивы генерятся прежней эвристикой.
- **Real target-проекты не создавались** — область покрыта unit-тестами на MockFileSystem (контракт).
- **Markdown-lint warnings** (MD032/MD051) в `.md` — pre-existing стиль, вне профиля ts-generator.
- **PR-ссылка** — placeholder `PR #TBD`; PR создаёт teamlead.

## Статус

Ready for review.

---

## Аддендум (2026-07-21) — pre-merge fix по итогам review

По решению владельца (вариант 2) на этой же ветке до мержа закрыт **MINOR-1** из
review-report: дубликат/self-junction в директиве (`junction: [task, task]`) теперь
даёт fail-fast ошибку валидации (`...parents must be distinct: "task" is specified twice...`)
вместо silent-пары `entity1=entity2`. Изменения:

- `src/features/generation/parsers/server_yaml_parser.ts` — guard в `parseJunctionDirective`.
- `src/test/parsers/junction_directive.test.ts` — +1 тест на дубликат.

**MINOR-2** (регистрочувствительность) — по решению владельца НЕ чинится/не документируется
сейчас; занесён follow-up-пунктом в `ai/project/tasks/backlog.md` → «Миграция шаблонов
t115/simplified на директиву».

Checks после фикса (прогон teamlead, из корня репо):

- compile: exit 0
- lint: exit 0 — 18 problems (0 errors, 18 warnings), все pre-existing
- unit: **315 passing** (314 + 1 новый), 0 failing
