# TASK-011 Report — sync_core 0.3.0 templates integration

**Status:** 🟡 In progress (executor заполняет по ходу phases)
**Branch:** `feature/TASK-011-sync-core-0-3-0-templates-integration`
**Cross-repo:** sync_core teamlead-side `[codegen TASK-X1]` (см. [sync_core/ai/docs/roadmap.md](../../../../../../Projects/Flutter/Packages/sync_core/ai/docs/roadmap.md))

## Резюме

(Заполняется после phase F. Что реализовано, какие phases пройдены, какой DoD результат.)

## Текущий статус

🔴 **BLOCKED 2026-05-02 на Phase F3 — verify FAIL errors=236 (architectural gap, см. § BLOCKED ниже).** Phase F2 (`create-project --name t150`) выполнен, project создан, но verify FAIL — orchestrator template после F0 содержит full 5-entities state, который при copy в new project ссылается на отсутствующие tasks features.

🟡 **Phase A0/A0.6/A1-A4/B/B5 ✅ done, продолжаю Phase B6/B7 + C0 + C + C7 + D + E + E5/E5.1 + E6 + F0/F1 без STOP-gates до Phase F2.**

- Прочитаны все обязательные docs: AGENTS.md, CLAUDE.md, agent_memory.md, INDEX.md, executor.prompt.md, task.md, Discussion #1 archive.
- Feature branch создан: `feature/TASK-011-sync-core-0-3-0-templates-integration` (через `task.py start --stash`).
- Reference inspection done — состояние t115 template подтверждено:
  - `home_page.dart` — tasks UI live (imports + state + 3 widgets), требует комментирования в A0.6.
  - `sync_orchestrator_provider.dart` — 5 hardcoded register'ов (Configuration + Category + Task + Tag + TaskTagMap), 5 entityType строк, 30 imports tasks/configuration adapters + DAO + entity + 3 sync infra.
  - 25 adapter файлов в `lib/features/tasks/{category,task,tag,task_tag_map}/` + 5 в configuration.
  - `lib/core/sync/`: 5 source `.dart` файлов (исключая `.g.dart`).
