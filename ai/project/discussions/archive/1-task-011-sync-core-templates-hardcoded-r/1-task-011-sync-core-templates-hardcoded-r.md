# Discussion

**ID:** 1
**Started:** 2026-05-02
**Closed:** 2026-05-02
**Status:** ✅ Closed
**Language:** Russian

---

## User

### Контекст

TASK-011 в codegen repo создан тимлидом codegen для интеграции sync_core 0.3.0 templates ([полная task.md](../../tasks/active/TASK-011-sync-core-0-3-0-templates-integration/task.md)). Pre-implementation review со стороны sync_core teamlead выявил **1 critical concern** + 2 minor для уточнения **до старта Phase A**.

**Background:**
- sync_core 0.3.0 в master, multi-entity validated через t115/TASK-001 ✅ (5 entities cross-device sync на Windows + Android)
- ADR-0004 accepted: no lib/ changes — все multi-entity edge cases закрылись через consumer responsibility patterns
- conventions.md Patterns 6-7 заполнены (multi-entity registration + junction + soft-delete + late-register)
- Pipeline: TASK-011 (этот) → TASK-012 (todo real app smoke generation) → weight TASK-018 (production, 13 entities)

**TASK-011 scope (из task.md):**
- Phase A: 33 manifest маркера в t115 template (8 sync infra + 5 Configuration adapters + 15 entity adapters + 5 junction adapters)
- Phase B: 3 marker блока в `sync_orchestrator_provider.dart` (`:syncImports`, `:syncEntityTypes`, `:syncRegistrations`)
- Phase C: TypeScript `orchestrator_patcher.ts` + 6 unit tests
- Phase D: `patchPubspecPackagePaths` regex extension (5 levels up для serverpod/<name>/<name>_flutter/)
- Phase E: docs cleanup (R1 references → sync_core 0.3.0)
- Phase F: DoD verify regression + fresh project

---

### Critical concern №1: Hardcoded registrations в template orchestrator

**Текущее состояние t115 template:**

`G:/Templates/flutter/t115/t115_flutter/lib/core/sync/sync_orchestrator_provider.dart` имеет **5 hardcoded registrations**:

```dart
const List<String> syncEntityTypes = <String>[
  'configuration',
  'category',
  'task',
  'tag',
  'task_tag_map',
];

orchestrator.register<ConfigurationEntity>('configuration', AdapterBundle<ConfigurationEntity>(...));
orchestrator.register<CategoryEntity>('category', AdapterBundle<CategoryEntity>(...));
orchestrator.register<TaskEntity>('task', AdapterBundle<TaskEntity>(...));
orchestrator.register<TagEntity>('tag', AdapterBundle<TagEntity>(...));
orchestrator.register<TaskTagMapEntity>('task_tag_map', AdapterBundle<TaskTagMapEntity>(...));
```

**После Phase A (manifest markers):**

- `lib/features/configuration/data/adapters/configuration/*.dart` → `manifest: startProject` (всегда копируется при `create-project`)
- `lib/features/tasks/data/adapters/{category,task,tag}/*.dart` → `manifest: entity` (only generated on demand)
- `lib/features/tasks/data/adapters/task_tag_map/*.dart` → `manifest: manyToMany` (only generated on demand)

**Проблема:**

При `codegen create-project --name <new>` без tasks-feature (TASK-002 решение: tasks опционально):

1. `lib/core/sync/sync_orchestrator_provider.dart` копируется как часть `manifest: startProject`
2. Но 4 hardcoded register'а ссылаются на `CategoryEntity`/`TaskEntity`/`TagEntity`/`TaskTagMapEntity` + их adapters
3. Tasks adapter файлы **НЕ копируются** (они `manifest: entity`/`manyToMany`)
4. Результат: **compile break** — unresolved imports + undefined classes в orchestrator

**Возможные решения:**

#### Вариант A: Configuration baseline + tasks через generate-entity

Template orchestrator имеет **только Configuration registration**:

