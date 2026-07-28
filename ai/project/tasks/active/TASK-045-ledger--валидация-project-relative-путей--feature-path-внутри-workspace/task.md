---
id: TASK-045
schema_version: 2
status: active
mode: interactive
zone: "generator-core"
verification_profile: "ts-generator"
checks: [compile, lint, unit]
max_attempts: 3
depends_on: []
---

# TASK-045: валидация project-relative путей ledger

> Follow-up к TASK-042, поднят обоими ревьюерами (MEDIUM-4 / LOW-4).

## Цель

Закрыть два способа молча испортить ledger путями.

1. **`--feature-path` вне `--workspace`.** Ключи становятся `../../../somewhere/else/…`
   (воспроизведено ревьюером). Контракт TASK-042 требует project-relative пути — чтобы ledger
   переезжал вместе с проектом и жил в git.
2. **Относительный `--feature-path`.** `path.relative` резолвит его от `process.cwd()`, поэтому
   ключи начинают зависеть от каталога запуска: запуск из другого cwd молча уводит **весь
   проект** в legacy-режим → массовые конфликты на ровном месте.

Родственная грябля уже описана в `agent_memory.md`: относительный `--feature-path` и до TASK-042
молча писал файлы в CWD.

## Не-цели

- НЕ менять форму ledger и схему `schemaVersion`.
- НЕ вводить автоматическое «исправление» путей — только явный отказ с понятным сообщением.

## Scope

Разрешено: `src/features/generation/generators/ledger.ts`, `generation_service.ts`
(`resolveLedgerRoot`), `src/adapters/cli/commands/generate_entity.ts`, `src/test/**`.
Запрещено: шаблоны, target-проекты.

## Критерии приёмки

- [ ] Ключ ledger, начинающийся с `..`, невозможен: fail-fast с сообщением, называющим оба пути (`--feature-path` и `--workspace`)
- [ ] Относительный `--feature-path` либо резолвится от `--workspace` детерминированно, либо отвергается — выбор обосновать в report.md; молчаливая зависимость от cwd недопустима
- [ ] Тест: одинаковый вызов из двух разных cwd даёт одинаковые ключи ledger
- [ ] Существующие ledger'ы (t208/t209/t210) остаются валидными — проверить, что валидация не ломает уже засеянные проекты
- [ ] checks compile/lint/unit зелёные

## План тестирования

Unit на `MockFileSystem`: feature-path вне workspace, относительный feature-path, запуск из
разных cwd. Плюс прогон на существующем тест-проекте — ledger не должен превратиться в legacy.
