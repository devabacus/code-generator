# Discussion

**ID:** 2
**Started:** 2026-05-02
**Status:** ✅ Closed
**Language:** Russian

---

## User

TASK-013 junction detection robust YAML field analysis - design questions

### Контекст

[TASK-013](../../tasks/active/TASK-013-junction-detection-robust-yaml-field-analysis/task.md) создана 2026-05-02 после TASK-011 round 3 adversarial review который обнаружил **2 confirmed false-negative junction entities** в weight repo:
- `RolePermission` (`weight_server/lib/src/models/user/role_permission.spy.yaml`) — pure 2-FK junction (`roleId` + `permissionId`)
- `CustomerUser` (`weight_server/lib/src/models/user/customer_user.spy.yaml`) — 3-FK + 1 nullable FK junction-style

Текущий heuristic `model.className.endsWith('Map')` производит false-negatives для junction'ов без `Map` суффикса → silent data divergence на out-of-order writes в production. Hard gate в [`roadmap.md`](../../docs/roadmap.md) Phase 1.5 блокирует weight TASK-018 пока TASK-013 не closed.

**TASK-013 цель:** replace `endsWith('Map')` на robust YAML field analysis (2+ FK + base-only fields = junction).

См. полный context:
- [`ai/bug-reports/junction-detection-audit.md`](../../bug-reports/junction-detection-audit.md) — 2 false-negatives + methodology gap
- [TASK-011 round 3 adversarial report](../../tasks/done/TASK-011-sync-core-0-3-0-templates-integration/adversarial-review-report-round3.md) — discovery context

### Вопрос для дискуссии

Перед запуском executor'а нужно согласовать **3 design questions**:

#### Q1: Junction-specific extra fields

Некоторые junction'ы могут иметь **extra fields** помимо FK + базовые 6 (id / userId / customerId / createdAt / lastModified / isDeleted). Примеры:
- `assignedAt: DateTime` — когда юзер получил permission
- `weight: int` — для ranking junction items (sortOrder)
- `isPrimary: bool` — для many-to-one с emphasis
- `note: String?` — annotation для junction connection

**Question:** считаем ли такую entity junction или regular?

**Variant A (strict):** только base fields + FK = junction. Любое extra field → regular.
- **Pro:** clean rule, no edge cases
- **Con:** реальные junction'ы которые трекают metadata (e.g. UserPermission с assignedAt) детектятся как regular → wrong adapter pattern

**Variant B (relaxed):** 2+ FK + base + few extras (whitelist tracking-style fields) = junction.
- Whitelist: `assignedAt`, `weight`, `sortOrder`, `isPrimary`, `note`
- **Pro:** покрывает realistic junction patterns
- **Con:** subjective whitelist, magic — что если developer использует другие имена?

**Variant C (explicit flag override):** strict default (Variant A), но `junction: true` в YAML overrides.
- **Pro:** automated detection covers 95%, edge cases через explicit flag — predictable, document'able
- **Con:** users должны знать про флаг (но это OK — это feature, не quirk)

**Recommend:** Variant C — strict default + explicit override. Документация в `sync-core-integration.md`.

#### Q2: `*Map` suffix fallback

После introducing field analysis — что делать с **существующим** `endsWith('Map')` heuristic'ом?

**Variant A (drop entirely):** clean break. Field analysis — single source of truth.
- **Pro:** simpler logic, no inconsistency между detection signals
- **Con:** **breaking change** для existing consumers использующих codegen-generated `*Map` entities (TaskTagMap в t115). Field analysis должен корректно детектить эти entities (что и должно happen, поскольку они структурно junction).
- **Risk:** если field analysis **пропустит** какой-то edge case существующего `*Map` — silent regression. Нужны regression tests на ALL existing `*Map` entities в codegen-generated проектах.

**Variant B (keep как secondary signal):** field analysis primary, suffix fallback warning.
- Logic: if field analysis says "regular" but className matches `*Map` → log warning "potential junction misdetection — consider explicit junction: true flag"
- **Pro:** safety net против edge cases
- **Con:** confusing dual-signal, warnings noise, может скрыть real bugs

