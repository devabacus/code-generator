# Отчёт TASK-040

> Примечание teamlead: текст отчёта подготовлен executor'ом (Opus); файл записан из
> основного цикла сессии — harness блокировал прямую запись report.md субагентом.

## Резюме

Директива junction переехала из YAML-**ключа** в YAML-**комментарий**
(`# codegen:junction: [a, b]` / `# codegen:junction: true`) — вариант C из
ADR-0006 (дискуссия #13, принят владельцем). Serverpod физически не видит
комментарий, поэтому `*_map.spy.yaml` с директивой проходит `serverpod generate`
без предобработки и без ручного снятия ключа — то есть директива TASK-037 стала
работоспособной end-to-end.

Реализовано строго по контракту задачи; архитектурное решение не пересматривалось.
Fallback-эвристика («первые 2 relation-поля») **не тронута** — это TASK-041.

## Изменения

**Код:**

- `src/features/generation/parsers/server_yaml_parser.ts`
  - `parseJunctionMarker(yamlContent, className)` — новый ридер маркера. Читает по
    **сырому `yamlContent` до `yaml.load`**, regex `^# codegen:junction:(.*)$` с флагами
    `gm` — **якорь на колонку 0** (маркер с отступом не считается директивой; содержимое
    block scalar / поля обязано быть с отступом, поэтому ложных срабатываний нет).
    Поддержаны **обе формы**: `true` (explicit override, TASK-013) и flow-массив `[a, b]`
    (explicit parents, TASK-037). Ровно **один** маркер; дубликат → ошибка. Пустой RHS,
    `false`, произвольный текст → **fail-fast**, без деградации к эвристике.
  - `assertNoLegacyJunctionKey(parsed, className)` — **migration-guard**: настоящий
    YAML-ключ `junction` любой формы → ошибка с цитатой ошибки Serverpod и готовой
    строкой замены (`junction: [author, book]` → `# codegen:junction: [author, book]`).
  - Валидация RHS и cross-validation пары (`resolveJunctionDirective` /
    `resolveJunctionElement`, guard на дубликат родителей из TASK-039) переиспользованы
    без изменения правил — сменился только источник значения.
  - Сообщения об ошибках директивы переписаны на новый синтаксис носителя.
- `src/features/generation/parsers/junction_detector.ts` — docstring'и и текст
  `JunctionValidationError` переведены на `# codegen:junction: true` (asserted-подстрока
  `Junction requires 2+ relations` сохранена).

**Тесты:**

- `src/test/parsers/junction_comment_directive.test.ts` — **новый файл, 21 тест** (TDD:
  написан красным до реализации). Покрывает: обе формы; маркер на произвольной строке;
  CRLF; FK-alias (`terminal_set` → `terminalSet`); дубликат маркера; якорь колонки 0
  (маркер с отступом и внутри block scalar игнорируются); malformed RHS (1/3 элемента,
  мусор, пустой); cross-validation (несуществующий родитель, не-relation поле, дубликат
  `[task, task]`); migration-guard обеих форм + упоминание Serverpod; неизменность
  fallback; сосуществование с `# manifest:`.
- `src/test/parsers/junction_directive.test.ts`, `src/test/parsers/junction_detector.test.ts` —
  фикстуры мигрированы на новый носитель (`junction: X` → `# codegen:junction: X`),
  логика тестов не менялась.

**Документация (в scope):**

- `docs-code-generator/sync-core-integration.md` — новый подраздел «Носитель директивы:
  YAML-комментарий (TASK-040 / ADR-0006)» с полным парсер-контрактом; все примеры и
  правила detection обновлены на комментарий.
- `ai/project/bug-reports/015-cross-feature-junction.md` — доп. находка #1 помечена
  **RESOLVED** с E2E-доказательством.

Шаблоны `G:/Templates/flutter/*` **не трогались** (зона владельца, по контракту).

## Тесты

Профиль `ts-generator`, все три именованных check'а — реальные выводы:

**1. `npm run compile`**

```text
> code-generator@0.0.2 compile
> tsc -p ./
```

exit 0, без ошибок.

**2. `npm run lint`**

```text
✖ 18 problems (0 errors, 18 warnings)
```

**0 errors / 18 warnings** — ровно baseline, новых предупреждений нет.

**3. Unit-тесты**

```text
node node_modules/mocha/bin/mocha.js --ui tdd "out/test/**/*.test.js" --ignore "out/test/extension.test.js"
...
343 passing (169ms)
```

**343 passing, 0 failing** (baseline 322 + 21 новых). Baseline не уронен.

### E2E-доказательство (критерий приёмки: serverpod generate PASS без ручного вмешательства)

Свежий проект **t207** (incremental numbering; существующие t-проекты не удалялись).
В нём создана junction-пара с BUG-026-формой — `customerId` объявлен **первым**, поэтому
эвристика дала бы неверную пару `customer+author`:

```yaml
# codegen:junction: [author, book]
class: AuthorBookMap
table: author_book_map
fields:
  id: UuidValue?, defaultPersist=random_v7
  customerId: UuidValue, relation(parent=customer, onDelete=Cascade)
  authorId: UuidValue, relation(parent=author, onDelete=Cascade)
  bookId: UuidValue, relation(parent=book, onDelete=Cascade)
  ...
```

**a) `serverpod generate` на файле с директивой-комментарием — БЕЗ правок:**

