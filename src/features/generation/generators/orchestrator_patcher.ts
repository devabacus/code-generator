import path from 'path';
import { IFileSystem } from '../../../core/interfaces/file_system';
import { GenerationConfig } from '../config/generation_config';
import { ServerpodModel, ServerpodField } from '../parsers/formatters/types';
import { JunctionDetector } from '../parsers/junction_detector';
import { toSnakeCase, unCap, cap } from '../../../utils/text_work/text_util';

/**
 * OrchestratorPatcher — идемпотентный patcher для `sync_orchestrator_provider.dart`
 * в target проекте. Вставляет три marker блока на каждый новый entity:
 *
 *   1. `:syncImports`        — 7 import строк per entity (5 adapter + 1 dao + 1 entity)
 *   2. `:syncEntityTypes`    — `'<entityType>',` строка в const list
 *   3. `:syncRegistrations`  — `orchestrator.register<XEntity>(...)` блок (12 строк
 *                              для regular, 18 для junction с docstring)
 *
 * Поведение:
 *   - **Идемпотентен:** повторный вызов с тем же model = identical content (snippet
 *     уже присутствует — skip, не дублировать).
 *   - **Recovery from legacy duplicates:** если найдено несколько marker pairs
 *     `:syncRegistrations` (или `:syncImports` / `:syncEntityTypes`) — оставляем
 *     первую, остальные удаляем + содержимое сохраняем в первой (как
 *     `relation_patcher.ts` BUG-003 fix).
 *   - **Junction detection (TASK-013):** через `JunctionDetector.isJunctionEntity()`
 *     (shared utility per Discussion #2 Q3=A). Junction → snippet берётся из
 *     `_JUNCTION_*` templates с docstring о junction-specific routing
 *     update→createX и delete→noop. Replaces legacy `endsWith('Map')` heuristic
 *     которое производило false-negatives для junction'ов без `Map` суффикса
 *     (см. ai/bug-reports/junction-detection-audit.md).
 *   - **Commutative:** apply A → B == apply B → A в final state.
 *
 * Reference patterns:
 *   - `relation_patcher.ts` — pattern для idempotent + recovery-from-legacy-duplicates
 *   - sync_core conventions.md Pattern 6/7 — multi-entity registration + junction
 *
 * Не патчит, если orchestrator файл не существует (свежий проект до Phase B).
 */
export class OrchestratorPatcher {
    constructor(private fileSystem: IFileSystem) {}

    public async patch(config: GenerationConfig, model: ServerpodModel): Promise<void> {
        const orchestratorPath = path.join(
            config.targetFlutterProjectPath,
            'lib',
            'core',
            'sync',
            'sync_orchestrator_provider.dart'
        );

        if (!(await this.fileSystem.exists(orchestratorPath))) {
            return;
        }

        let content = await this.fileSystem.readFile(orchestratorPath);

        // TASK-013: junction detection через shared JunctionDetector (Q3=A).
        // Replaces legacy `endsWith('Map')` (Q2=A — drop suffix entirely).
        const isJunction = JunctionDetector.isJunctionEntity(model);

        // Feature segment substitution (BUG-009 fix):
        // template imports содержат hardcoded `features/tasks/` literal. Заменяем
        // template feature name (config.templFeatureName, default 'tasks') на target
        // feature segment (config.targetFeatureName — basename of targetFeaturePath).
        // Это критично когда developer вызывает generate-entity --feature-path .../features/<X>
        // где X != tasks. Без substitution все imports ссылаются на features/tasks/...
        // которая не существует в свежем create-project'е → cascade uri_does_not_exist errors.
        const tplFeatureSnake = toSnakeCase(config.templFeatureName);
        const targetFeatureSnake = toSnakeCase(config.targetFeatureName);

        // Build all three snippets с substitutions подгоняя placeholders под
        // model.className + feature segment.
        const importsSnippet = this._buildImportsSnippet(model, isJunction, tplFeatureSnake, targetFeatureSnake);
        const entityTypeSnippet = this._buildEntityTypeSnippet(model);
        const registerSnippet = this._buildRegisterSnippet(model, isJunction);

        // Patch каждый marker блок.
        content = this._patchMarkerBlock(content, 'syncImports', importsSnippet);
        content = this._patchMarkerBlock(content, 'syncEntityTypes', entityTypeSnippet);
        content = this._patchMarkerBlock(content, 'syncRegistrations', registerSnippet);

        await this.fileSystem.createFile(orchestratorPath, content);
    }

