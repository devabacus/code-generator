# TASK-011: sync_core 0.3.0 templates integration

**Cross-repo context:** sync_core teamlead-side это `[codegen TASK-X1]` (см. [sync_core/ai/docs/roadmap.md](../../../../../../Projects/Flutter/Packages/sync_core/ai/docs/roadmap.md)). В codegen own tracker auto-ID = TASK-011. Blocking gate перед TASK-012 (todo real app smoke) → blocking weight TASK-018 (13 entities production migration).

**Discussion #1 ✅ closed (2026-05-02):** [archive/1-task-011-sync-core-templates-hardcoded-r/](../../../discussions/archive/1-task-011-sync-core-templates-hardcoded-r/) — User approved Variant A + 6 phase amendments (A0, A0.6, B5/B6/B7, C0, C7, E5+new doc, F0). Phase pipeline expanded ниже.

## Ветка

`feature/TASK-011-sync-core-0-3-0-templates-integration` (создаётся через `python ai/scripts/task.py start`)

## Цель

Обновить codegen чтобы:
1. `codegen create-project --name <X>` копировал sync_core 0.3.0 sync infrastructure (`lib/core/sync/` 5 source файлов) в новый проект.
2. `codegen generate-entity --yaml <X>.spy.yaml` генерировал 5 adapter файлов на entity (RemoteAdapter / PullAdapter / EventAdapter / PayloadCodec / LocalApply) в `lib/features/<feature>/data/adapters/<entity>/`.
3. При `generate-entity` идемпотентно патчил `sync_orchestrator_provider.dart` тремя marker блоками: imports + register<X> блок + `syncEntityTypes` const list.
4. Mutation-first Repository pattern (`_db.transaction { dao.insert + orchestrator.enqueue }`) уже работает через существующий `manifest: entity` / `manifest: manyToMany` в template — проверить regression.

DoD-гейт: `codegen create-project --name t152` + `codegen verify --name t152` PASS errors=0 на свежем проекте, плюс existing t115 regression PASS.

## Не-цели

