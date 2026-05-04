/**
 * TemplateConfig — конфигурация template-specific литералов для multi-template
 * architecture (per ADR-0005 + Discussion #11 + TASK-022 / Phase B1 + TASK-023 / Phase B2).
 *
 * **Цель:** убрать hardcoded литералы из generators (`RelationPatcher`,
 * `OrchestratorPatcher`, `AppDatabaseGenerator`) → передавать через
 * `GenerationConfig.templateConfig`. Это позволит Phase D (`--template <name>`
 * CLI flag) переключать между t115 (deprecated path) и simplified (TASK-B2 scope)
 * без code duplication.
 *
 * **Stack lock invariants** (per ADR-0005 amendment 2026-05-03):
 * - НЕ меняется выбор пакетов (Riverpod / Drift / sync_core / Serverpod)
 * - НЕ меняется marker scheme (13 markers per ClaudeAdv evidence)
 * - НЕ flatten directory layout (Clean preserved)
 *
 * Simplified template отличается от t115 ТОЛЬКО architecture ceremony reduction
 * (no usecases / business notifiers / validation / repository interfaces /
 * app services / mappers separate class / Either-Result / datasource interfaces).
 *
 * **TASK-023 / Phase B2 (BUG-019 fix):** `orchestrator` shape расширен snippet
 * content fields (`entityImportsTemplate` / `entityRegisterTemplate` /
 * `junctionImportsTemplate` / `junctionRegisterTemplate` + fallback entity
 * literals + feature segment literal). До TASK-023 эти snippet'ы были
 * hardcoded constants в `orchestrator_patcher.ts` (lines 410-474) с literal
 * entity references (`category`, `taskTagMap`, `task`, `tag`, `features/tasks/`)
 * → simplified template emission производила wrong content.
 */

/**
 * Конкретная shape конфига per task.md "Заметки по реализации" + ADR-0005.
 */
export interface TemplateConfig {
    /**
     * Идентификатор template. Используется только для diagnostic / logging.
     * Union type расширен заранее в TASK-B1 чтобы TASK-B2 мог plug-and-play
     * добавить `simplifiedTemplateConfig()` factory без re-edit interface.
     */
    name: 't115' | 'simplified';

    /**
     * Конфиг для `RelationPatcher` (`src/features/generation/generators/relation_patcher.ts`).
     * Заменяет hardcoded литералы в lines 18-19, 36 — `templateMainEntity` /
     * `templateRelatedEntity` / `markerName` / `scanDirectories`.
     */
    relationPatcher: {
        /**
         * Имя template entity, которое выступает «main» (содержащим relation методы).
         * Для t115: `'task'` — `task_dao.dart` имеет `getTasksByCategoryId(...)`,
         * patcher swap'ит `category_dao.dart` ⇄ `task_dao.dart` чтобы найти template
         * с :oneToManyMethods marker block.
         */
        templateMainEntity: string;

        /**
         * Имя template entity, которое выступает «related» (которое заменяется на
         * каждый relation field). Для t115: `'category'`. Используется как
         * sentinel в `templateFilePath` filter + ENTITY rules для related entity.
         */
        templateRelatedEntity: string;

        /**
         * Имя marker block (без префикса `// === generated_*:`). Для t115:
         * `'oneToManyMethods'`. Patcher строит full markers как
         * `// === generated_start:<markerName> ===` / `_end`.
         */
        markerName: string;

        /**
         * Список template directory keys для scan'а (relative ключи для
         * `getPathInfo` lookup). Для t115: `['feature/', 'server/']`.
         */
        scanDirectories: string[];
    };

