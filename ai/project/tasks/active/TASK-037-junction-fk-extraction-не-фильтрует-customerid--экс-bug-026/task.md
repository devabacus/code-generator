---
id: TASK-037
schema_version: 2
status: active            # active | blocked | done
mode: interactive         # interactive | auto
zone: "generator-core"
verification_profile: "ts-generator"
checks: [compile, lint, unit]
max_attempts: 3
depends_on: []
---

# TASK-037: junction FK extraction не фильтрует customerId (экс-BUG-026)

## Ветка

feature/TASK-037-junction-explicit-parents

## Цель

Устранить silent misgeneration junction-пары (BUG-026): дать генератору **явный сигнал
junction-родителей** в YAML вместо эвристики «первые 2 relation-поля по порядку объявления».

Дизайн (утверждён в BUG-026 re-classification, PR #38): опциональная директива уровня файла

```yaml
junction: [task, tag]
```

в `*_map.spy.yaml`. **Форма зафиксирована владельцем** (2026-07-21): именно файловая
директива — порядок `[a, b]` часть семантики (entity1/entity2), форма станет публичным
YAML-контрактом и уедет в шаблоны; это архитектурный выбор, не исполнительский.
Если файловая форма реально упрётся в парсер — executor ставит задачу BLOCKED с вариантами,
а НЕ меняет форму сам. Семантика:

- Директива присутствует → `entity1`/`entity2` берутся из неё во ВСЕХ трёх junction-кодопутях
  (`JunctionDetector`, `extractManyToManyEntities`, orchestrator FK-выбор) единообразно.
- Директивы нет → текущая эвристика сохраняется как есть (без изменений поведения) — это
  осознанный fallback, mitigation-конвенция «parents-first» продолжает действовать.
- Директива ссылается на несуществующее в fields relation-поле → понятная ошибка валидации
  (не silent).

## Не-цели

- НЕ вводить blanket exclude `customerId`/`userId` из FK-кандидатов — этот подход уже
  отклонён (ломает CustomerUser, где `customerId` — настоящий junction-родитель;
  см. Update в bug-report 026).
- НЕ менять поведение при отсутствии директивы (существующие проекты/шаблоны без неё
  должны генериться байт-в-байт как раньше).
- НЕ править шаблоны t115/simplified и тестовые YAML шаблона (`task_tag_map`) на новую
  директиву в этой задаче — только генератор + unit-тесты. Миграция шаблонов — отдельная
  задача после приёмки.
- НЕ трогать BUG-015 (cross-feature junction) — соседняя, но отдельная задача.

## Scope

Разрешено:

- `src/features/generation/parsers/server_yaml_parser.ts` (`extractManyToManyEntities`, парс директивы)
- `src/features/generation/parsers/junction-detector.ts` (или где живёт `JunctionDetector`)
- `src/features/generation/parsers/entity_yaml_validator.ts` (валидация директивы)
- `src/features/generation/generators/orchestrator_patcher.ts` (выбор fkFields)
- `src/test/**` (новые unit-тесты на MockFileSystem)
- `docs-code-generator/sync-core-integration.md` (обновить секцию «Junction FK extraction — known limitation»)

Запрещено:

- шаблоны `G:/Templates/flutter/*` (вне репо и вне scope)
- target-проекты `G:/Projects/Flutter/serverpod/*` (руками не патчить — DoD)
- не относящийся к задаче код

## Критерии приёмки

- [ ] Junction-YAML с `customerId: relation(...)`, объявленным ПЕРВЫМ, + директива → корректная пара entity1/entity2 (regression-тест из bug-report 026)
- [ ] CustomerUser-кейс (customerId = настоящий родитель) работает и С директивой, и БЕЗ (существующие тесты `orchestrator_patcher.test.ts:619-671` не тронуты и зелёные)
- [ ] Без директивы — поведение идентично текущему (baseline-тесты без правок)
- [ ] Невалидная директива → внятная ошибка валидации, тест на это
- [ ] Все три junction-кодопути читают пару из одного источника (нет рассинхрона)
- [ ] `checks: compile, lint, unit` — зелёные, реальные выводы в report.md
- [ ] report.md написан; bug-report 026 обновлён (DEFERRED → RESOLVED со ссылкой на PR)

## Заметки по реализации

- TDD: сначала regression-тест (customerId первым + директива), потом реализация.
- Порядок в `junction: [a, b]` — авторитетный (entity1=a, entity2=b); маппинг директивы на
  relation-поля — через `<name>Id`/`relation(parent=...)` соответствие; учесть FK-alias
  случай из BUG-012 (parser игнорирует `parent=` — если это мешает маппингу, зафиксировать
  ограничение в report.md, НЕ чинить BUG-012 попутно).
- Известная грабля окружения: git commit с кавычками в -m через PowerShell 5.1 ломается —
  использовать `git commit -F <файл>` (Known Issues владельца).

## Релевантный контекст

Файлы для прочтения перед началом:

- `ai/project/bug-reports/026-junction-fk-extraction-does-not-filter-customerid.md` — симптом, root cause, **почему простой fix отклонён** (обязательно, включая Update 2026-06-05)
- PR #38 (`gh pr view 38`) — re-classification: blanket exclude ломает CustomerUser, нужен explicit junction-parent signal
- `docs-code-generator/sync-core-integration.md` § «Junction FK extraction — known limitation» — документированная эвристика Option A + пример CustomerUser из weight
- `src/test/generators/orchestrator_patcher.test.ts:619-671` — CustomerUser-тесты, которые сломал отклонённый фикс (НЕ должны быть изменены)
- `ai/project/bug-reports/012-server-yaml-parser-ignores-relation-parent-directive.md` — parser derives relatedModel из имени поля, не из `parent=` (влияет на маппинг директивы)
- `CLAUDE.md` → «Definition of Done» + «Тесты» (MockFileSystem, `src/test/mocks/mock_file_system.ts`)

## План тестирования

Unit-тесты на MockFileSystem (без создания real target-проектов):

1. Regression BUG-026: junction-YAML, `customerId: relation(parent=customer)` объявлен первым, директива `junction: [task, tag]` → entity1=task, entity2=tag во всех трёх кодопутях.
2. CustomerUser: `junction: [customer, role]` → пара customer/role (совпадает с текущим ожиданием `deleteCustomerUserByCustomerAndRole`).
3. Backward-compat: те же YAML без директивы → текущее поведение (первые 2 relation-поля).
4. Валидация: `junction: [task, missing]` → ошибка с именем отсутствующего поля.

Гейт: `checks` из профиля `ts-generator` (compile → lint → unit), baseline 306 passing не падает.

## Результаты

- Изменения в parsers/generators по scope + новые unit-тесты.
- Обновлённые `docs-code-generator/sync-core-integration.md` и bug-report 026 (RESOLVED).
- report.md с реальными CLI-выводами checks.
