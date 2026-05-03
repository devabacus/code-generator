# BUG-013: t115 template markers gap на repository_impl + usecases — каждый fresh project с FK relations broken

**Статус:** ✅ Resolved (2026-05-03, PR 2 chore/bug-013-template-markers-fill, Approach A applied)
**Обнаружено:** 2026-05-03 (TASK-012 executor шаг 8 + Adversarial review)
**Источник:** Multi-agent review TASK-012 findings
**Критичность:** High (systemic template gap — affects ВСЕ fresh projects с FK relations)

## Resolution evidence (2026-05-03)

PR 2 Approach A applied — marker block seed в **4 layers** (audit revealed 4 layers, не 2 как initial estimate):

1. `task_repository_impl.dart` — marker block `:oneToManyMethods` внутри class с concrete impl `getTasksByCategoryId` delegating to `_localDataSource`
2. `task_usecases.dart` — marker block top-level (EOF, ПОСЛЕ `WatchTasksUseCase`) с class `GetTasksByCategoryIdUseCase` (Gemini_1 critical requirement: top-level placement satisfied)
3. `task_usecase_providers.dart` — marker block top-level с `@riverpod GetTasksByCategoryIdUseCase? getTasksByCategoryIdUseCase(Ref)` factory (null-safe pattern)
4. `task_local_datasource_service.dart` (interface — **scope expansion**, audit revealed как direct dependency repository_impl fix) — marker block с declaration `Future<List<TaskModel>> getTasksByCategoryId(...)`

**Verify evidence:** t158 fresh project + `generate-entity` для Task FK entity → `verify --name t158` PASS errors=0, warnings=1 (unrelated unused local), infos=44. success: true. Total: 42063ms. Time spent на fix: ~30 минут (под 90-min ceiling).

**MANY_TO_MANY substitution автоматически распространит fix** на other entities (Member.projectId, TodoItem.projectId, etc.) при `generate-entity` — никакие changes в `src/features/generation/` не нужны.

## Симптом

После `codegen create-project --name <X>` + `generate-entity --yaml <entity_with_FK>.spy.yaml`:

`<X>_flutter/lib/features/<feature>/data/repositories/<entity>_repository_impl.dart`:
- Не имеет concrete implementation для `getXxxByYyyId` методов
- Interface (`<entity>_repository.dart`) объявляет abstract methods через markers → patcher вставляет
- Compile FAIL: `non_abstract_class_inherits_abstract_member`

`<X>_flutter/lib/features/<feature>/domain/usecases/<entity>_usecases.dart`:
- Не имеет class `GetXxxByYyyIdUseCase`
- `.g.dart` references несуществующий class → compile FAIL: `undefined_identifier`

## Audit findings (2026-05-03 t115 task feature)

| Файл | markers `:oneToManyMethods` | hardcoded relation methods |
|------|---|---|
| `domain/repositories/task_repository.dart` | ✅ 1 | n/a (через patcher) |
| **`data/repositories/task_repository_impl.dart`** | ❌ **0** | ❌ **0** |
| `data/datasources/local/datasources/task_local_data_source.dart` | ❌ 0 | ✅ hardcoded |
| `data/datasources/local/daos/task/task_dao.dart` | ❌ 0 | ✅ hardcoded |
| `data/datasources/remote/sources/task_remote_data_source.dart` | ❌ 0 | (предположительно hardcoded) |
| **`domain/usecases/task_usecases.dart`** | ❌ **0** | ❌ **0** |
| `t115_server/lib/src/endpoints/task_endpoint.dart` | ❌ 0 | (предположительно hardcoded) |

**Реальный relation_patcher coverage в t115:** только **interface** (1 layer) через markers + dao/local_data_source через **hardcoded inheritance** + MANY_TO_MANY substitution.

**2 layers полностью broken**: repository_impl + usecases — НЕТ ни markers, ни hardcoded.

## Каскад

Когда генерируется новая entity с FK relation:

1. `task_repository.dart` (interface) → patcher вставляет abstract `getEntityByFkId(...)` ✅
2. `task_dao.dart` (hardcoded) → MANY_TO_MANY substitutes Task→Entity, Category→Fk → `getEntityByFkId(...)` ✅
3. `task_local_data_source.dart` (hardcoded) → substitutes ✅
4. `task_repository_impl.dart` → **нет ни markers, ни hardcoded** → impl missing → `non_abstract_class_inherits_abstract_member` ❌
5. `task_usecases.dart` → **нет class** → `.g.dart` references undefined → ❌