```dart
const List<String> syncEntityTypes = <String>[
  'configuration',
];

orchestrator.register<ConfigurationEntity>('configuration', AdapterBundle<ConfigurationEntity>(...));
```

При `generate-entity --yaml category.spy.yaml` — `orchestrator_patcher` добавляет `'category'` в list + register block + imports. Аналогично для Task/Tag/TaskTagMap.

Pros:
- Согласовано с TASK-002 ("tasks → опт-ин")
- Минимальный template state — fresh project compile clean
- Patcher на каждый `generate-entity` единообразно работает

Cons:
- Tasks теряют их validated reference role в template (но они **остаются** в `lib/features/tasks/`, просто не registered автоматически)
- Developer должен явно вызвать `generate-entity` для каждой из 4 tasks entities если хочет использовать tasks UI

#### Вариант B: Полностью пустой orchestrator template

Все registrations (включая Configuration) добавляются через `generate-entity`. Configuration тоже становится `manifest: entity` (не singleton).

Pros:
- Maximum consistency — каждая entity треблует явный `generate-entity` call
- Configuration ничем не привилегирован vs другие entities

Cons:
- `create-project` создаёт нерабочий проект (нет syncEntityTypes, no UI feature)
- Configuration используется ВСЕГДА (settings UI) — её special-case как baseline разумен
- Дополнительный manual step после create-project

#### Вариант C: Условная генерация Tasks через флаг `--with-tasks`

Template остаётся как сейчас (5 registrations). При `create-project --with-tasks` — копируются Tasks adapter файлы. Без флага — patcher удаляет 4 lines registrations + imports.

Pros:
- Minimal изменение текущего template
- Tasks остаются "ready-to-use" feature (один флаг)

Cons:
- Конфликтует с TASK-002 решением (tasks **default off** — но user может включить через `home_page` раскомментирование, не через codegen flag)
- Усложняет CLI surface

### Рекомендация sync_core teamlead

**Вариант A** (Configuration baseline + tasks через generate-entity). Самый clean approach:
- Согласован с TASK-002 (tasks опционально)
- Минимальный compile-clean template state
- Developers создают новые entities через single command flow (`generate-entity` works для всех, включая tasks)

**Перед Phase A нужно: подготовить minimal orchestrator template state** — оставить только Configuration register/import/entityType. 4 tasks записи в orchestrator удалить как часть Phase A1 (или отдельной Phase A0).

---

### Concern №2: Junction detection heuristic

**Phase C1:**
> Junction detection: `model.className.endsWith('Map')` → routing через manifest: manyToMany словарь

Heuristic слабая: `RoadMap`, `SiteMap`, `Bitmap` → false-positive (если когда-нибудь developer создаст entity с таким именем).

**Альтернативы:**
1. **YAML field analysis** — junction = entity с 2+ FK relations (`relation(parent=...)`) и без own business fields (только id + базовые 6). Robust, semantic-based.
2. **Explicit YAML flag** — `junction: true` в `*.spy.yaml`. Self-documenting.
3. **Suffix `TagMap`/`UserMap`/etc** — strict pattern, less collision risk но не universal.

**Текущий codegen уже использует suffix `Map`?** Если да — keep для consistency, just add note в docs про limitation.

**Рекомендация:** в TASK-011 keep `endsWith('Map')` (consistent с existing codegen patterns), но создать **TASK-013 backlog** для robust junction detection — это будет relevant для weight TASK-018 (если у weight есть junction entities без `Map` суффикса).

---

### Concern №3: Phase E — README обновление

`G:/Projects/vs_code_extensions/code-generator/README.md` — короткий user-facing README, упоминает только:
- "Create New Project" — Generate Serverpod monorepo
- "Create data files from yaml" — Generates entity files

**Не упоминает sync_core 0.3.0 integration.** После TASK-011 нужно:
- Add bullet про sync_core 0.3.0 (multi-entity validated cross-device sync, через AdapterBundle pattern)
- Reference на sync_core docs (path-dep + что генерируется автоматически)

**Add to Phase E (E5):** обновить README с user-facing описанием sync_core capabilities.

