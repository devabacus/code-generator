---
id: TASK-040
schema_version: 2
status: active            # active | blocked | done
mode: interactive         # interactive | auto
zone: "generator-core"
verification_profile: "ts-generator"
checks: [compile, lint, unit]
max_attempts: 3
depends_on: []
---

# TASK-040: директива junction: [a,b] не проходит serverpod generate (property not allowed)

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

## Подходы (разобрать оба, дать рекомендацию — это часть задачи)

**Подход A — codegen-only слой директивы (директива вне Serverpod-файла).**
Директива не хранится в `.spy.yaml`, а в отдельном месте, которое Serverpod не читает:
sidecar-файл (напр. `<junction>.codegen.yaml` рядом), или CLI-флаг
`generate-entity --junction <a>,<b>`, или отдельная codegen-секция. `.spy.yaml`
остаётся чистым для Serverpod.
- Плюс: `.spy.yaml` валиден для Serverpod без обработки; нет риска «забыл снять».
- Минус: пара «источник директивы ↔ .spy.yaml» разъезжается (два файла/два места);
  ceremony; надо решить, где канонично живёт junction-пара.

**Подход B — strip ключа `junction` перед serverpod generate.**
Директива остаётся в `.spy.yaml` (codegen её читает как сейчас), но перед вызовом
`serverpod generate` codegen удаляет ключ `junction` из физического файла (или
генерирует Serverpod-видимую копию без него).
- Плюс: один источник истины (`.spy.yaml`); директива рядом с fields; минимальное
  изменение UX TASK-037.
- Минус: mutating чужой файл (или дублирование); нужно понять, КТО и КОГДА вызывает
  serverpod generate (create-project и generate-entity — см. `create_project.ts:20`,
  `add_microservice.ts:143`; generate-entity сам serverpod generate НЕ зовёт — это
  делает `verify`/пользователь); strip должен быть идемпотентным и не терять данные.

**Требование:** executor разбирает ОБА подхода на реальном коде (где живёт `.spy.yaml`,
кто зовёт serverpod generate, как директива парсится в `server_yaml_parser.ts`), даёт
**обоснованную рекомендацию** одного из них (или гибрид) с оценкой blast radius. Если
выбор неочевиден или требует нового дизайн-решения владельца — **STOP/BLOCKED с
вариантами, не реализовывать наугад.**

## Не-цели

- НЕ ломать существующее поведение директивы в codegen (парс `junction: [a,b]` в
  `server_yaml_parser.ts` — TASK-037 — остаётся; меняется только как директива
  доживает до/переживает serverpod generate).
- НЕ трогать loud-guard BUG-015 (TASK-039) — соседний механизм.
- НЕ реализовывать cross-feature junction поддержку (backlog).
- НЕ менять форму директивы `[a, b]` (зафиксирована владельцем в TASK-037) — меняется
  только НОСИТЕЛЬ (где физически лежит), не синтаксис пары.

## Scope

Разрешено (уточнится после выбора подхода):

- `src/features/generation/parsers/server_yaml_parser.ts` (парс директивы / источник)
- `src/adapters/cli/commands/{generate_entity,create_project}.ts` (если подход B — точка strip; если A — источник директивы)
- возможный новый модуль (sidecar-reader / stripper)
- `src/test/**`
- `docs-code-generator/sync-core-integration.md`, bug-report/новый файл если нужен

Запрещено:

- шаблоны `G:/Templates/flutter/*` (если фикс требует — обосновать, но директива —
  codegen-концепция, шаблонных junction-YAML это касаться не должно)
- target-проекты (руками не патчить)
- форма директивы `[a, b]`

## Критерии приёмки

- [ ] Оба подхода (A/B) разобраны на реальном коде с blast radius; дан обоснованный выбор ИЛИ STOP/BLOCKED с вариантами для владельца
- [ ] Если реализовано: junction с директивой проходит `serverpod generate` БЕЗ ручного вмешательства (доказать — на t206 или свежем test-проекте, verify errors по serverpodGenerate = 0)
- [ ] Парс директивы в codegen (`junction: [a,b]` → entity1/entity2) продолжает работать (TASK-037 тесты зелёные)
- [ ] Новый unit-тест на выбранный механизм (sidecar-чтение / strip идемпотентность)
- [ ] checks compile/lint/unit зелёные, baseline 322 не падает
- [ ] Если подход B (strip): доказана идемпотентность и отсутствие потери данных из `.spy.yaml`

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