    /**
     * Конфиг для `OrchestratorPatcher` (`src/features/generation/generators/orchestrator_patcher.ts`).
     *
     * **TASK-022 / Phase B1:** добавлен `relativePath` (path components от
     * `targetFlutterProjectPath` до orchestrator файла).
     *
     * **TASK-023 / Phase B2 (BUG-019 fix):** добавлены snippet content fields:
     * - `entityImportsTemplate` / `entityRegisterTemplate` — шаблоны для regular
     *   entity sync wire-up (raw strings с placeholder tokens — `category` /
     *   `Category` для regular, заменяются substitution flow в patcher'е).
     * - `junctionImportsTemplate` / `junctionRegisterTemplate` — шаблоны для
     *   junction entity (с `__FK1__`/`__FK2__`/`__FK1Pascal__`/`__FK2Pascal__`
     *   placeholders для junction-specific FK substitution).
     * - `regularEntityFallback` / `junctionEntityFallback` — entity literal
     *   fallbacks которые соответствуют PascalCase/camelCase/snake_case в
     *   соответствующем template (substitution sentinel).
     * - `junctionFkFallbacks` — defensive FK name fallbacks если model.fields
     *   FK extraction не сработает.
     * - `templateFeatureSegment` — `features/<X>/` substring literal в template
     *   imports (substitution anchor для BUG-009 fix).
     */
    orchestrator: {
        /**
         * Relative path components от `targetFlutterProjectPath` до orchestrator
         * файла. Для t115: `['lib', 'core', 'sync', 'sync_orchestrator_provider.dart']`.
         * Используется через `path.join(targetFlutterProjectPath, ...relativePath)`.
         */
        relativePath: string[];

        /**
         * Imports snippet template для regular (non-junction) entity.
         * Содержит ровно 7 import строк (5 sync adapters + 1 dao + 1 entity).
         *
         * **Substitution sentinels** (placeholder tokens):
         * - `category` (lowerCamel/snake — same для single-word) → target entity
         * - `Category` (Pascal) → target Pascal
         * - `features/<templateFeatureSegment>/` → `features/<targetFeature>/` (BUG-009)
         *
         * Substitution производится `_substitutePlaceholders` в orchestrator_patcher.
         */
        entityImportsTemplate: string;

        /**
         * Register snippet template для regular entity.
         * Содержит ровно один `orchestrator.register<XEntity>(...)` block (12 строк
         * с adapter bundle + comment header).
         *
         * **Substitution sentinels:** identical к `entityImportsTemplate`.
         */
        entityRegisterTemplate: string;

        /**
         * Imports snippet template для junction entity.
         * Содержит ровно 7 import строк аналогично regular.
         *
         * **Substitution sentinels:**
         * - `task_tag_map` (snake) / `taskTagMap` (camel) / `TaskTagMap` (Pascal)
         *   → target junction entity (snake/camel/Pascal соответственно)
         * - `features/<templateFeatureSegment>/` → target feature
         */
        junctionImportsTemplate: string;

        /**
         * Register snippet template для junction entity (с docstring о routing
         * update→createX и delete→noop).
         *
         * **Substitution sentinels:**
         * - `task_tag_map` / `taskTagMap` / `TaskTagMap` — junction entity (как выше)
         * - `__FK1__` / `__FK2__` (lowerCamel) → first/second FK names
         * - `__FK1Pascal__` / `__FK2Pascal__` (PascalCase) → first/second FK names
         *
         * FK substitution производится `_substituteJunctionFKs` ДО `_substitutePlaceholders`
         * чтобы placeholders не конфликтовали с standard entity substitution.
         */
        junctionRegisterTemplate: string;

        /**
         * Fallback regular entity literal — sentinel для substitution когда model
         * не junction. Должен соответствовать substitution-anchor в
         * `entityImportsTemplate` / `entityRegisterTemplate`.
         *
         * Для t115: `'category'` (template entity которая используется в snippet'ах).
         */
        regularEntityFallback: string;

        /**
         * Fallback junction entity literal — sentinel для substitution когда model
         * is junction. Должен соответствовать substitution-anchor в
         * `junctionImportsTemplate` / `junctionRegisterTemplate`.
         *
         * Для t115: `'taskTagMap'` (lowerCamel form — `toSnakeCase` produces `task_tag_map`).
         */
        junctionEntityFallback: string;

        /**
         * Defensive FK name fallbacks для junction substitution когда
         * `model.fields` FK extraction returns < 2 FKs (defensive — не должно
         * случаться для правильно структурированной junction entity).
         *
         * Для t115: `{ fk1: 'task', fk2: 'tag' }` — соответствует `__FK1__` /
         * `__FK2__` в `junctionRegisterTemplate` (TaskTagMap junction = task+tag).
         */
        junctionFkFallbacks: {
            fk1: string;
            fk2: string;
        };

        /**
         * Template feature segment в `features/<X>/` literal (anchor для BUG-009
         * substitution). Должен совпадать с `config.templFeatureName`-derived
         * snake_case в template snippets.
         *
         * Для t115: `'tasks'` (template snippets содержат `features/tasks/...`).
         */
        templateFeatureSegment: string;
    };