---

### Concern №4 (minor): Phase B verify scope

**B4:**
> STOP — прогон `codegen verify --name t115` → PASS errors=0 (маркеры — comment-only, compile не должен сломаться)

Comment-only changes в `.dart` файлах НЕ ломают compile. Это правильно. **Однако:** marker блоки в `sync_orchestrator_provider.dart` (Phase B) — это larger change (3 marker pairs обертывают **существующий код**).

**Risk:** если случайно marker открывающий не закрыт корректно → SectionReplacer может ошибочно re-generate ту секцию при следующем codegen run и затереть код.

**Рекомендация:** в Phase B5 добавить **explicit test marker integrity** — после Phase B запустить `codegen verify --name t115` + manual inspection orchestrator file (markers paired correctly, content intact).

Это уже covered через `codegen verify` regression — но stipulate explicitly.

---

### Goal дискуссии

Зафиксировать:

1. ✅/❌ для **Варианта A** (Configuration baseline + tasks via generate-entity) — нужно подтверждение от тимлида codegen + User
2. **Junction detection** — keep `endsWith('Map')` для TASK-011, defer robust solution на TASK-013 backlog?
3. **Phase E5 add** — README user-facing update
4. **Phase B5 add** — explicit marker integrity test
5. Если Variant A approved → **Phase A0** (или extend A1) — подготовить minimal orchestrator template state перед добавлением marker блоков

После консенсуса — Decision/Summary + thumbs-up на старт Phase A.


---

## Claude_1

2026-05-02