    /**
     * Patches marker block `:<markerName>`:
     * - Если block отсутствует — no-op (orchestrator не подготовлен).
     * - Если block содержит `newSnippet` уже — idempotent skip.
     * - Иначе — append newSnippet к existing content внутри block.
     * - Recovery from legacy duplicates: оставляем первую marker pair,
     *   из последующих копируем content в первую и удаляем pair.
     *
     * Marker pair preserves leading whitespace перед start marker (для list literal —
     * `  // === ... ===`, для top-level imports — без indent).
     */
    private _patchMarkerBlock(
        content: string,
        markerName: string,
        newSnippet: string
    ): string {
        const startMarker = `// === generated_start:${markerName} ===`;
        const endMarker = `// === generated_end:${markerName} ===`;
        const startEsc = this._escapeRegex(startMarker);
        const endEsc = this._escapeRegex(endMarker);

        // Captures leading whitespace (indent) перед start marker. Single line.
        const pairRegex = new RegExp(
            `([ \\t]*)${startEsc}([\\s\\S]*?)([ \\t]*)${endEsc}`,
            'g'
        );

        const matches: Array<{
            full: string;
            startIndent: string;
            inner: string;
            endIndent: string;
        }> = [];
        let m: RegExpExecArray | null;
        while ((m = pairRegex.exec(content)) !== null) {
            matches.push({
                full: m[0],
                startIndent: m[1] ?? '',
                inner: m[2] ?? '',
                endIndent: m[3] ?? '',
            });
        }

        if (matches.length === 0) {
            return content;
        }

        // Combine inner content from ALL matches (recovery from legacy duplicates).
        const combinedInner = matches.map((mm) => mm.inner).join('\n');

        // Idempotency check: snippet (trimmed) already present?
        const trimmedSnippet = newSnippet.trim();
        const alreadyPresent =
            trimmedSnippet.length > 0 && combinedInner.includes(trimmedSnippet);

        // Build new combined inner content as array of lines (без leading/trailing
        // newline у каждой строки).
        const existingLines = this._extractContentLines(combinedInner);
        const snippetLines = this._extractContentLines(newSnippet);

        let mergedLines: string[];
        if (alreadyPresent) {
            mergedLines = existingLines;
        } else {
            mergedLines = [...existingLines, ...snippetLines];
        }

        // Build replacement string. Always:
        //   <startIndent><startMarker>\n<lines joined by \n>\n<endIndent><endMarker>
        // Где endIndent = startIndent (для consistency — orchestrator written by Edit
        // клал endMarker с тем же indent).
        const indent = matches[0].startIndent;
        const innerJoined = mergedLines.length > 0 ? mergedLines.join('\n') : '';
        const replacement = innerJoined.length > 0
            ? `${indent}${startMarker}\n${innerJoined}\n${indent}${endMarker}`
            : `${indent}${startMarker}\n${indent}${endMarker}`;

        // Replace ВСЕ marker pairs одним проходом:
        // первое вхождение → replacement, остальные → '' (removed).
        let firstReplaced = false;
        let result = content.replace(new RegExp(pairRegex.source, 'g'), () => {
            if (!firstReplaced) {
                firstReplaced = true;
                return replacement;
            }
            return '';
        });

        // Подчищаем избыточные пустые строки от удалённых дубликатов.
        result = result.replace(/\n{3,}/g, '\n\n');

        return result;
    }

    /**
     * Extracts non-empty content lines from inner block, preserving original indentation
     * within each line. Strips leading/trailing pure-whitespace lines.
     */
    private _extractContentLines(inner: string): string[] {
        const lines = inner.split('\n');
        // Trim leading/trailing fully-empty lines (whitespace only).
        let start = 0;
        let end = lines.length;
        while (start < end && lines[start].trim() === '') {
            start++;
        }
        while (end > start && lines[end - 1].trim() === '') {
            end--;
        }
        return lines.slice(start, end);
    }

