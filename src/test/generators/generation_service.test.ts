import * as assert from 'assert';
import { GenerationService } from '../../features/generation/generators/generation_service';
import { GenerationConfig } from '../../features/generation/config/generation_config';
import { ServerpodModel, ServerpodField } from '../../features/generation/parsers/formatters/types';

/**
 * TASK-014 regression tests для `GenerationService._getDestinationPath`.
 *
 * Bomb #2 из TASK-013 adversarial: file path generation для junction entities
 * без `Map` суффикса (RolePermission, CustomerUser) использовал hardcoded
 * `task_tag_map/` directory из template path. После TASK-014 — junction-aware
 * two-entity rewrite через `model.isRelation === true`.
 *
 * Используем grey-box подход: invoke `_getDestinationPath` через bracket access
 * (unit-level testing помога catch'ить regression на path mapping логику без
 * full FS mock).
 */

function junctionConfig(opts: {
    targetEntity1: string;
    targetEntity2: string;
    targetJunctionClassName: string;
    targetFeatureName?: string;
}): GenerationConfig {
    const featureName = opts.targetFeatureName ?? 'permission';
    return new GenerationConfig({
        templProject: 't115',
        templEntity: 'category',
        targetEntity: '',
        targetEntity1: opts.targetEntity1,
        targetEntity2: opts.targetEntity2,
        targetJunctionClassName: opts.targetJunctionClassName,
        templatesPath: '/test/templates',
        projectsPath: '/test/projects',
        targetProject: 'weight',
        templFeatureName: 'tasks',
        targetFeaturePath: `/test/projects/weight/weight_flutter/lib/features/${featureName}`,
        workspacesPath: '/test/projects/weight',
    });
}

function regularConfig(targetEntity: string): GenerationConfig {
    return new GenerationConfig({
        templProject: 't115',
        templEntity: 'category',
        targetEntity,
        templatesPath: '/test/templates',
        projectsPath: '/test/projects',
        targetProject: 'weight',
        templFeatureName: 'tasks',
        targetFeaturePath: '/test/projects/weight/weight_flutter/lib/features/expense',
        workspacesPath: '/test/projects/weight',
    });
}

function fkField(name: string, related: string): ServerpodField {
    return {
        name,
        type: 'UuidValue',
        nullable: false,
        isRelation: true,
        relationType: 'manyToOne',
        relatedModel: related,
    };
}

function makeJunctionModel(
    className: string,
    fkFields: ServerpodField[],
): ServerpodModel {
    return {
        className,
        tableName: className.toLowerCase(),
        isRelation: true,
        fields: [
            { name: 'id', type: 'UuidValue', nullable: true },
            ...fkFields,
            { name: 'userId', type: 'int', nullable: false },
            { name: 'customerId', type: 'UuidValue', nullable: false },
        ],
    };
}

function makeRegularModel(className: string): ServerpodModel {
    return {
        className,
        tableName: className.toLowerCase(),
        isRelation: false,
        fields: [
            { name: 'id', type: 'UuidValue', nullable: true },
            { name: 'userId', type: 'int', nullable: false },
            { name: 'customerId', type: 'UuidValue', nullable: false },
        ],
    };
}

/**
 * Bracket access на private `_getDestinationPath` для unit testing.
 */
function getDestPath(service: GenerationService, relativePath: string, config: GenerationConfig, model?: ServerpodModel): string {
    return (service as unknown as { _getDestinationPath: (rp: string, c: GenerationConfig, m?: ServerpodModel) => string })._getDestinationPath(relativePath, config, model);
}