    /**
     * Конфиг для `AppDatabaseGenerator` (`src/features/generation/generators/app_database_generator.ts`).
     * Заменяет hardcoded path в line 21.
     */
    database: {
        /**
         * Relative path components от `templFlutterLibPath` до template
         * `database.dart`. Для t115: `['core', 'data', 'datasources', 'local', 'database.dart']`.
         * Используется через `path.join(templFlutterLibPath, ...templateRelativePath)`.
         */
        templateRelativePath: string[];
    };
}

// ── t115 snippet templates (BUG-019 — extracted from orchestrator_patcher.ts) ──

/**
 * Imports snippet для regular entity в t115 template.
 *
 * Reference: t115/TASK-001 Phase 2b orchestrator post-add state.
 * Pre-TASK-023 location: `orchestrator_patcher.ts:410-416` (private constant `_ENTITY_IMPORTS_TEMPLATE`).
 */
const T115_ENTITY_IMPORTS_TEMPLATE = `import '../../features/tasks/data/adapters/category/category_event_adapter.dart';
import '../../features/tasks/data/adapters/category/category_local_apply.dart';
import '../../features/tasks/data/adapters/category/category_payload_codec.dart';
import '../../features/tasks/data/adapters/category/category_pull_adapter.dart';
import '../../features/tasks/data/adapters/category/category_remote_adapter.dart';
import '../../features/tasks/data/datasources/local/daos/category/category_dao.dart';
import '../../features/tasks/domain/entities/category/category_entity.dart';`;

/**
 * Imports snippet для junction entity в t115 template.
 *
 * Pre-TASK-023 location: `orchestrator_patcher.ts:422-428` (private constant `_JUNCTION_IMPORTS_TEMPLATE`).
 */
const T115_JUNCTION_IMPORTS_TEMPLATE = `import '../../features/tasks/data/adapters/task_tag_map/task_tag_map_event_adapter.dart';
import '../../features/tasks/data/adapters/task_tag_map/task_tag_map_local_apply.dart';
import '../../features/tasks/data/adapters/task_tag_map/task_tag_map_payload_codec.dart';
import '../../features/tasks/data/adapters/task_tag_map/task_tag_map_pull_adapter.dart';
import '../../features/tasks/data/adapters/task_tag_map/task_tag_map_remote_adapter.dart';
import '../../features/tasks/data/datasources/local/daos/task_tag_map/task_tag_map_dao.dart';
import '../../features/tasks/domain/entities/task_tag_map/task_tag_map_entity.dart';`;

/**
 * Register block snippet для regular entity в t115 template.
 *
 * Pre-TASK-023 location: `orchestrator_patcher.ts:433-443` (private constant `_ENTITY_REGISTER_TEMPLATE`).
 */
const T115_ENTITY_REGISTER_TEMPLATE = `  // ── Adapter bundle: Category ────────────────────────────────────────────
  orchestrator.register<CategoryEntity>(
    'category',
    AdapterBundle<CategoryEntity>(
      writeAdapter: CategoryRemoteAdapter(client),
      codec: const CategoryPayloadCodec(),
      localApply: CategoryLocalApply(CategoryDao(dbService)),
      pullAdapter: CategoryPullAdapter(client),
      eventAdapter: CategoryEventAdapter(client),
    ),
  );`;

/**
 * Register block snippet для junction entity в t115 template (с docstring о
 * routing update→createX и delete→noop).
 *
 * **TASK-014:** docstring и method-name fragments параметризованы через
 * `__FK1__` / `__FK2__` / `__FK1Pascal__` / `__FK2Pascal__` placeholders
 * (заменяются `_substituteJunctionFKs` ДО standard entity substitution).
 *
 * Pre-TASK-023 location: `orchestrator_patcher.ts:458-474` (private constant `_JUNCTION_REGISTER_TEMPLATE`).
 */