    /**
     * Builds imports snippet (7 import lines) для regular или junction entity.
     *
     * BUG-009 fix: принимает `tplFeatureSnake` / `targetFeatureSnake` для подмены
     * `features/tasks/` literal в template на актуальный target feature path.
     */
    private _buildImportsSnippet(
        model: ServerpodModel,
        isJunction: boolean,
        tplFeatureSnake: string,
        targetFeatureSnake: string,
    ): string {
        const tplEntity = isJunction ? 'taskTagMap' : 'category';
        const tplEntitySnake = toSnakeCase(tplEntity);

        const targetEntityCamel = unCap(model.className);
        const targetEntitySnake = toSnakeCase(targetEntityCamel);

        const template = isJunction
            ? this._JUNCTION_IMPORTS_TEMPLATE
            : this._ENTITY_IMPORTS_TEMPLATE;

        return this._substitutePlaceholders(template, {
            tplPascal: cap(tplEntity), // 'Category' / 'TaskTagMap'
            tplCamel: tplEntity, // 'category' / 'taskTagMap'
            tplSnake: tplEntitySnake, // 'category' / 'task_tag_map'
            targetPascal: cap(targetEntityCamel),
            targetCamel: targetEntityCamel,
            targetSnake: targetEntitySnake,
            tplFeatureSnake,
            targetFeatureSnake,
        });
    }

    /**
     * Builds entityType snippet: `  '<snake>',` (один literal с indent).
     */
    private _buildEntityTypeSnippet(model: ServerpodModel): string {
        const targetSnake = toSnakeCase(unCap(model.className));
        return `  '${targetSnake}',`;
    }

    /**
     * Builds register block snippet (12-18 lines) для regular или junction entity.
     *
     * Note: register snippet не содержит file paths, поэтому feature substitution
     * не требуется (передаём empty values чтобы no-op в `_substitutePlaceholders`).
     *
     * **TASK-014:** для junction template — substitute hardcoded FK literals (`task+tag`,
     * `ByTaskAndTag`) на actual FK names из model. Используем placeholders
     * `__FK1__` / `__FK2__` / `__FK1Pascal__` / `__FK2Pascal__` (специальные tokens
     * чтобы не конфликтовать с PascalCase/snake substitution из existing flow).
     */
    private _buildRegisterSnippet(model: ServerpodModel, isJunction: boolean): string {
        const tplEntity = isJunction ? 'taskTagMap' : 'category';
        const tplEntitySnake = toSnakeCase(tplEntity);

        const targetEntityCamel = unCap(model.className);
        const targetEntitySnake = toSnakeCase(targetEntityCamel);

        if (isJunction) {
            // TASK-014: extract FK names из model для junction docstring substitution.
            // Берём первые 2 FK fields в порядке declaration (per task.md Option A).
            // Fallback на `task`/`tag` если FK extraction не работает (defensive).
            const fkFields = model.fields.filter((f: ServerpodField) => f.isRelation === true);
            const fk1Name = fkFields.length >= 1 ? this._extractEntityNameFromField(fkFields[0]) : 'task';
            const fk2Name = fkFields.length >= 2 ? this._extractEntityNameFromField(fkFields[1]) : 'tag';

            // Substitute с FK literals + entity tokens. FK substitutions делаем через
            // `_substituteJunctionFKs` (специализированный — заменяет только в docstring
            // и method-name fragments, не задевая class names или snake_case identifiers).
            let snippet = this._substituteJunctionFKs(this._JUNCTION_REGISTER_TEMPLATE, fk1Name, fk2Name);

            // Standard entity substitution (taskTagMap → roleP_permission, etc).
            snippet = this._substitutePlaceholders(snippet, {
                tplPascal: cap(tplEntity),
                tplCamel: tplEntity,
                tplSnake: tplEntitySnake,
                targetPascal: cap(targetEntityCamel),
                targetCamel: targetEntityCamel,
                targetSnake: targetEntitySnake,
                tplFeatureSnake: '',
                targetFeatureSnake: '',
            });
            return snippet;
        }

        return this._substitutePlaceholders(this._ENTITY_REGISTER_TEMPLATE, {
            tplPascal: cap(tplEntity),
            tplCamel: tplEntity,
            tplSnake: tplEntitySnake,
            targetPascal: cap(targetEntityCamel),
            targetCamel: targetEntityCamel,
            targetSnake: targetEntitySnake,
            tplFeatureSnake: '',
            targetFeatureSnake: '',
        });
    }