- **НЕ менять sync_core lib/** — все изменения в codegen TypeScript + t115 template. Sync_core 0.3.0 API остаётся как есть (per ADR-0004 — no lib/ changes для multi-entity).
- **НЕ менять weight repo** — weight TASK-018 не стартует до TASK-012 acceptance ✅.
- **НЕ генерировать R1 sync stack** (`base_sync_repository.dart` / `sync_controller_provider.dart` / `sync_registry.dart`) — он удалён в t115/TASK-001, codegen src/ уже чист от R1 references.
- **НЕ создавать новый manifest type** — переиспользуем существующие `entity` / `manyToMany` / `startProject` (validated в Phase 2c/d/Repository файлах t115).
- **НЕ оптимизировать performance** генерации — focus на correctness, не на скорость.
- **НЕ делать robust junction detection** (per Discussion #1 Claude_1 decision) — keep `endsWith('Map')` heuristic для TASK-011, robust solution через YAML field analysis или explicit `junction: true` flag deferred → **TASK-013 backlog** (создаётся в Phase E5).

## Scope

**Разрешено:**

- **t115 template** (`G:/Templates/flutter/t115/`) — STOP-gate, каждое изменение требует подтверждения User'а перед commit. Список файлов под правки маркеров — в Phase A.
- **codegen TypeScript:**
  - `src/features/generation/generators/orchestrator_patcher.ts` (новый файл, analog `relation_patcher.ts`)
  - `src/features/generation/generators/generation_service.ts` (вызов orchestrator_patcher после relation_patcher)
  - `src/adapters/cli/commands/create_project.ts` — `patchPubspecPackagePaths` fix для sync_core path-dep (вне Packages monorepo)
  - `src/test/generators/orchestrator_patcher.test.ts` (новые unit-tests на MockFileSystem)
- **codegen docs:**
  - `ai/docs/agent_memory.md` — секция "Sync-паттерн в шаблоне" → переписать под sync_core 0.3.0 (drop R1 references)
  - `ai/docs/architecture.md` — секция "Sync-паттерн (в шаблоне t115)" → переписать
  - `CLAUDE.md` (root) — `## Что НЕ генерируется автоматически` → обновить про sync_core
  - `ai/docs/INDEX.md` если упоминает R1
- `ai/tasks/active/TASK-011-.../task.md` + `report.md` — журнал прогресса.

**Запрещено:**

- Любые правки sync_core repo (только **читаем** docs + reference patterns)
- Правки weight repo
- Изменения generator core которые ломают existing tests (62 passing baseline)
- Удаление manifest types (`startProject` / `entity` / `manyToMany`) — переиспользуем
- Smoke runtime через `flutter run` — это Phase TASK-012 scope (отдельный task)

## Критерии приёмки

### Must-have

- [x] **Phase A0 (orchestrator minimal state — Variant A per Discussion #1):** template `sync_orchestrator_provider.dart` приведён к Configuration-only baseline — ✅ done 2026-05-02
  - Удалены 4 imports tasks adapters (Category/Task/Tag/TaskTagMap) — 20 import строк
  - Удалены 4 imports tasks DAO + 4 imports tasks entities — 8 import строк
  - Удалены 4 строки в `syncEntityTypes` const list (оставлен только `'configuration'`)
  - Удалены 4 `orchestrator.register<...>(...)` блока (Category/Task/Tag/TaskTagMap), оставлен только `register<ConfigurationEntity>(...)`
  - **t115 регрессия в этой phase ОЖИДАЕМО fail** (tasks UI без orchestrator regs → runtime errors); resolves via Phase F0 re-add через generate-entity
- [x] **Phase A (template markers):** добавлены manifest маркеры в **30 файлов** t115 template — ✅ done 2026-05-02
  - **5 source файлов** в `lib/core/sync/*.dart` (исключая 3 `.g.dart` Riverpod codegen output) → `// manifest: startProject`
  - 5 adapter файлов в `lib/features/configuration/data/adapters/configuration/` → `// manifest: startProject` (Configuration — singleton, копируется как есть)
  - 15 adapter файлов в `lib/features/tasks/data/adapters/{category,task,tag}/` → `// manifest: entity`
  - 5 adapter файлов в `lib/features/tasks/data/adapters/task_tag_map/` → `// manifest: manyToMany`
- [ ] **Phase B (orchestrator marker блоки):** в `lib/core/sync/sync_orchestrator_provider.dart` обернуть 3 секции в marker блоки:
  - imports группа adapter'ов → `// === generated_start:syncImports ===` / `// === generated_end:syncImports ===`
  - `const List<String> syncEntityTypes = [...]` → `// === generated_start:syncEntityTypes ===` / `// === generated_end:syncEntityTypes ===`
  - блок `orchestrator.register<X>(...)` вызовов → `// === generated_start:syncRegistrations ===` / `// === generated_end:syncRegistrations ===`
- [ ] **Phase B5 (marker integrity test — per Discussion #1 concern №4):**
  - Manual inspection orchestrator файла после Phase B — все 3 marker pairs paired correctly, content внутри сохранён без потери
  - Нет orphan `generated_end` без matching `generated_start` или наоборот
- [ ] **Phase B6 (idempotency unit test — per Discussion #1 concern №4):**
  - Unit test: `SectionReplacer.process()` на orchestrator файле post-Phase-B без изменений content → file content stable, не trigger'ит accidental re-generation
  - На MockFileSystem с двумя последовательными вызовами — digest identical
- [ ] **Phase B7 (SectionReplacer marker tests — per Discussion #1 codegen teamlead concern):** unit tests для `:syncRegistrations` / `:syncImports` / `:syncEntityTypes` markers (4 cases: empty / existing content idempotent / malformed orphan / duplicate recovery)
- [ ] **Phase C0 (replacement_util audit — per Discussion #1 codegen teamlead concern):** ENTITY/M2M словари расширены под orchestrator_patcher requirements (XEntity / 'x' lowercase id / XRemoteAdapter etc.) + tests
- [ ] **Phase C (codegen TypeScript):**
  - `orchestrator_patcher.ts` создан, идемпотентный (повторный generate с тем же YAML → identical content), recovery от legacy duplicates (как `relation_patcher.ts` BUG-003 fix)
  - Patches 3 marker блока на основе ServerpodModel (entity name, junction detection, relation analysis)
  - Подключён в `generation_service.ts` flow после relation_patcher
  - Unit-tests на MockFileSystem (минимум: empty state, single entity add, idempotent re-run, junction entity, multiple entities, recovery from legacy duplicates) — **минимум 6 тестов**
- [ ] **Phase C7 (concurrent test — per Discussion #1 codegen teamlead concern):** mock-based test что patcher commutative (apply A→B == apply B→A в final state)
- [ ] **Phase D5 (BUG-008 fix):** `AppDatabaseGenerator` scan paths расширены до `core/**/*_table.dart` — `sync_queue_table.dart` (и любые будущие core-уровневые tables) попадают в `database.dart` imports + tables list. Regression test + idempotency test.
- [ ] **Phase D (pubspec fix):** `patchPubspecPackagePaths` правильно обрабатывает sync_core path-dep в свежем target проекте
  - Template path: `path: ../../../../Projects/Flutter/Packages/sync_core` (в `Templates/flutter/t115/t115_flutter/pubspec.yaml`)
  - Target path после create-project: должен быть `path: ../../../../../Projects/Flutter/Packages/sync_core` (на 1 глубже из-за `serverpod/`)
  - Текущий `patchPubspecPackagePaths` обрабатывает только `path: ../../Packages/X` → `path: ../../../Packages/X` — нужно расширить regex
- [ ] **Phase E (docs cleanup):**
  - `ai/docs/agent_memory.md` секция "Sync-паттерн в шаблоне" переписана под sync_core 0.3.0 (Adapter Bundle, mutation-first, register patcher)
  - `ai/docs/architecture.md` секция "Sync-паттерн (в шаблоне t115)" переписана
  - `CLAUDE.md` обновлён — sync_core 0.3.0 generation теперь покрыт codegen
- [ ] **Phase E5 (README short bullet + new detail doc — per Discussion #1 codegen teamlead concern):**
  - `README.md` (root) — short bullet + link на новый detailed doc (не expand README extensively)
  - **`docs-code-generator/sync-core-integration.md`** (новый файл) — детальное описание: что генерируется, YAML model requirements, limitations, references на sync_core docs
- [ ] **TASK-013 backlog created** (per Discussion #1 concern №2): robust junction detection (YAML field analysis или explicit `junction: true` flag) — defer на отдельный TASK после weight TASK-018 если weight discoverит false-negatives на `endsWith('Map')` heuristic
- [ ] **Phase F0 (E2E patcher validation — per Discussion #1 Variant A): re-add tasks через generate-entity** для t115
  - Прогон 4 раза `codegen generate-entity --yaml {category,task,tag,task_tag_map}.spy.yaml --feature-path .../tasks --workspace t115`
  - Это E2E проверка: orchestrator_patcher (Phase C) реально воссоздаёт original orchestrator state из minimal Configuration baseline
  - После этого orchestrator должен иметь те же 5 register'ов что были в pre-A0 state (Configuration + Category + Task + Tag + TaskTagMap)
  - `dart format` orchestrator_provider.dart — для проверки стабильности idempotent reformatting
- [ ] **DoD verify (regression на t115):** `codegen verify --name t115` PASS errors=0 — **выполняется ПОСЛЕ Phase F0** (re-add tasks). Без F0 t115 ожидаемо fail (acceptable intermediate state).
- [ ] **DoD verify (свежий проект):** `codegen create-project --name t152` + `codegen verify --name t152` PASS errors=0
  - Новый проект имеет `lib/core/sync/` (8 файлов скопированы)
  - Configuration entity registered в orchestrator (singleton baseline)
  - Tasks features НЕ присутствуют по default (TASK-002 опт-ин)
  - `flutter analyze` 0 errors / warnings ≤ 5
- [ ] **DoD generate-entity:** в свежем проекте `codegen generate-entity --yaml expense.spy.yaml --feature-path .../expense --workspace t152` создаёт:
  - 5 adapter файлов в `lib/features/expense/data/adapters/expense/`
  - register block + import + entityType добавлены в `sync_orchestrator_provider.dart`
  - `flutter analyze` все ещё PASS
- [ ] **report.md** написан с цитированием actual `verify` JSON output (errors=N, warnings=M, infos=K)
- [ ] **Все 62+ existing tests passing** + новые tests для orchestrator_patcher

### Should-have (nice-to-have, не блокеры)

- [ ] CLI `codegen verify --runtime` (TASK-010) integration — auto-run smoke на новом sync_core 0.3.0 проекте (если TASK-010 закрыт ранее)
- [ ] Удалить упоминания R1 (`base_sync_repository`, `sync_controller_provider`, `sync_registry`) изо всех docs (`docs-code-generator/` legacy archive trough)

## STOP-gates

Деструктивные операции, требующие явного `y/N` подтверждения от User'а перед каждым выполнением:

1. **Правка t115 template** (`G:/Templates/flutter/t115/`) — каждый коммит template маркеров требует STOP. Template вне репо, изменения blast radius на все будущие `create-project`.
   - **Phase A0** (orchestrator minimal state — drop 4 tasks registers + imports + entityTypes) — особо destructive, требует explicit STOP.
   - **Phase A0.6** (закомментировать tasks UI в `home_page.dart`) — preserve TASK-002 default state.
   - **⚠ Verification rule между A0 и F0:** НЕ запускать full `codegen verify --name t115` (даст FAIL на intermediate broken state, может ввести в заблуждение). Допустим только targeted `flutter analyze` для конкретных новых файлов или `npm test` для unit-tests.
2. **`codegen create-project --name t152`** — создаёт свежий проект на disk (~3 минуты, ~500MB). Перед запуском подтвердить какой `<N+1>` использовать (текущий последний был `t143`).
3. **Удаление test-проектов** `G:/Projects/Flutter/serverpod/t<N>/` — за разрешением (политика «новый t152 при каждом фиксе»).
4. **Force push** на feature branch — допустим без STOP, на master — **запрещено** (только через PR + squash-merge).

## Заметки по реализации

### Reference (validated patterns)

**t115 (validated 2026-05-02):**
- [`G:/Templates/flutter/t115/t115_flutter/lib/core/sync/`](../../../../../../Templates/flutter/t115/t115_flutter/lib/core/sync/) — 5 source файлов (8 на disk включая 3 `.g.dart` Riverpod codegen), hardcoded register'ы для 5 entities
- [`G:/Templates/flutter/t115/t115_flutter/lib/features/tasks/data/adapters/category/`](../../../../../../Templates/flutter/t115/t115_flutter/lib/features/tasks/data/adapters/category/) — 5 файлов adapter pattern
- [`G:/Templates/flutter/t115/t115_flutter/lib/features/tasks/data/adapters/task_tag_map/task_tag_map_remote_adapter.dart`](../../../../../../Templates/flutter/t115/t115_flutter/lib/features/tasks/data/adapters/task_tag_map/task_tag_map_remote_adapter.dart) — junction routing update→createX pattern
- [`G:/Templates/flutter/t115/t115_flutter/lib/features/tasks/data/repositories/category_repository_impl.dart`](../../../../../../Templates/flutter/t115/t115_flutter/lib/features/tasks/data/repositories/category_repository_impl.dart) — `// manifest: entity` ✅ (already works)

