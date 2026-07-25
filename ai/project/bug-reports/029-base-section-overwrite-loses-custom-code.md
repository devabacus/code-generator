# BUG-029: потеря пользовательского кода при regenerate (65 из 81 шаблона пишутся без проверки существования)

> ## ⚠ Переформулировка 2026-07-22 (дискуссия #14, решение владельца)
>
> **Было:** «`:base` секции перезаписываются при regenerate → потеря custom-кода».
> **Стало:** «65 из 81 entity-шаблона идут через `createFile()` без проверки
> существования и без предупреждения».
>
> **Почему:** дискуссия #14 (Claude ×2 / GPT ×2, факты перепроверены teamlead'ом по коду)
> установила, что `:base` — как раз **защищённая** часть: механизм merge существует и
> работает, код вне блока переживает regen. Беззащитно всё остальное — 65 файлов, среди
> них ровно те, что правят руками (`repository_impl`, `usecases`, `entity`, `model`,
> `state_providers`, `endpoint`, адаптеры). Исходная формулировка описывала меньшую часть
> проблемы; большая не была заведена.
>
> **Решение владельца:** расширить ЭТОТ bug-report, новый не заводить (один класс дефекта —
> потеря пользовательского кода при regen; два номера про одно уже проходили с BUG-005).
>
> **Источник:** [дискуссия #14](../discussions/archive/14-bug-029-base-overwrite-как-сохранять-cus/discussion.md) → Decision.

> **История номера:** ранее эта проблема числилась в CLAUDE.md как «BUG-005 (backlog)»,
> но номер 005 уже занят закрытым [BUG-005 AppDatabaseGenerator incremental](005-app-database-generator-incremental-only.md)
> (RESOLVED 2026-04-26). Разведено 2026-07-22 (TASK-039 follow-up): `:base` overwrite
> получил собственный номер **029**, ссылка в CLAUDE.md поправлена.

**Статус:** **RESOLVED для regen-пути** (`generate-entity`, VS Code `createDataFilesByReplacement`) —
2026-07-25, [TASK-042](../tasks/): двухфазный fail-closed preflight + ledger, все три
silent-режима на этом пути стали громкими.

**Где guard НЕ действует (осознанно, формулировка «65 из 81 шаблона пишутся `createFile()`
без проверки существования» для этих случаев остаётся буквально верной):**

- **`create-project` (bootstrap).** Вызывает `generate(..., { overwriteExisting: true })` —
  preflight отрабатывает, но конфликты подтверждены заранее и записи идут всегда. Так
  сделано намеренно: `serverpod create` / `flutter create` раскладывают собственный скелет
  (`pubspec.yaml`, `main.dart`, `analysis_options.yaml`, `README`), записей в ledger для
  него нет → каждый такой файл классифицировался бы как `legacy-mismatch` и ронял бы
  создание проекта. Пользовательского кода в только что созданном проекте не существует —
  терять нечего. Побочный и нужный эффект: ledger засевается именно здесь, до `git init`.
  **Следствие для агентов:** запускать `create-project` поверх существующего непустого
  проекта по-прежнему опасно, guard от этого не защищает.
- **[BUG-030](030-relation-patcher-otm-region-outside-guard.md)** — правка внутри
  `:oneToManyMethods` в merge-файлах (`*_dao.dart`, `*_local_data_source.dart`,
  `*_repository.dart`) теряется молча: `RelationPatcher` пишет в обход plan/apply.
- **Прочие писатели вне plan** — `orchestrator_patcher`, `app_database_generator`
  (детали и обоснование — в report TASK-042).

**Следующие этапы (отдельные задачи, НЕ входили в scope):** миграция 65 шаблонов на
merge-дисциплину и ownership-директива `// codegen:ownership:`.
**Критичность:** High — silent потеря пользовательского кода при regen.

## Что закрыто (TASK-042, 2026-07-25)

- **Двухфазный поток** `plan → apply` в `GenerationService.generate`. `Promise.all` остался
  только в read-only фазе plan; при конфликте хотя бы в одном файле не записывается **ни один**.
- **Ledger** `<project>/.codegen/ledger.json` (`schemaVersion: 1`, project-relative пути,
  точный SHA-256 без нормализации, запись атомарная и **последней**). Для `ownership: merge`
  хранятся хеши **регионов**, не файла целиком.
- **Три режима отказа стали громкими:** полная замена existing-файла (65 шаблонов) → conflict;
  правка внутри `:base` → conflict; потерянные/битые/дублированные маркеры → conflict
  (silent staleness закрыт `region_parser`, который отличает «маркеров нет» от «маркеры битые»).
- **Анти-prompt-fatigue:** `sha(existing) == ledger` → молчаливая перезапись, даже если render
  изменился. Legacy без записи: `existing == render` → seed; иначе conflict; «оставить как есть»
  baseline **не** сеет.
- **Точки входа:** CLI `generate-entity --overwrite-existing` (без него — отчёт с diff в stderr
  и non-zero exit), VS Code — модальный preview/confirm. `create-project` сеет ledger в момент
  bootstrap (до `git init`, поэтому файл попадает в первый коммит).
- **Вне guard'а осознанно остались** `relation_patcher`, `orchestrator_patcher`,
  `app_database_generator` — пишут в обход plan/apply (обоснование — в report TASK-042).
  Единственный из них, который приводит к **молчаливой потере пользовательского кода**,
  выделен в [BUG-030](030-relation-patcher-otm-region-outside-guard.md).
- **Самовосстановление ledger'а:** если запись в ledger разошлась с диском не по вине
  пользователя (сбой `save()` после apply, throw/Ctrl-C между apply и save, разрешение
  git-конфликта в `.codegen/ledger.json`), а на диске лежит побайтово то, что генератор и
  записал бы, — конфликт **не** поднимается, baseline пересеивается. Иначе единственным
  предложенным выходом был бы деструктивный `--overwrite-existing` там, где терять нечего.

## Симптом (уточнённый)

`generate-entity` на **существующем** проекте молча перезаписывает пользовательский код.
Три различных режима отказа, все silent:

1. **Silent loss (основной, 65 файлов).** Шаблон без `:base` идёт по СТРАТЕГИИ 2
   ([generation_service.ts:221-239](../../../src/features/generation/generators/generation_service.ts#L221-L239)):
   `createFile(destinationPath, newContent)` **без проверки существования и без
   предупреждения**. Затираются в том числе `repository_impl`, `usecases`, `entity`,
   `model`, `state_providers`, `endpoint`, адаптеры — ровно те файлы, которые правят руками.
2. **Silent loss внутри owned-region.** Пользователь изменил содержимое `:base`, которое
   по текущему контракту принадлежит генератору — но контракт нигде не объявлен и ничем
   не защищён.
3. **Silent staleness.** Шаблон содержит `:base`, а target потерял/сломал маркеры →
   `_mergeBaseContent` [тихо возвращает destinationContent](../../../src/features/generation/generators/generation_service.ts#L255-L257)
   без ошибки: файл навсегда перестаёт получать обновления шаблона.

**Измерено на t115 (2026-07-22):** 81 entity-шаблон, из них **16 с `:base`** (СТРАТЕГИЯ 1,
merge) и **65 без** (СТРАТЕГИЯ 2, полная замена).

## Что оказалось НЕ так, как считалось

`:base` — **защищённая** часть, а не дыра. `_mergeBaseContent` заменяет только область
между маркерами, всё остальное содержимое целевого файла переносится дословно (докстринг
метода фиксирует это прямо: «позволяет сохранять кастомные изменения пользователя вне
базового блока»). Дописать свой метод после `generated_end:base` — рабочий способ уже
сегодня. Проблема в том, что контракт не объявлен пользователю, а в части файлов `:base`
нарезан так широко, что места «снаружи» почти не остаётся (в `task_dao.dart` блок
начинается с `import` в первой строке).

## Решение (дискуссия #14 → Decision, принято владельцем 2026-07-22)

**Первый deliverable — preflight + ledger ВМЕСТЕ (неделимая единица).** Guard без baseline
мёртв: каждый штатный regen (добавили поле → изменился вывод во всех ~21 файле сущности)
упирался бы в conflict → пользователь рефлекторно жмёт `--overwrite-existing` → guard
перестаёт защищать ровно тогда, когда custom-код действительно есть.

**Три технических инварианта (обязательны):**

- **(а) Preflight ДО начала записи**, не внутри `_processFile`: там `Promise.all`
  ([generation_service.ts:172-177](../../../src/features/generation/generators/generation_service.ts#L172-L177)),
  бросок в одном promise не остановит остальные → полузаписанное дерево. Поток
  двухфазный: plan (вычислить destination + контент, классифицировать, не трогая FS) →
  apply (только при отсутствии конфликтов либо явном подтверждении).
- **(б) Для merge-файлов хешируются регионы, не файл целиком.** Иначе легальное
  добавление custom-импорта/метода в preserved-зону даёт conflict на пустом месте.
- **(в) Legacy-состояние НЕ «усыновляется» как generated.** Если existing ≠ render и
  выбрано «оставить как есть» — нельзя писать хеш existing как baseline (внутри может быть
  custom-код → следующий regen увидит `existing == ledger` и молча сотрёт). Допустимо
  только: reviewed overwrite (записать render, хешировать render) либо preserve (не писать
  и не seed'ить).

**Ledger** (`.codegen/ledger.json`): versioned, хранится **в git**, пути project-relative,
точный SHA-256 **без** lossy-нормализации, записывается в FS **последним** — после
успешного apply, атомарной заменой временного файла.

## Отклонённые варианты

- **Per-method markers** — решают задачу, которую уже решает merge-стратегия, ценой N
  маркеров на файл и хрупкой привязки к именам методов (переименование в шаблоне →
  «осиротевший» блок).
- **Patch-only как постоянный режим** — перекладывает merge на пользователя. Diff из
  preflight полезен как интерфейс подтверждения, но не как режим работы.
- **Partial-файлы «как sync hooks»** — посылка неверна: проверено, sync hooks живут в
  **том же файле** после маркеров, пользовательских partial-файлов нет. Плюс Dart не
  поддерживает partial class. Реально обкатан паттерн «узкие marker-блоки + остальной файл
  — территория пользователя»; он и распространяется на merge-файлы.

## Вынесено за скобки (отдельные вопросы)

- **Правка тела** сгенерённого метода не сохраняется **ни одной** маркерной схемой —
  это вопрос точек расширения (callback/strategy/wrapper/subclass), отдельное API-решение.
- Миграция 65 шаблонов на merge-дисциплину — инкрементально, по файлу, после guard'а.
- Явный ownership-контракт `// codegen:ownership: generated|merge` — отдельной
  директивой-строкой, НЕ через перегрузку `manifest:`
  ([marker_analyzer.ts:39](../../../src/features/generation/generators/marker_analyzer.ts#L39)
  делает слепой каст токенов в `ManifestType` без валидации). Синтаксис — общая конвенция
  `codegen:<key>: <value>` с решением [дискуссии #13](../discussions/archive/13-где-должна-жить-codegen-метадата-junctio/discussion.md).

## Бывший workaround (снят TASK-042)

До guard'а: `git diff` перед regen руками (CLAUDE.md → «Порядок работы → Добавь поле»).
Требовал дисциплины; при её отсутствии — silent потеря. **Больше не нужен на regen-пути**:
preflight сам сравнивает диск с ledger'ом и останавливается до первой записи. Остаётся
актуальным для зон из списка «где guard не действует» (в первую очередь
[BUG-030](030-relation-patcher-otm-region-outside-guard.md)).

## Совместимость

**Stack-lock соблюдён:** preflight, ledger, ownership-комментарии и перестановка
marker-комментариев не меняют Riverpod-аннотации, Drift-конвенции, Clean layout и
sync_core 0.3.0. Partial-файлы / наследование / новые callback API — задевают структуру
шаблонов и требуют явного approval владельца.

## Затронуто

- `src/features/generation/generators/*` — merge-логика `:base` блока.
- Шаблонные файлы с `:base` маркерами (t115 + simplified) — при выборе per-method markers.
- CLAUDE.md → «Порядок работы» (workaround `git diff` заменяется на реальный механизм).

## Связанное

- [BUG-030](030-relation-patcher-otm-region-outside-guard.md) — остаток этого же класса дефекта: `:oneToManyMethods` в merge-файлах вне guard'а.
- [BUG-005](005-app-database-generator-incremental-only.md) — другой баг, тот же бывший номер (разведено).
- sync hooks partial-файлы (sync_core 0.3.0) — референс паттерна custom/generated (вариант 3).
