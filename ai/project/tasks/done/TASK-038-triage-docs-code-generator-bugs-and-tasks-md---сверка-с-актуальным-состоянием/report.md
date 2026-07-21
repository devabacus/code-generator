# Отчёт TASK-038

## Резюме

Triage `docs-code-generator/bugs-and-tasks.md` (исторический срез 2026-03-26 — 2026-03-27,
11 «исправленных» багов + секция «Оставшиеся задачи» TASK-1/2/3) против текущего
состояния репо. Документ помечен архивной шапкой (дата сверки 2026-07-21, ссылка на
`ai/project/tasks/backlog.md`), каждая запись получила явный вердикт с обоснованием
и, где возможно, ссылкой на артефакт (bug-report / TASK / коммит / тест).

**Итоговые счётчики (14 записей всего = 11 багов + 3 TASK):**

| Вердикт | Кол-во | Записи |
| --- | --- | --- |
| закрыто | 6 | #2, #4, #9, TASK-1, TASK-2, TASK-3 |
| unclear | 8 | #1, #3, #5, #6, #7, #8, #10, #11 |
| открыто (перенесено в backlog) | 0 | — |
| устарело | 0 | — |

**Живых хвостов для переноса в backlog не обнаружено.** Все записи со статусом «ИСПРАВЛЕН»
в исходном документе либо подтвердились через bug-report/TASK/тест (закрыто), либо не
удалось подтвердить ни закрытие, ни то, что проблема всё ещё актуальна и не оттрекана
(unclear — они не являются «живыми хвостами» в смысле подтверждённых открытых багов,
это неопределённость атрибуции старых, до-`ai/`-трекинговых записей). Ни одна запись не
потребовала переноса в `ai/project/tasks/backlog.md`.

## Таблица вердиктов (детали)

### Исправленные баги (2026-03)

| # | Баг | Вердикт | Доказательство |
| --- | --- | --- | --- |
| 1 | `??` в freezedConstructor (`code_formatter.ts`) | **unclear** | Нет bug-report/TASK/коммита с атрибуцией (запись предшествует `ai/`-трекингу). Текущий `src/features/generation/parsers/formatters/code_formatter.ts` не содержит `??`-паттерна, но это не доказывает, что это тот самый фикс — коммиты эпохи (`git log` до `7335eda`) все безымянные (`1`, `work`, `работает`). |
| 2 | `CargotypeTable` vs `CargoTypeTable` (`text_util.ts`) | **закрыто** | [BUG-002](../../bug-reports/002-file-names-camelcase.md) (Resolved 2026-04-25) — casing fix в `replacement_util.ts` + тесты `src/test/utils/text_util.test.ts`, `src/test/replacement/replacement_util.test.ts`. Текущий `toPascalCase`/`toSnakeCase` в `src/utils/text_work/text_util.ts` корректны. |
| 3 | `title` в provider orElse (шаблон `category_get_by_id_provider.dart`) | **unclear** | Файл живёт в `G:/Templates/flutter/t115/` — вне этого репо (deprecated path). Глубокая проверка git-истории шаблона — вне scope docs-only triage кода-генератора. Артефакта в `ai/project/` нет. |
| 4 | `Cargo_type` vs `CargoType` (`create_data_files_by_replacement.ts`) | **закрыто** | Та же casing-семья, что #2 — [BUG-002](../../bug-reports/002-file-names-camelcase.md), фикс в `replacement_util.ts`/`generation_service.ts`. |
| 5 | Nullable relation `String` без `?` (`code_formatter.ts`) | **unclear** | Текущий `formatRequiredTypeFields` содержит корректную `field.nullable ? 'String?' : 'String'` логику, но нет bug-report/TASK/теста, атрибутирующего именно этот фикс — невозможно отличить «всегда так было» от «починили, и это тот фикс». Прямое чтение кода — не «проверенный артефакт» по правилу задачи. |
| 6 | Enum → String не конвертируется (`code_formatter.ts`, `relation_generation.ts`) | **unclear** | Текущий код конвертирует enum в String корректно, но это отдельная проблема от [BUG-022](../../bug-reports/022-enum-byname-state-error.md)/TASK-027 (graceful `tryParseEnum` — про runtime `byName` throw, не про сам факт конвертации типа). Артефакта на исходный баг #6 нет. |
| 7 | `.name` на String в model extension (`section_generators.ts`) | **unclear** | Файл существует, но нет bug-report/TASK/теста с атрибуцией конкретно этого фикса. |
| 8 | import `cargo_type_table.dart` vs `cargoType_table.dart` (`relation_generation.ts`) | **unclear** | Похоже на casing-семью BUG-002, но BUG-002 resolution явно называет другие файлы (`replacement_util.ts`, `generation_service.ts`, `relation_patcher.ts`, `app_database_generator.ts`) — не `relation_generation.ts`. Совпадение не прямое, дотягивать догадкой запрещено правилом задачи. |
| 9 | Дублирующие relation methods (`relation_patcher.ts`) | **закрыто** | [BUG-003](../../bug-reports/003-new-relation-not-patched-in-existing-feature.md)/TASK-008 — resolution явно фиксирует idempotent single-pass patcher + «recovery от legacy-дубликатов… схлопываются в одну». |
| 10 | `avoid_print` warnings (шаблоны DAO/remote datasource) | **unclear** | Шаблонные файлы вне этого репо (`G:/Templates/flutter/t115/`), нет артефакта в `ai/project/`, вне scope этого triage. |
| 11 | `unnecessary_import` flutter_riverpod (шаблоны usecase_providers) | **unclear** | То же — шаблон вне репо, нет атрибутирующего артефакта. |