**sync_core docs:**
- [conventions.md § Pattern 6](../../../../../../Projects/Flutter/Packages/sync_core/ai/docs/conventions.md) — multi-entity registration + FK ordering
- [conventions.md § Pattern 7](../../../../../../Projects/Flutter/Packages/sync_core/ai/docs/conventions.md) — Junction entities + soft-delete + late-register
- [ADR-0004](../../../../../../Projects/Flutter/Packages/sync_core/ai/docs/decisions/adr-0004-multi-entity-runtime-guidance.md) — 5 multi-entity Q closed via consumer responsibility
- [TASK-001 report](../../../../../../Templates/flutter/t115/ai/tasks/done/TASK-001-migrate-t115-sync-layer-to-sync-core-0-3-0--multi-entity-validation-gate/report.md) — runtime evidence Windows + Android

### Codegen reference

- `relation_patcher.ts` — pattern для idempotent + recovery-from-legacy-duplicates (BUG-003 fix). orchestrator_patcher повторяет тот же подход.
- `entity_yaml_validator.ts` — validation hook before generation (BUG-004). Для junction (`*Map`) валидация уже пропускается — это автоматически даст `manifest: manyToMany` routing.
- `app_database_generator.ts` — scan-based pattern (BUG-005). Не используется для sync (отдельный domain), но reference для idempotent patching.