    /**
     * TASK-014: extracts entity name из FK field (e.g. `roleId` → `role`).
     * Mirrors logic из `server_yaml_parser.ts:extractEntityNameFromField`.
     *
     * BUG-012 (TASK-016): возвращает lowerCamel form. Previous `.toLowerCase()`
     * ломало multi-word entity names (`'terminalSet'` → `'terminalset'`,
     * `cap()` потом давал `'Terminalset'` вместо `'TerminalSet'`). После parser
     * fix `relatedModel` уже lowerCamel — substitution downstream работает
     * корректно через `cap()`/`unCap()`/`toSnakeCase()` calls.
     */
    private _extractEntityNameFromField(field: ServerpodField): string {
        if (field.relatedModel) {
            return field.relatedModel;
        }
        // Fallback: strip-Id from name (already lowerCamel via Serverpod convention).
        return field.name.endsWith('Id') ? field.name.slice(0, -2) : field.name;
    }

    /**
     * TASK-014: junction-specific FK substitution. Заменяет в template:
     *   - `__FK1__` → fk1 (lowercase, e.g. `role`)
     *   - `__FK2__` → fk2 (e.g. `permission`)
     *   - `__FK1Pascal__` → cap(fk1) (e.g. `Role`)
     *   - `__FK2Pascal__` → cap(fk2) (e.g. `Permission`)
     *
     * Используем uppercase markers `__FK1__` чтобы их substitution не конфликтовала с
     * standard entity name substitution (которая работает на `task`/`taskTagMap`/etc).
     */
    private _substituteJunctionFKs(template: string, fk1: string, fk2: string): string {
        let result = template;
        result = this._replaceAll(result, '__FK1Pascal__', cap(fk1));
        result = this._replaceAll(result, '__FK2Pascal__', cap(fk2));
        result = this._replaceAll(result, '__FK1__', fk1);
        result = this._replaceAll(result, '__FK2__', fk2);
        return result;
    }

    /**
     * Substitutes placeholders в template snippet.
     *
     * Order matters:
     *   1. **Feature path substitution** (BUG-009 fix) — `features/<tpl>/` → `features/<target>/`
     *      anchored через `features/` prefix чтобы не задевать entity snake names.
     *      Делается ПЕРВЫМ, иначе entity snake substitution может изменить literal `tasks`
     *      внутри `features/tasks/` если entity = 'task' (substring overlap).
     *   2. snake_case entity (e.g. `task_tag_map`) — длинный токен → раньше PascalCase/camelCase.
     *   3. PascalCase entity (e.g. `TaskTagMap`).
     *   4. camelCase entity (e.g. `taskTagMap`) — только если tplCamel != tplSnake (для regular
     *      `category` они равны, second substitution no-op).
     *
     * Если `tplFeatureSnake` / `targetFeatureSnake` пустые (e.g. для register snippet,
     * где feature path не используется) — feature substitution skip'ается.
     */
    private _substitutePlaceholders(
        template: string,
        forms: {
            tplPascal: string;
            tplCamel: string;
            tplSnake: string;
            targetPascal: string;
            targetCamel: string;
            targetSnake: string;
            tplFeatureSnake: string;
            targetFeatureSnake: string;
        }
    ): string {
        let result = template;

        // 1) Feature path substitution (BUG-009 fix). Anchored через `features/<X>/`
        //    чтобы избежать ложных matches на entity snake_case строки.
        if (
            forms.tplFeatureSnake.length > 0 &&
            forms.targetFeatureSnake.length > 0 &&
            forms.tplFeatureSnake !== forms.targetFeatureSnake
        ) {
            const tplPath = `features/${forms.tplFeatureSnake}/`;
            const targetPath = `features/${forms.targetFeatureSnake}/`;
            result = this._replaceAll(result, tplPath, targetPath);
        }

        // 2) snake_case form (e.g. `task_tag_map`) — заменяем literally,
        //    т.к. в Dart code это всегда file/path/string-id context.
        result = this._replaceAll(result, forms.tplSnake, forms.targetSnake);

        // 3) PascalCase (e.g. `TaskTagMap`) — заменяем literally (case-sensitive).
        result = this._replaceAll(result, forms.tplPascal, forms.targetPascal);

        // 4) camelCase (e.g. `taskTagMap`) — заменяем literally.
        //    Note: Это safe потому что snake_case (`task_tag_map`) уже заменили в шаге 2
        //    и в template нет идентификаторов вида `task` без следующего символа `T`.
        //    Для regular entity (placeholder=`category`), tplCamel === tplSnake — second
        //    substitution no-op (string already replaced).
        if (forms.tplCamel !== forms.tplSnake) {
            result = this._replaceAll(result, forms.tplCamel, forms.targetCamel);
        }

        return result;
    }

