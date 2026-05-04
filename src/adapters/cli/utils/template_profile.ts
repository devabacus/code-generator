/**
 * TemplateProfile — централизованная конфигурация template-specific defaults
 * для CLI commands (`create-project` / `generate-entity`).
 *
 * **TASK-024 / Session E3d (Phase B2 — generator default switch):**
 *
 * Отражает выбор `--template <name>` flag в трёх местах:
 * 1. `templProject` (template directory id — `t115` или `simplified`)
 * 2. `templFeatureName` (template feature name — `tasks` для обоих templates;
 *    Configuration baseline (`features/configuration/`) копируется как-есть из
 *    startProject manifest и НЕ участвует в template-substitution flow.
 *    Substitution-источник для regular fixture entities — `features/tasks/`
 *    в обоих templates (t115 + simplified inherits same fixture location
 *    per ADR-0005 §7 stack lock + Clean directory layout invariant))
 * 3. `templEntity` (template entity name — `category` для обоих templates;
 *    consolidated tasks/Category fixture used as substitution anchor)
 * 4. `templateConfig` factory (`t115TemplateConfig()` или `simplifiedTemplateConfig()`)
 *
 * Default = `simplified` (per ADR-0005 + Discussion #11). Legacy `t115` остаётся
 * available через `--template t115` flag для regression testing / opt-in.
 */
import {
    TemplateConfig,
    t115TemplateConfig,
    simplifiedTemplateConfig,
} from '../../../features/generation/config/template_config';

export type TemplateName = 't115' | 'simplified';

export const DEFAULT_TEMPLATE: TemplateName = 'simplified';

export interface TemplateProfile {
    name: TemplateName;
    /** Template directory id (имя поддиректории внутри `Templates/flutter/`). */
    templProject: string;
    /** Template feature name. */
    templFeatureName: string;
    /** Template entity placeholder. */
    templEntity: string;
    /** Factory для `templateConfig` field в `GenerationConfig`. */
    templateConfig: TemplateConfig;
}

const PROFILES: Record<TemplateName, TemplateProfile> = {
    t115: {
        name: 't115',
        templProject: 't115',
        templFeatureName: 'tasks',
        templEntity: 'category',
        get templateConfig() { return t115TemplateConfig(); },
    },
    simplified: {
        name: 'simplified',
        templProject: 'simplified',
        // Configuration baseline copies as-is via startProject manifest;
        // template fixture для substitution flow = `features/tasks/` (same as t115)
        // per ADR-0005 §7 stack lock + Clean directory layout invariant.
        // E3d2 fix: prior 'configuration' default caused Configuration table
        // duplication (defined в `features/configuration/` baseline AND
        // substituted into `features/<targetFeaturePath>/`) → 312 errors smoke.
        templFeatureName: 'tasks',
        templEntity: 'category',
        get templateConfig() { return simplifiedTemplateConfig(); },
    },
};

/**
 * Returns the profile для указанного template name. Throws если name не в
 * `TemplateName` union (defensive — commander validates через `choices()`).
 *
 * Если `name` undefined → возвращает default profile (`simplified`).
 */
export function resolveTemplateProfile(name?: string): TemplateProfile {
    const resolved = (name ?? DEFAULT_TEMPLATE) as TemplateName;
    const profile = PROFILES[resolved];
    if (!profile) {
        throw new Error(`Unknown template '${name}'. Valid: t115, simplified.`);
    }
    return profile;
}