### Анти-паттерны

- НЕ создавать новый `// manifest:` тип — переиспользуем `entity` (для обычных), `manyToMany` (для junction), `startProject` (для core/sync infra + Configuration singleton).
- НЕ хардкодить entity names в orchestrator_patcher — через `ServerpodModel.className` + `replacement_util.ENTITY` словарь.
- НЕ убирать защитный `// === generated_start ===` re-run safety — patcher должен быть полностью идемпотентным.
- НЕ патчить руками target проекты для прохождения verify — это сигнал бага codegen (per CLAUDE.md DoD).

## Релевантный контекст

Файлы обязательного прочтения перед началом (executor):

**Codegen src (zone of work):**
- `src/features/generation/generators/relation_patcher.ts` — pattern для idempotent patcher
- `src/features/generation/generators/generation_service.ts` — flow integration point
- `src/features/generation/generators/section_generators.ts` + `section_config.ts` — secrets of replacement
- `src/features/generation/generators/manifests.ts` + `marker_analyzer.ts` — manifest types
- `src/features/generation/replacement/replacement_util.ts` — словари (ENTITY / M2M / COMMON)
- `src/adapters/cli/commands/create_project.ts` — `patchPubspecPackagePaths` location

**t115 template (read-only reference):**
- `G:/Templates/flutter/t115/t115_flutter/lib/core/sync/sync_orchestrator_provider.dart` — структура imports / register'ов / syncEntityTypes
- `G:/Templates/flutter/t115/t115_flutter/lib/features/tasks/data/adapters/category/*.dart` — 5 adapter files
- `G:/Templates/flutter/t115/t115_flutter/lib/features/tasks/data/adapters/task_tag_map/*.dart` — junction adapter
- `G:/Templates/flutter/t115/t115_flutter/lib/features/configuration/data/adapters/configuration/*.dart` — singleton entity adapters

**sync_core docs (read-only reference):**
- `G:/Projects/Flutter/Packages/sync_core/ai/docs/conventions.md` — Patterns 1-7
- `G:/Projects/Flutter/Packages/sync_core/ai/docs/contracts.md` — public API
- `G:/Projects/Flutter/Packages/sync_core/ai/docs/decisions/adr-0004-multi-entity-runtime-guidance.md`

**codegen docs to update:**
- `ai/docs/agent_memory.md` секция "Sync-паттерн в шаблоне"
- `ai/docs/architecture.md` секция "Sync-паттерн (в шаблоне t115)"
- `CLAUDE.md` секция "Что НЕ генерируется автоматически"

## План тестирования

### Unit tests (MockFileSystem) — 6+ тестов

