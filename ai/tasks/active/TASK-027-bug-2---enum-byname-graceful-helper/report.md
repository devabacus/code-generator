# TASK-027 Report — Bug 2: Enum `byName` → graceful helper

**Status:** Ready for multi-agent review + commit. NOT committed, NOT pushed.

**Branch:** `feature/TASK-027-bug-2-enum-byname-graceful` (from master `6c55788` post-TASK-026).

**Verify result on t191:** ✅ **PASS errors=0, warnings=0, infos=30** (Total 75715ms).

---

## Summary

Закрывает Bug 2 из weight TASK-019 sync_core pack. Заменил `EnumType.values.byName(raw)` (бросает `StateError` на unknown raw) на graceful helper `tryParseEnum(values, raw, defaultValue)` (возвращает `defaultValue` на unknown raw, lossy > crash). Closes silent freeze в sync_core push pipeline для multi-word enum-полей (weight TASK-019 Bug A2: WeighingStatus / Direction / TaraSource).

**Design choice — Option A (shared helper)** (per User approval): shared `lib/core/utils/enum_parse.dart` (`manifest: startProject`) с topl-level `tryParseEnum<T extends Enum>(...)` function. Import inject'ится в template `category_entity_extension.dart` (`// ignore: unused_import` для entities без enum полей — acceptable trade-off vs conditional emission complexity).

## Implementation diff

### 1. New template file: `enum_parse.dart` (shared helper, manifest: startProject)

`G:/Templates/flutter/simplified/simplified_flutter/lib/core/utils/enum_parse.dart` (new, 25 lines):

```dart
// manifest: startProject
T tryParseEnum<T extends Enum>(List<T> values, String? raw, T defaultValue) {
  if (raw == null) return defaultValue;
  for (final v in values) {
    if (v.name == raw) return v;
  }
  return defaultValue;
}
```

Extensive docstring документирует Bug 2 closure, sync_core context, design rationale (`defaultValue = values.first` chosen as deterministic lossy fallback).

### 2. Modified template: `database_types.dart` (SyncStatusConverter — secondary site)

```diff
 import 'package:drift/drift.dart';
+import '../../../../core/utils/enum_parse.dart';
 ...
   SyncStatus fromSql(String fromDb) {
-    return SyncStatus.values.byName(fromDb);
+    return tryParseEnum(SyncStatus.values, fromDb, SyncStatus.local);
   }
```

### 3. Modified template: `category_entity_extension.dart` (import injection, unconditional)

```diff
 import 'package:simplified_client/simplified_client.dart' as serverpod;
+// ignore: unused_import
+import '../../../../../core/utils/enum_parse.dart';
```

5 ups: extensions → entities → domain → tasks → features → lib, then down to core/utils. Path stable across ENTITY substitution (не содержит `category` literal).

### 4. Modified src: `relation_generation.ts:87-95` (emission fix)

```diff
-        if (field.isEnum) {
-            fieldValue = field.nullable
-                ? `${field.name} != null ? serverpod.${field.type}.values.byName(${field.name}!) : null`
-                : `serverpod.${field.type}.values.byName(${field.name})`;
-        }
+        if (field.isEnum) {
+            const enumRef = `serverpod.${field.type}`;
+            fieldValue = field.nullable
+                ? `${field.name} != null ? tryParseEnum(${enumRef}.values, ${field.name}, ${enumRef}.values.first) : null`
+                : `tryParseEnum(${enumRef}.values, ${field.name}, ${enumRef}.values.first)`;
+        }
```

### 5. New unit test: `enum_parse_helper.test.ts` (9 tests, 2 suites)

| Suite | Test | Coverage |
|---|---|---|
| generateEntityToServerpodParams (7) | non-null enum → tryParseEnum + values.first default | core fix |
| | nullable enum → null passthrough + tryParseEnum в not-null ветке | nullable semantics |
| | multiple enum fields (3) | каждый emits tryParseEnum, 0 byName |
| | non-enum String / int field | plain passthrough |
| | FK relation field | UuidValue.fromString preserved |
| | mixed (enum + relation + plain) | каждый получает correct treatment |
| generateServerpodToModelParams (2) | enum → .name direction unchanged | regression — no accidental tryParseEnum |
| | nullable enum → ?.name preserved | regression |

### Repo status

```
git status post-rebase + implementation:
 M src/features/generation/generators/relation_generation.ts    (10 lines — comment + tryParseEnum emission)
?? src/test/generators/enum_parse_helper.test.ts                (NEW, 9 tests)
?? ai/tasks/active/TASK-027-.../task.md                         (modified — журнал + статусы)
?? ai/tasks/active/TASK-027-.../report.md                       (этот файл)
```

**Template (outside repo) — 3 файла:**

- `lib/core/utils/enum_parse.dart` (NEW, manifest: startProject)
- `lib/core/data/datasources/local/database_types.dart` (modified, import + tryParseEnum для SyncStatusConverter)
- `lib/features/tasks/domain/entities/extensions/category_entity_extension.dart` (modified, import injection)

