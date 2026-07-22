---
id: TASK-041
schema_version: 2
status: active            # active | blocked | done
mode: interactive         # interactive | auto
zone: "generator-core"
verification_profile: "ts-generator"
checks: [compile, lint, unit]
max_attempts: 3
depends_on: [TASK-040]
---

# TASK-041: ужесточение junction fallback до fail-fast при структурной неоднозначности

> ## ⛔ УСЛОВИЕ СТАРТА (владелец, 2026-07-22)
>
> Задача заведена **сразу** (решение владельца — не откладывать в «потом»), но executor
> **НЕ запускается** до выполнения двух условий:
>
> 1. **TASK-040 смержена** (носитель `# codegen:junction:` работает) — `depends_on`.
> 2. **Владелец подтвердил, что шаблоны мигрированы** — t115 и simplified junction-YAML
>    несут `# codegen:junction: [a, b]`, плюс строка добавлена в weight
>    `customer_user.spy.yaml`. Это его зона (другие репо).
>
> Без п.2 включение fail-fast **ломает `create-project` из коробки** (см. «Почему условие»).
> Teamlead обязан получить явное подтверждение владельца перед `task.py start`.

## Цель

Убрать silent-путь из junction-детекции: при структурной неоднозначности пары
`entity1`/`entity2` генератор должен **падать с внятной ошибкой**, а не молча выбирать
правдоподобную-но-возможно-неверную пару по эвристике «первые 2 relation-поля».

Это закрывает исходный класс BUG-026 (silent misgeneration) окончательно: после TASK-040
у пользователя есть рабочий носитель директивы (`# codegen:junction: [a, b]`), поэтому
требование «укажи пару явно» выполнимо без побочных эффектов.

## Почему условие старта (обоснование из дискуссии #13)

`customerId: relation(parent=customer)` — **hard-required поле стека** (CLAUDE.md), поэтому
почти любой junction имеет ≥3 relation-полей by construction. Замер по реальным файлам:

| Файл | relation-поля | При включённом fail-fast |
| --- | --- | --- |
| t115 `task_tag_map.spy.yaml` | `taskId`, `tagId`, `customerId` → 3 | ❌ падает без директивы |
| t115 `customer_user.spy.yaml` | `customerId`, `roleId` → 2 | ✅ авто |
| weight `role_permission.spy.yaml` | `roleId`, `permissionId` → 2 | ✅ авто |
| weight `customer_user.spy.yaml` | + `defaultTerminalSetId?` → 3 | ❌ падает без директивы |

`task_tag_map` авто-генерируется командой `create-project` из шаблона → без миграции
шаблонов fail-fast сломает базовый сценарий «создать проект». Отсюда порядок:
носитель (TASK-040) → миграция шаблонов (владелец) → ужесточение (эта задача).

## Не-цели

- **НЕ внедрять каскад-эвристику** (не-nullable + имя ∉ {`customerId`, `userId`}) —
  **отклонена владельцем**: даёт третье состояние fallback, которое придётся выпиливать,
  и сохраняет silent-путь. Контрпример подтверждён на реальном файле: в weight
  `customer_user.spy.yaml` поле `defaultTerminalSetId: UuidValue?` — required attribute-FK
  тривиально получается снятием `?`, и каскад молча выберет `role+terminalSet` вместо
  `customer+role`. Ошибка остаётся silent, просто реже.
- НЕ менять носитель директивы (сделано в TASK-040).
- НЕ трогать loud-guard cross-feature (TASK-039) и preflight/ledger (TASK-042).
- НЕ вводить требование unique-индекса у junction (отдельная тема целостности БД).

## Scope

Разрешено:

- `src/features/generation/parsers/server_yaml_parser.ts` — правило неоднозначности
- `src/features/generation/parsers/junction_detector.ts` — если детекция затронута
- `src/features/generation/generators/orchestrator_patcher.ts` — если fallback дублируется
- `src/test/**` — тесты + миграция фикстур
- `ai/project/bug-reports/026-junction-fk-extraction-does-not-filter-customerid.md` — финальный статус

Запрещено:

- шаблоны `G:/Templates/flutter/*` (мигрирует владелец до старта)
- target-проекты (руками не патчить)
- каскад-эвристика (см. не-цели)

## Критерии приёмки

- [ ] Правило: пара выводится автоматически ТОЛЬКО когда она структурно однозначна (ровно 2 relation-поля); иначе — **fail-fast** с сообщением «пара неоднозначна, укажи `# codegen:junction: [a, b]»`, перечислив найденные relation-поля
- [ ] Никакого fallback к «первым двум» при неоднозначности — silent-путь удалён полностью
- [ ] Сообщение об ошибке называет конкретные поля-кандидаты (диагностика, а не просто отказ)
- [ ] `create-project` из коробки проходит (шаблоны мигрированы) — доказать: свежий `t<N>` + `codegen verify`, errors=0
- [ ] Существующие тесты junction обновлены под новое правило; CustomerUser-кейс работает через явную директиву
- [ ] BUG-026 переводится в окончательный Resolved со ссылкой на TASK-040+041
- [ ] checks compile/lint/unit зелёные

## Заметки по реализации

- Правило неоднозначности (консенсус дискуссии #13, GPT_1): ровно 2 relation-поля → пара
  однозначна, директива не нужна; >2 → директива обязательна. `junction: true`-эквивалент
  остаётся нужен для классификации junction с business-полями.
- Ошибка должна быть fail-fast **на этапе парсинга**, до генерации файлов.
- Breaking change для weight `customer_user` (3 FK) и тест-фикстур
  `orchestrator_patcher.test.ts:619-671`, где текущий результат `customer+role` был
  задокументированной догадкой («known limitation»). Владелец принял этот размен: цена —
  одна строка директивы в одном файле.
- Грабля: `git commit -m` с кавычками в PowerShell 5.1 → `git commit -F <файл>`.

## Релевантный контекст

Файлы для прочтения перед началом:

- [дискуссия #13](../../discussions/archive/13-где-должна-жить-codegen-метадата-junctio/discussion.md) — Decision п.3 (порядок работ) + разбор Q4 (почему пара не выводится структурно) + контрпример GPT_2 к каскаду
- `ai/project/bug-reports/026-junction-fk-extraction-does-not-filter-customerid.md` — исходный silent-баг и почему blanket-exclude отклонён
- `ai/project/tasks/done/TASK-040-*/report.md` — реализованный носитель директивы
- `src/features/generation/parsers/server_yaml_parser.ts` — текущая эвристика `extractManyToManyEntities`
- `CLAUDE.md` → «Обязательные поля entity YAML» (почему `customerId` есть почти везде)

## План тестирования

1. Unit: 2 relation-поля → авто-пара (без директивы); 3+ без директивы → fail-fast с внятным сообщением; 3+ с директивой → пара из директивы.
2. Регресс: BUG-026 repro (`customerId` первым, 3 FK) → теперь fail-fast, а не silent неверная пара.
3. Integration: свежий `t<N>` → `create-project` + `codegen verify` errors=0 (доказательство, что миграция шаблонов достаточна).
4. Гейт: checks ts-generator, baseline не падает.

## Результаты

- Правило неоднозначности в парсере + тесты.
- BUG-026 → Resolved (окончательно).
- report.md с реальными CLI-выводами (включая verify свежего проекта).