**Каждый** fresh project с FK relation entity ловит этот gap. TASK-011/013/014 не поймали потому что:
- TASK-011 — Configuration baseline (no relations)
- TASK-013 — junction structural detection (no runtime relation method generation)
- TASK-014 — t157 ProjectMember junction (junction detection путь, не regular FK relation путь)

## Connection с BUG-007

[BUG-007](007-relation-patcher-misses-template-without-markers.md) описывал manifestation **только на usecases gap**. BUG-013 = **тот же systemic problem на repository_impl** + extension на **factual structural gap** template (нет hardcoded methods вообще).

## Misrepresentation в codegen docs (relevant correction)

`CLAUDE.md L118` утверждает:
> "Additive. Новый relation(parent=X) в YAML → новый метод во всех 8 слоях (endpoint, remote_data_source, usecases, local_datasource_service, local_data_source, dao, repository, repository_impl)."

`agent_memory.md` similar claim про "8 слоях".

**Реально:** patcher работает на 1 layer (interface) через markers, остальные 4-5 через hardcoded template substitution, **2 не работают вообще** (repository_impl, usecases — структурный gap).

Это **doc claim, не соответствующий реальности** — нужно fix в любом outcome.

## Production impact на weight TASK-018

Каждая weight entity с relation (≥10 of 13 entities) после `generate-entity` будет иметь:
- Broken `<entity>_repository_impl.dart` (missing impl методы)
- Broken `<entity>_usecases.dart` (missing class definitions)
- ~13 × N (N = relations per entity) `non_abstract_class_inherits_abstract_member` errors
- Plus undefined_identifier errors

**Workaround user'ом** (вручную написать impl + usecases) — нарушает DoD ("не патчить руками target").

## Acceptance criteria для fix

Два возможных подхода:

### Approach A — Hardcoded inheritance (template fix only)

Расширить template:
- `task_repository_impl.dart` — добавить hardcoded `getTasksByCategoryId` impl методы delegating to `_localDataSource`. MANY_TO_MANY substitution автоматически работает.
- `task_usecases.dart` — добавить hardcoded `class GetTasksByCategoryIdUseCase` definitions. MANY_TO_MANY substitution автоматически работает.
- (Аналогично для category_*, tag_* если они имеют relations.)

Trade-off: один-раз template work, no generator changes. Но если новая relation method pattern появится — нужно добавлять hardcoded snippet в template (не scalable).

### Approach B — Full markers + patcher coverage (generator fix + template markers)

- Добавить markers `:oneToManyMethods` в repository_impl + usecases templates
- Расширить relation_patcher для покрытия impl-side context (impl нуждается в `_localDataSource.getXxx(...)` mapping, отличается от interface declaration)
- Расширить relation_patcher для usecases context (class definition с use case fields)

Trade-off: scalable (новые patterns через markers), но requires generator + template changes + tests на patcher correctness.

### Recommended

**Approach A** для unblocking weight TASK-018 (fast, no generator risk). **Approach B** как backlog для future scalability.

## Acceptance check

- [ ] Template `task_repository_impl.dart` имеет relation method для Task.categoryId relation (hardcoded with MANY_TO_MANY substitution markers/inheritance pattern)
- [ ] Template `task_usecases.dart` имеет `class GetTasksByCategoryIdUseCase`
- [ ] Аналогично для category_repository_impl + tag_repository_impl + их usecases (если они имеют relations)
- [ ] Verify на свежем `t<N+1>` PASS errors=0 после `generate-entity` для FK entity
- [ ] CLAUDE.md L118 + agent_memory.md обновлены с реальным coverage (1 layer markers + 4-5 layers hardcoded inheritance + 2 broken)

## Estimate

**Approach A:** 30-45 минут template work + verify regen. Минимальный риск.
**Approach B:** 2-3 часа generator/patcher work + tests + template markers + verify.

## Связанные

- BUG-007 (initial relation_patcher gap report — usecases-specific) — **не дубликат**, BUG-013 wider scope
- BUG-012 (parser parent= ignore) — не связан, но обе блокируют weight TASK-018
- TASK-012 — discovery context
- weight TASK-018 — **blocked** до BUG-013 closed
