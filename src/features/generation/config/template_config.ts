/**
 * TemplateConfig — конфигурация template-specific литералов для multi-template
 * architecture (per ADR-0005 + Discussion #11 + TASK-022 / Phase B1).
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
 * **YAGNI scope (TASK-B1):** один template (`t115`). Strategy pattern abstract
 * interface не вводим — добавим когда simplified config landed (TASK-B2).
 * Union type `name: 't115' | 'simplified'` будет расширен в TASK-B2.
 */

/**
 * Конкретная shape конфига per task.md "Заметки по реализации" + ADR-0005.
 */
export interface TemplateConfig {
    /**
     * Идентификатор template. Используется только для diagnostic / logging.
     * Расширяется в TASK-B2 (`'simplified'`).
     */
    name: 't115';

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
     * Заменяет hardcoded path components в lines 42-48.
     */
    orchestrator: {
        /**
         * Relative path components от `targetFlutterProjectPath` до orchestrator
         * файла. Для t115: `['lib', 'core', 'sync', 'sync_orchestrator_provider.dart']`.
         * Используется через `path.join(targetFlutterProjectPath, ...relativePath)`.
         */
        relativePath: string[];
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

/**
 * Factory для t115 (Clean / advanced) template config. Литералы идентичны
 * pre-TASK-022 hardcoded state в generators.
 *
 * **Reference points** (для verification что literals unchanged):
 * - `relation_patcher.ts:18-19,36` (pre-TASK-022)
 * - `orchestrator_patcher.ts:42-48` (pre-TASK-022)
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
        },
        database: {
            templateRelativePath: ['core', 'data', 'datasources', 'local', 'database.dart'],
        },
    };
}
