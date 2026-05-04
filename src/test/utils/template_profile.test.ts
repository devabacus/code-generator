import * as assert from 'assert';
import {
    DEFAULT_TEMPLATE,
    resolveTemplateProfile,
    type TemplateName,
} from '../../adapters/cli/utils/template_profile';

/**
 * TASK-024 Round 2 (H7) — unit coverage для resolveTemplateProfile.
 *
 * Post-pivot Discussion #12 (2026-05-04): default = 't115'; simplified = opt-in.
 * Эти тесты lock контракт post-revert + ensure programmatic callers (VS Code
 * adapter, future API consumers) корректно резолвят profile.
 */
suite('template_profile — resolveTemplateProfile', () => {
    test('DEFAULT_TEMPLATE === "t115" (post-pivot Discussion #12)', () => {
        assert.strictEqual(DEFAULT_TEMPLATE, 't115');
    });

    test('valid "t115" → returns t115 profile', () => {
        const profile = resolveTemplateProfile('t115');
        assert.strictEqual(profile.name, 't115');
        assert.strictEqual(profile.templProject, 't115');
        assert.strictEqual(profile.templFeatureName, 'tasks');
        assert.strictEqual(profile.templEntity, 'category');
        assert.ok(profile.templateConfig, 'templateConfig factory returns truthy config');
    });

    test('valid "simplified" → returns simplified profile', () => {
        const profile = resolveTemplateProfile('simplified');
        assert.strictEqual(profile.name, 'simplified');
        assert.strictEqual(profile.templProject, 'simplified');
        assert.strictEqual(profile.templFeatureName, 'tasks');
        assert.strictEqual(profile.templEntity, 'category');
        assert.ok(profile.templateConfig, 'templateConfig factory returns truthy config');
    });

    test('undefined → returns default profile (t115 post-pivot)', () => {
        const profile = resolveTemplateProfile(undefined);
        assert.strictEqual(profile.name, 't115');
    });

    test('no argument → returns default profile (t115 post-pivot)', () => {
        const profile = resolveTemplateProfile();
        assert.strictEqual(profile.name, 't115');
    });

    test('invalid template name → throws Error с whitelist', () => {
        assert.throws(
            () => resolveTemplateProfile('unknown'),
            /Unknown template 'unknown'\. Valid: t115, simplified\./,
        );
    });

    test('empty string → throws (defensive — commander .choices() catches на parse step,', () => {
        // Empty string не satisfies TemplateName union; runtime check defends
        // programmatic callers, которые могут bypass commander layer.
        assert.throws(
            () => resolveTemplateProfile(''),
            /Unknown template ''/,
        );
    });
});
