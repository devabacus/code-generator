# BUG-026: junction FK-extraction не фильтрует `customerId` → неверная entity1/entity2 пара (silent)

**Статус:** ✅ **RESOLVED** (2026-07-21, TASK-037, PR #TBD). Решение — explicit-parents директива `junction: [a, b]` (не blanket exclude). См. [Resolution](#resolution-2026-07-21--task-037) ниже.
Предыстория: DEFERRED → [TASK-015 robust pseudo-FK detection] (2026-06-05). Простой fix (blanket exclude `customerId`) **отклонён** — ломает легитимный CustomerUser junction. См. [Update](#update-2026-06-05--простой-fix-отклонён) ниже.
**Обнаружено:** 2026-06-05 (generator audit — оба reviewer'а, cross-cutting)
**Критичность:** Medium — **silent misgeneration**. Если в junction-YAML `customerId` объявлен с `relation(...)` раньше реальных FK, генератор выбирает его как одну из junction-сторон → коррумпированные `targetEntity1`/`targetEntity2` (DAO/adapters/substitution привязаны не к тем сущностям). Компилируется, но логика junction неверна.

## Симптом

`extractManyToManyEntities` берёт `fkFields[0]`/`fkFields[1]` по порядку объявления, **не исключая** `customerId` (и `userId`). В отличие от [relation-analyzer.ts:13-15](../../src/features/generation/parsers/relation-analyzer.ts) (`manyToOneFields` literally исключает `customerId`), junction-пути этого не делают.

## Root cause

- [server_yaml_parser.ts](../../src/features/generation/parsers/server_yaml_parser.ts) `extractManyToManyEntities` — `fkFields[0]/[1]` без фильтра `customerId`/`userId`.
- [orchestrator_patcher.ts:294-298](../../src/features/generation/generators/orchestrator_patcher.ts) — тот же выбор `fkFields[0]/[1]`.
- Несогласованность: три junction-кодопути (`JunctionDetector`, `extractManyToManyEntities`, orchestrator) фильтруют по-разному, а `RelationAnalyzer` фильтрует `customerId`.

Сейчас не «горит» только потому, что в шаблонных junction-YAML (`task_tag_map`) реальные FK (`taskId`/`tagId`) объявлены **до** `customerId`. Любой junction с другим порядком полей → silent corruption.

## Repro (предполагаемый)

Junction YAML, где `customerId: relation(parent=customer)` объявлен раньше `xId`/`yId` → entity1 = customer (неверно).

## Предлагаемое решение

Исключать `customerId` (и `userId`) из FK-кандидатов во всех junction-путях, единообразно с `RelationAnalyzer.manyToOneFields`. Добавить regression-тест с `customerId` объявленным первым.

## Связанные

- [BUG-012](012-server-yaml-parser-ignores-relation-parent-directive.md) (parser relation directive), [BUG-015] cross-feature junction (untested edge).

## Update (2026-06-05) — простой fix отклонён

Попытка фикса (blanket exclude `customerId`/`userId` из FK-пары в `extractManyToManyEntities` + orchestrator `fkFields`) **провалила review/тесты**: сломала 2 существующих теста CustomerUser (`orchestrator_patcher.test.ts:619-671`).

**Причина — `customerId` структурно неоднозначен:**
- В `TaskTagMap` `customerId: relation(parent=customer)` = tenant-scope (ownership marker) → должен быть исключён.
- В `CustomerUser` (Customer↔Role junction) `customerId` = **настоящий junction-родитель** → должен быть включён (тест явно ожидает `deleteCustomerUserByCustomerAndRole`).

Оба объявляются идентично (`customerId: relation(parent=customer)`) — **различить по структуре поля невозможно**. Поэтому никакое blanket-правило не корректно: исключение ломает CustomerUser, не-исключение оставляет TaskTagMap-баг.

Текущее поведение (первые 2 relation-поля по порядку объявления) — **сознательная задокументированная эвристика** (см. комментарий `orchestrator_patcher.test.ts:648-653` + `docs-code-generator/sync-core-integration.md` "Junction FK extraction — known limitation" + TASK-015 backlog).

**Решение:**
- **Re-classified → TASK-015** (robust pseudo-FK detection): требует явного сигнала junction-родителей (напр. YAML `junction: [task, tag]` или per-field маркер) — это feature с дизайном, не quick-fix.
- **Mitigation (действует сейчас):** конвенция «объявляй junction-родительские FK ПЕРЕД ownership `customerId`» — её соблюдает шаблон t115 (`task_tag_map`: `taskId`/`tagId` до `customerId`). Баг проявляется только при нарушении конвенции.

Код-изменения по этому багу **не вносились** (reverted). 293 tests baseline сохранён.

## Resolution (2026-07-21) — TASK-037

**Решение — explicit-parents директива, не blanket exclude.** Владелец зафиксировал форму
(2026-07-21): опциональная **файловая** директива `junction: [a, b]` в `*_map.spy.yaml`.
Порядок авторитетен: `entity1 = a`, `entity2 = b`.

**Почему это, а не blanket exclude:** `customerId` структурно неоднозначен (ownership в
TaskTagMap vs настоящий junction-родитель в CustomerUser) — различить по структуре поля
невозможно (см. Update выше). Явный сигнал в YAML снимает неоднозначность, не ломая ни один
из двух легитимных случаев.

**Что сделано:**

- `server_yaml_parser.ts` — `junction` теперь парсится в двух формах: boolean `junction: true`
  (существующий explicit override) **и** array `junction: [a, b]` (новая директива, также
  подразумевает junction-классификацию). Директива резолвится в пару через сопоставление
  элемента с relation-полем (`<element>Id` по имени **или** `relatedModel` по `parent=X`) →
  canonical lowerCamel. Невалидный элемент / некорректная форма массива → внятная ошибка (не silent).
- `orchestrator_patcher.ts` — junction FK-выбор читает `model.entity1`/`model.entity2` (единый
  источник, populated парсером) вместо независимого re-derive из `model.fields`. Fallback на
  field-derivation сохранён для моделей без entity1/2 (тест-фикстуры). Это устраняет рассинхрон
  трёх junction-кодопутей.
- Без директивы — поведение **байт-в-байт** прежнее (эвристика «первые 2 relation-поля»);
  mitigation-конвенция «parents-first» продолжает действовать как fallback.
- Регрессия: `src/test/parsers/junction_directive.test.ts` (8 тестов) — regression BUG-026
  (customerId first + директива), CustomerUser, backward-compat (2 варианта), 2 валидации,
  FK-alias маппинг, orchestrator single-source. Существующие CustomerUser-тесты
  (`orchestrator_patcher.test.ts:619-671`) не тронуты, зелёные.

**Verify (профиль ts-generator):** compile exit 0, lint exit 0 (0 errors), unit 314 passing
(306 baseline + 8 новых), 0 регрессий.

**Известное ограничение (не в scope):** blanket exclude отклонён окончательно; BUG-012 FK-alias
не чинился попутно — директива полагается на уже-исправленный (TASK-016/017) `relatedModel`.
Миграция шаблонов t115/simplified на новую директиву — отдельная задача после приёмки.

Связано: [TASK-037](../tasks/active/TASK-037-junction-fk-extraction-не-фильтрует-customerid--экс-bug-026/), PR #TBD.