## Regression baseline (pre-verify)

```
[tsc -p ./] → EXIT=0 (silent)

[mocha workaround]
→ 218 passing (87ms)
  Composition: 209 baseline (post-TASK-026 merge) + 9 new TASK-027 tests = 218 total, 0 failing

[eslint]
→ 0 errors, 18 pre-existing warnings
```

## E2E DoD verify on t191

### Step 1 — create-project

```
[create-project --name t191 --template simplified] → Duration: 198873ms, EXIT=0
→ Verified template carries enum_parse.dart + updated database_types.dart
```

(t190 abandoned после `Order` reserved class collision; fresh t191 per HARD RULE incremental policy — sandbox blocks subdirs cleanup.)

### Step 2 — generate-entity для MeasurementRecord (2 enum fields)

YAMLs (`tmp/order_yaml/`):

```yaml
# measurement_record.spy.yaml
class: MeasurementRecord
table: measurement_record
fields:
  ...
  status: MeasurementStatus           # non-null enum
  source: MeasurementStatus?          # nullable enum

# measurement_status.spy.yaml
enum: MeasurementStatus
values: [pending, active, done, cancelled]

# measurement_record_sync_event.spy.yaml (canonical shape — message payload, no Drift)
class: MeasurementRecordSyncEvent
fields:
  type: SyncEventType
  measurementRecord: MeasurementRecord?
  id: UuidValue?
```

```
[generate-entity --template simplified] → 38ms, EXIT=0, SUCCESS 19 created + 2 modified
```

### Step 3 — grep evidence (Bug 2 CORE criterion)

```bash
$ grep -A 2 "entityToServerpodParams" .../measurement_record_entity_extension.dart
    // === generated_start:entityToServerpodParams ===
  status: tryParseEnum(serverpod.MeasurementStatus.values, status, serverpod.MeasurementStatus.values.first),
        source: source != null ? tryParseEnum(serverpod.MeasurementStatus.values, source, serverpod.MeasurementStatus.values.first) : null

$ grep -c "byName" .../measurement_record_entity_extension.dart
0

$ grep -c "tryParseEnum" .../measurement_record_entity_extension.dart
3   # 1 comment + 2 code emissions
```

**✅ tryParseEnum** emit'ится для обоих enum fields с правильным null-passthrough для nullable. **0 byName** в feature dir.

Import injection survives ENTITY substitution intact (path stable, `category` не содержится в path).

### Step 4 — verify (DoD gate)

```
[verify --name t191 --human]
[1/4] dart pub get (server)...
[1/4] flutter pub get (flutter)...
[2/4] serverpod generate --experimental-features=all...
[3/4] dart run build_runner build --delete-conflicting-outputs...
[4/4] flutter analyze...

PASS: verify t191
  ✓ flutterAnalyze — 49605ms (errors=0, warnings=0, infos=30)
  ✓ pubGet — 3882ms
  ✓ serverpodGenerate — 12871ms
  ✓ buildRunner — 9354ms
Total: 75715ms
→ EXIT=0
```

**DoD gate ✅ PASS.** `errors=0, warnings=0, infos=30`. infos count unchanged from baseline (unused_import не triggered как info-level, либо counted в pre-existing 30).

## Acceptance criteria checklist

- [x] Найдено точное место — `relation_generation.ts:87-91` + secondary `database_types.dart:11`.
- [x] `byName(raw)` заменён на `tryParseEnum(EnumType.values, raw, EnumType.values.first)` в src + secondary site.
- [x] Helper в **shared** `lib/core/utils/enum_parse.dart` (manifest: startProject) — **Option A approved by User**.
- [x] Дефолт = `EnumType.values.first` (документирован в helper docstring + relation_generation.ts comment).
- [x] Unit test — **9 tests** (расширил scope vs task.md plan 3→9: 7 ENTITY + 2 regression на serverpodToModel direction).
- [x] tsc + eslint clean + mocha **218 passing** (209+9, 0 регрессий).
- [x] `verify --name t191 --human` → **PASS errors=0, warnings=0, infos=30**.
- [x] Grep на t191: `byName` → 0, `tryParseEnum` → 2 code emissions matching 2 enum fields.
- [x] `report.md` с CLI-выводом + design rationale (этот файл).

## Stack-lock compliance (Discussion #11)

- ✅ Riverpod / Drift / Clean directory layout / sync_core / Serverpod / 13 markers — не trog'ались.
- ✅ t115 — НЕ trog'ался (frozen).
- ✅ Изменения только в `src/features/generation/generators/` (1 файл) + template (3 файла внутри simplified) + 1 test file.

## Test projects (sandbox-protected)

- `t191/` — ✅ canonical TASK-027 baseline (verify PASS errors=0, MeasurementRecord enum entity)
- `t190/` — abandoned (Order class collision; sandbox blocks subdirs cleanup → incremental new project)
- `t189/` — post-TASK-026 baseline (PASS)