### Оставшиеся задачи

| TASK | Вердикт | Доказательство |
| --- | --- | --- |
| TASK-1: тесты для генератора | **закрыто** | Актуальный `src/test/**` (315 passing) содержит выделенные test-файлы для всех 4 перечисленных модулей: `code_formatter_fields_filter.test.ts`, `server_yaml_parser.test.ts` (22 упоминания isEnum/isRelation), `relation_generation.test.ts`, `app_database_generator.test.ts` (107 упоминаний PascalCase/table/entityType). Gap закрыт инкрементально по мере багфиксов TASK-008/012/016/017/023/027/034/035 и др., не единой TASK-004. |
| TASK-2: snake_case файлы | **закрыто** | [BUG-002](../../bug-reports/002-file-names-camelcase.md) Resolved 2026-04-25 — см. #2/#4 выше. Проверено на t140: `flutter analyze` 0 `file_names` warnings. |
| TASK-3: CLI для генератора | **закрыто** | Коммиты `7335eda` и `cece8a5` подтверждены в `git log` (17-18 апреля 2026). CLI `codegen` продолжает существовать и развиваться (`src/adapters/cli/**`, см. CLAUDE.md — >10 команд сегодня). |

## Изменения

- `docs-code-generator/bugs-and-tasks.md` — добавлена архивная шапка (дата сверки,
  ссылка на backlog); каждая из 14 записей помечена вердиктом triage с обоснованием;
  поправлена сломанная после v2-миграции ссылка `../ai/bug-reports/002-...` →
  `../ai/project/bug-reports/002-...`. Документ не удалён, историю не переписывал.
- `ai/project/tasks/backlog.md` — без изменений (живых хвостов для переноса не найдено).
- `ai/project/tasks/active/TASK-038-.../report.md` — этот файл.

## Перенесено в backlog

Ничего. Все «unclear» записи касаются до-`ai/`-трекинговой эпохи (2026-03) без атрибутируемого
артефакта ни на закрытие, ни на актуальность проблемы сегодня — они не являются подтверждённо
открытыми багами, поэтому перенос в `backlog.md` как «живой хвост» был бы необоснованным
дотягиванием в другую сторону (unclear → open). Владелец разбирает unclear-записи сам при
чтении этого отчёта; если по итогам кто-то из них окажется реальной открытой проблемой — это
отдельное решение владельца, не triage-агента.