```text
✓ Generating code (17.6s)
✓ Done.
EXITCODE=0
```

**b) Контр-тест (тот же файл, директива возвращена в YAML-ключ):**

```text
ERROR: Found 1 issue.
Error on line 2, column 1 of lib\src\models\library\author_book_map.spy.yaml:
  The "junction" property is not allowed for class type. Valid keys are
  {class, sealed, extends, immutable, table, managedMigration, serverOnly, fields, indexes}.
EXITCODE=1
```

Это подтверждает, что чинится именно корень, а не симптом.

**c) Migration-guard через CLI на том же файле со старым ключом:**

```text
ERROR: Error: Entity "AuthorBookMap": YAML-ключ `junction` больше не поддерживается —
Serverpod отвергает этот ключ ("The \"junction\" property is not allowed for class type"),
поэтому `serverpod generate` на таком файле падает. Перенесите директиву в комментарий:
замените строку `junction: [author, book]` на `# codegen:junction: [author, book]`
(комментарий Serverpod не видит). См. ADR-0006 / TASK-040.
```

**d) Директива реально авторитетна** — после `generate-entity` в
`t207_flutter/lib/core/sync/sync_orchestrator_provider.dart`:

```text
// ── Adapter bundle: AuthorBookMap (junction FK→author+book) ───
// `deleteAuthorBookMapByAuthorAndBook` (soft-delete via business key).
```

Пара `author+book` из директивы, а не `customer+author` от эвристики.

**e) `codegen verify --name t207` (DoD-гейт):**

```json
{
  "success": true,
  "steps": {
    "pubGet":            { "ok": true,  "ms": 5339 },
    "serverpodGenerate": { "ok": true,  "ms": 20486 },
    "buildRunner":       { "ok": true,  "ms": 15532 },
    "flutterAnalyze":    { "ok": true,  "ms": 12831,
                           "counts": { "errors": 0, "warnings": 1, "infos": 67 } }
  },
  "errors": []
}
```

**serverpodGenerate errors = 0**, flutter analyze **0 errors / 1 warning / 67 infos**.

## Риски / Заметки

- **Шаблоны не мигрированы** (по контракту — зона владельца): `G:/Templates/flutter/t115`
  и `simplified`. Директива-комментарий безвредна для старого кода, но если в шаблонах
  где-то остался YAML-ключ `junction:` — теперь это **громкая** ошибка парсера с
  инструкцией переноса (раньше падал `serverpod generate`). Проверка шаблонов на наличие
  ключа — за владельцем.
- **Fallback не изменён осознанно** — TASK-041. Junction без директивы по-прежнему может
  получить неверную пару, если ownership-FK объявлен раньше настоящих родителей. Тесты
  эвристики зелёные без правок логики.
- **Якорь колонки 0 — это контракт, а не эвристика**: маркер с любым отступом
  игнорируется молча (тест зафиксирован). Если пользователь выровняет `# codegen:junction:`
  под ключи YAML, директива не применится и сработает fallback. Это прямое следствие
  принятого контракта (снятие ложных срабатываний в block scalar).
- `matchAll` со статическим `g`-regex безопасен (`lastIndex` не переносится между
  вызовами, в отличие от `exec`/`test`).
- Побочная находка (не баг TASK-040): `generate-entity` без флага `--with-server`
  (TASK-029) не создаёт серверные endpoint'ы — первый прогон `verify` дал 32 ошибки
  `The getter 'book' isn't defined for the type 'Client'`. После прогона с `--with-server`
  — 0 ошибок. Поведение задокументировано во флаге, генератор чинить не требуется.
- t207 оставлен на диске (HARD RULE: агент не удаляет test-проекты).

## Статус

Reviewed: **APPROVE WITH MINOR**. Единственное замечание (строгая форма маркера с
ровно одним пробелом после `#`) зафиксировано в user-facing документации; блокеров нет.
Ready for PR.