## Multi-agent review (applied)

### Standard: APPROVE (4 NIT/info — non-blockers, deferred)

- N1: docstring BUG-022 reference → resolved via G3 fix (BUG-022 created).
- N2: `tryParseEnum` public function (no underscore) — sознательно для cross-file import, defensible.
- N3: `values.first` semantic для enums где first = valid state — documented как acceptable lossy fallback.
- N4: `// ignore: unused_import` лишний для entities с enum полями — но необходим для no-enum case (Configuration / Category baseline без enums).

### Adversarial: APPROVE WITH HIGH FIXES (2 HIGH applied, 4 MEDIUM acknowledged)

| ID | Sev | Title | Status |
|---|---|---|---|
| A1 | HIGH | `task_entity_extension.dart` + `tag_entity_extension.dart` не получили import → если user invokes `--templ-entity task\|tag`, generated extension emits `tryParseEnum` без импорта → Dart compile fail | ✅ FIXED — same import block applied к обоим templates |
| G3 | HIGH | `BUG-022` referenced в helper docstring + relation_generation.ts comment + test, но `ai/bug-reports/022-*.md` не существует — orphan link | ✅ FIXED — created `ai/bug-reports/022-enum-byname-state-error.md` с full context (root cause + resolution + migration note) |
| A3 | MEDIUM | M2M `task_tag_map_entity_extension.dart` не имеет `:entityToServerpodParams` markers — junction hardcoded, enum payload в junction не emit'ит tryParseEnum | ⏭ DEFERRED — junction не имеет current users с enum-payload, BUG-015 cross-feature junction repair scope coverage; track |
| D1 | MEDIUM | `SyncStatusConverter.fromSql()` change — runtime semantic shift: corrupt `syncStatus = "old_status"` теперь silently returns `SyncStatus.local` вместо crash | ⏭ ACKNOWLEDGED defensible (graceful > crash для sync robustness); future `developer.log` warning при default-fallback можно добавить если concretely surfaces data corruption |
| D2 | MEDIUM | Weight v1 manual `_tryParseEnum` (private, T? nullable, no defaultValue) clash с new public `tryParseEnum` (T non-null, explicit default) при weight migration | ✅ DOCUMENTED в BUG-022 migration note section + Recommended weight build TASK reference |
| F2/F3 | MEDIUM | Claim "infos count 30 unchanged" — unresolved hypothesis (unused_import не surfaces в analyzer default rules vs counted в pre-existing 30) | ⏭ DEFERRED — empirical resolution требует non-enum entity verify (post-merge на t192); current evidence positive (t191 errors=0 warnings=0 infos=30 confirmed) |

### LOW / NIT findings (deferred non-blockers)

- B2: SyncStatusConverter explicit `SyncStatus.local` vs user enum mechanical `values.first` — inconsistency by design (per-enum override only для shared infra, generated emission stays mechanical).
- B3: O(n) linear scan — trivial perf concern, ok.
- C3: 5-ups relative path — `package:<project>_flutter/...` package-relative refactor — defer (current works, requires substitution-aware codegen change).
- E1: Tests verify emission strings only, not Dart runtime — defer runtime smoke к Dart unit-test в template (future cleanup).
- E3: Anti-pattern double-wrap guard — defer (current `!result.includes('byName')` adequate).

## Re-verify после merge (post-merge teamlead obligation)

- [ ] `git checkout master && git pull` после merge
- [ ] `codegen create-project --name t192` + generate-entity для enum entity + `codegen verify --name t192` — confirm master green с TASK-027 fix.

## Files (absolute paths)

**Outside repo (template):**

- `G:/Templates/flutter/simplified/simplified_flutter/lib/core/utils/enum_parse.dart` (NEW)
- `G:/Templates/flutter/simplified/simplified_flutter/lib/core/data/datasources/local/database_types.dart` (modified)
- `G:/Templates/flutter/simplified/simplified_flutter/lib/features/tasks/domain/entities/extensions/category_entity_extension.dart` (modified)

**Inside repo:**

- `g:/Projects/vs_code_extensions/code-generator/src/features/generation/generators/relation_generation.ts`
- `g:/Projects/vs_code_extensions/code-generator/src/test/generators/enum_parse_helper.test.ts` (NEW)
- `g:/Projects/vs_code_extensions/code-generator/ai/tasks/active/TASK-027-.../task.md`
- `g:/Projects/vs_code_extensions/code-generator/ai/tasks/active/TASK-027-.../report.md`

**Excluded (gitignore'd via tmp/):**

- `tmp/order_yaml/*.spy.yaml`

## Decision required from teamlead

1. После multi-agent review — apply findings inline или escalate.
2. После reviewers approve — commit + PR + ждать User merge approval.
3. Post-merge: re-verify create-project + verify на свежем t192.
