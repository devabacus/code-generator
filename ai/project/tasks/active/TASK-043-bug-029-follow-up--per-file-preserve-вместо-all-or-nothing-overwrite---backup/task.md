---
id: TASK-043
schema_version: 2
status: active            # active | blocked | done
mode: interactive         # interactive | auto
zone: "generator-core"
verification_profile: "ts-generator"
checks: [compile, lint, unit]
max_attempts: 3
depends_on: []
---

# TASK-043: per-file preserve вместо all-or-nothing + backup перед деструктивной записью

> Follow-up к TASK-042 (merged, master `66ac705`). Поднят Adversarial-ревью как **HIGH-2**.
> **Это блокер для первого прогона guard'а на живом проекте (weight).**

## Цель

Дать пользователю возможность решать судьбу конфликтов **по файлу**, а не «всё или ничего»,
и не терять код безвозвратно при подтверждённой перезаписи.

Сегодня `--overwrite-existing` перезаписывает **все** конфликтующие файлы разом. Контракт
TASK-042 (инвариант «в», п.3) допускает после конфликта два действия **по каждому файлу**:
reviewed overwrite ЛИБО preserve — реализована только гранулярность всего прогона.

## Почему это блокирует weight

Первый прогон на существующем проекте даст N конфликтов: часть — файлы с реальным custom-кодом,
часть — legacy-расхождения без ценности. Разделить их нечем: либо не генерировать вовсе, либо
снести все N. Плюс ledger хранит только хеши и восстановить прежний код не может — backup'а нет
(требование зафиксировано в TASK-042, но не реализовано).

## Не-цели

- НЕ вводить интерактивный TUI-режим выбора по каждому файлу в CLI — достаточно списка путей.
- НЕ трогать классификацию preflight (она уже верна) и форму ledger.
- НЕ решать BUG-030 (`:oneToManyMethods` вне guard'а) — отдельная задача.

## Scope

Разрешено:

- `src/features/generation/generators/{generation_service,preflight}.ts`
- `src/adapters/cli/commands/generate_entity.ts` — приём списка путей у флага
- `src/adapters/vscode/commands/create_data_files_by_replacement.ts` — выбор файлов в preview
- `src/test/**`

Запрещено:

- шаблоны `G:/Templates/flutter/**`
- «adopt existing as generated» по умолчанию (инвариант «в» TASK-042)

## Критерии приёмки

- [ ] `--overwrite-existing` принимает список путей (перезаписать только их); без аргументов — прежнее поведение «все», но с явным предупреждением в выводе
- [ ] Файлы, не попавшие в список, остаются нетронутыми и **не сеют baseline** в ledger — тест
- [ ] Backup содержимого перед деструктивной перезаписью (куда именно — решить и обосновать в report.md; вариант по умолчанию `.codegen/backup/<timestamp>/`), путь печатается в выводе
- [ ] Backup не попадает в git по умолчанию (проверить `.gitignore` целевого проекта)
- [ ] VS Code preview позволяет снять галочку с отдельного файла
- [ ] При запуске **с** флагом diff всё равно печатается (сейчас показываются только пути)
- [ ] checks compile/lint/unit зелёные, baseline не падает
- [ ] E2E на свежем `t<N>`: три конфликта → перезаписать один → два остались целы, ledger для них не изменился

## Релевантный контекст

- `ai/project/tasks/done/TASK-042-*/report.md` — раздел «Ревью и раунд 2», HIGH-2
- `ai/project/docs/decisions/adr-0007-*.md` — state machine legacy
- `src/features/generation/generators/preflight.ts` — классификация и `GenerationConflictError`

## План тестирования

Unit на `MockFileSystem` по каждому критерию + E2E на свежем `t<N>` (incremental numbering).
