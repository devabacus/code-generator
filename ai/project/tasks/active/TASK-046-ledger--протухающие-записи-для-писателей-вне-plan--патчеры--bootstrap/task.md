---
id: TASK-046
schema_version: 2
status: active
mode: interactive
zone: "generator-core"
verification_profile: "ts-generator"
checks: [compile, lint, unit]
max_attempts: 3
depends_on: []
---

# TASK-046: протухающие записи ledger для писателей вне plan

> Follow-up к TASK-042, поднят обоими ревьюерами (MEDIUM-1 / MEDIUM-6) с замером на диске.

## Цель

Устранить ситуацию, когда ledger хранит **заведомо неверные хеши** и это ничем не детектится.

Замер ревьюера на t208 (272 записи): **2 записи не совпадают с диском** —
`t208_flutter/lib/core/sync/sync_orchestrator_provider.dart` (переписан `OrchestratorPatcher`
после `ledger.save()`) и `t208_flutter/pubspec.yaml` (переписан bootstrap-шагом `create-project`
после снятия baseline).

Сегодня это безвредно **по совпадению конфигурации**: манифест `entity` сканирует
`['feature/', 'server/']`, а оба файла лежат в `flutter/`, поэтому их никто не перепланирует.
Это не защищённый инвариант — добавление `flutter/` в entity-манифест (или новый манифест,
сканирующий core) мгновенно превращает их в вечные ложные конфликты, а рефлекторный
`--overwrite-existing` снесёт регистрации сущностей в оркестраторе.

## Не-цели

- НЕ заводить `relation_patcher` под plan/apply — это BUG-030, отдельная задача.
- НЕ менять форму ledger.

## Scope

Разрешено: `src/features/generation/generators/{generation_service,ledger,orchestrator_patcher,app_database_generator}.ts`,
`src/core/services/project_bootstrapper.ts`, `src/test/**`.
Запрещено: шаблоны, target-проекты.

## Критерии приёмки

- [ ] После полного `create-project` и после `generate-entity` **все** записи ledger совпадают с диском — проверяемо скриптом/тестом (сейчас на t208 расходятся 2 из 272)
- [ ] Выбран и обоснован механизм: переснятие baseline после писателей вне plan ЛИБО `ledger.remove(path)` для тронутых ими файлов — обосновать в report.md
- [ ] Регрессионный тест, фиксирующий инвариант «файл, тронутый писателем вне plan, не остаётся в ledger с устаревшим хешем»
- [ ] Проверено, что prompt fatigue не возвращается: повторный `generate-entity` после `create-project` молчит
- [ ] checks compile/lint/unit зелёные

## План тестирования

Unit на `MockFileSystem` + E2E на свежем `t<N>`: сверка всех записей ledger с диском после
create-project и после generate-entity (скрипт сверки привести в report.md).