    private _replaceAll(s: string, find: string, replace: string): string {
        return s.split(find).join(replace);
    }

    private _escapeRegex(s: string): string {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ── Templates ──────────────────────────────────────────────────────────

    /**
     * Imports template для regular entity.
     * Placeholders: `category` (snake/camel — same), `Category` (Pascal).
     *
     * Reference: t115/TASK-001 Phase 2b orchestrator post-add state.
     */
    private readonly _ENTITY_IMPORTS_TEMPLATE = `import '../../features/tasks/data/adapters/category/category_event_adapter.dart';
import '../../features/tasks/data/adapters/category/category_local_apply.dart';
import '../../features/tasks/data/adapters/category/category_payload_codec.dart';
import '../../features/tasks/data/adapters/category/category_pull_adapter.dart';
import '../../features/tasks/data/adapters/category/category_remote_adapter.dart';
import '../../features/tasks/data/datasources/local/daos/category/category_dao.dart';
import '../../features/tasks/domain/entities/category/category_entity.dart';`;

    /**
     * Imports template для junction entity.
     * Placeholders: `task_tag_map` (snake), `taskTagMap` (camel), `TaskTagMap` (Pascal).
     */
    private readonly _JUNCTION_IMPORTS_TEMPLATE = `import '../../features/tasks/data/adapters/task_tag_map/task_tag_map_event_adapter.dart';
import '../../features/tasks/data/adapters/task_tag_map/task_tag_map_local_apply.dart';
import '../../features/tasks/data/adapters/task_tag_map/task_tag_map_payload_codec.dart';
import '../../features/tasks/data/adapters/task_tag_map/task_tag_map_pull_adapter.dart';
import '../../features/tasks/data/adapters/task_tag_map/task_tag_map_remote_adapter.dart';
import '../../features/tasks/data/datasources/local/daos/task_tag_map/task_tag_map_dao.dart';
import '../../features/tasks/domain/entities/task_tag_map/task_tag_map_entity.dart';`;

    /**
     * Register block template для regular entity.
     */
    private readonly _ENTITY_REGISTER_TEMPLATE = `  // ── Adapter bundle: Category ────────────────────────────────────────────
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
     * Register block template для junction entity (с docstring о routing
     * update→createX и delete→noop).
     *
     * **TASK-014:** docstring и method-name fragments параметризованы через
     * `__FK1__` / `__FK2__` / `__FK1Pascal__` / `__FK2Pascal__` placeholders
     * (заменяются `_substituteJunctionFKs` ДО standard entity substitution).
     * Это закрывает Bomb #6 из TASK-013 adversarial — RolePermission получает
     * docstring `junction FK→role+permission` (NOT `task+tag`) и method-name
     * `deleteRolePermissionByRoleAndPermission` (NOT `...ByTaskAndTag`).
     *
     * Reference: t115/TASK-001 Phase 2d TaskTagMap register block.
     */
    private readonly _JUNCTION_REGISTER_TEMPLATE = `  // ── Adapter bundle: TaskTagMap (junction FK→__FK1__+__FK2__) ───────────────────
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
}