const T115_JUNCTION_REGISTER_TEMPLATE = `  // ── Adapter bundle: TaskTagMap (junction FK→__FK1__+__FK2__) ───────────────────
  // Junction-specific: server has no \`updateTaskTagMap\` RPC, only
  // \`createTaskTagMap\` (idempotent create + resurrect) and
  // \`deleteTaskTagMapBy__FK1Pascal__And__FK2Pascal__\` (soft-delete via business key).
  // \`update()\` adapter routes через \`createTaskTagMap\`; \`delete()\` is
  // a noop (Repository должен решать delete-flow — см.
  // task_tag_map_remote_adapter.dart docstring).
  orchestrator.register<TaskTagMapEntity>(
    'task_tag_map',
    AdapterBundle<TaskTagMapEntity>(
      writeAdapter: TaskTagMapRemoteAdapter(client),
      codec: const TaskTagMapPayloadCodec(),
      localApply: TaskTagMapLocalApply(TaskTagMapDao(dbService)),
      pullAdapter: TaskTagMapPullAdapter(client),
      eventAdapter: TaskTagMapEventAdapter(client),
    ),
  );`;

/**
 * Factory для t115 (Clean / advanced) template config. Литералы идентичны
 * pre-TASK-022 / pre-TASK-023 hardcoded state в generators.
 *
 * **Reference points** (для verification что literals unchanged):
 * - `relation_patcher.ts:18-19,36` (pre-TASK-022)
 * - `orchestrator_patcher.ts:42-48` (pre-TASK-022)
 * - `orchestrator_patcher.ts:208,250,261-262,410-474` (pre-TASK-023)
 * - `app_database_generator.ts:21` (pre-TASK-022)
 *
 * Backward compat: все existing call-sites которые не передают `templateConfig`
 * получают этот factory automatically через `GenerationConfig` constructor default.
 */
export function t115TemplateConfig(): TemplateConfig {
    return {
        name: 't115',
        relationPatcher: {
            templateMainEntity: 'task',
            templateRelatedEntity: 'category',
            markerName: 'oneToManyMethods',
            scanDirectories: ['feature/', 'server/'],
        },
        orchestrator: {
            relativePath: ['lib', 'core', 'sync', 'sync_orchestrator_provider.dart'],
            entityImportsTemplate: T115_ENTITY_IMPORTS_TEMPLATE,
            entityRegisterTemplate: T115_ENTITY_REGISTER_TEMPLATE,
            junctionImportsTemplate: T115_JUNCTION_IMPORTS_TEMPLATE,
            junctionRegisterTemplate: T115_JUNCTION_REGISTER_TEMPLATE,
            regularEntityFallback: 'category',
            junctionEntityFallback: 'taskTagMap',
            junctionFkFallbacks: { fk1: 'task', fk2: 'tag' },
            templateFeatureSegment: 'tasks',
        },
        database: {
            templateRelativePath: ['core', 'data', 'datasources', 'local', 'database.dart'],
        },
    };
}

// ── simplified snippet templates (TASK-023 — Configuration baseline) ──

/**
 * Imports snippet для regular entity в simplified template.
 *
 * **Стратегия (per ADR-0005 §7 stack lock):** simplified template inherits
 * t115's directory layout + sync_core 0.3.0 wire-up shape — снапшот snippet'а
 * MIRROR'ится с одним отличием: template feature = `configuration` (Configuration
 * baseline singleton entity, ADR-0005 §3.1 generate categories), template entity
 * = `configuration` (regular entity).
 *
 * Substitution flow в orchestrator_patcher преобразует `configuration` → target
 * entity name + `features/configuration/` → `features/<target_feature>/` (BUG-009).
 *
 * **NB:** simplified template содержит SAME structure (5 adapters + 1 dao +
 * 1 entity) per ADR-0005 §3.1 generate categories — это generate scope
 * не меняется между templates, только ceremony layer (usecases / interfaces /
 * separate mappers / etc) удаляется. Sync_core 0.3.0 contract = invariant.
 */
const SIMPLIFIED_ENTITY_IMPORTS_TEMPLATE = `import '../../features/configuration/data/adapters/configuration/configuration_event_adapter.dart';
import '../../features/configuration/data/adapters/configuration/configuration_local_apply.dart';
import '../../features/configuration/data/adapters/configuration/configuration_payload_codec.dart';
import '../../features/configuration/data/adapters/configuration/configuration_pull_adapter.dart';
import '../../features/configuration/data/adapters/configuration/configuration_remote_adapter.dart';
import '../../features/configuration/data/datasources/local/daos/configuration/configuration_dao.dart';
import '../../features/configuration/domain/entities/configuration/configuration_entity.dart';`;