1. **Empty orchestrator state** — patcher на свежем `sync_orchestrator_provider.dart` с пустыми marker блоками → добавляет один entity
2. **Single entity add** — повторный run с другой entity добавляет второй register block без дублей
3. **Idempotent re-run** — третий run с тем же YAML → identical content (digest stable)
4. **Junction entity (`*Map`)** — patcher детектит manyToMany через model.className suffix `Map` → routing через manifest: manyToMany
5. **Recovery from legacy duplicates** — если в файле >1 marker-пары `:syncRegistrations` → схлопываются в одну (как relation_patcher BUG-003 fix)
6. **Multiple entities sequential** — 5 add'ов → 5 register блоков + 5 imports + 5 entries в syncEntityTypes без race

### Integration (DoD verify) — 2 прогона

1. `codegen verify --name t115` regression (existing template post-markers) → PASS errors=0
2. `codegen create-project --name t152` + `codegen verify --name t152` (свежий проект) → PASS errors=0
3. (Bonus) `codegen generate-entity --yaml expense.spy.yaml ... --workspace t152` → PASS, проверить 5 файлов + 3 marker блока обновлены + `flutter analyze` clean

### Definition of Done (cite actual numbers)

В `report.md` цитировать реальный JSON вывод `verify`:
```
[verify regression t115]
  ✓ flutterAnalyze — Xms (errors=0, warnings=N, infos=M)

[verify fresh t152]
  ✓ flutterAnalyze — Xms (errors=0, warnings=N, infos=M)
```

## Результаты (ожидаемые файлы)

**Создано:**
- `src/features/generation/generators/orchestrator_patcher.ts`
- `src/test/generators/orchestrator_patcher.test.ts`

**Изменено в codegen src:**
- `src/features/generation/generators/generation_service.ts` (новый flow step)
- `src/adapters/cli/commands/create_project.ts` (`patchPubspecPackagePaths` regex extension)

**Изменено в t115 template (`G:/Templates/flutter/t115/`):**
- 30 файлов с manifest маркерами (см. Phase A)
- `lib/core/sync/sync_orchestrator_provider.dart` с marker блоками (Phase B)

**Изменено в codegen docs:**
- `ai/docs/agent_memory.md`
- `ai/docs/architecture.md`
- `CLAUDE.md`
- (опционально) `ai/docs/INDEX.md`

**Создано в codegen ai/:**
- `ai/tasks/active/TASK-011-.../task.md` ← этот файл
- `ai/tasks/active/TASK-011-.../report.md` ← заполняется executor'ом по ходу + финал

## План работы (декомпозиция от teamlead, executor отмечает [x])

### Phase A0 — Orchestrator minimal Configuration-only baseline (STOP-gate, per Discussion #1 Variant A)

- [x] **A0.6 (PRECONDITION) — закомментировать tasks UI ПЕРЕД A0:** в `lib/features/home/presentation/pages/home_page.dart` (или эквивалентный файл) закомментировать tasks features references — вернуть к pre-TASK-001 Phase 4 state (TASK-002 default "tasks off"). Без этого t115 будет broken UI-wise между A0 и F0. — ✅ done 2026-05-02 (User ok), 3 imports + 3 state-поля + 6 виджетных строк закомментированы line-by-line, hint comments сохранены, `flutter analyze lib/features/home/presentation/pages/home_page.dart` → No issues found.
- [x] A0.1. В `lib/core/sync/sync_orchestrator_provider.dart` удалить 4 imports tasks adapters (Category/Task/Tag/TaskTagMap — 20 import строк) — ✅ done 2026-05-02
- [x] A0.2. Удалить 4 строки `'category', 'task', 'tag', 'task_tag_map'` из `syncEntityTypes` const list (оставить только `'configuration'`) — ✅ done 2026-05-02
- [x] A0.3. Удалить 4 `orchestrator.register<...>(...)` блока (Category/Task/Tag/TaskTagMap), оставить только `register<ConfigurationEntity>(...)` — ✅ done 2026-05-02
- [x] A0.4. ⚠ Ожидаемое промежуточное состояние: t115 не compile / runtime errors на tasks UI до Phase F0 — acceptable; targeted `flutter analyze lib/core/sync/sync_orchestrator_provider.dart` → No issues found (1.3s).
- [x] A0.5. Skip verify run на этом этапе — verify запустится в F1 после re-add

