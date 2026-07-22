---
id: TASK-039
schema_version: 2
status: done
mode: interactive         # interactive | auto
zone: "generator-core"
verification_profile: "ts-generator"
checks: [compile, lint, unit]
max_attempts: 3
depends_on: []
---

# TASK-039: BUG-015 cross-feature junction prove-out + фикс при провале

## Ветка

feature/TASK-039-cross-feature-junction

## Цель

Закрыть последний непроверенный junction-край — **BUG-015**: генерация junction, у
которого parent-сущности живут в **разных features** (например `author` в feature
`authors`, `book` в feature `books`, junction `author_book_map` — в одной из них или
третьей). Same-feature junction доказан на t201 (2026-05-28, PASS errors=0);
cross-feature НЕ тестировался и числится «⚠ High codegen → untested» в status.md.

Задача двухфазная:

**Фаза 1 — prove-out (обязательная).** Воспроизводимый сценарий на свежем test-проекте:
`create-project` → две parent-сущности в РАЗНЫХ features (`generate-entity` каждой в свой
`--feature-path`) → junction между ними (с директивой `junction: [a, b]` из TASK-037) →
`codegen verify` → зафиксировать реальные числа.

**Фаза 2 — только если Фаза 1 провалилась.** Минимальный фикс генератора, если источник
провала локален (import-пути / feature-resolution / substitution). Если провал
архитектурный (несколько подсистем, неочевидный дизайн) — НЕ чинить: статус BLOCKED,
findings + варианты решения в report.md, решение за владельцем.

Исход любой из веток — определённость: BUG-015 либо закрыт с доказательством
(запись в status.md/roadmap.md обновляется, заводится файл bug-report
`ai/project/bug-reports/015-cross-feature-junction.md` со статусом Resolved/описанием
prove-out — номер 015 свободен, файла никогда не было), либо превращается из
«untested» в конкретный подтверждённый баг с repro.

## Не-цели

- НЕ тестировать BUG-017 (`onDelete=Cascade` для FK alias) — отдельный край.
- НЕ регенерировать weight и НЕ трогать существующие t-проекты.
- НЕ удалять test-проекты (HARD RULE: incremental numbering, использовать СЛЕДУЮЩИЙ
  свободный `t<N>`; на 2026-07-21 последний — t205, значит t206; если к моменту
  исполнения появились новые — взять следующий за фактически последним).
- НЕ чинить архитектурные провалы в этой задаче (→ BLOCKED, см. Фазу 2).
- НЕ править шаблоны `G:/Templates/flutter/*` без крайней необходимости; если фикс
  требует правки шаблона — это допустимо ТОЛЬКО для t115/simplified junction-файлов
  с явным обоснованием в report.md (шаблон — часть генерационного контура BUG-015).

## Scope

Разрешено:

- Фаза 1: test-проект `G:/Projects/Flutter/serverpod/t206/` (создание + генерация; НЕ ручные правки «чтобы заработало» — это сигнал бага, DoD)
- Фаза 2 (условно): `src/features/generation/**` (parsers, generators), `src/test/**`
- `ai/project/bug-reports/015-cross-feature-junction.md` (новый), `ai/project/docs/status.md` + `roadmap.md` (строка BUG-015)

Запрещено:

- ручное патчинье сгенерённого кода в t206 для сокрытия провала (найденное руками несоответствие = находка, не «локальный фикс»)
- удаление/пересоздание существующих t-проектов
- weight, sync_core, шаблоны вне оговорённого выше

## Критерии приёмки