**Variant C (suffix как additional positive signal):** OR logic — junction если field analysis OR suffix.
- **Pro:** strongest safety
- **Con:** RoadMap, SiteMap, Bitmap ambiguous — суффикс Map не значит junction. False-positives.

**Recommend:** Variant A — drop suffix entirely. Field analysis надёжнее, не вводит в заблуждение. **Pre-condition:** explicit regression tests на ВСЕ existing `*Map` entities в template t115 (TaskTagMap) + в свежих generated проектах — должны continue быть detected как junction.

#### Q3: Validation hook synchronization

`entity_yaml_validator.ts` (BUG-004 fix) уже имеет junction skip pattern: `*Map` entities пропускают 6-field requirement validation (поскольку junction'ы не нуждаются в full base fields).

После TASK-013 fix — junction detection logic будет в **двух** местах:
- `entity_yaml_validator` — что пропускать validation
- `orchestrator_patcher` — что routing'ть через `manyToMany` template

Если эти detection logic'и расходятся — silent inconsistency (validator says "regular" → 6-field check fails for legit junction; OR validator says "junction" but patcher routes regular → wrong adapter).

**Variant A (shared utility function):** вынести `isJunctionEntity(model)` в общий `parsers/junction_detector.ts` или подобный, both consumers (validator + patcher) используют ту же функцию.
- **Pro:** single source of truth, sync guaranteed
- **Con:** minor refactor, но clean

**Variant B (duplicate logic):** каждый consumer имеет свою copy.
- **Pro:** no refactor
- **Con:** drift между components, tests fragmented

**Variant C (hybrid: shared interface, separate impl):** shared signature но different impl per consumer.
- Не вижу use case — both consumers нужно ту же detection.

**Recommend:** Variant A — shared utility. Single test suite, single source.

### Goal дискуссии

Зафиксировать решения по 3 questions:

1. Q1 (junction-specific extra fields): A / B / C?
2. Q2 (`*Map` suffix fallback): A / B / C?
3. Q3 (validation hook sync): A / B / C?

Plus подтвердить scope cutoff:
- TASK-013 НЕ touches sync_core/weight repos
- TASK-013 НЕ refactor existing junction routing logic (template patterns) — только detection
- TASK-013 acceptance включает re-audit weight 14+ entities

После консенсуса → Decision/Summary в этом discussion + thumbs-up на executor spawn.

---

## Claude_1

2026-05-02 14:30

Прочитал task.md, audit, MULTI_AGENT_PROTOCOL, и текущие call-sites detection logic в codegen src. По существу — поддерживаю рекомендации User'а (C / A / A) с одним **критическим уточнением scope в Q3**: detection логика лежит в **трёх** местах, не в двух. Это меняет implementation scope и тесты.

### Q1 (junction-specific extra fields) → Variant C (strict + explicit override) ✅

Согласен с рекомендацией. Доводы User'а корректны. Дополнительные аргументы:

- **Вариант B обречён на whitelist drift.** `assignedAt`/`weight`/`sortOrder`/`isPrimary`/`note` — этот набор будет расти post-hoc по мере появления новых junction'ов с metadata. Сегодня `assignedAt`, через месяц `grantedAt`, потом `priority`, потом `tier` — каждое добавление = silent breaking change для существующих generated проектов. Whitelist в коде это чистое magic с нулевым contract'ом для пользователя.
- **Вариант A слишком restrictive.** Реально pure 2-FK junction'ы существуют (RolePermission, TaskTagMap), но junction'ы с tracking metadata (`assignedAt`) — тоже legitimate pattern. Strict A классифицирует их как regular, что даёт wrong adapter routing — точно тот же класс false-negative bug который TASK-013 призван исправить.
- **Вариант C даёт contract.** Field analysis покрывает 95% (RolePermission, CustomerUser, все existing `*Map`). Остальные 5% — explicit flag, документируем в `sync-core-integration.md`. Это не quirk, это feature: developer знает когда entity нестандартная и явно отмечает.

#### Implementation детали (sub-question под Q1)

Форма "explicit override" — открытый вопрос, **выношу отдельно** для решения:

- **Option C-1:** YAML field `junction: true` (top-level, рядом с `class`/`table`/`fields`). Простой, parser tolerates unknown top-level keys (проверил `server_yaml_parser.ts` — `parsed.class`/`parsed.table`/`parsed.fields` явно читаются, остальное игнорируется). **STOP-gate** per task.md ("YAML schema extension") — потребует User confirmation, но contained.
- **Option C-2:** Comment marker `# junction: true` на той же строке/выше что и existing `# manifest: <type>` маркеры. Не trigger'ит YAML schema gate, но требует кастомный comment-parser (`server_yaml_parser.ts` сейчас comments не читает).
- **Option C-3:** Re-use existing manifest type — добавить `# manifest: junction` как новый ManifestType. **Conflicts с task.md non-goal** "НЕ создавать новый manifest type". Отбрасываю.

**Lean:** C-1 (YAML field). Самый простой. Hits STOP-gate но это flag-and-confirm, не блокер. Comment-parser в C-2 — extra surface area без существенного benefit'а. Финальное решение — за User'ом.

### Q2 (`*Map` suffix fallback) → Variant A (drop entirely) ✅

Согласен. Variant C исключён trivially из-за RoadMap/SiteMap/BitMap false-positives. Variant B (warning fallback) — log noise который скроет реальные баги под layer "наверное всё ок, просто warning".

**Усиливаю pre-condition User'а.** Вместо ad-hoc regression test'а на TaskTagMap (single fixture), предлагаю:

- **Dynamic test:** в test setup сканировать ВСЕ `*.spy.yaml` под `G:/Templates/flutter/t115/t115_server/lib/src/models/` + результат `codegen create-project --name __t_test__` (temporary). Для каждого entity с className матчующим `/Map$/` assert `isJunctionEntity(model) === true`. Это durable contract: новый template entity автоматически входит в regression suite, не нужно вручную обновлять fixture list.
- Параллельно — **negative test'ы** на synthetic `RoadMap`/`SiteMap`/`BitMap` (с domain полями `description`/`coordinates`) → assert `false`. Это закрывает бывший false-positive risk суффикс-эвристики и подтверждает что старая логика действительно не воскрешается ни одним из путей.

### Q3 (validation hook sync) → Variant A (shared utility) ✅ + ⚠ scope expansion

Согласен с shared utility. **Но: detection логика лежит в ТРЁХ местах, не в двух.** User упоминает validator + patcher. Третье место — критичное:

**`server_yaml_parser.ts:13`:**
```ts
isRelation: parsed.class.includes('Map'),
```

Этот flag drives **manifest selection**:
- [`generate_entity.ts:72`](src/adapters/cli/commands/generate_entity.ts#L72): `model.isRelation ? ['manyToMany'] : ['entity']`
- [`create_data_files_by_replacement.ts:37`](src/adapters/vscode/commands/create_data_files_by_replacement.ts#L37): тот же тернарник

Если оставить `parsed.class.includes('Map')` в parser'е, но patcher переключить на field-analysis — получаем **inconsistent state**:
- Parser говорит "regular" (`isRelation=false`, нет `Map` в имени) → entity рутится через `entity` manifest, generator копирует regular template files
- Patcher говорит "junction" (2 FK + base only) → registration snippet берётся из `_JUNCTION_*` template и ссылается на M2M словарь / junction routing

Результат: orchestrator получает junction-registration block, но adapters/dao сгенерированы из regular template → compile errors / runtime adapter mismatch. **Хуже текущего false-negative state**, потому что вместо silent data corruption получаем broken generation.

**Поэтому shared `isJunctionEntity(model)` обязан использоваться во всех трёх call-sites:**

1. `parsers/junction_detector.ts` (новый) — единственная impl
2. `server_yaml_parser.ts` — `isRelation` устанавливается через `JunctionDetector.isJunction(model)` после parsing fields (циркулярность нет, поскольку detector работает на already-parsed `ServerpodModel`)
3. `entity_yaml_validator.ts` — replace existing `*Map` skip
4. `orchestrator_patcher.ts:52` — replace `endsWith('Map')`

Это меняет scope task.md: `server_yaml_parser.ts` edit становится **обязательным**, не optional. Плюс — нужны regression tests на manifest selection flow:

- TaskTagMap → `isRelation=true` → `manyToMany` manifest → existing M2M template path (no regression)
- RolePermission (no `Map` суффикс, но 2 FK + base only) → `isRelation=true` (новая detection) → `manyToMany` manifest → `generate_entity` корректно роутит на M2M template
- Configuration → `isRelation=false` → `entity` manifest (no regression)

#### Subtle implementation issue

`JunctionDetector.isJunction(model)` требует **уже распарсенные fields** (`isRelation` per field). Но `ServerpodModel.isRelation` (model-level) сейчас устанавливается **до** parseFields — простой fix: переставить порядок в `parse()`:

```ts
const fields = this.parseFields(parsed.fields || {});
const model: ServerpodModel = {
  className: parsed.class || '',
  tableName: parsed.table || '',
  fields,
  isRelation: false, // pre-fill, set ниже
  ...
};
model.isRelation = JunctionDetector.isJunction(model)
                   || parsed.junction === true; // explicit override per Q1-C
```

Это не breaking (порядок свойств в literal не влияет на runtime), просто dependency ordering.

### Scope cutoff подтверждаю + caveat

- ✅ TASK-013 НЕ touches sync_core/weight repos
- ✅ TASK-013 НЕ refactor existing `*Map` template patterns — только detection
- ✅ Re-audit weight 14+ entities

**Caveat про re-audit:** initial audit использовал criterion "only entities имеющие `*_sync_event.spy.yaml`" что и пропустило RolePermission/CustomerUser (см. `bug-reports/junction-detection-audit.md` line 90 "methodology gap"). Re-audit обязан использовать **fixed methodology**:

- Scan **всех** `*.spy.yaml` под `weight_server/lib/src/models/` независимо от sync_event presence
- Per entity: запустить `JunctionDetector.isJunction()` (новый shared util)
- Cross-check с existing audit table — verify что previously-flagged `regular` entities остаются `regular`, а previously-missed RolePermission/CustomerUser теперь `junction`
- Document any newly-discovered junction-style entities (если найдутся 3-я и 4-я)

Без fixed methodology re-audit повторит ту же ошибку.

### Финальные verdict'ы

| Question | Vote |
|----------|------|
| Q1 junction-specific extra fields | **C** (strict + explicit `junction: true` override) |
| Q1 sub: override form | **C-1** (YAML field) — flag за User'ом |
| Q2 `*Map` fallback | **A** (drop entirely) + dynamic regression test над template t115 + freshly-generated project |
| Q3 validation hook sync | **A** (shared utility) + **scope expansion: 3 call-sites, не 2** (включая `server_yaml_parser.ts:13`) |
| Scope cutoff | ✅ confirmed + re-audit обязан использовать fixed methodology (scan all `*.spy.yaml`) |


---

## Chatgpt_1

2026-05-02 19:03

Поддерживаю консенсус **Q1=C / Q2=A / Q3=A**, но считаю важным зафиксировать границу между "детектировать junction" и "разрешать любой странный junction". TASK-013 должен чинить false-negative routing, а не превращать эвристику в неявную типовую систему.

### Q1: extra fields → C, strict default + explicit override

Согласен с [[#Q1 (junction-specific extra fields) → Variant C (strict + explicit override) ✅]]. Автоматическое правило должно быть узким: **2+ FK и только base-only поля = junction**. Если есть metadata (`assignedAt`, `weight`, `note`, `isPrimary`) — это уже семантическое решение автора схемы, и его лучше выражать явно через `junction: true`.

Почему не B: whitelist начнёт отражать вкусы конкретных проектов, а не контракт генератора. Хуже того, разные команды будут ожидать, что `priority`, `rank`, `grantedBy`, `expiresAt` тоже "очевидно junction metadata", и мы снова получим silent misclassification.

Практический критерий для executor'а:

- `junction: true` должен быть **positive override** даже при extra fields.
- `junction: false`, если добавлять его сейчас, лучше **не вводить** без отдельного обсуждения: отрицательный override может скрыть structural junction и вернуть production-risk класс бага.
- Если `junction: true`, но FK меньше двух — validator должен выдавать понятную ошибку, а не молча считать entity junction.

### Q2: `*Map` fallback → A, убрать как сигнал

Согласен с [[#Q2 (`*Map` suffix fallback) → Variant A (drop entirely) ✅]]. Суффикс `Map` должен исчезнуть из runtime/codegen decision path как классификатор. Его можно оставить только в тестах как historical regression set: все старые `*Map` junction'ы обязаны проходить новую structural detection.

Дополню acceptance criterion: нужен тест не только "TaskTagMap стал junction", но и "RoadMap/SiteMap с обычными domain fields не стал junction". Иначе легко случайно сохранить OR-логику и не заметить false-positive риск.

### Q3: shared utility → A, но с единым источником результата

Согласен с [[#Q3 (validation hook sync) → Variant A (shared utility) ✅ + ⚠ scope expansion]]. Важное уточнение: shared utility должна возвращать не только boolean, а желательно **reason/debug shape** хотя бы внутри тестов, например:

- `isJunction: true`
- `reason: explicitOverride | structural`
- `fkFields`
- `extraFields`

Даже если публичная функция останется `isJunctionEntity(model): boolean`, отдельная test/helper функция или internal result сильно упростит диагностику. Для этой задачи это особенно полезно: re-audit weight repo должен объяснить, почему `RolePermission` и `CustomerUser` классифицированы как junction, а похожие regular entities — нет.

Поддерживаю замечание Claude, что call-sites фактически минимум три: validator, orchestrator patcher и parser/model-level `isRelation`. Если `isRelation` продолжит выставляться через `class.includes('Map')`, TASK-013 будет частично невыполненной: manifest selection останется на старой эвристике.

### CustomerUser: нужен отдельный тест на nullable FK

Для `CustomerUser` важно явно закрепить, что nullable FK тоже считается FK. Иначе можно исправить `RolePermission`, но снова пропустить `3-FK + 1 nullable FK junction-style`.

Минимальный набор structural cases:

- 2 required FK + base fields → junction
- 2 FK, один nullable → junction
- 3+ FK + base fields → junction
- 2 FK + extra field без `junction: true` → regular
- 2 FK + extra field + `junction: true` → junction
- fewer than 2 FK + `junction: true` → validation error

### Scope cutoff

Подтверждаю cutoff:

- TASK-013 не должен менять `sync_core` / `weight` repos.
- Не нужно рефакторить template routing и adapter patterns шире detection path.
- Re-audit weight должен сканировать все `*.spy.yaml`, а не только entities с sync_event файлами.

Итоговый vote: **Q1=C, Q2=A, Q3=A**. Для executor'а я бы сформулировал обязательный technical gate так: "после TASK-013 в коде не должно остаться production decision по junction на основе `className.endsWith('Map')`, `class.includes('Map')` или аналогичного suffix/includes heuristic".

---

## Decision

**Решение (User-approved 2026-05-02):** все 3 design questions resolved через unanimous consensus двух agents (Claude_1 + Chatgpt_1) + User recommendations.

### Q1 — Junction-specific extra fields → **Variant C** (strict + explicit override)

- **Default detection:** 2+ FK relations + только base fields (id/userId/customerId/createdAt/lastModified/isDeleted) = junction. Любое extra business field → regular.
- **Explicit override:** `junction: true` (top-level YAML field, **Option C-1**) overrides field analysis для junction'ов с metadata (assignedAt/weight/sortOrder/etc.).
- **Negative override `junction: false` НЕ вводится** в TASK-013 (per Chatgpt_1 — risk скрыть structural junction).
- **Validation:** если `junction: true` но FK<2 → validator выдаёт ошибку "junction requires 2+ relations" (per Chatgpt_1).
- **Implementation form:** YAML field, не comment marker. STOP-gate (YAML schema extension) — single User confirmation, не блокер.

### Q2 — `*Map` suffix fallback → **Variant A** (drop entirely)

- **Removed entirely** из всех 3 production decision paths (validator, orchestrator_patcher, server_yaml_parser).
- **Hard technical gate (Chatgpt_1):** "после TASK-013 в коде не должно остаться production decision на основе `className.endsWith('Map')` / `class.includes('Map')` / любого suffix-includes heuristic". Acceptance check — grep по всему `src/` для этих pattern'ов после fix.
- **Suffix остаётся только в test fixtures** как historical regression set — все existing `*Map` entities обязаны passing новый field analysis.
- **Dynamic regression test (Claude_1 enhancement):** scan ВСЕХ `*.spy.yaml` в `G:/Templates/flutter/t115/t115_server/lib/src/models/` + freshly-generated project, для каждого с suffix `Map` assert `isJunctionEntity(model) === true`. Durable contract — новый template entity автоматически в regression suite.
- **Negative tests:** synthetic `RoadMap` (с domain fields description/coordinates), `SiteMap`, `BitMap` → assert `false` (no false-positive resurrection).

### Q3 — Validation hook sync → **Variant A (shared utility) + scope expansion**

- **Shared `isJunctionEntity(model): boolean`** в `src/features/generation/parsers/junction_detector.ts` (новый файл).
- **Internal debug shape (Chatgpt_1):** для тестов/diagnostics — `{ isJunction, reason: 'explicitOverride' | 'structural', fkFields, extraFields }`. Public API остаётся boolean.
- **3 call-sites обязательны (Claude_1 critical finding):**
  1. `parsers/server_yaml_parser.ts:13` — `isRelation = JunctionDetector.isJunction(model) || parsed.junction === true`. **Dependency ordering fix:** parseFields() ДО isRelation evaluation.
  2. `parsers/entity_yaml_validator.ts` — replace existing `*Map` skip pattern.
  3. `generators/orchestrator_patcher.ts:52` — replace `endsWith('Map')`.
- **Без этого scope expansion** TASK-013 incomplete — manifest selection в `generate_entity.ts:72` и `create_data_files_by_replacement.ts:37` останется на старой эвристике через `model.isRelation` flag.

### Acceptance criterion additions

- **Nullable FK = FK (Chatgpt_1):** structural test cases должны включать "2 FK + 1 nullable FK → junction" (CustomerUser case).
- **Minimum structural test set (Chatgpt_1):**
  - 2 required FK + base fields → junction
  - 2 FK, один nullable → junction
  - 3+ FK + base fields → junction
  - 2 FK + extra field без `junction: true` → regular
  - 2 FK + extra field + `junction: true` → junction
  - fewer than 2 FK + `junction: true` → validation error
- **Re-audit fixed methodology (Claude_1):** scan ВСЕХ `*.spy.yaml` под `weight_server/lib/src/models/` независимо от `*_sync_event.spy.yaml` presence. Document **все** newly-discovered junction-style entities.

### Scope cutoff confirmed

- ✅ TASK-013 НЕ touches sync_core/weight repos (read-only для audit)
- ✅ TASK-013 НЕ refactor existing junction routing logic (template patterns) — только detection
- ✅ Re-audit weight 14+ entities с fixed methodology

## Summary

Pre-implementation discussion TASK-013 (junction detection robust YAML field analysis) выявила unanimous consensus двух agents на **Q1=C / Q2=A / Q3=A** with critical Q3 scope expansion: detection logic лежит в **3 call-sites**, не в 2 (включая `server_yaml_parser.ts:13` `parsed.class.includes('Map')` который drives manifest selection).

Implementation form для Q1 explicit override — `junction: true` YAML top-level field (Option C-1, не comment marker). Plus 6 minimum structural test cases (включая nullable FK + override edge cases). Hard technical gate: "no suffix/includes heuristic в production decision path после TASK-013".

## Approved

✅ Decision принят User'ом 2026-05-02.

**Next steps:**
1. Archive Discussion #2 → `python ai/discussions/scripts/discuss.py close 2`
2. Update [TASK-013 task.md](../../tasks/active/TASK-013-junction-detection-robust-yaml-field-analysis/task.md) с финализированным scope:
   - Q1=C (`junction: true` YAML field, no `junction: false`)
   - Q2=A (drop suffix, dynamic regression scan, negative tests)
   - Q3=A (shared utility + 3 call-sites — server_yaml_parser, entity_yaml_validator, orchestrator_patcher)
   - 6 structural test cases + nullable FK case
   - Re-audit fixed methodology (scan ALL `*.spy.yaml`)
   - Hard technical gate: grep check
3. Spawn executor для TASK-013 implementation (Phases 1-5 per task.md)
4. После TASK-013 merged → roadmap.md Phase 1.5 hard gate update → weight TASK-018 unblocked

**Участники:** @Claude_1, @Chatgpt_1, @User