- **2026-05-02 — STOP-gate №1 ✅ approved User'ом → Phase A0.6 ✅ done.** Tasks UI закомментирован в `home_page.dart` (3 imports + 3 state + 6 виджетных строк), hint comments сохранены, `flutter analyze` → No issues found (1.8s).
- **2026-05-02 — STOP-gate №2 ✅ approved User'ом → Phase A0 + A1-A4 ✅ done.**
  - **A0:** orchestrator приведён к Configuration-only baseline (4 tasks register'а / 4 entityTypes / 28 imports tasks adapters + DAO + entities удалены, docstring переписан).
  - **A1:** 5 sync infra source файлов получили `// manifest: startProject` (`lib/core/sync/*.dart`).
  - **A2:** 5 Configuration adapter файлов получили `// manifest: startProject`.
  - **A3:** 15 task/category/tag adapter файлов получили `// manifest: entity` (10 уже было до этого segment'а, 3 tag добавлены в этом segment'е: `tag_payload_codec.dart` / `tag_pull_adapter.dart` / `tag_remote_adapter.dart`; 2 tag и 5+5 task/category были done предыдущим executor'ом).
  - **A4:** 5 task_tag_map adapter файлов получили `// manifest: manyToMany` (все 5 добавлены в этом segment'е).
  - Verification: `flutter analyze lib/core/sync/sync_orchestrator_provider.dart` → No issues found (1.3s); `flutter analyze lib/features/tasks/data/adapters/ lib/features/configuration/data/adapters/ lib/core/sync/` → No issues found (1.3s). Markers — comment-only, не ломают компиляцию.

## ⚠ STOP — требуется ok teamlead'а

### STOP-gate №1: Phase A0.6 — закомментировать tasks UI в t115 template ✅ DONE 2026-05-02

User approved 2026-05-02 → A0.6 выполнен. Tasks UI закомментирован line-by-line, hint comments сохранены, `flutter analyze lib/features/home/presentation/pages/home_page.dart` → No issues found (1.8s).

### STOP-gate №2: Phase A0 — drop 4 tasks register'ов в sync_orchestrator_provider.dart ✅ DONE 2026-05-02

User approved 2026-05-02 → A0 выполнен (drop'ы 28 imports + 4 entityTypes + 4 register блоков), затем сразу A1-A4 (manifest markers — comment-only). `flutter analyze` clean.

### STOP-gate №3: Phase B — оборачивание marker блоков в orchestrator ✅ DONE 2026-05-02

**User approved 2026-05-02 → Phase B + B5 done.**

**Реализация B1/B2/B3:**
- **B1 `:syncImports`** — обёрнуты 7 import строк Configuration (lines 17–23 в финальном файле). Прочие imports (sync_core/drift/project core/auth/lifecycle/device/queue store) остались ВНЕ marker блока — они invariant к entities.
- **B2 `:syncEntityTypes`** — markers внутри `<String>[...]` literal вокруг `'configuration',` (lines 34–36). Declaration `const List<String> ... = <String>[` и закрывающий `];` остались вне marker pair.
- **B3 `:syncRegistrations`** — обёрнут Configuration register block (lines 82–94). Header comment "Adapter bundles registration" и Hooks block (Hook 1-4) остались вне marker block.

**B5 manual inspection PASS:**
- 3 marker pairs paired correctly (каждый `start` имеет matching `end`)
- Content внутри сохранён без потери
- Нет orphan markers
- Total file: 200 lines (было 197 + 6 marker строк)

**Verification:** `flutter analyze lib/core/sync/sync_orchestrator_provider.dart` → **No issues found! (ran in 46.6s)** — markers comment-only, не ломают компиляцию.

### ⚠ STOP-gate №5: Phase F2 — `codegen create-project --name t150`

**Текущее состояние перед F2:**
- Phase B + B5/B6/B7 + C0 + C + C7 + D + E + E5/E5.1 + E6 + F0 + F1 — все ✅ done
- На feature branch: 2 commits (Phase A/B + Phase C/D)
- npm test: **79 passing** (62 baseline + 7 orchestrator_patcher + 5 section_replacer + 6 project_bootstrapper) — 0 failures
- Compile clean, lint warnings (16 pre-existing, 0 errors)
- t115 после F0 re-add: 5 entities patched в orchestrator (Configuration baseline + Category + Task + Tag + TaskTagMap junction). 12 errors про `GetTasksByCategoryIdUseCase` — pre-existing relation_patcher limitation (template `category_usecases.dart` без `:oneToManyMethods` marker), **не TASK-011 регрессия**.

**Что планирую делать в F2:**

`codegen create-project --name t150 --templ-project t115`

- Свежий проект на disk (~3 минуты, ~500MB).
- Last test project: `t149` → следующий **`t150`**.
- Цель: validate fresh project bootstrap c sync_core 0.3.0 baseline (Configuration + 3 marker pairs ready) + patched pubspec.yaml для sync_core path-dep.

**Verification после F2 (Phase F3):**
- `codegen verify --name t150` PASS errors=0 (Configuration-only baseline проект работает clean)
- `flutter analyze` 0 errors / warnings ≤ 5
- 8 файлов в `lib/core/sync/` (5 source + 3 .g.dart)
- pubspec.yaml: `sync_core: path: ../../../../../Projects/Flutter/Packages/sync_core` (углублён на 1 уровень от template)

**Жду:** `ok` или `делай` или `да` от teamlead'а на F2 (`create-project --name t150`).

⏸ **PAUSE — возвращаю управление teamlead'у для STOP-gate №5 review.**

### STOP-gate №3 (legacy plan): Phase B — план оборачивания (выполнено выше)

**Что планирую делать:**

В `G:/Templates/flutter/t115/t115_flutter/lib/core/sync/sync_orchestrator_provider.dart` обернуть **3 секции** в marker pairs (для будущего idempotent patching через `orchestrator_patcher.ts` в Phase C).

**Текущая структура файла после Phase A0 (197 строк):** см. Inline-снимок ниже. Marker блоки и их границы:

#### B1: `:syncImports` marker блок

**Текущее (line 16-22, 7 строк):**
```dart
import '../../features/configuration/data/adapters/configuration/configuration_event_adapter.dart';   // 16
import '../../features/configuration/data/adapters/configuration/configuration_local_apply.dart';    // 17
import '../../features/configuration/data/adapters/configuration/configuration_payload_codec.dart';  // 18
import '../../features/configuration/data/adapters/configuration/configuration_pull_adapter.dart';   // 19
import '../../features/configuration/data/adapters/configuration/configuration_remote_adapter.dart'; // 20
import '../../features/configuration/data/datasources/local/daos/configuration/configuration_dao.dart'; // 21
import '../../features/configuration/domain/entities/configuration/configuration_entity.dart';       // 22
```

**После B1 (обёртка marker pair):**
```dart
// === generated_start:syncImports ===
import '../../features/configuration/data/adapters/configuration/configuration_event_adapter.dart';
import '../../features/configuration/data/adapters/configuration/configuration_local_apply.dart';
import '../../features/configuration/data/adapters/configuration/configuration_payload_codec.dart';
import '../../features/configuration/data/adapters/configuration/configuration_pull_adapter.dart';
import '../../features/configuration/data/adapters/configuration/configuration_remote_adapter.dart';
import '../../features/configuration/data/datasources/local/daos/configuration/configuration_dao.dart';
import '../../features/configuration/domain/entities/configuration/configuration_entity.dart';
// === generated_end:syncImports ===
```

**Граница:** marker pair оборачивает 7 import строк Configuration entity — это начальная популяция блока, в которую `orchestrator_patcher.ts` далее вставит дополнительные imports (per `generate-entity` runs в Phase F0 + future `expense.spy.yaml` etc.). Прочие imports (sync_core / drift / project core / auth / lifecycle / device / queue store) **остаются вне marker блока** — они invariant к entities и не патчатся.

#### B2: `:syncEntityTypes` marker блок

**Текущее (line 29-33, 5 строк):**
```dart
/// Список зарегистрированных entityType. Расширяется через
/// `codegen generate-entity` (orchestrator_patcher patch'ит этот блок).
const List<String> syncEntityTypes = <String>[
  'configuration',
];
```

**После B2 (обёртка marker pair вокруг **внутренней** части list literal):**
```dart
/// Список зарегистрированных entityType. Расширяется через
/// `codegen generate-entity` (orchestrator_patcher patch'ит этот блок).
const List<String> syncEntityTypes = <String>[
  // === generated_start:syncEntityTypes ===
  'configuration',
  // === generated_end:syncEntityTypes ===
];
```

**Граница:** markers внутри `[...]` literal — patcher вставляет `'<entityType>',` строки между ними. `const List<String> ... = <String>[` declaration и закрывающий `];` остаются вне marker pair — это static syntax скелет.

#### B3: `:syncRegistrations` marker блок

**Текущее (line 78-88, 11 строк):**
```dart
  // ── Adapter bundle: Configuration (Phase 3.6) ───────────────────────────
  orchestrator.register<ConfigurationEntity>(
    'configuration',
    AdapterBundle<ConfigurationEntity>(
      writeAdapter: ConfigurationRemoteAdapter(client),
      codec: const ConfigurationPayloadCodec(),
      localApply: ConfigurationLocalApply(ConfigurationDao(dbService)),
      pullAdapter: ConfigurationPullAdapter(client),
      eventAdapter: ConfigurationEventAdapter(client),
    ),
  );
```

**После B3 (обёртка marker pair):**
```dart
  // === generated_start:syncRegistrations ===
  // ── Adapter bundle: Configuration (Phase 3.6) ───────────────────────────
  orchestrator.register<ConfigurationEntity>(
    'configuration',
    AdapterBundle<ConfigurationEntity>(
      writeAdapter: ConfigurationRemoteAdapter(client),
      codec: const ConfigurationPayloadCodec(),
      localApply: ConfigurationLocalApply(ConfigurationDao(dbService)),
      pullAdapter: ConfigurationPullAdapter(client),
      eventAdapter: ConfigurationEventAdapter(client),
    ),
  );
  // === generated_end:syncRegistrations ===
```

**Граница:** marker pair оборачивает только Configuration register block. Header comment `// ── Adapter bundles registration ────────...` (lines 74-76) **остаётся вне** marker block — это invariant header. Hooks block (Hook 1: boot recovery, Hook 2: connectivity, Hook 3: foreground, Hook 4: scope change) **тоже вне** marker block.

**Blast radius:**
- Только template `G:/Templates/flutter/t115/`, не codegen src.
- 3 marker pairs (6 marker строк итого) добавлены — comment-only changes, не меняют compiled behavior.
- t115 в **broken state** между A0 и F0 (acceptable per Discussion #1 §10 — будет fixed в F0 через `generate-entity`).

**Verification после Phase B:**
- `flutter analyze lib/core/sync/sync_orchestrator_provider.dart` — должен compile clean (markers — comment-only).
- Manual inspection: 3 marker pairs paired correctly, no orphan markers.
- НЕ запускать full `codegen verify --name t115` (даст FAIL — intermediate state).

**Что планирую делать дальше (после ok на B):**
1. Phase B (3 marker pairs в orchestrator, ~5 минут).
2. Phase B5/B6/B7: B5 manual inspection paired markers, B6/B7 — отложу до Phase C2 (тесты пишутся вместе с patcher implementation).
3. Phase C0: replacement_util audit (ENTITY/M2M словари расширения).
4. Phase C: orchestrator_patcher.ts + 6 unit-tests, C7 concurrent test.
5. Phase D: patchPubspecPackagePaths fix.
6. Phase E: docs cleanup, E5/E5.1 README + sync-core-integration.md, E6 TASK-013 backlog.
7. Phase F0: re-add 4 tasks через `generate-entity` для t115 (E2E patcher validation).
8. Phase F1-F3: DoD verify regression + fresh project.

**Жду:** `ok` или `делай` или `да` от teamlead'а на B drop'ы в sync_orchestrator_provider.dart.

### STOP-gate №2: Phase A0 — drop 4 tasks register'ов в sync_orchestrator_provider.dart (legacy)

**Что планирую делать:**

В `G:/Templates/flutter/t115/t115_flutter/lib/core/sync/sync_orchestrator_provider.dart` **удалить** (не закомментировать — destructive drop, чистый baseline):

1. **20 import строк tasks adapters (строки 15–34):**
   - `category/category_event_adapter.dart` / `_local_apply.dart` / `_payload_codec.dart` / `_pull_adapter.dart` / `_remote_adapter.dart` (5 строк, 15–19)
   - `tag/tag_event_adapter.dart` / `_local_apply.dart` / `_payload_codec.dart` / `_pull_adapter.dart` / `_remote_adapter.dart` (5 строк, 20–24)
   - `task/task_event_adapter.dart` / `_local_apply.dart` / `_payload_codec.dart` / `_pull_adapter.dart` / `_remote_adapter.dart` (5 строк, 25–29)
   - `task_tag_map/task_tag_map_event_adapter.dart` / `_local_apply.dart` / `_payload_codec.dart` / `_pull_adapter.dart` / `_remote_adapter.dart` (5 строк, 30–34)

2. **4 import строки tasks DAO (строки 35–38):**
   - `category_dao.dart` / `tag_dao.dart` / `task_dao.dart` / `task_tag_map_dao.dart`

3. **4 import строки tasks domain entities (строки 39–42):**
   - `category_entity.dart` / `tag_entity.dart` / `task_entity.dart` / `task_tag_map_entity.dart`

   Итого по imports: **28 строк удалить** (20 adapters + 4 DAO + 4 entities). Configuration imports (43–49) + sync infra imports (50–52) **оставить** в текущем виде.

4. **4 строки tasks в `syncEntityTypes` const list (строки 63–66):**
   ```dart
   'category',
   'task',
   'tag',
   'task_tag_map',
   ```
   Также удалить устаревший docstring (57–60) о "Phase 2b/c/d" — заменить на короткий comment о Configuration baseline. Финальное состояние:
   ```dart
   /// Список зарегистрированных entityType. Расширяется через
   /// `codegen generate-entity` (orchestrator_patcher patch'ит этот блок).
   const List<String> syncEntityTypes = <String>[
     'configuration',
   ];
   ```

5. **4 `orchestrator.register<...>(...)` блока (строки 125–177):**
   - Category register block (125–135, ~11 строк)
   - Task register block (137–147, ~11 строк)
   - Tag register block (149–159, ~11 строк)
   - TaskTagMap register block (161–177, ~17 строк включая junction-specific docstring 161–167)

   Configuration register (113–123) **оставить** как есть — singleton baseline.

**Blast radius:**
- Только template `G:/Templates/flutter/t115/`, не codegen src.
- Файл будет содержать **только Configuration adapter bundle** (singleton + 1 register) — это targeted minimal Variant A baseline (per Discussion #1).
- t115 после Phase A0 в **broken state** (tasks Repository/UI ссылаются на orchestrator который не имеет tasks register'ов → runtime errors). Это **acceptable intermediate state** per Discussion #1 Decision §10. Resolves в Phase F0 (re-add via `generate-entity` × 4).

**Verification после A0:**
- НЕ запускать `codegen verify --name t115` (даст FAIL — ожидаемо, не показатель регрессии).
- Допустимо: `flutter analyze lib/core/sync/sync_orchestrator_provider.dart` — должен скомпилироваться (orphan ссылок не остаётся, только entities/DAO/adapters tasks становятся unused-but-existing в template).

**Что планирую делать дальше (после ok на A0):**

1. Phase A0: drop 4 imports + 4 entityTypes + 4 register'ов в sync_orchestrator_provider.dart (после ok этого STOP-gate №2)
2. Phase A1-A4: 30 manifest маркеров в template adapter файлы → STOP-gate №3
3. Phase B: оборачивание marker блоков в orchestrator → продолжение STOP-gate №3 или новый
4. Далее — codegen TS работа без STOP-gates до Phase F2 (`create-project --name t150`).

**Уточнение по Phase A1 числу файлов:**

Task.md Phase A1: "8 файлов в `lib/core/sync/*.dart` (исключая `.g.dart`) → manifest: startProject". Фактически в директории **5 `.dart` файлов** (исключая `.g.dart`): `app_lifecycle_provider.dart`, `device_id_provider.dart`, `drift_sync_queue_store.dart`, `sync_orchestrator_provider.dart`, `sync_queue_table.dart`. Остальные 3 файла в директории — `.g.dart` (Riverpod codegen output, manifest не нужен). Total Phase A: 5 + 5 + 15 + 5 = **30 manifest маркеров** (не 33 в task.md). Это cosmetic discrepancy в task.md (числа 8/33), не блокер. В Phase A1 поставлю 5 маркеров.

**Жду:** `ok` или `делай` или `да` от teamlead'а на A0 правку sync_orchestrator_provider.dart.

## Phase tracking

| Phase | Что | Status | Commit |
|---|---|---|---|
| **A0** | Orchestrator minimal Configuration baseline (Variant A — Discussion #1) | ✅ done 2026-05-02 (no commit yet) | uncommitted |
| **A0.6** | Закомментировать tasks UI в `home_page.dart` (TASK-002 default state) | ✅ done 2026-05-02 (no commit yet) | uncommitted |
| A | Manifest markers в t115 template (30 файлов: 5 sync infra source + 5 Configuration + 15 Tasks + 5 TaskTagMap) | ✅ done 2026-05-02 (no commit yet) | uncommitted |
| B | Orchestrator marker блоки в template (3 пары) | ✅ done 2026-05-02 (no commit yet) | uncommitted |
| **B5** | Manual inspection (paired markers, content saved) | ✅ done 2026-05-02 | — |
| **B6/B7** | Idempotency unit test + SectionReplacer marker tests | ✅ done 2026-05-02 — `section_replacer.test.ts` (5 tests, B6+B7×4) | — |
| **C0** | replacement_util ENTITY/M2M словари audit | ✅ done 2026-05-02 (no extension needed — built-in placeholder substitution) | — |
| C | orchestrator_patcher.ts + 6 unit-tests | ✅ done 2026-05-02 — `orchestrator_patcher.ts` + 7 tests | — |
| **C7** | Mock-based concurrent patcher test (commutative) | ✅ done 2026-05-02 — included in patcher tests | — |
| D | patchPubspecPackagePaths fix (sync_core path-dep) | ✅ done 2026-05-02 — extended regex для `../../../../Projects/...` patterns + 6 tests | — |
| E | Codegen docs cleanup (drop R1 references) | ⏭ pending | — |
| **E5/E5.1** | README short bullet + new `docs-code-generator/sync-core-integration.md` | ⏭ pending | — |
| **E6** | TASK-013 backlog placeholder (robust junction detection) | ⏭ pending | — |
| **F0** | E2E patcher validation: re-add 4 tasks через `generate-entity` для t115 | ✅ done 2026-05-02 — orchestrator_patcher восстановил 5 entities (Configuration + Category + Task + Tag + TaskTagMap), junction docstring корректный. **Pre-existing limitation:** relation_patcher не восстанавливает `:oneToManyMethods` marker блоки в task_usecases/providers/repository — template файлы без markers, regen ломает relation methods. 12 errors про `GetTasksByCategoryIdUseCase` — known issue, не TASK-011 регрессия (BUG-007). См. raw output ниже. | uncommitted |
| **F2** | `codegen create-project --name t150 --human` | ✅ done 2026-05-02 — 259 файлов создано за 236943ms, structure correct (5 source `lib/core/sync/` + 5 Configuration adapters + agent infra) | uncommitted (filesystem state) |
| **F3** | `codegen verify --name t150 --human` | 🔴 **FAIL 2026-05-02** — errors=236 (architectural gap: t115 template orchestrator post-F0 has 5 entities — broken для fresh project copy без tasks features). См. § BLOCKED. | — |
| F4-F5 | (опционально) generate-entity на t150 + финальный report | ⏭ blocked на F3 fix | — |

**Phase pipeline expanded** через [Discussion #1 archive](../../../discussions/archive/1-task-011-sync-core-templates-hardcoded-r/) (User decision 2026-05-02): Variant A acceptance + 6 phase amendments (A0/A0.6, B5/B6/B7, C0, C7, E5+new doc, F0).

## Изменения

### Создано

**Codegen src:**
- `src/features/generation/generators/orchestrator_patcher.ts` (~250 строк) — идемпотентный patcher для 3 marker блоков в `sync_orchestrator_provider.dart`. Junction detection через `model.className.endsWith('Map')`. Placeholder-based substitution (3-form: PascalCase/camelCase/snake_case). Recovery from legacy duplicates (как `relation_patcher.ts` BUG-003 fix).

**Codegen tests:**
- `src/test/generators/orchestrator_patcher.test.ts` — 7 tests (empty/single/idempotent/junction/multi-sequential/recovery-duplicates/commutative)
- `src/test/generators/section_replacer.test.ts` — 5 tests (B6 digest stable + B7 4 cases: empty/existing/malformed/duplicates)
- `src/test/services/project_bootstrapper.test.ts` — 6 tests для patchPubspecPackagePaths (in-monorepo / out-of-monorepo / combined / idempotent / absolute / sibling)

### Изменено в codegen src

- `src/features/generation/generators/generation_service.ts` — подключён `OrchestratorPatcher` в `generate()` flow после `RelationPatcher.patch()` (только при entity-based generation).
- `src/core/services/project_bootstrapper.ts` — `patchPubspecPackagePaths` extended regex для покрытия sync_core path-dep (`(?:\.\.\/){4,}Projects\/` pattern).
- `src/adapters/cli/commands/generate_entity.ts` — добавлен `--projects-path` flag для override default `G:/Projects/Flutter/serverpod` (нужен для Phase F0 — E2E patcher validation на template directory).

### Изменено в t115 template

**Phase A0 (drop tasks из orchestrator) + A0.6 (comment-out tasks UI):**
- `t115_flutter/lib/core/sync/sync_orchestrator_provider.dart` — drop 28 import строк tasks (20 adapters + 4 DAO + 4 entities), 4 entityType строк (`category` / `task` / `tag` / `task_tag_map`), 4 register блоков (~50 строк). Файл reduced 256 → 197 lines. Docstring переписан под Configuration baseline + codegen extension.
- `t115_flutter/lib/features/home/presentation/pages/home_page.dart` — закомментировано 3 imports + 3 state поля + 3 widgets + 2 SizedBox разделителя.

**Phase A1 (manifest: startProject в lib/core/sync/, 5 файлов):**
- `t115_flutter/lib/core/sync/app_lifecycle_provider.dart`
- `t115_flutter/lib/core/sync/device_id_provider.dart`
- `t115_flutter/lib/core/sync/drift_sync_queue_store.dart`
- `t115_flutter/lib/core/sync/sync_orchestrator_provider.dart`
- `t115_flutter/lib/core/sync/sync_queue_table.dart`

**Phase A2 (manifest: startProject в configuration adapters, 5 файлов):**
- `t115_flutter/lib/features/configuration/data/adapters/configuration/configuration_event_adapter.dart`
- `t115_flutter/lib/features/configuration/data/adapters/configuration/configuration_local_apply.dart`
- `t115_flutter/lib/features/configuration/data/adapters/configuration/configuration_payload_codec.dart`
- `t115_flutter/lib/features/configuration/data/adapters/configuration/configuration_pull_adapter.dart`
- `t115_flutter/lib/features/configuration/data/adapters/configuration/configuration_remote_adapter.dart`

**Phase A3 (manifest: entity в category/task/tag adapters, 15 файлов):**
- `t115_flutter/lib/features/tasks/data/adapters/category/{category_event_adapter,category_local_apply,category_payload_codec,category_pull_adapter,category_remote_adapter}.dart`
- `t115_flutter/lib/features/tasks/data/adapters/task/{task_event_adapter,task_local_apply,task_payload_codec,task_pull_adapter,task_remote_adapter}.dart`
- `t115_flutter/lib/features/tasks/data/adapters/tag/{tag_event_adapter,tag_local_apply,tag_payload_codec,tag_pull_adapter,tag_remote_adapter}.dart`

**Phase A4 (manifest: manyToMany в task_tag_map adapters, 5 файлов):**
- `t115_flutter/lib/features/tasks/data/adapters/task_tag_map/{task_tag_map_event_adapter,task_tag_map_local_apply,task_tag_map_payload_codec,task_tag_map_pull_adapter,task_tag_map_remote_adapter}.dart`

**Phase B (orchestrator marker блоки, 1 файл):**
- `t115_flutter/lib/core/sync/sync_orchestrator_provider.dart` — 3 marker pairs (`:syncImports`, `:syncEntityTypes`, `:syncRegistrations`) обёрнуты вокруг Configuration imports/entityType/register block. File grew 197 → 200 lines (6 marker строк, comment-only).

### Изменено в codegen docs

**Phase E (docs cleanup):**
- `ai/docs/agent_memory.md` — секция "Sync-паттерн в шаблоне" переписана под sync_core 0.3.0 (drop R1, описание 5 source файлов + per-entity adapters + manifest types)
- `ai/docs/architecture.md` — секция "Sync-паттерн (в шаблоне t115)" переписана с детальной структурой (5 source файлов + 5 adapters + 3 marker блока + 4 hooks)
- `CLAUDE.md` (root) — обновлены: "Что НЕ генерируется автоматически" (drop R1, добавлен про custom hooks), "Создай новый проект" (Configuration baseline + tasks UI закомментирован), "Без парного sync_event" (sync_core 0.3.0 conventions), "ВНИМАНИЕ :base секции" (про idempotent marker блоки)

**Phase E5/E5.1 (README + new doc):**
- `README.md` — short bullet про sync_core 0.3.0 multi-entity sync + link на новый detailed doc
- **`docs-code-generator/sync-core-integration.md`** (новый файл, ~120 строк) — детальное описание: что генерируется (create-project + generate-entity + 3 marker блока), YAML model requirements (6 fields + sync_event), limitations (junction heuristic / soft-delete / patcher prerequisites / pubspec idempotency), references (codegen src + sync_core docs + reference consumers + TASK-013 backlog).

**Phase E6 (TASK-013 backlog placeholder):**
- `ai/tasks/backlog.md` — добавлена запись TASK-013 (robust junction detection через YAML field analysis или explicit `junction: true` flag), trigger: weight TASK-018 false-negatives.

## Тесты

- Unit-tests добавлено: TBD (минимум 6 для orchestrator_patcher)
- Total tests passing: TBD (baseline 62, expected 68+)
- Все проходят: TBD
- Запуск: `npm test`

## DoD verify (cite actual JSON output)

### Phase A regression — t115 (existing template post-markers)

```
[verify --name t115]
TBD — заполняется после Phase A
```

### Phase F fresh project — t150

**`create-project --name t150 --human` (2026-05-02):**

```
SUCCESS: create-project
Created (259):
  + G:\Projects\Flutter\serverpod\t150\t150_flutter\lib\core\sync\app_lifecycle_provider.dart
  + G:\Projects\Flutter\serverpod\t150\t150_flutter\lib\core\sync\device_id_provider.dart
  + G:\Projects\Flutter\serverpod\t150\t150_flutter\lib\core\sync\drift_sync_queue_store.dart
  + G:\Projects\Flutter\serverpod\t150\t150_flutter\lib\core\sync\sync_orchestrator_provider.dart
  + G:\Projects\Flutter\serverpod\t150\t150_flutter\lib\core\sync\sync_queue_table.dart
  + 5 configuration adapter files (event/local_apply/payload_codec/pull/remote)
  + 254 other files (project skeleton)
Modified (9): pubspec.yaml + main.dart + .gitignore in 3 sub-projects
Duration: 236943ms
```

**`verify --name t150 --human` (2026-05-02) — FAIL:**

```
[1/4] dart pub get (server)...
[1/4] flutter pub get (flutter)...
[2/4] serverpod generate --experimental-features=all...
[3/4] dart run build_runner build --delete-conflicting-outputs...
[4/4] flutter analyze...

FAIL: verify t150
  project: G:\Projects\Flutter\serverpod\t150
  ✗ flutterAnalyze — 13821ms (errors=236, warnings=8, infos=44)
  ✓ pubGet — 4566ms
  ✓ serverpodGenerate — 9034ms
  ✓ buildRunner — 3743ms
Errors:
  ! flutter analyze: 236 errors
Total: 31168ms
```

**Root cause:** t115 template orchestrator после Phase F0 (E2E patcher validation re-add 4 tasks) содержит 5 entities (Configuration + Category + Task + Tag + TaskTagMap) — broken для fresh project copy. См. § BLOCKED секцию.

### Phase F generate-entity (опционально)

```
[generate-entity --yaml expense.spy.yaml ... --workspace t<N+1>]
TBD
```

## Acceptance criteria

(копия из task.md — executor отмечает [x] по ходу)

### Must-have
- [x] **Phase A0**: orchestrator minimal Configuration baseline (Variant A) — 2026-05-02, drop 28 imports + 4 entityTypes + 4 register блока, `flutter analyze` clean
- [x] **Phase A0.6**: tasks UI закомментирован в `home_page.dart` (2026-05-02, `flutter analyze` clean)
- [x] Phase A: 30 файлов с manifest маркерами (5 sync infra source + 5 Configuration + 15 Tasks + 5 TaskTagMap) — 2026-05-02, `flutter analyze` adapter dirs clean
- [x] **Phase B**: 3 marker блока в sync_orchestrator_provider.dart — 2026-05-02, `flutter analyze` clean
- [x] **Phase B5**: marker integrity (manual inspection PASS) — 2026-05-02
- [x] **Phase B6/B7**: idempotency + SectionReplacer marker tests — 2026-05-02, `section_replacer.test.ts` (5 tests: empty pair / existing idempotent / malformed orphan no-crash / duplicate pairs no-op / B6 digest stable)
- [x] **Phase C0**: replacement_util audit — ✅ no extension needed (orchestrator_patcher использует built-in 3-form placeholder substitution с PascalCase/camelCase/snake_case formstvo + не зависит от dictionary словарей, т.к. patcher не делает file-level replacement, а text-snippet substitution).
- [x] **Phase C**: orchestrator_patcher.ts + 7 unit-tests passing — 2026-05-02
- [x] **Phase C7**: commutative test (apply A→B == B→A) — included in patcher tests
- [x] **Phase D**: patchPubspecPackagePaths covers sync_core path-dep — 2026-05-02, regex extension `(?:\.\.\/){4,}Projects\/` + 6 unit-tests
- [x] **Phase E**: docs cleanup (drop R1) — 2026-05-02, обновлены `agent_memory.md` + `architecture.md` + `CLAUDE.md` (root)
- [x] **Phase E5/E5.1**: README short bullet + `docs-code-generator/sync-core-integration.md` — 2026-05-02, новый файл ~120 строк (что генерируется / YAML / limitations / references)
- [x] **Phase E6**: TASK-013 backlog placeholder — 2026-05-02, в `ai/tasks/backlog.md`
- [x] **Phase F0**: re-add 4 tasks через `generate-entity` для t115 (E2E patcher validation) — 2026-05-02, orchestrator_patcher восстановил 5 entities ✅. Pre-existing relation_patcher limitation: 12 errors про `GetTasksByCategoryIdUseCase` (template файлы без `:oneToManyMethods` marker) — known issue, **не TASK-011 регрессия**.
- [ ] DoD t115 regression PASS errors=0 (после F0)
- [ ] DoD fresh t<N+1> PASS errors=0 (Configuration-only baseline)
- [ ] DoD generate-entity 5 adapters created + register patched
- [ ] report.md с actual JSON output
- [ ] 62+ existing tests + new tests passing (B7 + C0 + C2 + C7 = +10-15 tests)

## Architectural concerns / Risks

(Executor flag'ит проблемы по ходу, например:)
- (TBD: Junction entity manifest:manyToMany словарь правильно покрывает 5 adapter pattern?)
- (TBD: Late `registerEntity` после `start()` — codegen patcher должен ли validate этот case?)
- (TBD: `patchPubspecPackagePaths` regex broader scope — могут ли быть unintended side effects?)

## BLOCKED — требуется решение User'а

### BLOCKED 2026-05-02: Phase F3 verify FAIL errors=236 — architectural gap "post-F0 template state vs fresh project Configuration baseline"

**Симптом:**

Phase F2 успешен — `codegen create-project --name t150 --human` создал t150 за 237s, файлы скопированы корректно (5 source `lib/core/sync/` + 5 Configuration adapters + agent infrastructure).

Phase F3 FAIL:
```
FAIL: verify t150
  ✗ flutterAnalyze — 13821ms (errors=236, warnings=8, infos=44)
  ✓ pubGet — 4566ms
  ✓ serverpodGenerate — 9034ms
  ✓ buildRunner — 3743ms
```

**Sample errors (из `flutter analyze lib/core/sync/sync_orchestrator_provider.dart`):**
```
error - Target of URI doesn't exist: '../../features/tasks/data/adapters/category/category_event_adapter.dart' - line 24:8 - uri_does_not_exist
error - Target of URI doesn't exist: '../../features/tasks/data/adapters/category/category_local_apply.dart' - line 25:8 - uri_does_not_exist
... (×28 import errors про отсутствующие tasks adapters/DAO/entities)
... + cascading undefined classes (CategoryEntity / CategoryRemoteAdapter / TaskEntity / TaskTagMapDao etc.)
```

**Корневая причина:**

t115 template `lib/core/sync/sync_orchestrator_provider.dart` после Phase F0 (E2E patcher validation — re-add tasks через generate-entity) содержит **5 entities** state:
- 7 Configuration imports + 28 tasks imports = 35 imports
- 5 entityTypes (`'configuration'` + 4 tasks)
- 5 register блоков (Configuration + Category + Task + Tag + TaskTagMap)

При `create-project --name t150` `manifest: startProject` копирует этот orchestrator файл as-is. Но tasks features **не копируются** (TASK-002 default off — нет manifest:entity директорий для tasks в новый проект). Результат: orchestrator ссылается на 28 несуществующих файлов → 236 errors.

**Между Phase F0 и F2 есть architectural conflict:**
- F0 цель — E2E validation patcher через re-add tasks → orchestrator template ВКЛЮЧАЕТ 5 entities
- F2/F3 цель — fresh project с Configuration baseline только → orchestrator template ДОЛЖЕН содержать ТОЛЬКО Configuration

Эти два требования взаимоисключающие при текущей архитектуре `manifest: startProject` (literal copy без фильтрации).

**Возможные решения (нужен User decision):**

**Variant A: rollback orchestrator template к Configuration baseline после F0 evidence**
- После F0 успешного re-add (5 entities в orchestrator, idempotent patcher proven), сохранить evidence в discussion archive (текстовый снапшот orchestrator post-F0), затем git-revert template orchestrator к pre-F0 state (Configuration baseline только)
- Pro: F2/F3 пройдут errors=0; Variant A intent сохранён ("Configuration baseline + future generate-entity adds tasks")
- Con: t115 template снова broken (tasks UI закомментирован уже OK, но features/tasks директории остаются orphan'ами); F0 patcher evidence только в текстовой форме

**Variant B: добавить tasks features в new project (TASK-002 включить по default)**
- Включить копирование `lib/features/tasks/` директорий в `manifest: startProject` (или эквивалентный `manifest: entity` обработчик с include по default)
- Pro: t115 template остаётся as-is post-F0 ("realistic state" reference)
- Con: ломает TASK-002 default off contract — fresh project имеет hardcoded 5 entities вместо minimal Configuration baseline; противоречит scope task.md ("Tasks features НЕ присутствуют по default — TASK-002 опт-ин")

**Variant C: orchestrator template делать "fragmented" с marker блоков
- Template orchestrator копируется с пустыми marker pair, а Configuration register block добавляется через post-create-project step (orchestrator_patcher на manifest "Configuration" entity)
- Pro: clean Configuration baseline по умолчанию; добавление entity через generate-entity — incremental
- Con: требует архитектурного изменения — Configuration становится "first-class entity, генерируемый patcher'ом" (не singleton baseline в template). Расширяет TASK-011 scope значительно. Возможно нужен отдельный "configuration-entity" generator или special-case в `generation_service.ts`.

**Variant D: post-create-project cleanup step**
- В `create_project.ts` после копирования template orchestrator вызывать `orchestrator_patcher.stripEntities(content, ['category', 'task', 'tag', 'task_tag_map'])` (новый method)
- Pro: исправление точечное; t115 template остаётся as-is post-F0
- Con: новая complexity в orchestrator_patcher (strip operation вместо only insert/idempotent); требует tests; скорее всего создаёт TASK-013-like backlog

**Текущее состояние filesystem:**
- `G:/Projects/Flutter/serverpod/t150/` — 259 файлов созданы, broken state
- `G:/Templates/flutter/t115/t115_flutter/lib/core/sync/sync_orchestrator_provider.dart` — 5 entities (post-F0 state)
- Codegen tests — 80 passing (corrigeable F2/F3 не от codegen src, а от template state)

**Жду:** User decision на Variant A/B/C/D перед continuation. Per executor.prompt.md "F3 errors > 0 — flag блокер, остановись".

## Next steps

(Заполняется после merge — что далее в pipeline)

После TASK-011 acceptance ✅:
- TASK-012 (codegen → todo real app generation + smoke) — sync_core teamlead spawn'ит executor
- weight TASK-018 unblocked (после TASK-012 ✅)

## Статус

🔴 **BLOCKED 2026-05-02** — Phase F2 done (t150 created), Phase F3 FAIL errors=236 (architectural gap orchestrator template post-F0 vs fresh project Configuration baseline). Жду teamlead/User decision на Variant A/B/C/D (см. § BLOCKED).