- [ ] Cross-feature сценарий воспроизведён на t206: 2 parents в разных features + junction, все команды и их вывод в report.md
- [ ] `codegen verify --name t206` прогнан, числа процитированы (`errors: N, warnings: M`); PASS = errors 0
- [ ] Вердикт по BUG-015 однозначен: Resolved (с evidence) ИЛИ подтверждённый баг с минимальным repro (+фикс, если Фаза 2 локальна) ИЛИ BLOCKED с вариантами
- [ ] Если был фикс: unit-тест на cross-feature случай (MockFileSystem), checks compile/lint/unit зелёные, baseline 315 не падает
- [ ] Заведён `ai/project/bug-reports/015-cross-feature-junction.md` с итоговым статусом; status.md/roadmap.md строки BUG-015 обновлены
- [ ] При исходе Resolved — в bug-report 015 обязательный раздел **«Границы доказательства»**: какая конфигурация проверена (2 features, 1 junction, директива + parents-first, t206) и что НЕ проверено (3+ features, несколько junction'ов, без директивы, ...). «Untested» закрывается только на доказанную ширину
- [ ] При провале Фазы 1 — same-feature control-прогон в том же t206 выполнен, дельта cross vs same зафиксирована в report.md (обязательный протокол, см. Заметки)
- [ ] report.md с реальными CLI-выводами (verify JSON, тесты)

## Заметки по реализации

- Junction-YAML писать с директивой `junction: [a, b]` (TASK-037) И с соблюдением
  конвенции parents-first — чтобы результат не зависел от BUG-026-эвристики.
- Обязательные поля entity YAML (userId/customerId/isDeleted + парный
  `*_sync_event.spy.yaml`) — см. CLAUDE.md, иначе валидация оборвёт генерацию раньше
  сути. M2M junction (`*Map`) валидацию пропускают.
- `create-project` ~3 мин — НЕ перезапускать ради «посмотреть лог» (CLAUDE.md).
- Известный смежный контекст: relation_patcher / datasource-слои используют hardcoded
  inheritance + substitution (см. CLAUDE.md «реальный coverage»), BUG-013 (broken
  layers repository_impl/usecases в t115) может дать фоновые ошибки, НЕ относящиеся
  к cross-feature.
- **ОБЯЗАТЕЛЬНЫЙ control-прогон (владелец, 2026-07-21): при ЛЮБОМ провале Фазы 1 —
  same-feature junction в том же t206** (аналог t201-сценария рядом с cross-feature).
  Диагноз «cross-feature broken» валиден только как дельта: same-feature PASS +
  cross-feature FAIL. Ошибки, воспроизводящиеся в ОБОИХ прогонах — фоновый шум
  (BUG-013 и т.п.), в findings отделять явно. Это детерминированная часть протокола,
  не усмотрение executor'а.
- `relation_generation.ts:31-35` уже содержит «Search in sibling features» — точка
  входа для диагностики import-путей cross-feature.
- Грабля: `git commit -m` с кавычками в PowerShell 5.1 → `git commit -F <файл>`.

## Релевантный контекст

Файлы для прочтения перед началом:

- `ai/project/docs/status.md` — строка BUG-015 + «Junction prove-out (t201)» (что уже доказано)
- `CLAUDE.md` — DoD, обязательные YAML-поля, структура target-проекта, длительные команды, HARD RULE по t-проектам
- `src/features/generation/generators/relation_generation.ts` — sibling-features import lookup
- `src/features/generation/parsers/server_yaml_parser.ts` — junction-директива (TASK-037)
- `src/adapters/cli/commands/generate_entity.ts` — `--feature-path` семантика
- `ai/project/tasks/done/TASK-037-*/report.md` — свежее состояние junction-контура
- t201-прогон в status.md (2026-05-28) — как выглядел same-feature prove-out

## План тестирования

1. Фаза 1 = сам тест: t206, 2 features, junction, `codegen verify` (числа в report.md).
2. При фиксе: unit-тест cross-feature на MockFileSystem + повторный verify на t206
   (или t207, если t206 загрязнён провальной генерацией — НЕ удалять t206).
3. Гейт: checks `compile/lint/unit` профиля ts-generator (baseline 315), verify errors=0.

## Результаты

- Вердикт по BUG-015 с доказательствами (bug-report 015 заведён, status/roadmap обновлены).
- t206 на диске (оставить как есть, включая провальный вариант — не чистить).
- report.md с полными CLI-выводами; при фиксе — код + тесты.
