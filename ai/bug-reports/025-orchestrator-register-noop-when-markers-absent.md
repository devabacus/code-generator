# BUG-025: OrchestratorPatcher молча no-op при отсутствии marker-пар → сущность не зарегистрирована в sync (verify-blind)

**Статус:** RESOLVED (2026-06-05) — fail-fast guard в `OrchestratorPatcher`. См. [Решение](#решение) ниже.
**Обнаружено:** 2026-06-05 (adversarial generator audit)
**Критичность:** High — **verify-blind silent failure**. Сущность генерируется, компилируется зелёным, `flutter analyze` errors=0, но **не подключена к sync_core** (нет import/entityType/register). Баг доезжает до runtime: сущность не синкается между устройствами.

## Симптом

Если `sync_orchestrator_provider.dart` не содержит marker-пары `:syncImports` / `:syncEntityTypes` / `:syncRegistrations` (hand-edited, старый шаблон, или проект bootstrap'нут без них), `OrchestratorPatcher.patch` ничего не патчит и возвращает контент без изменений — **без ошибки, без warning, exit 0**.

## Root cause

[orchestrator_patcher.ts:147-149](../../src/features/generation/generators/orchestrator_patcher.ts):

```ts
if (matches.length === 0) { return content; }   // silent no-op
```

То же по форме у [relation_patcher.ts:69-71 / :144-146](../../src/features/generation/generators/relation_patcher.ts) (`if (!innerMatch) continue;`), но там пропуск relation-методов даёт `non_abstract_class_inherits_abstract_member` → **ловится** analyze. Orchestrator no-op НЕ даёт compile-ошибки (просто код не подключён) → analyze=0 → **проходит мимо verify**.

## Repro

Сгенерировать entity в проект, где `sync_orchestrator_provider.dart` лишён marker-блоков (или удалить их вручную) → `generate-entity` SUCCESS, `verify` errors=0, но в orchestrator нет регистрации новой сущности.

## Предлагаемое решение

При entity-based генерации (`manifest: entity`/`manyToMany`), если target orchestrator существует, но marker-пары отсутствуют → эмитить **warning** (а лучше — fail с понятным сообщением «orchestrator markers missing, entity NOT wired to sync»). Не молчать.

## Связанные

- [BUG-009](009-orchestrator-patcher-uses-templ-feature-for-import-paths.md), [BUG-019](019-orchestrator-snippet-hardcoded-literals.md) — другие orchestrator-patcher issues.
- Класс «verify-blind silent failure»: см. также [BUG-005](005-app-database-generator-incremental-only.md) (`:base` overwrite) — verify не ловит семантическую потерю.

## Решение

Fail-fast guard в [orchestrator_patcher.ts](../../src/features/generation/generators/orchestrator_patcher.ts):

- `_assertMarkersPresent(content, model, path)` вызывается в `patch()` сразу после чтения файла (после early-return для file-absent). Проверяет наличие всех трёх required marker-блоков через `_hasMarkerBlock`.
- Если файл существует, но хотя бы один маркер отсутствует → **throw** с понятным сообщением (имена отсутствующих маркеров + «verify-blind» предупреждение + remediation). Раньше `_patchMarkerBlock` молча возвращал content (no-op).
- `REQUIRED_MARKERS = ['syncImports', 'syncEntityTypes', 'syncRegistrations']` — ровно те 3 блока, которые `patch()` всегда патчит (template-agnostic; simplified-orchestrator обязан иметь те же маркеры, иначе patch не работал бы вообще).
- **File-absent остаётся мягким skip** (свежий/не-bootstrap'нутый проект, mock-тесты) — поведение не изменено. Duplicate marker pairs по-прежнему проходят (`_hasMarkerBlock` = «есть хотя бы одна пара») → legacy-duplicate recovery не сломан.
- create-project не затронут: orchestrator-patch вызывается только при entity-based generation (`model && isEntityBasedGeneration`), а create-project (startProject) сущности не генерит.

**Verification (DoD):**
- Unit: **293 passing** (+3 BUG-025: no-markers throw / partial-marker throw с именем / all-present no-throw regression). compile clean, lint 0 errors.
- Happy path: regen entity на t203 (маркеры на месте) → SUCCESS, `verify t203` errors=0 (no regression).
- Guard fires (CLI): убрал маркер `syncRegistrations` в t203 orchestrator → `generate-entity` **abort** с сообщением `[syncRegistrations]`; orchestrator восстановлен byte-identical.
- Review: adversarial (см. PR).
