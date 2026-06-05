# BUG-026: junction FK-extraction не фильтрует `customerId` → неверная entity1/entity2 пара (silent)

**Статус:** Open (Medium)
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
