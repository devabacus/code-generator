# BUG-022: `EnumType.values.byName(raw)` бросает StateError на unknown raw → sync_core silent freeze

**Статус:** Resolved (TASK-027, 2026-05-25)
**Обнаружено:** 2026-05-22 в weight TASK-019 Сессия 2 adversarial review (Bug A2)
**Закрыто:** 2026-05-25 (TASK-027, simplified template patch + 9 unit tests + e2e t191 verify PASS errors=0)
**Источник:** weight TASK-019 Сессия 2 adversarial review (см. handoff)
**Затронутые сущности (weight v1):** `WeighingStatus`, `Direction`, `TaraSource` + предсуществующий случай `SubscriptionStatus`

## Описание

Генератор `relation_generation.generateEntityToServerpodParams()` emit'ил для enum-полей `*_entity_extension.dart` `toServerpod<X>()` метода:

```dart
status: serverpod.WeighingStatus.values.byName(status)   // crash на unknown raw
```

`EnumType.values.byName(raw)` бросает `StateError: No enum value with that name` если raw не входит в текущий `values` set. В sync_core push pipeline:

1. Local entity сериализуется → `toServerpod()` → server.
2. Server retry/queue → unknown raw из storage (legacy data после schema bump, partial deserialization, мусор).
3. `byName` crashes → push fails → outbox **retry loop** (sync_core retries failed mutations).
4. Loop никогда не пройдёт (data corrupt permanently) → **silent freeze** в sync.

В weight TASK-019 это всплыло для 7 multi-word enum сущностей — все silently не синхронизировались на cross-device pull.

## Симптом

```
Unhandled Exception: Bad state: No enum value with that name: "old_status"
#0  EnumByName.byName (dart:core/enum.dart:178:7)
#1  ServerpodWeighingEntityExtensions.toServerpodWeighing (weighing_entity_extension.dart:...)
#2  WeighingRemoteAdapter.create (weighing_remote_adapter.dart:...)
#3  SyncOrchestrator._processOutboxMutation (sync_orchestrator.dart:...)
... retry loop forever
```

## Источник в codegen

[src/features/generation/generators/relation_generation.ts:87-91](../../src/features/generation/generators/relation_generation.ts#L87-L91) — `generateEntityToServerpodParams()`:

```ts
if (field.isEnum) {
    fieldValue = field.nullable
        ? `${field.name} != null ? serverpod.${field.type}.values.byName(${field.name}!) : null`
        : `serverpod.${field.type}.values.byName(${field.name})`;
}
```

Secondary site: [G:/Templates/flutter/simplified/simplified_flutter/lib/core/data/datasources/local/database_types.dart:11](../../../../Templates/flutter/simplified/simplified_flutter/lib/core/data/datasources/local/database_types.dart) — `SyncStatusConverter.fromSql()` тоже использует `byName` для Drift TypeConverter.

## Resolution (TASK-027, 2026-05-25)

**Design Option A (shared helper)** — approved by User.

**1. New template helper** — `G:/Templates/flutter/simplified/simplified_flutter/lib/core/utils/enum_parse.dart` (`manifest: startProject`):

```dart
T tryParseEnum<T extends Enum>(List<T> values, String? raw, T defaultValue) {
  if (raw == null) return defaultValue;
  for (final v in values) {
    if (v.name == raw) return v;
  }
  return defaultValue;
}
```

**Default:** `EnumType.values.first` — deterministic lossy fallback (semantic-correct если первый enum представляет `unknown`/`pending`/safe state; всё равно lossy > crash для sync pipeline robustness).

**2. Generator emission** — `relation_generation.ts:87-95` теперь emit'ит:

```dart
status: tryParseEnum(serverpod.WeighingStatus.values, status, serverpod.WeighingStatus.values.first)
```

С null-passthrough preserved для nullable: `status != null ? tryParseEnum(...) : null`.

**3. SyncStatusConverter** — `database_types.dart` использует `tryParseEnum(SyncStatus.values, fromDb, SyncStatus.local)` (explicit ground state default).

**4. Import injection** — `category_entity_extension.dart` + `task_entity_extension.dart` + `tag_entity_extension.dart` templates все 3 имеют `// ignore: unused_import` + `import '../../../../../core/utils/enum_parse.dart';` (per Adversarial review A1 fix: previously только category, теперь все 3 для protection против `--templ-entity task|tag` override).

**Regression tests:** [src/test/generators/enum_parse_helper.test.ts](../../src/test/generators/enum_parse_helper.test.ts) — 9 тестов в 2 suite'ах (7 ENTITY scenarios + 2 regression на `.name` serverpodToModel direction).

**E2E DoD evidence** (t191, 2026-05-25 post-TASK-026 master `6c55788`):
- `generate-entity` для MeasurementRecord (2 enum fields: status non-null + source nullable) → `measurement_record_entity_extension.dart` с 2 `tryParseEnum` emissions / 0 `byName` (substitution MeasurementStatus.values сохранила pattern).
- `codegen verify --name t191 --human` → **PASS errors=0 warnings=0 infos=30** (Total 75715ms).

**t115 template НЕ trog'ался** — frozen / deprecated path per Discussion #11 stack-lock decision. Weight v1 на t115 (если используется в production) сохраняет original `byName` anti-pattern — fix требует либо manual patch existing generated файлов в weight repo, либо clean-slate rebuild на simplified (per Discussion #9 clean-slate decision: weight v1 НЕ в production → manual patch acceptable).

## Migration note (weight v1)

⚠ Weight v1 имеет manual `_tryParseEnum` (private, signature `T? Function(List<T>, String?)` — returns nullable, no defaultValue, caller использует `?? fallback`) в `weighing_entity_extension.dart` (added в weight TASK-019 ручной hotfix). Regen после TASK-027 merge принесёт generated `tryParseEnum` (public, signature `T Function(List<T>, String?, T)` — non-nullable, explicit defaultValue) — **name overlap + signature mismatch**. При migration weight v1 → simplified rebuild:

1. Manual rename existing `_tryParseEnum` callers — drop `?? fallback` (новый helper уже включает default).
2. Либо drop manual helper file полностью (shared helper из template покрывает).

Should be documented в weight build TASK (capacity-driven post-Phase A-D gate).

См. [TASK-027 report.md](../tasks/done/TASK-027-bug-2---enum-byname-graceful-helper/report.md) (после merge) для full closure evidence + multi-agent review summary.
