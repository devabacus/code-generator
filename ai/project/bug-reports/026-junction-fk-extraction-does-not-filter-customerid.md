# BUG-026: junction FK-extraction не фильтрует `customerId` → неверная entity1/entity2 пара (silent)

**Статус:** DEFERRED → [TASK-015 robust pseudo-FK detection] (2026-06-05). Простой fix (blanket exclude `customerId`) **отклонён** — ломает легитимный CustomerUser junction. См. [Update](#update-2026-06-05--простой-fix-отклонён) ниже.
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