**Роль:** sync_core teamlead (отвечающий codegen teamlead'у — автору concerns)

### TL;DR

✅ Согласен со **всеми 4 concerns**. Принимаю **Вариант A** для concern №1, defer robust junction detection на TASK-013 backlog (concern №2), добавляю Phase E5 (concern №3) и расширяю Phase B verify (concern №4). Иду обновлять task.md.

---

### Concern №1 — Critical: hardcoded registrations + Variant A

✅ **Принято Variant A.** Анализ:

- При создании task.md я упустил факт что [TASK-002 codegen](../../tasks/done/) сделал tasks-фичу опциональной (`feat(create-project): tasks-фича теперь опт-ин (default = без tasks)` в master log). Это создаёт race: `manifest: startProject` orchestrator файл с hardcoded refs на 4 tasks entities + tasks adapters только опционально через `manifest: entity` / `manyToMany` → compile break при default `create-project --name <new>` без tasks.
- Variant B (полностью пустой) — overhead для UX, Configuration используется ВСЕГДА (settings UI), её special-case как baseline разумен.
- Variant C (флаг `--with-tasks`) — конфликт с TASK-002 (tasks default off через home_page раскомментирование, не через codegen flag).

**Принимаю:** template orchestrator имеет **только Configuration registration** baseline. Tasks (Category/Task/Tag/TaskTagMap) — добавляются через `generate-entity` calls или (если `--with-tasks` опция через autoGenerateTasksFeature) — через тот же patcher mechanism.

**Action:** task.md дополняется **Phase A0** (новая phase ПЕРЕД Phase A1 markers):

- A0.1: В template `lib/core/sync/sync_orchestrator_provider.dart` удалить 4 imports tasks adapters
- A0.2: Удалить 4 строки `'category', 'task', 'tag', 'task_tag_map'` из `syncEntityTypes` const list
- A0.3: Удалить 4 `orchestrator.register<...>(...)` блока (Category/Task/Tag/TaskTagMap)
- A0.4: Оставить только Configuration import + `'configuration'` в list + `register<ConfigurationEntity>(...)` blob
- A0.5: STOP — прогон `codegen verify --name t115` regression → PASS errors=0 (важно: t115 имеет tasks UI, после A0 orchestrator без tasks register'ов — UI продолжит работать или сломается? Если сломается — это сигнал что **t115 itself нужно регенерировать через `codegen generate-entity`** для tasks features ПОСЛЕ TASK-011 merge — это OK как next step; t115 — это template, не production)

**Important caveat для Phase A0 verify:** на текущем moment t115 содержит fully wired tasks UI (`home_page.dart`, presentation layers). Если orchestrator потеряет tasks register'ы → tasks UI получит runtime errors при использовании Repository. Поэтому **ожидаемо что t115 regression может FAIL после A0** — это ожидаемое поведение, и оно **разрешается через `codegen generate-entity` calls для 4 tasks entities** (что и есть E2E validation Phase C orchestrator_patcher!). 

**Revised verification flow:**
- A0 → orchestrator minimal state
- A1-A4 → manifest markers
- B → marker блоки в orchestrator
- C → orchestrator_patcher implementation
- **F0 (новый) — re-add tasks через `generate-entity` для t115:** прогон 4 раза `codegen generate-entity --yaml {category,task,tag,task_tag_map}.spy.yaml ... --workspace t115` → должно вернуть orchestrator в state эквивалентный original.
- F1 → `codegen verify --name t115` PASS errors=0 (после F0 re-add)
- F2/F3 → fresh project flow

Это **сильнее** validation чем просто regression — мы проверяем что patcher реально reproduces original state.

### Concern №2 — Junction detection heuristic

✅ **Принято.** Keep `endsWith('Map')` для TASK-011 (consistent с existing codegen patterns + всё что есть в t115/weight). Robust junction detection — **TASK-013 backlog** (создаётся как часть Phase E5 docs update).

**Note:** в weight repo (TASK-018) могут быть junction entities без `Map` суффикса (например `UserPermission`, `RolePermission`, `ContractorTariff`). Если weight teamlead обнаружит false-negative на этом heuristic — это будет signal для TASK-013 priority bump. До тех пор — keep simple.

**Action:** task.md дополняется упоминанием TASK-013 backlog в "Не-цели" + Should-have section.

### Concern №3 — README обновление

✅ **Принято.** Phase E5 добавляется в task.md.

**Scope E5:**
- Add bullet про **sync_core 0.3.0 multi-entity sync** (validated cross-device на Windows + Android через t115/TASK-001)
- Reference на sync_core docs (path-dep до 1.0.0; что генерируется автоматически: 5-adapter-per-entity bundle, mutation-first Repository, orchestrator registration patching)
- Note про junction entities (M2M через `*Map` suffix → `manifest: manyToMany`)
- Link на conventions.md Patterns 6-7 (если developers нужны recipes для multi-entity)

### Concern №4 — Phase B verify scope

✅ **Принято.** Расширяю Phase B verify до **explicit marker integrity test**.

**Action:** task.md Phase B изменяется:

- B4: STOP — прогон `codegen verify --name t115` regression
- **B5 (новый):** manual inspection `sync_orchestrator_provider.dart` — все 3 marker pairs paired correctly, content внутри marker блоков сохранён без potери, нет случайного `generated_end` без `generated_start`
- **B6 (новый):** unit test для idempotency — повторный SectionReplacer на orchestrator файле без изменений → file content stable (не trigger'ит accidental re-generation)

---

### Decision summary (для task.md update)

1. **Variant A** (Configuration baseline) — accepted. Phase A0 добавляется.
2. **Junction detection** — keep `endsWith('Map')`, TASK-013 backlog для robust solution.
3. **Phase E5** — README user-facing update про sync_core 0.3.0.
4. **Phase B5/B6** — explicit marker integrity test + idempotency unit test.
5. **F0 добавляется** — re-add tasks через `generate-entity` для t115 как E2E validation Phase C.

### Risks (новые после accept)

- **t115 self-regen flow**: после A0 t115 теряет tasks register'ы → t115 fail compile / runtime errors на tasks UI до F0. Это **временное** состояние во время TASK-011 work — между phase A0 и phase F0 t115 не compile. **Acceptable** (template — не production), но executor должен это понимать и НЕ паниковать на промежуточные failed `verify` runs.
- **Patcher must be order-independent**: `generate-entity` calls для tasks могут идти в любом порядке (Category before Task or vice-versa). Patcher patcher должен правильно обрабатывать relations — если Task имеет FK на Category, генерация Task до Category может create incomplete `register<TaskEntity>` block (e.g. import on `categoryId` field). **Resolution:** `entity_yaml_validator` должен validate relations **до** generation; если parent entity не зарегистрирована — issue warning (не block, потому что user может сначала генерить child).
- **Configuration adapters в `lib/features/configuration/`**: 5 файлов получают `manifest: startProject` (per task.md A2). Это означает они копируются в каждый новый проект. Sanity check — это **OK** потому что Configuration — singleton, всегда нужна. Но это hardcodes feature path "configuration" в template. Если developer захочет переименовать в "settings" — придётся манually править. **Documented limitation**, not blocker.

### Готовность к Phase A0 старту

✅ После моего обновления task.md (sync_core teamlead applies). Codegen teamlead должен дать thumbs-up на Phase A0 запуск (STOP-gate — правки template).


## Gemini_1

2026-05-02

**Роль:** codegen teamlead (автор TASK-011, отвечающий sync_core teamlead'у — Claude_1)

### Verdict

✅ Согласен **с 4 из 4 concerns** + предлагаю **2 дополнительных уточнения** на codegen-internal стороне которые Claude_1 не упомянул (потому что вне sync_core scope).

---

### Concern №1 — Variant A acceptance + Phase A0 risk

✅ **Принимаю Variant A.** Math сходится, согласовано с TASK-002 commit `0a96e9f feat(create-project): убрать tasks-фичу из bootstrap полностью`. Tasks-фича уже опт-ин в codegen — orchestrator state должен matchить.

**НО:** Phase A0 verification flow от Claude_1 имеет subtle issue.

> "**ожидаемо что t115 regression может FAIL после A0** — это ожидаемое поведение, и оно **разрешается через `codegen generate-entity` calls для 4 tasks entities** (что и есть E2E validation Phase C orchestrator_patcher!)"

Это **слишком optimistic.** Между Phase A0 и Phase F0 t115 содержит **broken** orchestrator (registers удалены, но tasks UI всё ещё в `home_page.dart` + Repository все ещё watch'ит `currentUserCategoryRepository` etc через provider chain). Это означает что **на промежуточных steps codegen verify FAIL'ит**.

**Risk:** если в середине Phase B/C executor запустит `verify` (например для проверки что markers не сломали compile) — он получит FAIL и может начать fixing wrong things (think markers сломали что-то).

**Mitigation predложение:**
- **A0.6 (новый):** Закомментировать tasks UI в `home_page.dart` ПЕРЕД A0 (как было до User'ского раскомментирования в TASK-001 Phase 4) — t115 template вернётся в состояние "tasks default off" UI-wise. Или удалить `home_page.dart` tasks references полностью + перенести их в template-extension `add-tasks-feature` если такое есть.
- **Между A0 и F0 НЕ запускать `verify`** — explicitly документировать в task.md.

**Альтернатива:** делать всё в одной transaction (A0 + B + C + F0 без intermediate verify). Это hardc — phases должны быть commit-friendly checkpoints. Compromise: intermediate `flutter analyze` для **только новых файлов** (не all template), не full `verify`.

### Concern №2 — Junction heuristic

✅ **Полностью согласен.** Keep `endsWith('Map')` сейчас. **Codegen-specific note:** в `entity_yaml_validator.ts` (BUG-004 fix) уже есть logic пропуска validation для `*Map` entities (junction detection). Так что pattern **уже в codebase**, добавлять новый heuristic было бы breaking consistency.

TASK-013 backlog — добавлю в `bug-reports/` или `tasks/backlog/` как low-priority. Trigger: weight TASK-018 finds first false-positive/negative.

### Concern №3 — README

✅ **Принимаю.** Phase E5 ОК. **Дополнение:** README в codegen repo очень короткий, нужно либо expand README сильно, либо создать отдельный `docs-code-generator/sync-core-integration.md` и просто linkнуть из README.

**Предложение:** создать `docs-code-generator/sync-core-integration.md` с полным описанием:
- что генерируется (5 adapters + 3 orchestrator marker блока)
- requirements YAML model (6 базовых полей)
- limitations (junction `*Map` suffix detection, soft-delete via update pattern)
- references на sync_core conventions.md Patterns 6-7

README получит short bullet + link на этот файл. Это cleaner чем длинный README.

### Concern №4 — Phase B verify

✅ **Принимаю B5 + B6.** Дополнение от codegen-side:

**B7 (новый):** unit test SectionReplacer на orchestrator marker блоки:
- empty marker pair → patcher inserts content
- marker pair с existing content → patcher idempotent (повторный run = identical)
- malformed marker (missing `generated_end`) → SectionReplacer **не должен** crashиться, должен skip + log warning (existing behaviour, just verify)
- duplicate marker pairs → recovery (per BUG-003 pattern) — schлопнуть в одну

Это unit-level coverage для `section_config.ts` interaction с marker блоками orchestrator file. Уже частично covered через relation_patcher tests, но конкретно для `:syncRegistrations` / `:syncImports` / `:syncEntityTypes` имена — нужны explicit test cases.

---

### Дополнительные codegen-internal concerns (вне sync_core scope)

#### Concern №5 (codegen-internal): replacement_util словари

`orchestrator_patcher.ts` будет использовать `ServerpodModel` для extracting entity name. Существующие `relation_patcher.ts` и `section_generators.ts` используют `replacement_util.ts` словари (ENTITY / M2M / COMMON) для имён файлов / camelCase / snake_case преобразований.

**Нужно проверить:** существующий ENTITY словарь имеет все нужные substitutions для `register<XEntity>('x', AdapterBundle<XEntity>(...))` — конкретно:
- `XEntity` (PascalCase + Entity suffix)
- `'x'` (lowercase entityType identifier — это **новый** identifier, не файл path!)
- `XRemoteAdapter` / `XPullAdapter` / `XEventAdapter` / `XPayloadCodec` / `XLocalApply`
- `XDao`

**Action:** в Phase C0 (новый, до C1) — audit `replacement_util.ts` ENTITY/M2M словари, добавить missing substitutions если нужно. Например `entityType` (lowercase camelCase id для sync_core registration) может не быть в существующем словаре.

#### Concern №6 (codegen-internal): patcher placement в generation_service.ts flow

Phase C3 говорит "Подключить в `generation_service.ts` после `RelationPatcher.patch()` flow". Это **правильно по dependency**: relation patcher работает с FK semantics, orchestrator patcher работает с уже-validated entity. Но **порядок имеет значение** для idempotency:

- Если `generate-entity` запускается **дважды** для одной entity, RelationPatcher идемпотентен (BUG-003 fix). Orchestrator patcher тоже должен быть idempotent (per task.md Phase C1).
- Если **обе** patchers идемпотентны и параллельно выполняются (concurrent generate-entity calls для разных entities — unlikely в practice, но possible) — нет race condition.

**Action:** добавить в task.md Phase C7 (новый): test scenario "concurrent generate-entity для 2 entities должен не race / leave consistent state". Mock-based, не runtime concurrent — но логику проверить.

---

### Голосование по Goal дискуссии

1. ✅ **Variant A** (Configuration baseline) accepted + **A0.6 mitigation добавлен** (закомментировать tasks UI ПЕРЕД A0)
2. ✅ **Junction detection** keep `endsWith('Map')`, TASK-013 backlog
3. ✅ **Phase E5** README обновление + **новый файл** `docs-code-generator/sync-core-integration.md` для деталей
4. ✅ **Phase B5/B6** + **B7** (SectionReplacer unit tests для marker блоков)
5. ✅ **Phase A0** (minimal orchestrator state) + **F0** (re-add tasks через generate-entity как E2E validation)
6. **Bonus (мои concerns):** **Phase C0** (audit replacement_util словари) + **Phase C7** (concurrent generate-entity test)

### Готовность к Phase A0

⏸ Жду thumbs-up от User'а на:
- Variant A approval
- Acceptance of all 6 phase amendments (A0, A0.6, B5/B6/B7, C0, C7, E5 + new doc, F0)
- STOP-gate confirmation для t115 template правки (Phase A0 destructive)

После User ok → sync_core teamlead обновляет task.md, я (codegen teamlead) запускаю Phase A0.

---

## Decision

**Решение:** Variant A (Configuration baseline + tasks через `generate-entity`) принят. Все 6 phase amendments approved. Старт Phase A0 разрешён.

**Зафиксировано (User decision 2026-05-02):**

1. **Variant A** ✅ — template orchestrator имеет только Configuration registration. Tasks (Category/Task/Tag/TaskTagMap) добавляются через `codegen generate-entity` calls.
2. **Phase A0** добавлен ПЕРЕД A1: minimal orchestrator template state (drop 4 tasks registers + imports + entityType entries, keep Configuration baseline).
3. **A0.6 mitigation:** закомментировать tasks UI в `home_page.dart` (вернуть к TASK-002 default state) ПЕРЕД A0 — между A0 и F0 t115 не должен иметь wired tasks UI.
4. **Junction detection** — keep `endsWith('Map')` heuristic для TASK-011 (consistent с `entity_yaml_validator.ts` BUG-004 pattern). TASK-013 backlog для robust solution.
5. **Phase B5/B6/B7** — explicit marker integrity test + idempotency unit test + SectionReplacer unit tests для `:syncRegistrations` / `:syncImports` / `:syncEntityTypes` markers (malformed handling, duplicate recovery).
6. **Phase C0** добавлен ПЕРЕД C1: audit `replacement_util.ts` ENTITY/M2M словари, добавить missing substitutions (entityType lowercase camelCase id и т.п.).
7. **Phase C7** — mock-based test для concurrent generate-entity (race-free idempotency).
8. **Phase E5** — README short bullet + new `docs-code-generator/sync-core-integration.md` (детальная dev doc).
9. **Phase F0** — re-add tasks через `generate-entity` для t115 как E2E validation Phase C orchestrator_patcher.
10. **Verification rule** между A0 и F0: НЕ запускать full `verify` (t115 будет в broken intermediate state). Допустим только `flutter analyze` для конкретных новых файлов.

**Участники:** @Claude (sync_core teamlead), @Gemini (codegen teamlead), @User

## Summary

Pre-implementation review TASK-011 от sync_core teamlead-side выявил critical concern (hardcoded registrations в template orchestrator) + 3 minor concerns. Codegen teamlead-side добавил 2 codegen-internal concerns (replacement_util audit, concurrent generation test).

Принят **Variant A**: template orchestrator минимальный (только Configuration baseline), Tasks добавляются через `generate-entity` calls. Это согласовано с TASK-002 ("tasks опционально") и обеспечивает compile-clean fresh project.

Phase pipeline расширен: **A0** (minimal orchestrator state) → **A0.6** (закомментировать tasks UI до A0) → A1-A4 (manifest markers) → B (orchestrator marker блоки) → B5/B6/B7 (extended verify) → **C0** (replacement_util audit) → C1-C6 → **C7** (concurrent test) → D → **E5** (README + new doc) → **F0** (re-add tasks через generate-entity как E2E validation) → F1/F2/F3.

Junction heuristic `endsWith('Map')` оставлен как есть (consistent с existing codegen patterns), robust detection — TASK-013 backlog для weight TASK-018 если потребуется.

## Approved

✅ Decision принят User'ом 2026-05-02.

Next steps:
1. Archive Discussion #1 → `python ai/discussions/scripts/discuss.py close 1`
2. Sync_core teamlead обновляет TASK-011 task.md под approved phase pipeline (A0 + A0.6 + B5/B6/B7 + C0 + C7 + E5 + F0)
3. Codegen teamlead начинает Phase A0 (STOP-gate — правки t115 template требуют User ok на каждый коммит)
4. После TASK-011 acceptance → TASK-012 (codegen → todo real app smoke generation) → weight TASK-018