suite('GenerationService — _getDestinationPath (TASK-014)', () => {
    let service: GenerationService;

    setup(() => {
        service = new GenerationService();
    });

    test('TASK-014: RolePermission junction → role_permission/ directory + role_permission_*.dart files', () => {
        const config = junctionConfig({
            targetEntity1: 'role',
            targetEntity2: 'permission',
            targetJunctionClassName: 'RolePermission',
        });
        const model = makeJunctionModel('RolePermission', [
            fkField('roleId', 'Role'),
            fkField('permissionId', 'Permission'),
        ]);

        // Template path: feature/data/adapters/task_tag_map/task_tag_map_remote_adapter.dart
        // Expected target: feature/data/adapters/role_permission/role_permission_remote_adapter.dart
        const result = getDestPath(
            service,
            'feature/data/adapters/task_tag_map/task_tag_map_remote_adapter.dart',
            config,
            model,
        );
        assert.strictEqual(
            result,
            'feature/data/adapters/role_permission/role_permission_remote_adapter.dart',
            'junction adapter path должен использовать role_permission/ (НЕ task_tag_map/)',
        );

        // Multiple junction files (5 adapter + 1 dao + 1 entity).
        const remoteAdapter = getDestPath(
            service,
            'feature/data/adapters/task_tag_map/task_tag_map_remote_adapter.dart',
            config,
            model,
        );
        const dao = getDestPath(
            service,
            'feature/data/datasources/local/daos/task_tag_map/task_tag_map_dao.dart',
            config,
            model,
        );
        const entity = getDestPath(
            service,
            'feature/domain/entities/task_tag_map/task_tag_map_entity.dart',
            config,
            model,
        );

        assert.ok(
            remoteAdapter.includes('role_permission/role_permission_remote_adapter.dart'),
            `remote adapter: ${remoteAdapter}`,
        );
        assert.ok(
            !remoteAdapter.includes('task_tag_map'),
            `remote adapter не должен содержать task_tag_map: ${remoteAdapter}`,
        );
        assert.ok(
            dao.includes('role_permission/role_permission_dao.dart'),
            `dao: ${dao}`,
        );
        assert.ok(
            entity.includes('role_permission/role_permission_entity.dart'),
            `entity: ${entity}`,
        );
    });

    test('TASK-014 backward compat: TaskTagMap junction → task_tag_map/ directory preserved (no-op)', () => {
        // Backward compat: TaskTagMap-targeted generation should produce identical
        // output to pre-TASK-014 (template path == target path).
        const config = junctionConfig({
            targetEntity1: 'task',
            targetEntity2: 'tag',
            targetJunctionClassName: 'TaskTagMap',
            targetFeatureName: 'tasks',
        });
        const model = makeJunctionModel('TaskTagMap', [
            fkField('taskId', 'Task'),
            fkField('tagId', 'Tag'),
        ]);

        const result = getDestPath(
            service,
            'feature/data/adapters/task_tag_map/task_tag_map_remote_adapter.dart',
            config,
            model,
        );
        assert.strictEqual(
            result,
            'feature/data/adapters/task_tag_map/task_tag_map_remote_adapter.dart',
            'TaskTagMap target должен сохранять task_tag_map/ путь (backward compat)',
        );
    });

    test('TASK-014: regular entity (Expense) → single-entity rewrite preserved', () => {
        // Negative regression: regular entity flow не должен задеваться junction logic.
        const config = regularConfig('expense');
        const model = makeRegularModel('Expense');

        // Template path: feature/data/datasources/local/tables/category_table.dart
        // Expected: feature/data/datasources/local/tables/expense_table.dart
        const result = getDestPath(
            service,
            'feature/data/datasources/local/tables/category_table.dart',
            config,
            model,
        );
        assert.strictEqual(
            result,
            'feature/data/datasources/local/tables/expense_table.dart',
            'regular entity rewrite (category → expense) preserved',
        );
    });

    test('TASK-024 Round 2 (H7): empty targetEntity → no entity rewrite (path preserved verbatim)', () => {
        // startProject flow без entity scope (e.g. simplified Configuration baseline).
        // Раньше `replaceAll(templEntity, '')` рендерил `configuration_dao.dart` →
        // `_dao.dart` (silent corruption). Defensive guard в _getDestinationPath:
        // если targetEntity = '' → entity rewrite skipped, file copied as-is.
        const config = new GenerationConfig({
            templProject: 't115',
            templEntity: 'category',
            targetEntity: '',
            templatesPath: '/test/templates',
            projectsPath: '/test/projects',
            targetProject: 'weight',
            templFeatureName: 'configuration',
            targetFeaturePath: '/test/projects/weight/weight_flutter/lib/features/configuration',
            workspacesPath: '/test/projects/weight',
        });

        // Template path содержит `category` — без guard превратилось бы в `_table.dart`.
        const result = getDestPath(
            service,
            'feature/data/datasources/local/tables/category_table.dart',
            config,
            // model=undefined emulates startProject flow (no model parsed)
        );

        // С guard: targetEntity '' → entity rewrite skipped, path preserved
        // (только templProject 't115' → 'weight' substitution применяется).
        assert.strictEqual(
            result,
            'feature/data/datasources/local/tables/category_table.dart',
            'empty targetEntity → no rewrite (silent data loss prevention)',
        );
        assert.ok(
            !result.includes('_table.dart') || result.includes('category_table.dart'),
            `path должен сохранять "category" prefix, не пустую строку: ${result}`,
        );
    });

    test('TASK-024 Round 2 (H7): empty targetEntity preserves Configuration baseline file names', () => {
        // Configuration baseline (simplified template) копируется через startProject
        // manifest без model + без targetEntity. Все файлы должны сохранить имена.
        const config = new GenerationConfig({
            templProject: 't115',
            templEntity: 'category',
            targetEntity: '',
            templatesPath: '/test/templates',
            projectsPath: '/test/projects',
            targetProject: 'app1',
            templFeatureName: 'configuration',
            targetFeaturePath: '/test/projects/app1/app1_flutter/lib/features/configuration',
            workspacesPath: '/test/projects/app1',
        });

        const sourceFiles = [
            'feature/data/datasources/local/daos/configuration_dao.dart',
            'feature/data/repositories/configuration_repository_impl.dart',
            'feature/domain/entities/configuration_entity.dart',
            'feature/presentation/dialogs/configuration_dialog.dart',
        ];

        for (const src of sourceFiles) {
            const result = getDestPath(service, src, config);
            assert.strictEqual(
                result,
                src,
                `empty targetEntity flow: file ${src} должен сохраниться verbatim, got ${result}`,
            );
        }
    });

    test('TASK-014: junction CustomerUser (3 FK + nullable) → customer_user/ directory', () => {
        // CustomerUser fixture (TASK-013 false-negative #2). 3 FK включая nullable —
        // entity1=customer, entity2=user. Junction class name = CustomerUser.
        const config = junctionConfig({
            targetEntity1: 'customer',
            targetEntity2: 'user',
            targetJunctionClassName: 'CustomerUser',
            targetFeatureName: 'access',
        });
        const model = makeJunctionModel('CustomerUser', [
            fkField('customerId', 'Customer'),
            fkField('userId', 'User'),
            { name: 'roleId', type: 'UuidValue', nullable: true, isRelation: true, relationType: 'manyToOne', relatedModel: 'Role' },
        ]);

        const result = getDestPath(
            service,
            'feature/data/adapters/task_tag_map/task_tag_map_remote_adapter.dart',
            config,
            model,
        );
        assert.strictEqual(
            result,
            'feature/data/adapters/customer_user/customer_user_remote_adapter.dart',
            'CustomerUser junction adapter путь должен быть customer_user/',
        );
    });
});