/**
 * Register block snippet для regular entity в simplified template.
 *
 * Identical в shape к t115 (sync_core 0.3.0 wire-up = invariant), отличие
 * только в template entity name (`configuration` instead of `category`).
 */
const SIMPLIFIED_ENTITY_REGISTER_TEMPLATE = `  // ── Adapter bundle: Configuration ──────────────────────────────────────
  orchestrator.register<ConfigurationEntity>(
    'configuration',
    AdapterBundle<ConfigurationEntity>(
      writeAdapter: ConfigurationRemoteAdapter(client),
      codec: const ConfigurationPayloadCodec(),
      localApply: ConfigurationLocalApply(ConfigurationDao(dbService)),
      pullAdapter: ConfigurationPullAdapter(client),
      eventAdapter: ConfigurationEventAdapter(client),
    ),
  );`;

/**
 * Imports snippet для junction entity в simplified template.
 *
 * **NB на TASK-023 scope:** Configuration baseline singleton (no junction
 * present в bootstrap content). Junction entities генерируются через
 * `generate-entity` post-bootstrap. Snippet shape inherits t115 contract
 * (5 adapters + 1 dao + 1 entity), template feature = `configuration`,
 * template junction = `configuration_map` (placeholder pattern). Когда
 * Phase C synthetic создаёт concrete junction reference fixture — этот
 * placeholder может потребовать update; для TASK-B2 baseline — generic
 * shape работает (`generate-entity` для real junction substitute'ит target
 * names через `_substitutePlaceholders` flow).
 *
 * **Honest limitation note:** Symmetric с t115 в shape (substitution flow
 * mechanical), но конкретные literal values (`configuration_map`) — это
 * placeholder; t115 has `task_tag_map` от concrete TaskTagMap fixture.
 * Simplified bootstrap не содержит concrete junction → placeholder
 * `configuration_map` приемлем, substitution заменит на target.
 */
const SIMPLIFIED_JUNCTION_IMPORTS_TEMPLATE = `import '../../features/configuration/data/adapters/configuration_map/configuration_map_event_adapter.dart';
import '../../features/configuration/data/adapters/configuration_map/configuration_map_local_apply.dart';
import '../../features/configuration/data/adapters/configuration_map/configuration_map_payload_codec.dart';
import '../../features/configuration/data/adapters/configuration_map/configuration_map_pull_adapter.dart';
import '../../features/configuration/data/adapters/configuration_map/configuration_map_remote_adapter.dart';
import '../../features/configuration/data/datasources/local/daos/configuration_map/configuration_map_dao.dart';
import '../../features/configuration/domain/entities/configuration_map/configuration_map_entity.dart';`;

/**
 * Register block snippet для junction entity в simplified template.
 *
 * Sync_core junction routing semantics = invariant (`update()` → `createX`,
 * `delete()` = noop, soft-delete via `deleteXBy__FK1Pascal__And__FK2Pascal__`).
 * Substitution placeholders identical с t115 (`__FK1__` / `__FK2__` /
 * `__FK1Pascal__` / `__FK2Pascal__`).
 *
 * Placeholder fallback FK pair = `parentA` + `parentB` (generic) — для
 * simplified bootstrap нет concrete junction fixture, generate-entity
 * substitute'ит actual FK names из target model.
 */
const SIMPLIFIED_JUNCTION_REGISTER_TEMPLATE = `  // ── Adapter bundle: ConfigurationMap (junction FK→__FK1__+__FK2__) ────────
  // Junction-specific: server has no \`updateConfigurationMap\` RPC, only
  // \`createConfigurationMap\` (idempotent create + resurrect) and
  // \`deleteConfigurationMapBy__FK1Pascal__And__FK2Pascal__\` (soft-delete via business key).
  // \`update()\` adapter routes через \`createConfigurationMap\`; \`delete()\` is
  // a noop (Repository должен решать delete-flow — см.
  // configuration_map_remote_adapter.dart docstring).
  orchestrator.register<ConfigurationMapEntity>(
    'configuration_map',
    AdapterBundle<ConfigurationMapEntity>(
      writeAdapter: ConfigurationMapRemoteAdapter(client),
      codec: const ConfigurationMapPayloadCodec(),
      localApply: ConfigurationMapLocalApply(ConfigurationMapDao(dbService)),
      pullAdapter: ConfigurationMapPullAdapter(client),
      eventAdapter: ConfigurationMapEventAdapter(client),
    ),
  );`;

