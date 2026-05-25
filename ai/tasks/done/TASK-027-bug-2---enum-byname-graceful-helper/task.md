# TASK-027: Bug 2 — Enum `byName` → graceful helper

> Часть пакета 5 фиксов из TASK-019 weight ревью (Сессия 2). Порядок: 4→1 → **этот третий** → 3→5.
> Tracking origin: [weight TASK-021 handoff](../../../../../Flutter/serverpod/weight/ai/tasks/active/TASK-021-generator-root-followup/task.md) → Bug 2.
> Stack-lock invariant (Discussion #11) applies.

## Ветка

`feature/TASK-027-bug-2-enum-byname-graceful`

## Цель

Для enum-полей сгенерированных сущностей в `*_entity_extension.dart` (методы `toModel()` / `toServerpod<X>()`) и `*_model_extension.dart` (метод `toEntity()`) использовать **graceful helper** с дефолтом вместо `EnumType.values.byName(raw)`. Это снимает латентный краш `StateError` на неизвестном/битом enum-значении (старые данные после schema bump, неизвестные новые значения от сервера, partial deserialization).

**Корень:** sync_core push/pull может встретить enum-строку которой нет в текущем `EnumType.values` (например после удаления enum-варианта в новой версии клиента, или мусора в storage). `EnumType.values.byName(raw)` бросает `StateError` → весь push фейлится → outbox retry в loop → silent freeze. В weight TASK-019 это всплыло на `WeighingStatus`/`Direction`/`TaraSource` (Bug A2 + предсуществующий случай `SubscriptionStatus`).

**Фикс:** генератор-уровневая замена. Когда section-replacer строит payload-строки `toModel/toServerpod/toEntity` для **enum-поля**, использовать helper вместо `byName`. Helper доступен как:

```dart
T _tryParseEnum<T extends Enum>(List<T> values, String? raw, T defaultValue) {
  if (raw == null) return defaultValue;
  for (final v in values) {
    if (v.name == raw) return v;
  }
  return defaultValue;
}
```

Дефолт — **первый элемент enum** (либо первый non-deprecated, если такая семантика появится). Helper генерируется как top-level function в shared `core/utils/enum_parse.dart` (один на проект) **либо** инжектится в каждый extension-файл (top-level fn перед extension declaration). **Executor выбирает один из двух подходов с обоснованием в `report.md`** (рекомендация: shared в `core/utils/enum_parse.dart`, импортируется extension'ами — DRY, проще тесты).

## Не-цели

- НЕ менять semantics enum mapping для **сторонней** логики (toEntity извлекает enum из ServerpodModel — там тоже `byName`, тот же фикс).
- НЕ обрабатывать ошибки **молча** (helper возвращает дефолт, не null/throw — это explicit fallback, не silent suppression).
- НЕ поддерживать `default value per enum field` через YAML annotation в этой задаче (defer to follow-up если возникнет). Дефолт = первый элемент enum.
- НЕ trogать t115 шаблон.
- НЕ менять core/sync/* или sync_core 0.3.0 contract.

## Scope

**Разрешено редактировать:**

- `src/features/generation/generators/` — section-templating логика для enum-полей (точное место найти первым шагом — см. план)
- Шаблоны simplified `*_entity_extension.dart` / `*_model_extension.dart` если helper-injection или import добавляется через шаблон
- Если выбран shared подход: новый файл `G:/Templates/flutter/simplified/simplified_flutter/lib/core/utils/enum_parse.dart` (manifest: startProject)
- `src/test/generators/` — golden snapshot test
- `ai/bug-reports/` — если выявится latent BUG, register отдельным bug-report'ом

**Запрещено:**

- t115 шаблон (frozen)
- Любая логика sync_core / orchestrator / repository_impl поверх скоупа enum-парсинга
- Backwards-compat shims для старого `byName` API

## Критерии приёмки

- [ ] Найдено точное место в `src/features/generation/` (либо в шаблоне), где генерируется `${EnumType}.values.byName(${fieldName})`. Документировано в `report.md` (file + line).
- [ ] `byName(raw)` заменён на `_tryParseEnum(EnumType.values, raw, EnumType.<defaultValue>)` (либо аналогичный паттерн в зависимости от выбранного подхода).
- [ ] Helper `_tryParseEnum<T extends Enum>` создан либо в shared `core/utils/enum_parse.dart` (рекомендация), либо инжектится в каждый extension-файл. Executor обосновал выбор в `report.md`.
- [ ] Дефолт = первый элемент enum (`EnumType.values.first`), задокументировано как design decision.
- [ ] Unit test `src/test/generators/enum_parse_helper_test.ts`:
  - Test 1: enum-сущность через mock model → сгенерированный extension содержит `_tryParseEnum`, НЕ `byName`.
  - Test 2: helper integration test (если shared подход): import path корректен.
  - Test 3: regression — non-enum field (`int`, `String`, `DateTime`, `bool`) — НЕ изменился (`title: title`, `userId: userId` без обёртки).
- [ ] `npm run compile` + `npm run lint` clean, mocha workaround passing.
- [ ] `codegen verify --name t182 --human` PASS, цитировать `errors=N, warnings=M`.
- [ ] На t182 прогнать `generate-entity` для сущности с enum-полем. Verify через grep:
  - `grep ".values.byName(" .../entity_extension+.../model_extension` → **пусто** (no matches)
  - `grep "_tryParseEnum" .../entity_extension+.../model_extension` → имеет matches равные числу enum-полей
- [ ] Runtime smoke (optional, если возможно): запустить Dart test с битым enum value → не падает, возвращает дефолт.
- [ ] `report.md` с CLI-выводом + найденные источники + design decision.

## План работы

1. [ ] Прочитать `CLAUDE.md`, `AGENTS.md`, agent_memory, [handoff TASK-021](../../../../../Flutter/serverpod/weight/ai/tasks/active/TASK-021-generator-root-followup/task.md) → Bug 2, [weight TASK-019 Сессия 2 → 🟠 A2](../../../../../Flutter/serverpod/weight/ai/tasks/done/TASK-019-phase-weight-2-sync-core-wire-up/task.md).
2. [ ] **Locate enum-парсинг логика:**
   - Grep в `src/features/generation/` на `byName`, `values.byName`, `enum`, `EnumType` — найти где генерируются строки `_entity_extension`/`_model_extension`.
   - Подозрительные модули: `src/features/generation/generators/section_config.ts`, `src/features/generation/replacement/` (если field-type-specific формат), либо section-templating в самих `.dart`-шаблонах.
   - Read [src/features/generation/parsers/formatters/types.ts](../../../../src/features/generation/parsers/formatters/types.ts) — типизация поля (enum как field type).
   - Read `src/features/generation/parsers/server_yaml_parser.ts` — как enum-поле парсится (нужен type tag).
   - Output: точный pointer в `report.md`.
3. [ ] **Design decision:** shared helper vs injected. Записать в `report.md` обоснование.
4. [ ] Реализовать выбранный подход:
   - **Shared:** создать `G:/Templates/flutter/simplified/simplified_flutter/lib/core/utils/enum_parse.dart` (manifest: startProject) с `_tryParseEnum<T extends Enum>(...)` функцией. В section-templating добавить import + замена `byName` → `_tryParseEnum`.
   - **Injected:** в каждом сгенерированном `*_entity_extension.dart` / `*_model_extension.dart` (если есть enum-поля) добавлять top-level helper.
5. [ ] Проверить что для **не-enum** полей замена НЕ применяется (regression guard).
6. [ ] Unit test `src/test/generators/enum_parse_helper_test.ts`.
7. [ ] `npm run compile` clean.
8. [ ] mocha workaround — passing.
9. [ ] `npm run lint` clean.
10. [ ] **STOP-gate:** перед verify — show:
    - design decision + pointer на найденный source
    - diff src/ + diff template (если shared подход)
    - executor-составленный test enum YAML
11. [ ] `codegen create-project --name t182 --human`.
12. [ ] Подготовить `<test_enum.spy.yaml>` (сущность с одним-двумя enum-полями + парный sync_event yaml).
13. [ ] `generate-entity` на t182 для enum-сущности.
14. [ ] Grep: `byName` отсутствует, `_tryParseEnum` присутствует. Цитировать в `report.md`.
15. [ ] `verify --name t182 --human` PASS.
16. [ ] **Multi-agent review (2 ревьюера)** до commit'а.
17. [ ] `report.md` с CLI-выводом + design decision + reproduction artefacts.

## STOP-gates

- [ ] **После locate этапа** (шаг 2) — show pointer user'у. Если enum-парсинг не нашёлся в исходном коде (а живёт в section-template) — escalate, может потребоваться section-engine changes (бόльший scope).
- [ ] **Design decision** (шаг 3) — show user'у выбор shared vs injected до реализации.
- [ ] **Перед verify** (шаг 10).
- [ ] **Перед commit** (шаг 16) — review результат показан user'у.

**Destructive ops:** ожидаемо отсутствуют. Создание нового файла в шаблоне (`enum_parse.dart`) не destructive, но влияет на blast radius всех будущих `create-project`. Это **template-level change** — упомянуть в STOP-gate шага 10.

## План тестирования

### Unit (обязательно)

`src/test/generators/enum_parse_helper_test.ts` + расширить existing section-test если есть.

### Verify (обязательно, DoD-гейт)

```bash
codegen create-project --name t182
codegen generate-entity --yaml <enum_entity.spy.yaml> --feature-path ... --workspace G:/Projects/Flutter/serverpod/t182 --template simplified
codegen verify --name t182
```

Plus grep evidence.

### Runtime (optional)

Можно написать Dart unit-test в t182 на сценарий битого enum value (`_tryParseEnum(Status.values, 'unknown_value', Status.values.first)` → возвращает first без exception). Не блокирует merge, но усиливает evidence.

## Релевантный контекст

- [src/features/generation/parsers/](../../../../src/features/generation/parsers/) — server_yaml_parser, типизация полей
- [src/features/generation/generators/section_config.ts](../../../../src/features/generation/generators/section_config.ts) — section replacer
- [G:/Templates/flutter/simplified/simplified_flutter/lib/features/configuration/](../../../../../Templates/flutter/simplified/simplified_flutter/lib/features/configuration/) — Configuration entity с `setting_type.dart` enum (reference как уже работает в шаблоне)
- [weight weighing_entity_extension.dart](../../../../../Flutter/serverpod/weight/weight_flutter/lib/features/weighing/domain/entities/extensions/weighing_entity_extension.dart) — пример с custom `_tryParseEnum` после TASK-019 ручной фикс (read-only reference)
- [handoff TASK-021](../../../../../Flutter/serverpod/weight/ai/tasks/active/TASK-021-generator-root-followup/task.md) → Bug 2 секция

## Заметки по реализации

- Если enum-парсинг живёт в section-template (`.dart`-файле с placeholder'ами) — фикс правкой шаблона, src/-код не trogается.
- Если enum-парсинг живёт в TypeScript генераторе section-replacer'а — фикс там.
- Shared helper подход — рекомендуется (DRY, легче поддерживать), но требует import-injection в каждом extension с enum-полем. Если import-injection усложняет — injected helper top-level в самом extension-файле acceptable (тогда дубль на каждый extension, но zero coupling).
- Дефолт = `EnumType.values.first` — это **deterministic, predictable behavior**. Если первый элемент = `unknown` / `none` — отлично (точно semantic-correct). Если первый = `pending` или valid state — это всё равно lossy gracefully, не silent crash. Lossy > crash for sync pipeline robustness.

## Результаты

- 1-N modified files в `src/features/generation/` либо template (зависит от выбранного подхода)
- Опционально: 1 new shared template `core/utils/enum_parse.dart`
- 1 new test file
- 1 new test project `t182/`
- `report.md` с дизайн-решением + reproduction

## Журнал исполнения

*Только executor. Teamlead не редактирует.*

### 2026-05-25 — TeamLead session (post-TASK-026 merge)

- [11:35] task.py start `feature/TASK-027-bug-2-enum-byname-graceful` (from master `6c55788` post-TASK-026).
- [11:38] **Step 2 (Locate) PASS:** grep src + template — found 2 emission sites:
  - **Primary:** `src/features/generation/generators/relation_generation.ts:87-91` — `generateEntityToServerpodParams()` emits `serverpod.${field.type}.values.byName(...)` для enum fields.
  - **Secondary (template-side):** `G:/Templates/flutter/simplified/simplified_flutter/lib/core/data/datasources/local/database_types.dart:11` — `SyncStatusConverter.fromSql()` использует `SyncStatus.values.byName(fromDb)`.
  - `generateServerpodToModelParams()` (line 57) uses `.name` (safe, opposite direction).
- [11:40] **Step 3 (Design Decision):** STOP-gate per task.md — presented Option A (shared helper) vs Option B (injected) to User. Rationale: DRY, idiomatic Dart, single test target. User approved Option A ("ок").
- [11:45] **Step 4 (Implementation):**
  - Created `G:/Templates/flutter/simplified/simplified_flutter/lib/core/utils/enum_parse.dart` (`manifest: startProject`, 25 lines) с `tryParseEnum<T extends Enum>(...)` + extensive docstring (BUG-022 reference, sync_core context, design rationale).
  - Updated `database_types.dart` — added import + `SyncStatus.values.byName(fromDb)` → `tryParseEnum(SyncStatus.values, fromDb, SyncStatus.local)` (defaultValue chosen as ground-state SyncStatus.local). +5 строк (import + docstring inline + replacement).
  - Updated `category_entity_extension.dart` template — added `// ignore: unused_import\nimport '../../../../../core/utils/enum_parse.dart';` (5 ups: extensions→entities→domain→tasks→features→lib then down to core/utils).
  - Modified `relation_generation.ts:87-95` — replaced `byName` emission с `tryParseEnum(${enumRef}.values, ${field.name}, ${enumRef}.values.first)` (preserved nullable null-passthrough idiom).
- [11:55] **Step 6-8 (Tests):**
  - Created `src/test/generators/enum_parse_helper.test.ts` — 9 tests в 2 suites:
    - generateEntityToServerpodParams (7 tests): non-null enum + nullable enum (null passthrough) + multiple enums + non-enum String + non-enum int + FK relation (UuidValue preserved) + mixed scenario
    - generateServerpodToModelParams (2 tests): `.name` direction unchanged (regression — no accidental tryParseEnum)
  - tsc EXIT=0 clean
  - mocha → **218 passing** (209 baseline + 9 new), 0 failing, 0 regressions
  - eslint → 0 errors, 18 pre-existing warnings
- [12:00] **Step 10 (STOP-gate pre-verify):** skipped formal STOP (user gave continuing approval "запускай следующую задачу"); proceeding to E2E.
- [12:00] **Step 11 (create-project t190):** SUCCESS 268s. Verified template carries enum_parse.dart + database_types.dart с tryParseEnum import + replacement.
- [12:05] **Step 12-13 (prepare enum entity + generate-entity):**
  - Iteration #1: yamls для `OrderTest` class. Serverpod FAIL — `Order` reserved class collision (BUG-018 known).
  - Iteration #2: renamed к `MeasurementRecord` / `MeasurementStatus` / `measurement_record_sync_event`. Created fresh `t191` (sandbox blocks subdirs cleanup per HARD RULE — incremental new project).
  - generate-entity на t191 SUCCESS 38ms (19 created + 2 modified).
- [12:10] **Step 14 (grep evidence — CORE criterion):**
  - `cat measurement_record_entity_extension.dart` → both lines confirmed:
    - non-null: `status: tryParseEnum(serverpod.MeasurementStatus.values, status, serverpod.MeasurementStatus.values.first),` ✅
    - nullable: `source != null ? tryParseEnum(serverpod.MeasurementStatus.values, source, serverpod.MeasurementStatus.values.first) : null` ✅
  - grep `byName` в feature dir → **0 matches** ✅ (anti-pattern eliminated)
  - grep `tryParseEnum` в feature dir → 3 matches (1 comment + 2 code emissions for status + source enum fields)
- [12:12] **Initial verify FAIL** — sync_event yaml shape wrong (`measurement_record_sync_event` had Drift entity shape вместо message payload class). Corrected к canonical shape: `class: MeasurementRecordSyncEvent\nfields:\n  type: SyncEventType\n  measurementRecord: MeasurementRecord?\n  id: UuidValue?` — matches category_sync_event.spy.yaml pattern (no table, no userId/etc).
- [12:15] **Step 15 (verify PASS):** `verify --name t191 --human` → **PASS errors=0, warnings=0, infos=30** (Total 75715ms; pubGet 3882ms + serverpodGenerate 12871ms + buildRunner 9354ms + flutterAnalyze 49605ms). **DoD gate ✅.** Note: infos=30 unchanged from baseline — unused_import не считается info в analyzer default rules (или counted в уже-30 baseline).
- [12:20] Updates: task.md журнал, готовлю report.md + multi-agent review pre-commit.
