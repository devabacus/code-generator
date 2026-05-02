import { ServerpodModel, ServerpodField } from './formatters/types';

/**
 * JunctionDetector — single source of truth для определения junction (many-to-many)
 * entities. Заменяет legacy `endsWith('Map')` / `includes('Map')` heuristic'и
 * во всех 3 production decision paths:
 *
 *   1. `parsers/server_yaml_parser.ts` — `isRelation` flag (drives manifest selection
 *      в `generate_entity.ts:72` + `create_data_files_by_replacement.ts:37`).
 *   2. `parsers/entity_yaml_validator.ts` — junction skip pattern (BUG-004 6-field
 *      requirement пропускается для junction'ов).
 *   3. `generators/orchestrator_patcher.ts:52` — выбор `_JUNCTION_*` vs `_ENTITY_*`
 *      template для register/imports snippet'ов.
 *
 * Detection logic (per Discussion #2, 2026-05-02 — Q1=C / Q2=A / Q3=A):
 *
 *   - **Default (structural):** entity = junction если 2+ FK relations + НЕТ business
 *     полей кроме базовых (id, userId, customerId, createdAt, lastModified, isDeleted).
 *     Nullable FK тоже считается FK (CustomerUser case).
 *   - **Explicit override:** YAML top-level `junction: true` field → junction независимо
 *     от field analysis (для junction'ов с metadata типа `assignedAt`, `weight`,
 *     `sortOrder`). **Negative override `junction: false` НЕ поддерживается** — risk
 *     скрыть structural junction.
 *   - **Validation:** если `junction: true` но FK<2 → throw `JunctionValidationError`
 *     с сообщением "junction requires 2+ relations".
 *
 * Public API: `isJunctionEntity(model): boolean`. Internal debug shape (для тестов
 * + diagnostics) — `analyze(model): JunctionAnalysis` с полями `isJunction`, `reason`,
 * `fkFields`, `extraFields`.
 *
 * Reference:
 *   - Discussion #2 archive: `ai/discussions/archive/2-task-013-junction-detection-robust-yaml/`
 *   - Bug audit: `ai/bug-reports/junction-detection-audit.md` (2 false-negatives:
 *     RolePermission, CustomerUser).
 */

/**
 * Поля которые игнорируются при подсчёте "extra business fields". Если у entity
 * нет полей вне этого набора (плюс FK relations), это считается structural junction.
 *
 * Note: `userId` (часто `int` в weight schema, без `relation` declaration) тоже
 * считается base — это per-customer ownership marker, не business attribute.
 */
const BASE_FIELD_NAMES: ReadonlySet<string> = new Set([
    'id',
    'userId',
    'customerId',
    'createdAt',
    'lastModified',
    'isDeleted',
]);

export type JunctionReason = 'explicitOverride' | 'structural';

export interface JunctionAnalysis {
    /** Final classification result. */
    isJunction: boolean;
    /**
     * Reason for classification. `undefined` если `isJunction === false`.
     *   - `explicitOverride` — `junction: true` flag set AND FK count >= 2.
     *   - `structural` — field analysis matched (2+ FK + no extra business fields).
     */
    reason?: JunctionReason;
    /** Foreign-key fields detected (`isRelation === true`). Includes nullable FKs. */
    fkFields: ServerpodField[];
    /**
     * Non-FK fields ВНЕ base whitelist. Если непустой — structural detection
     * блокируется (но explicit override может всё равно классифицировать как junction).
     */
    extraFields: ServerpodField[];
}

/**
 * Validation error thrown when `junction: true` set но FK count < 2.
 *
 * Throw происходит в `JunctionDetector.analyze()` — это fail-fast pattern, чтобы
 * malformed YAML не пропустился silently.
 */
export class JunctionValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'JunctionValidationError';
    }
}

export class JunctionDetector {
    /**
     * Public API. Returns `true` если entity classified as junction (many-to-many).
     *
     * @param model parsed `ServerpodModel`. Должен содержать parsed `fields` (с
     *              правильными `isRelation` flags).
     * @param explicitFlag optional значение `junction:` field из YAML. `true` →
     *                     explicit override. `undefined`/`false` → structural-only.
     * @throws JunctionValidationError если `explicitFlag === true` но FK count < 2.
     */
    public static isJunctionEntity(
        model: ServerpodModel,
        explicitFlag?: boolean,
    ): boolean {
        return this.analyze(model, explicitFlag).isJunction;
    }

    /**
     * Internal debug API. Returns full `JunctionAnalysis` shape — used by tests
     * + diagnostics. Public callers should prefer `isJunctionEntity()`.
     *
     * @throws JunctionValidationError если `explicitFlag === true` но FK<2.
     */
    public static analyze(
        model: ServerpodModel,
        explicitFlag?: boolean,
    ): JunctionAnalysis {
        const fkFields = model.fields.filter(f => f.isRelation === true);
        const extraFields = model.fields.filter(
            f => !f.isRelation && !BASE_FIELD_NAMES.has(f.name),
        );

        // Validation hook (Q1 + Chatgpt_1 finalization): explicit override требует
        // минимум 2 FK relation. Иначе — malformed YAML, fail-fast.
        if (explicitFlag === true && fkFields.length < 2) {
            throw new JunctionValidationError(
                `Entity "${model.className}" has junction:true but only ${fkFields.length} `
                + `relation field(s). Junction requires 2+ relations.`,
            );
        }

        // Explicit override: junction:true + valid FK count → classify as junction
        // независимо от extra fields. Это intended use case (e.g. UserPermission
        // с assignedAt + 2 FK).
        if (explicitFlag === true) {
            return {
                isJunction: true,
                reason: 'explicitOverride',
                fkFields,
                extraFields,
            };
        }

        // Structural detection: 2+ FK + no extra business fields.
        const isStructural = fkFields.length >= 2 && extraFields.length === 0;

        return {
            isJunction: isStructural,
            reason: isStructural ? 'structural' : undefined,
            fkFields,
            extraFields,
        };
    }
}
