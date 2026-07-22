---
id: TASK-040
schema_version: 2
status: active
mode: interactive         # interactive | auto
zone: "generator-core"
verification_profile: "ts-generator"
checks: [compile, lint, unit]
max_attempts: 3
depends_on: []
---

# TASK-040: директива junction: [a,b] не проходит serverpod generate (property not allowed)

> **РАЗБЛОКИРОВАНА 2026-07-22.** Архитектурная развилка решена в
> [дискуссии #13](../../discussions/archive/13-где-должна-жить-codegen-метадата-junctio/discussion.md)
> (Claude ×2 / GPT ×2, факты перепроверены teamlead'ом по коду) → Decision принят
> владельцем: **носитель — вариант C (comment-directive)**, fallback в этой задаче
> **не трогается**. Ниже контракт переписан под принятое решение.

## Цель

Сделать директиву `junction: [a, b]` (TASK-037) реально работоспособной end-to-end.
Сейчас она — **блокер**: codegen читает её из `.spy.yaml`, но `serverpod generate`
читает ТОТ ЖЕ физический файл и падает:

```
Error on line 3 of author_book_map.spy.yaml:
  The "junction" property is not allowed for class type.
  Valid keys are {class, sealed, extends, immutable, table, managedMigration,
  serverOnly, fields, indexes}.
```

Обнаружено в TASK-039 (BUG-015 prove-out). Директива — codegen-input, но живёт в
Serverpod-видимом файле → Serverpod её отвергает. Пользователь вынужден снимать
директиву руками перед `serverpod generate`, что сводит на нет её ценность.

**Приоритет:** выше triage-хвостов — это блокер работоспособности TASK-037.

## Принятое решение (дискуссия #13 → Decision, владелец 2026-07-22)

**Носитель — вариант C (comment-directive).** Директива переезжает из YAML-**ключа** в
YAML-**комментарий** того же `*_map.spy.yaml`:

```yaml
# codegen:junction: [task, tag]
class: TaskTagMap
```

Почему C, а не A/B (разбор уже сделан в дискуссии, executor его НЕ повторяет):

- Serverpod физически не видит комментарий → **все 13 известных точек вызова зелёные
  без единой правки**, плюс закрыт неперечислимый хвост (пользователь руками по DoD,
  IDE-плагин Serverpod, CI). Критерий: *файл на диске в покое обязан быть валидным для
  Serverpod без всякой предобработки.*
- Носитель уже обкатан в этом репозитории: `marker_analyzer.ts:35` читает codegen-метадату
  из комментариев (`// | # | <!--`), и **16 шаблонных `.spy.yaml` уже несут
  `# manifest: startProject`** — включая `customer_user.spy.yaml`. Багов носителя за всё
  время не было.
- B (враппер+strip) отклонён: чинит 13 известных вызовов, оставляет хвост, мутирует
  пользовательский файл. A-sidecar — резервный (2 файла на один датум). A-CLI-флаг — только
  как разовый override, пара не персистится.

**Обе формы мигрируют.** `junction: [a, b]` (TASK-037) И `junction: true` (TASK-013)
болеют одинаково — Serverpod отвергает **ключ**, а не значение (`junction: true` не «горит»
лишь потому, что ни один шаблон её не использует). Чинить обе, иначе баг вернётся.

**Fallback в этой задаче НЕ трогается** — остаётся текущий (эвристика «первые 2
relation-поля»). Ужесточение до fail-fast — отдельная задача TASK-041 (`depends_on: [TASK-040]`),
стартует только после подтверждения владельца о миграции шаблонов. Каскад-эвристика
(не-nullable + имя ∉ {customerId, userId}) **отклонена владельцем**: даёт третье состояние
fallback, которое придётся выпиливать, и сохраняет silent-путь (контрпример с required
attribute-FK подтверждён на реальном `weight/customer_user.spy.yaml`).

## Требования к реализации

1. **Парсер-контракт** (консенсус дискуссии, соблюсти буквально):
   - читать маркер **до** `yaml.load`, по сырому `yamlContent` (он уже приходит строкой в `parse()`);
   - якорь на **колонку 0**: `^# codegen:junction:` без отступа — это снимает ложное
     срабатывание внутри block scalar / строкового default'а (их содержимое обязано быть
     с отступом). Приём уже применён в `parseField` (BUG-012 side-fix);
   - разрешён **ровно один** такой маркер; дубликат — ошибка;
   - RHS разбирается и валидируется теми же правилами, что сейчас: `true` / `[a, b]`,
     включая guard на дубликат родителей (`[task, task]` → CROSS-проверка из TASK-039);
   - **cross-validation:** оба указанных родителя обязаны существовать среди relation-полей
     и быть различны;
   - malformed маркер → **fail-fast**, НЕ тихая деградация к эвристике.
2. **Migration-guard:** если парсер видит настоящий YAML-ключ `junction` (любой формы) —
   падать с явным сообщением «перенеси в комментарий `# codegen:junction:`, Serverpod
   отвергнет этот ключ». Иначе сценарий «забыл снять» просто переезжает на новое место.
3. **Конвенция:** маркер плоский namespaced — `# codegen:<key>: <value>`. Это общая
   конвенция codegen-директив с решением дискуссии #14 (`// codegen:ownership:`) — не
   разводить два похожих синтаксиса.
4. **Тест-фикстуры репо** (`junction_directive.test.ts`, `orchestrator_patcher.test.ts`)
   мигрировать на новый носитель в рамках этой задачи.

## Не-цели

- НЕ ломать существующее поведение директивы в codegen (парс `junction: [a,b]` в
  `server_yaml_parser.ts` — TASK-037 — остаётся; меняется только как директива
  доживает до/переживает serverpod generate).
- НЕ трогать loud-guard BUG-015 (TASK-039) — соседний механизм.
- НЕ реализовывать cross-feature junction поддержку (backlog).
- НЕ менять форму директивы `[a, b]` (зафиксирована владельцем в TASK-037) — меняется
  только НОСИТЕЛЬ (где физически лежит), не синтаксис пары.

## Scope

Разрешено:

- `src/features/generation/parsers/server_yaml_parser.ts` — чтение маркера из комментария
  (до `yaml.load`), migration-guard на YAML-ключ, cross-validation пары
- `src/test/**` — новые тесты + миграция существующих фикстур на новый носитель
- `docs-code-generator/sync-core-integration.md` — описание носителя
- `ai/project/bug-reports/015-cross-feature-junction.md` — доп. находка #1 → resolved

Запрещено:

- **шаблоны `G:/Templates/flutter/*`** — миграцию t115/simplified делает владелец
  (его зона, другие репо), директива-комментарий безвредна для старого кода
- target-проекты (руками не патчить)
- **fallback-логика** (эвристика «первые 2 relation-поля») — не трогать, это TASK-041
- форма пары `[a, b]` — не меняется, меняется только носитель

## Критерии приёмки

- [ ] `# codegen:junction: [a, b]` читается из комментария; **обе** формы (`[a,b]` и `true`) поддержаны
- [ ] Маркер якорится на колонку 0 и читается ДО `yaml.load`; дубликат маркера → ошибка
- [ ] Cross-validation: оба родителя существуют среди relation-полей и различны; malformed → fail-fast (не тихая деградация)
- [ ] Migration-guard: настоящий YAML-ключ `junction` → внятная ошибка с инструкцией переноса
- [ ] **serverpod generate PASS** на junction с директивой БЕЗ ручного вмешательства (доказать на свежем test-проекте: `verify` → serverpodGenerate errors=0)
- [ ] Fallback-поведение НЕ изменено (тесты эвристики зелёные без правок логики)
- [ ] Тест-фикстуры репо мигрированы на новый носитель
- [ ] checks compile/lint/unit зелёные, baseline 322 не падает

## Заметки по реализации

- Serverpod допустимые ключи класса (из ошибки): `{class, sealed, extends, immutable,
  table, managedMigration, serverOnly, fields, indexes}` — `junction` среди них нет.
- Кто зовёт `serverpod generate`: `create_project.ts:20/174/209/210`,
  `add_microservice.ts:143`; `generate-entity` сам НЕ зовёт (serverpod generate делает
  `verify` или пользователь вручную) — важно для подхода B (где ставить strip).
- Директива парсится `ServerpodYamlParser.parse` (`server_yaml_parser.ts:23-62`,
  `parseJunctionDirective`) — точка, где codegen её потребляет.
- Грабля: `git commit -m` с кавычками в PowerShell 5.1 → `git commit -F <файл>`.
- HARD RULE: test-проекты не удалять, incremental numbering (следующий свободный t<N>).

## Релевантный контекст

Файлы для прочтения перед началом:

- `ai/project/bug-reports/015-cross-feature-junction.md` — где найдена несовместимость (доп. находка #1)
- `ai/project/tasks/done/TASK-037-*/task.md` + `report.md` — форма директивы, зафиксированная владельцем, и семантика пары
- `src/features/generation/parsers/server_yaml_parser.ts:23-125` — парс директивы (обе формы)
- `src/adapters/cli/commands/generate_entity.ts` — точка входа генерации
- `src/adapters/cli/commands/create_project.ts:20,174,207-210` — вызовы serverpod generate/migration
- `CLAUDE.md` — DoD, структура target-проекта, длительные команды

## План тестирования

- Unit: парс директивы (регресс TASK-037) + новый механизм (sidecar/strip).
- Integration (если реализовано): свежий test-проект или t206 — junction с директивой →
  `serverpod generate` errors=0 без ручного снятия ключа → `codegen verify` числа.
- Гейт: checks ts-generator (baseline 322), serverpodGenerate PASS для junction с директивой.

## Результаты

- Разбор A/B + рекомендация (в report.md); при реализации — код + тесты + доказательство
  serverpod generate PASS.
- Обновлённая дока по директиве (sync-core-integration.md / bug-report 015 доп.находка #1 → resolved).