Проверено пересечение с существующими backlog-записями (TASK-013 junction detection,
TASK-015 non-FK pseudo-keys, «Миграция шаблонов на директиву junction») — ни одна из
14 triage-записей с ними не пересекается, дублей нет (и добавлять было нечего).

## Прочие legacy-файлы `docs-code-generator/` (не разбирались специально, замечено мимоходом)

- `implementation-plan.md` и `progress.md` — датированы декабрём 2025 (`## 2025-12-21`),
  описывают отдельный более ранний рефакторинг (Фаза 0 baseline и т.д.), полностью
  предшествующий текущей `ai/`-системе задач. Явно устарели по факту (собственная дата),
  но не трогались — вне scope этой задачи (см. task.md «Не-цели»).
- `task refactor.md` — план рефакторинга microservice-модуля («Было 6+ команд → Будет
  4 команды»); не проверялось, соответствует ли текущему `src/adapters/vscode/commands/`
  меню — кандидат на будущий triage, замечен мимоходом, не разбирался.

## Тесты

Docs-only задача — код не менялся, checks не гонялись (per task.md `verification_profile: ""`,
`checks: []`). Формальный гейт:

```bash
python ai/core/scripts/task.py lint
```

Результат: см. секцию «Финальный гейт» ниже.

### Финальный гейт

_будет заполнено после запуска `task.py lint`_

## Риски / Заметки

- Итоговое соотношение «unclear» (8 из 14) выше, чем изначально ожидалось для «в основном
  закрыто» — это следствие строгого правила владельца («сомневаешься — unclear», нельзя
  дотягивать чтением кода без атрибутирующего артефакта). Для до-`ai/`-трекинговой эпохи
  (коммиты `1`, `work`, `работает` без описания) единственный способ закрыть unclear-записи
  окончательно — либо найти более старый лог/переписку с описанием фикса (не в репо), либо
  считать вопрос закрытым по умолчанию доверия к «дата фикса 2026-03 + код сейчас корректен»
  (что и есть выбор владельца/ревьюера, не triage-агента).
- Записи #1/#3/#5-8/#10/#11 (unclear) в основном равномерно распределены между
  «code_formatter.ts logic без теста» (5, 6, 7 — частично) и «шаблон вне репо» (3, 10, 11).
  Если владелец хочет закрыть их окончательно — потребуется либо raw git blame/reflog поиск
  глубже текущего `git log` (маловероятно, коммиты той эпохи не имеют описательных сообщений),
  либо явное решение «доверяем коду» → закрыть без артефакта.

## Статус

Ready for review.

---

## Аддендум (2026-07-21) — разбор unclear владельцем

Решение владельца по 8 unclear-записям:

- **#8 → закрыто** (целевая сверка кодом, разрешена контрактом): `relation_generation.ts:23`
  генерит импорты через `toSnakeCase(field.relatedModel!)_table.dart`, с комментарием-атрибуцией
  BUG-012/TASK-016 ровно на этот класс симптома. Симптом невоспроизводим.
- **#1, #3, #5, #6, #7, #10, #11 → «исторически закрыто»** (формулировка владельца:
  «исторически закрыто (март 2026), атрибуция утеряна — код противоречий не показывает»).

Итоговые счётчики после разбора: **закрыто 7 · исторически закрыто 7 · открыто 0 ·
устарело 0 · unclear 0.** Документ обновлён (вердикты + шапка + починена ссылка на
report.md — задача переехала в done/).

Побочные флаги сохранены: в `ai/project/tasks/backlog.md` добавлена строка-кандидат
на triage остальных легаси-доков `docs-code-generator/`.
