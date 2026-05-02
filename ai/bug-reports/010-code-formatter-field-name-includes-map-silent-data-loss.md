# BUG-010: code_formatter.ts:81 — silent data loss для fields с "Map" в имени

**Статус:** Open (backlog, обнаружен TASK-013 round 1 adversarial review 2026-05-02)
**Критичность:** Medium-High (silent data loss, не immediate compile error)

## Симптом

В `src/features/generation/parsers/formatters/code_formatter.ts:81` логика wrapping fields в Drift `Value()` использует `!field.name.includes('Map')` как exclusion filter. Любое field с substring "Map" в имени silently исключается из Drift Value wrapper → field не записывается в БД при insert/update operations.

```typescript
// src/features/generation/parsers/formatters/code_formatter.ts:81
return fields.filter(field =>
    !exactExcludes.includes(field.name) &&
    !field.name.includes('Map') && !field.scope?.includes('serverOnly'));
```

## Affected field name patterns

- `mapData: String` (e.g. JSON map data)
- `bitmapJson: String` (e.g. raster image как JSON)
- `mapboxToken: String` (API token field)
- `coordinatesMap: Map<String, double>` (geo coordinates dictionary)
- Любое field с pattern `*Map*` или `*map*`

## Root cause

Field-name substring match used для что-то (видимо historical artifact из R1 sync stack era где `*Map` field имели special handling). Filter активен независимо от entity type — even на regular entities.

## Отличие от TASK-013 scope

TASK-013 заменил junction detection class-name `endsWith('Map')` на field analysis. Hard technical gate (grep) prouvé что production decision paths больше не используют `*Map` class-name heuristic. Но `code_formatter.ts:81` использует **field-name** `*Map` substring — это другой concern (field filtering, не junction detection).

Standard reviewer TASK-013 Finding #3 acknowledged out-of-scope (TASK-013 Q2=A grep gate specifically targets className-level production decisions). Adversarial review Bomb #3 flagged latent silent data loss risk.

## Воспроизведение

1. Создать entity с field `mapData: String` или похожим
2. `generate-entity --yaml ...`
3. Inspect generated `*_dao.dart` или `*_table.dart` — field `mapData` отсутствует в Drift Value() wrapper / insert companion

## Fix

Identify what `field.name.includes('Map')` was originally trying to filter (видимо relation fields from old R1 sync era where junction map fields имели name pattern). Replace specific pattern с either:
- Field type check (relation vs primitive)
- Explicit annotation в YAML (e.g. `@drift_skip` decorator)
- Remove filter entirely if obsolete

## Связанные

- Discovered: TASK-013 adversarial review round 1 2026-05-02 (Bomb #3)
- Related: TASK-011 hard technical gate (production decision paths) — formally passed но landmine остался
- Related: TASK-013 standard review Finding #3 (out-of-scope acknowledged)
