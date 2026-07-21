import * as assert from 'assert';
import { OrchestratorPatcher } from '../../features/generation/generators/orchestrator_patcher';
import { GenerationConfig } from '../../features/generation/config/generation_config';
import { ServerpodYamlParser } from '../../features/generation/parsers/server_yaml_parser';
import { MockFileSystem } from '../mocks/mock_file_system';

/**
 * TASK-037 — `junction: [a, b]` explicit-parents directive.
 *
 * BUG-026 regression: junction FK-extraction эвристика «первые 2 relation-поля по
 * порядку объявления» ломается когда `customerId: relation(parent=customer)`
 * объявлен ПЕРВЫМ (ownership marker, не junction-родитель) → silent misgeneration
 * пары entity1/entity2.
 *
 * Fix: опциональная файловая директива `junction: [task, tag]` в `*_map.spy.yaml`
 * даёт явный сигнал junction-родителей. Порядок `[a, b]` авторитетен
 * (entity1=a, entity2=b). Директива читается ВСЕМИ тремя junction-кодопутями
 * из единого источника (`model.entity1`/`model.entity2`, populated парсером).
 *
 * Без директивы — поведение байт-в-байт текущее (первые 2 relation-поля).
 */
suite('TASK-037: junction explicit-parents directive', () => {

    // ── Regression BUG-026: customerId объявлен ПЕРВЫМ + директива ────────────

    test('BUG-026 regression: customerId first + junction:[task,tag] → entity1=task entity2=tag', () => {
        // Junction, где ownership `customerId` объявлен РАНЬШЕ реальных FK.
        // Без директивы эвристика взяла бы customer+task (silent corruption).
        // С директивой — авторитетно task+tag.
        const yamlContent = `class: TaskTagMap
table: task_tag_map
junction: [task, tag]
fields:
  id: UuidValue?, defaultPersist=random_v7
  customerId: UuidValue, relation(parent=customer, onDelete=Cascade)
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
`;
        const model = ServerpodYamlParser.parse(yamlContent);

        assert.strictEqual(model.isRelation, true, 'директива-массив → junction классификация');
        assert.strictEqual(model.entity1, 'task',
            'entity1 берётся из директивы (task), а НЕ из первого relation-поля (customer)');
        assert.strictEqual(model.entity2, 'tag',
            'entity2 берётся из директивы (tag), а НЕ из второго relation-поля (task)');
    });

    // ── CustomerUser: директива [customer, role] совпадает с текущим ожиданием ─

    test('CustomerUser: junction:[customer,role] → entity1=customer entity2=role', () => {
        const yamlContent = `class: CustomerUser
table: customer_user
junction: [customer, role]
fields:
  id: UuidValue?, defaultPersist=random_v7
  customerId: UuidValue, relation(parent=customer)
  userId: int
  roleId: UuidValue, relation(parent=role)
  defaultTerminalSetId: UuidValue?, relation(parent=terminal_set)
`;
        const model = ServerpodYamlParser.parse(yamlContent);

        assert.strictEqual(model.isRelation, true);
        assert.strictEqual(model.entity1, 'customer');
        assert.strictEqual(model.entity2, 'role');
    });

    // ── Backward-compat: тот же YAML без директивы → текущее поведение ────────

    test('backward-compat: TaskTagMap без директивы (taskId/tagId first) → task+tag (эвристика)', () => {
        const yamlContent = `class: TaskTagMap
table: task_tag_map
fields:
  id: UuidValue?, defaultPersist=random_v7
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
  customerId: UuidValue, relation(parent=customer, onDelete=Cascade)
`;
        const model = ServerpodYamlParser.parse(yamlContent);

        assert.strictEqual(model.isRelation, true);
        assert.strictEqual(model.entity1, 'task', 'без директивы — первое relation-поле (taskId → task)');
        assert.strictEqual(model.entity2, 'tag', 'без директивы — второе relation-поле (tagId → tag)');
    });

    test('backward-compat: customerId first БЕЗ директивы → эвристика даёт customer+task (текущий баг сохранён осознанно)', () => {
        // Тот же YAML что в regression-тесте, но без директивы. Подтверждает что
        // при отсутствии директивы поведение НЕ меняется (BUG-026 mitigation-конвенция).
        const yamlContent = `class: TaskTagMap
table: task_tag_map
fields:
  id: UuidValue?, defaultPersist=random_v7
  customerId: UuidValue, relation(parent=customer, onDelete=Cascade)
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
`;
        const model = ServerpodYamlParser.parse(yamlContent);
        assert.strictEqual(model.entity1, 'customer', 'без директивы — первое relation-поле как раньше');
        assert.strictEqual(model.entity2, 'task', 'без директивы — второе relation-поле как раньше');
    });

    // ── Валидация: директива ссылается на несуществующее relation-поле ────────

    test('validation: junction:[task, missing] → внятная ошибка с именем отсутствующего поля', () => {
        const yamlContent = `class: TaskTagMap
table: task_tag_map
junction: [task, missing]
fields:
  id: UuidValue?, defaultPersist=random_v7
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
`;
        assert.throws(
            () => ServerpodYamlParser.parse(yamlContent),
            /junction.*missing/i,
            'директива на несуществующее relation-поле → ошибка с именем "missing"',
        );
    });

    test('validation: junction:[foo, bar] с не-relation полем → ошибка (не silent)', () => {
        const yamlContent = `class: TaskTagMap
table: task_tag_map
junction: [task, note]
fields:
  id: UuidValue?, defaultPersist=random_v7
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
  note: String
`;
        assert.throws(
            () => ServerpodYamlParser.parse(yamlContent),
            /junction.*note/i,
            '`note` не relation-поле → ошибка валидации',
        );
    });

    // ── snake_case parent маппинг: директива по entity-имени, поле alias ──────

    test('mapping: директива по parent-имени (snake→camel) резолвит FK alias', () => {
        // FK alias: поле defaultTerminalSetId, parent=terminal_set. Директива
        // ссылается на entity-имя `terminal_set`, должна смапиться через relatedModel.
        const yamlContent = `class: SetRoleMap
table: set_role_map
junction: [terminal_set, role]
fields:
  id: UuidValue?, defaultPersist=random_v7
  defaultTerminalSetId: UuidValue, relation(parent=terminal_set)
  roleId: UuidValue, relation(parent=role)
`;
        const model = ServerpodYamlParser.parse(yamlContent);
        assert.strictEqual(model.entity1, 'terminalSet',
            'terminal_set резолвится в relatedModel terminalSet (lowerCamel)');
        assert.strictEqual(model.entity2, 'role');
    });

    // ── Все три кодопути читают пару из одного источника (orchestrator) ───────

    const ORCHESTRATOR_PATH =
        '/p/weight/weight_flutter/lib/core/sync/sync_orchestrator_provider.dart';
    const ORCHESTRATOR_BASELINE = `// manifest: startProject
import 'package:sync_core/sync_core.dart';
// === generated_start:syncImports ===
// === generated_end:syncImports ===

const List<String> syncEntityTypes = <String>[
  // === generated_start:syncEntityTypes ===
  // === generated_end:syncEntityTypes ===
];

SyncOrchestrator syncOrchestrator(Ref ref) {
  final orchestrator = SyncOrchestrator();
  // === generated_start:syncRegistrations ===
  // === generated_end:syncRegistrations ===
  return orchestrator;
}
`;

    function makeConfig(): GenerationConfig {
        return new GenerationConfig({
            templProject: 't115',
            templEntity: 'category',
            targetEntity: '',
            templatesPath: '/t',
            projectsPath: '/p',
            targetProject: 'weight',
            templFeatureName: 'tasks',
            targetFeaturePath: '/p/weight/weight_flutter/lib/features/junction',
            workspacesPath: '/p/weight',
        });
    }

    test('orchestrator reads directive-resolved pair: customerId first + directive → docstring customer... нет, task+tag', async () => {
        const mockFs = new MockFileSystem();
        mockFs.setFile(ORCHESTRATOR_PATH, ORCHESTRATOR_BASELINE);

        const yamlContent = `class: TaskTagMap
table: task_tag_map
junction: [task, tag]
fields:
  id: UuidValue?, defaultPersist=random_v7
  customerId: UuidValue, relation(parent=customer, onDelete=Cascade)
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
`;
        const model = ServerpodYamlParser.parse(yamlContent);
        const patcher = new OrchestratorPatcher(mockFs);
        await patcher.patch(makeConfig(), model);

        const result = await mockFs.readFile(ORCHESTRATOR_PATH);

        assert.ok(
            result.includes('junction FK→task+tag'),
            'orchestrator docstring должен отражать директиву task+tag, а НЕ первое relation-поле customer',
        );
        assert.ok(
            !result.includes('junction FK→customer+task'),
            'эвристика customer+task НЕ должна протечь при наличии директивы',
        );
        assert.ok(
            result.includes('deleteTaskTagMapByTaskAndTag'),
            'method-name должен быть ByTaskAndTag (из директивы)',
        );
    });
});
