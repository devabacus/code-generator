---
id: TASK-044
schema_version: 2
status: active
mode: interactive
zone: "generator-core"
verification_profile: "ts-generator"
checks: [compile, lint, unit]
max_attempts: 3
depends_on: []
---

# TASK-044: машиночитаемое поле conflicts в stdout-JSON generate-entity

> Follow-up к TASK-042. В самой задаче поле НЕ добавлялось: изменение формы stdout-JSON —
> STOP-gate, согласования не было. Владелец разрешил вести работы 2026-07-28.

## Цель

Дать потребителям CLI машиночитаемый признак конфликта. Сейчас при конфликте есть только
exit-код и человекочитаемый текст в поле `errors` — VS Code adapter и агенты в репо-потребителях
вынуждены парсить прозу, чтобы понять, какие файлы конфликтуют и почему.

## Не-цели

- НЕ переименовывать и НЕ удалять существующие ключи (`command`, `duration_ms`, `errors`,
  `files_created`, `files_modified`, `success`) — только аддитивное расширение.
- НЕ менять человекочитаемый вывод `--human` и содержимое stderr.
- НЕ трогать логику классификации конфликтов.

## Scope

Разрешено: `src/adapters/cli/**` (тип `CliResult`, `generate_entity.ts`), `src/test/**`.
Запрещено: `src/features/generation/**` (кроме чтения), шаблоны.

## Критерии приёмки

- [ ] `conflicts?: { path: string; reason: string; message: string }[]` в `CliResult`; поле присутствует ТОЛЬКО при конфликте (иначе отсутствует, не пустой массив)
- [ ] `path` — project-relative (та же форма, что ключи ledger), не абсолютный
- [ ] `reason` — стабильный machine-код (`user-modified` / `region-modified` / `broken-markers` / `legacy-mismatch`), НЕ русский текст; человекочитаемое остаётся в `message`
- [ ] Существующие ключи не изменились — тест на точный набор ключей при успехе и при конфликте
- [ ] Прочие команды CLI не задеты
- [ ] checks compile/lint/unit зелёные

## Заметки по реализации

Оценка из TASK-042 — ~10 строк. Значения `reason` брать из существующей классификации
`preflight.ts`, не выдумывать новые. Стабильность этих кодов = публичный контракт, зафиксировать
их список в докстринге.

## План тестирования

Unit: набор ключей JSON при успехе / при конфликте; форма `path`; коды `reason` для всех
классов конфликта. Прогон реальной команды с цитированием вывода в report.md.
