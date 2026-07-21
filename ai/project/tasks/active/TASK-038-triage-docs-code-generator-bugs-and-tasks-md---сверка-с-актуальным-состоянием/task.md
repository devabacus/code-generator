---
id: TASK-038
schema_version: 2
status: active            # active | blocked | done
mode: interactive         # interactive | auto
zone: "generator-core"
verification_profile: ""  # docs-only triage: код не меняется, checks не нужны
checks: []
max_attempts: 3
depends_on: []
---

# TASK-038: triage docs-code-generator/bugs-and-tasks.md — сверка с актуальным состоянием

## Ветка

feature/TASK-038-triage-bugs-and-tasks

## Цель

Разобрать легаси-документ `docs-code-generator/bugs-and-tasks.md` (исторический срез
2026-03, до переезда трекинга в `ai/`): каждую запись сверить с актуальным состоянием
репо и довести до одного из вердиктов:

- **закрыто** — подтвердить где (bug-report / TASK / коммит) и пометить в документе;
- **всё ещё открыто и НЕ оттрекано** в `ai/project/bug-reports/` или backlog —
  перенести в `ai/project/tasks/backlog.md` (со ссылкой на источник);
- **устарело/неактуально** — пометить с одной строкой обоснования;
- **unclear** — «не смог подтвердить ни закрытие, ни актуальность» + описание, что
  именно не сошлось. **Правило (владелец, 2026-07-21): сомневаешься — ставь unclear.
  ЗАПРЕЩЕНО дотягивать запись до «закрыто»/«устарело» догадкой.** Записи unclear
  разбирает владелец при чтении report.md.

Итог: документ перестаёт быть источником неопределённости («а не потеряли ли мы там
что-то?») — все живые хвосты оттреканы в `ai/project/`, документ помечен как
архивный с датой сверки.

## Не-цели

- НЕ чинить найденные баги и НЕ реализовывать найденные задачи — только triage.
- НЕ удалять сам документ (исторический след; пометить как архив).
- НЕ разбирать остальные легаси-файлы `docs-code-generator/` (implementation-plan.md,
  progress.md, refactor-instructions.md, task refactor.md, project-info-before-refactoring.md,
  troubleshooting.md) — но если при сверке замечено, что какой-то из них противоречит
  актуальному состоянию, упомянуть одной строкой в report.md (кандидат на будущий triage).
- НЕ трогать код `src/**`, шаблоны, target-проекты.

## Scope

Разрешено:

- `docs-code-generator/bugs-and-tasks.md` (пометки вердиктов + архивная шапка)
- `ai/project/tasks/backlog.md` (перенос живых хвостов)
- `ai/project/tasks/active/TASK-038-*/report.md`

Запрещено:

- всё остальное.

## Критерии приёмки

- [ ] Каждая запись документа (11 «исправленных» багов + TASK-1..N «оставшихся задач») имеет явный вердикт: закрыто (где) / открыто (перенесено в backlog, ссылка) / устарело (почему) / unclear (что не сошлось)
- [ ] Вердикты подтверждены проверкой, не памятью: ссылка на bug-report/TASK/коммит/тест или прямая проверка кода (для «частично» статусов типа TASK-1 «нет тестов entity-генератора» — сверить с текущим `src/test/**`, 315 passing)
- [ ] Живые хвосты добавлены в `ai/project/tasks/backlog.md` без дублей с уже существующими записями (проверить пересечение с BUG-005/BUG-015/TASK-013/TASK-015-legacy записями)
- [ ] Документ помечен архивным (шапка: дата сверки, ссылка на backlog)
- [ ] report.md: таблица вердиктов + что перенесено в backlog

## Заметки по реализации

- Документ содержит ссылки вида `../ai/bug-reports/...` — они сломаны после миграции v2
  (теперь `../ai/project/bug-reports/...`); при простановке вердиктов поправить пути.
- Источники для сверки: `ai/project/bug-reports/` (001-028), `ai/project/tasks/done/`
  (TASK-001..037), `ai/project/docs/status.md`, `git log --oneline`, `src/test/**`.
- Кодировка: файл в UTF-8; в PowerShell-консоли кириллица может отображаться крякозябрами —
  читать через Read tool, не через `Get-Content` без настройки.

## Релевантный контекст

Файлы для прочтения перед началом:

- `docs-code-generator/bugs-and-tasks.md` — предмет triage (41 строка)
- `ai/project/tasks/backlog.md` — текущее состояние backlog (куда переносить; там уже есть записи TASK-013/TASK-015-legacy и «Миграция шаблонов на директиву»)
- `ai/project/docs/status.md` + `ai/project/docs/INDEX.md` — актуальный срез состояния
- `ai/project/bug-reports/` — оглавление номеров 001-028

## План тестирования

Docs-only: код не меняется, checks профиля не гоняются. Приёмка — чтение владельцем
report.md и обновлённого backlog.md. Формальный гейт: `python ai/core/scripts/task.py lint`
без ошибок.

## Результаты

- Обновлённый `docs-code-generator/bugs-and-tasks.md` (вердикты + архивная шапка).
- Пополненный `ai/project/tasks/backlog.md` (если найдены живые хвосты).
- report.md с таблицей вердиктов.