/**
 * Factory для simplified template config (TASK-023 / Phase B2).
 *
 * **ADR-0005 §1 + §7 stack lock invariants applied:**
 * - Same package set as t115 (Riverpod / Drift / sync_core / Serverpod)
 * - Same marker scheme (13 markers per ClaudeAdv evidence)
 * - Same Clean directory layout (`lib/features/<feature>/data/datasources/local/tables/`)
 *
 * **Differences from t115 (architecture ceremony reduction только, per ADR-0005 §3.5):**
 * - NO usecases / NO business notifiers / NO validation / NO repository
 *   interfaces (default OFF, `--with-interfaces` Phase D opt-in) /
 *   NO application services / NO mappers separate class / NO Either-Result /
 *   NO datasource interfaces
 *
 * **Snippet content differences from t115:**
 * - Template entity = `configuration` (single Configuration baseline per
 *   ADR-0005 §3.1, не `category` как в t115's tasks feature reference)
 * - Template feature = `configuration` (per Configuration entity location в
 *   `lib/features/configuration/`)
 * - Junction placeholder = `configuration_map` (no concrete junction в
 *   simplified bootstrap; placeholder for `generate-entity` substitution flow)
 * - Junction FK fallbacks = `parentA`/`parentB` (generic) since no concrete
 *   junction reference fixture в bootstrap
 *
 * **NB на template content scope (per task.md "Не-цели"):** этот factory =
 * codegen core extension; actual `G:/Templates/flutter/simplified/` template
 * directory bootstrap (Configuration baseline files + sync_core wire-up files
 * + scaffold) — separate Session 2 deliverable, не входит в сессию 1
 * implementation которая closes BUG-019.
 */
export function simplifiedTemplateConfig(): TemplateConfig {
    return {
        name: 'simplified',
        relationPatcher: {
            // Simplified template = Configuration baseline (singleton, no relation).
            // RelationPatcher applicability per ADR-0005 §7.3 = YES under stack lock
            // (markers preserved, patcher executes when target entity has FK).
            // Template "main" = `configuration` (single entity baseline; не `task` как в t115
            // потому что simplified bootstrap не содержит multi-entity FK fixture).
            // ⚠ Когда Phase C synthetic добавляет concrete FK fixture (e.g. Project + Task),
            // эти literals потребуется обновить. Пока baseline — simplified RelationPatcher
            // активируется только при `generate-entity` с FK relation, использует
            // `configuration` template как substitution anchor.
            templateMainEntity: 'configuration',
            templateRelatedEntity: 'configuration',
            markerName: 'oneToManyMethods',
            scanDirectories: ['feature/', 'server/'],
        },
        orchestrator: {
            // Same path as t115 (Clean directory layout preserved per ADR-0005 §7.3).
            relativePath: ['lib', 'core', 'sync', 'sync_orchestrator_provider.dart'],
            entityImportsTemplate: SIMPLIFIED_ENTITY_IMPORTS_TEMPLATE,
            entityRegisterTemplate: SIMPLIFIED_ENTITY_REGISTER_TEMPLATE,
            junctionImportsTemplate: SIMPLIFIED_JUNCTION_IMPORTS_TEMPLATE,
            junctionRegisterTemplate: SIMPLIFIED_JUNCTION_REGISTER_TEMPLATE,
            // Substitution sentinels matching simplified snippet templates.
            regularEntityFallback: 'configuration',
            junctionEntityFallback: 'configurationMap',
            // Generic FK fallbacks since simplified bootstrap не содержит concrete junction.
            junctionFkFallbacks: { fk1: 'parentA', fk2: 'parentB' },
            // Template feature segment matching simplified bootstrap.
            templateFeatureSegment: 'configuration',
        },
        database: {
            // Same path as t115 (Drift conventions preserved per ADR-0005 §7.2).
            templateRelativePath: ['core', 'data', 'datasources', 'local', 'database.dart'],
        },
    };
}