**⚠ Verification rule между Phase A0 и Phase F0 (per Discussion #1 Decision §10):** НЕ запускать full `codegen verify --name t115` (даст FAIL на intermediate broken state, может ввести в заблуждение). Допустим только targeted `flutter analyze` для конкретных новых файлов или `npm test` для unit-tests. Документировано в "Журнал исполнения" — executor не должен паниковать на intermediate verify failures.

### Phase A — Manifest markers в t115 template (STOP-gate)

- [x] A1. Добавить `// manifest: startProject` в **5 source файлов** `lib/core/sync/*.dart` — ✅ done 2026-05-02
- [x] A2. Добавить `// manifest: startProject` в 5 файлов `lib/features/configuration/data/adapters/configuration/*.dart` — ✅ done 2026-05-02
- [x] A3. Добавить `// manifest: entity` в 15 файлов `lib/features/tasks/data/adapters/{category,task,tag}/*.dart` — ✅ done 2026-05-02 (5 файлов done предыдущим segment'ом, 3 tag добавлены в текущем segment'е, 7 уже было)
- [x] A4. Добавить `// manifest: manyToMany` в 5 файлов `lib/features/tasks/data/adapters/task_tag_map/*.dart` — ✅ done 2026-05-02 (все 5 добавлены в текущем segment'е)
- [x] A5. Skip `codegen verify --name t115` — verify в F1 после re-add
- [ ] A6. (опционально) Прогон `codegen create-project --name t144` baseline — отложен до Phase F2

### Phase B — Orchestrator marker блоки в template

- [ ] B1. В `lib/core/sync/sync_orchestrator_provider.dart` обернуть Configuration import в `:syncImports` marker блок (после A0 это 5 imports configuration adapters + dao + entity)
- [ ] B2. Обернуть `const List<String> syncEntityTypes = ['configuration']` в `:syncEntityTypes` marker блок
- [ ] B3. Обернуть `orchestrator.register<ConfigurationEntity>(...)` вызов в `:syncRegistrations` marker блок
- [ ] B4. Skip `codegen verify --name t115` (ожидаемо fail — компенсируется Phase F0)
- [ ] B5. Manual inspection orchestrator файла — все 3 marker pairs paired correctly, content внутри сохранён, нет orphan markers
- [ ] B6. Unit test (написать в Phase C2 вместе с другими): `SectionReplacer` на orchestrator файле без model.changes → file content stable (digest идентичный двумя последовательными вызовами)
- [ ] B7. SectionReplacer unit tests для marker блоков `:syncRegistrations` / `:syncImports` / `:syncEntityTypes` (per Discussion #1 codegen teamlead concern):
  - empty marker pair → patcher inserts content
  - marker pair с existing content → patcher idempotent (повторный run = identical)
  - malformed marker (missing `generated_end`) → SectionReplacer **не должен** crashиться, должен skip + log warning (existing behaviour, just verify)
  - duplicate marker pairs → recovery (per BUG-003 pattern relation_patcher.ts) — схлопнуть в одну

### Phase C — Codegen TypeScript

- [ ] **C0 (PRECONDITION — replacement_util audit, per Discussion #1 codegen teamlead concern):** проверить ENTITY/M2M словари в `src/features/generation/replacement/replacement_util.ts` на missing substitutions для orchestrator_patcher:
  - `XEntity` (PascalCase + Entity suffix)
  - `'x'` lowercase entityType identifier (это **новый** identifier, не файл path!) — может потребовать `entityTypeId` или `dLower` или `entitySnake` rule
  - `XRemoteAdapter` / `XPullAdapter` / `XEventAdapter` / `XPayloadCodec` / `XLocalApply`
  - `XDao`
  - Junction (M2M) словарь — те же substitutions для junction entities, плюс M2M-specific (например `entity1_entity2_map`)
  - Если missing — добавить с тестами (`replacement_util.test.ts` extension)
- [ ] C1. Создать `src/features/generation/generators/orchestrator_patcher.ts` (analog `relation_patcher.ts`):
  - Функция `patch(model: ServerpodModel, content: string): string` — возвращает обновлённый содержимое orchestrator файла
  - Идемпотентный: повторный вызов с тем же model = identical content
  - Junction detection: `model.className.endsWith('Map')` → routing через manifest: manyToMany словарь
  - Recovery from legacy duplicates: replace через callback с regex `/\/\/ === generated_start:syncRegistrations[\s\S]*?\/\/ === generated_end:syncRegistrations ===/g` (как `relation_patcher.ts`)
- [ ] C2. Создать `src/test/generators/orchestrator_patcher.test.ts` — 6 тестов minimum (см. План тестирования)
- [ ] C3. Подключить в `generation_service.ts` после `RelationPatcher.patch()` flow
- [ ] C4. `npm test` — 62 + 6 = 68+ tests passing
- [ ] **C7 (mock-based concurrent test — per Discussion #1 codegen teamlead concern):** test scenario "concurrent generate-entity для 2 entities должен не race / leave consistent state". Mock-based проверка логики (не runtime concurrent):
  - Вызов patcher для entity A → отдельный snapshot orchestrator state
  - Вызов patcher для entity B на том же initial state → отдельный snapshot
  - Sequential apply: A then B vs B then A → final orchestrator state должно быть **порядко-независимым** (commutative operation)

### Phase D — patchPubspecPackagePaths fix

- [ ] D1. В `src/adapters/cli/commands/create_project.ts` функция `patchPubspecPackagePaths` — расширить regex для покрытия sync_core path-dep
- [ ] D2. Тест на MockFileSystem (если возможно) или manual verify через `create-project --name t152` + проверить `<X>_flutter/pubspec.yaml`

### Phase D5 — AppDatabaseGenerator scan paths fix (BUG-008)

Per [BUG-008](../../bug-reports/008-app-database-generator-misses-core-sync-tables.md) — scan игнорирует tables вне `features/*/data/datasources/local/tables/`, теряет `core/sync/sync_queue_table.dart`.

- [ ] D5.1. В `src/features/generation/generators/app_database_generator.ts` расширить scan paths (Variant B generic): добавить второй glob `<flutterLib>/core/**/*_table.dart` к existing scan
- [ ] D5.2. Regression test в `src/test/generators/app_database_generator.test.ts`: MockFS с `features/X/.../X_table.dart` + `core/sync/sync_queue_table.dart` → оба попадают в imports + tables list в результирующем `database.dart`
- [ ] D5.3. Idempotency test: повторный run → identical content
- [ ] D5.4. `npm test` PASS

### Phase E — Codegen docs cleanup

- [ ] E1. `ai/docs/agent_memory.md` секция "Sync-паттерн в шаблоне" → переписать под sync_core 0.3.0
- [ ] E2. `ai/docs/architecture.md` секция "Sync-паттерн (в шаблоне t115)" → переписать
- [ ] E3. `CLAUDE.md` секция "Что НЕ генерируется автоматически" — убрать упоминание R1 sync stack
- [ ] E4. (опционально) `ai/docs/INDEX.md` — если есть R1 references
- [ ] E5. `README.md` (root) — short bullet про sync_core 0.3.0 multi-entity sync + link на новый detailed doc (per Discussion #1 codegen teamlead — not expand README extensively):
  - Bullet: "Generates sync_core 0.3.0 multi-entity sync (validated cross-device на Windows + Android через t115/TASK-001). 5 adapter файлов на entity + mutation-first Repository + idempotent orchestrator registration patcher."
  - Link на `docs-code-generator/sync-core-integration.md` для детального описания
- [ ] **E5.1 — создать `docs-code-generator/sync-core-integration.md`** (per Discussion #1 codegen teamlead concern №3):
  - Что генерируется: 5 adapter файлов per entity (RemoteAdapter / PullAdapter / EventAdapter / PayloadCodec / LocalApply) + 3 orchestrator marker блока (:syncImports / :syncEntityTypes / :syncRegistrations)
  - YAML model requirements: 6 базовых полей (id / userId / customerId / createdAt / lastModified / isDeleted) + парный `*_sync_event.spy.yaml`
  - Limitations: junction `*Map` suffix detection (TASK-013 backlog для robust solution), soft-delete via update pattern (server endpoints без deleteX RPC)
  - References: sync_core conventions.md Patterns 6-7 (multi-entity registration + junction patterns), ADR-0004 (multi-entity runtime guidance), t115/TASK-001 report (validated reference)
- [ ] E6. Создать TASK-013 backlog placeholder в `ai/tasks/backlog/` или `ai/docs/roadmap.md` — robust junction detection (YAML field analysis или explicit `junction: true`), priority bump trigger: weight TASK-018 false-negatives на `endsWith('Map')` heuristic

### Phase F — Final DoD verify

- [ ] F0. **E2E patcher validation:** прогон 4× `codegen generate-entity --yaml {category,task,tag,task_tag_map}.spy.yaml --feature-path .../tasks --workspace t115` → восстанавливает orchestrator state эквивалентный pre-A0 (4 register'а + 4 imports + 4 entityTypes ре-добавлены через patcher)
- [ ] F1. `codegen verify --name t115` regression (после F0 re-add) — PASS errors=0
- [ ] F2. `codegen create-project --name t152` (~3 минуты, STOP-gate) — PASS
- [ ] F3. `codegen verify --name t152` — PASS errors=0 (Configuration-only baseline проект работает clean)
- [ ] F4. (опционально) В свежем проекте `codegen generate-entity --yaml expense.spy.yaml --feature-path .../expense --workspace t152` — успех + verify clean (patcher создал 5 adapter файлов + register block)
- [ ] F5. `report.md` написан с цитированием actual JSON output (errors=N, warnings=M, infos=K) для F1 + F3
- [ ] F6. PR + squash-merge → master (после User approval)

## Журнал исполнения

(Executor заполняет по ходу — решения, блокеры, findings)

- [2026-05-02] Прочитал task.md, AGENTS.md, CLAUDE.md, agent_memory.md, INDEX.md, executor.prompt.md, Discussion #1 archive.
- [2026-05-02] `task.py start` через `--stash` — успешно создал `feature/TASK-011-sync-core-0-3-0-templates-integration`, untracked файлы (TASK-011 директория + Discussion archive + status.md mod) перенесены в feature ветку.
- [2026-05-02] Inspect t115 template state:
  - `lib/core/sync/`: 8 файлов (4 .dart + 4 .g.dart) — `app_lifecycle_provider` / `device_id_provider` / `drift_sync_queue_store` / `sync_orchestrator_provider` / `sync_queue_table` (последний без .g.dart). Реальное число `.dart` файлов: **5 (4 .dart с парами .g.dart + 1 без .g)**. Task.md упоминает "8 файлов в `lib/core/sync/*.dart` (исключая `.g.dart`)" — это значит 5 файлов (только `.dart`, не `.g.dart`); надо уточнить с teamlead'ом.
  - `lib/features/configuration/data/adapters/configuration/`: 5 .dart файлов (event/local_apply/payload_codec/pull/remote adapter)
  - `lib/features/tasks/data/adapters/{category,task,tag,task_tag_map}/`: 5+5+5+5 = 20 .dart файлов
  - `home_page.dart` — tasks UI **не закомментирован**: live imports, state поля `_selectedCategoryId/_selectedTaskId/_selectedTagId`, live виджеты CreationSection/RelationManagementSection/DataDisplaySection.
- [2026-05-02] Last test project: t149 → следующий будет t150 (для F2).
- [2026-05-02] Прежде чем трогать template — STOP-gate №1 (A0.6), жду ok от teamlead'а.
- [2026-05-02] **STOP-gate №1 ✅ approved User'ом → Phase A0.6 done.** В `G:/Templates/flutter/t115/t115_flutter/lib/features/home/presentation/pages/home_page.dart` закомментировано:
  - 3 import строки (20–22): `creation_section.dart` / `data_display_section.dart` / `relation_management_section.dart`
  - 3 state-поля (36–38): `_selectedCategoryId` / `_selectedTaskId` / `_selectedTagId`
  - 3 виджета + 2 разделителя `SizedBox(height: 20)` в `build()` (130–143): `CreationSection(...)` (5 строк) + `RelationManagementSection(...)` (6 строк) + `const DataDisplaySection()` + 2 `SizedBox`
  - Hint comments на строках 17–19, 34–35, 127–129 сохранены без изменений (developer guidance "раскомментировать после generate-entity")
  - Verification: `flutter analyze lib/features/home/presentation/pages/home_page.dart` → **No issues found** (1.8s, 0 errors)
  - Не делал full `codegen verify --name t115` per Discussion #1 Decision §10 (intermediate state между A0 и F0).
  - Замечание: pre-existing artefact на строке 3 — закомментированный `// import 'package:ble_feature/ble_feature.dart';` дубликат активного импорта на строке 4. Не моя зона (Phase A0.6 scope — только tasks UI), не трогаю.
- [2026-05-02] ⏸ STOP-gate №2 (Phase A0) — план drop'а tasks register'ов в `sync_orchestrator_provider.dart` зафиксирован в report.md, жду ok.
- [2026-05-02] **STOP-gate №2 ✅ approved User'ом → Phase A0 + A1-A4 done.**
  - **A0:** orchestrator drop'ы выполнены (28 imports + 4 entityTypes + 4 register блоков). Файл reduced 256→197 lines. Docstring переписан под Configuration baseline. Verification: `flutter analyze lib/core/sync/sync_orchestrator_provider.dart` → No issues found (1.3s).
  - **A1-A4:** manifest markers добавлены в 30 файлов:
    - A1: 5 sync infra source файлов (`// manifest: startProject`)
    - A2: 5 Configuration adapter файлов (`// manifest: startProject`)
    - A3: 15 task/category/tag adapter файлов (`// manifest: entity`) — 10 уже было предыдущим executor'ом, 3 tag (`tag_payload_codec.dart` / `tag_pull_adapter.dart` / `tag_remote_adapter.dart`) добавлены в текущем segment'е
    - A4: 5 task_tag_map adapter файлов (`// manifest: manyToMany`) — все 5 добавлены в текущем segment'е
  - Verification: `flutter analyze lib/features/tasks/data/adapters/ lib/features/configuration/data/adapters/ lib/core/sync/` → No issues found (1.3s). Markers — comment-only.
- [2026-05-02] ⏸ STOP-gate №3 (Phase B) — план оборачивания 3 marker блоков (`:syncImports` / `:syncEntityTypes` / `:syncRegistrations`) с line-numbered границами зафиксирован в report.md, жду ok teamlead'а.

### Уточнение по числу файлов в Phase A1

Task.md говорит "8 файлов в `lib/core/sync/*.dart` (исключая `.g.dart`)" — фактически в директории 8 файлов всего, но из них `.dart` (не `.g.dart`) — **5**: `app_lifecycle_provider.dart`, `device_id_provider.dart`, `drift_sync_queue_store.dart`, `sync_orchestrator_provider.dart`, `sync_queue_table.dart`. Остальные 3 — `.g.dart` (генерируются Riverpod codegen). Манифест-маркер ставится только в исходных `.dart` файлах. Принимаю: **5 manifest: startProject маркеров в lib/core/sync/**, что соответствует исключению `.g.dart`. Total Phase A: 5 + 5 + 15 + 5 = **30 manifest маркеров** (не 33 как в task.md). Запишу в report.md, не блокирую — отклонение от cosmetic числа не меняет суть phase.
