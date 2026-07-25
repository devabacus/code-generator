import * as assert from 'assert';
import { ServerpodYamlParser } from '../../features/generation/parsers/server_yaml_parser';
import { JunctionValidationError } from '../../features/generation/parsers/junction_detector';

/**
 * TASK-040 — носитель директивы junction переехал из YAML-ключа в YAML-комментарий.
 *
 * Причина (ADR-0006 / дискуссия #13): `serverpod generate` читает ТОТ ЖЕ физический
 * `.spy.yaml` и падает на неизвестном ключе:
 *   `The "junction" property is not allowed for class type.`
 * Комментарий Serverpod физически не видит → файл на диске в покое валиден для
 * Serverpod без всякой предобработки.
 *
 * Контракт парсера (консенсус дискуссии #13, п.1-4 GPT_1 + уточнение Claude_2):
 *   - читать маркер ДО `yaml.load`, по сырому `yamlContent`;
 *   - якорь на колонку 0: `^# codegen:junction:` без отступа (снимает ложное
 *     срабатывание внутри block scalar / строкового default'а);
 *   - ровно ОДИН маркер; дубликат — ошибка;
 *   - RHS валидируется теми же правилами, что раньше: `true` / `[a, b]`;
 *   - malformed → fail-fast, НЕ тихая деградация к эвристике;
 *   - настоящий YAML-ключ `junction` → migration-guard с инструкцией переноса.
 */
suite('TASK-040: junction comment-directive (# codegen:junction:)', () => {

    // ── Форма [a, b] ─────────────────────────────────────────────────────────

    test('BUG-026 regression: customerId first + # codegen:junction: [task, tag] → task+tag', () => {
        const yamlContent = `# codegen:junction: [task, tag]
class: TaskTagMap
table: task_tag_map
fields:
  id: UuidValue?, defaultPersist=random_v7
  customerId: UuidValue, relation(parent=customer, onDelete=Cascade)
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
`;
        const model = ServerpodYamlParser.parse(yamlContent);

        assert.strictEqual(model.isRelation, true, 'комментарий-директива → junction классификация');
        assert.strictEqual(model.entity1, 'task',
            'entity1 из комментария-директивы, а НЕ из первого relation-поля (customer)');
        assert.strictEqual(model.entity2, 'tag');
    });

    test('маркер работает не только на первой строке файла (колонка 0, любая позиция)', () => {
        const yamlContent = `class: TaskTagMap
table: task_tag_map
# codegen:junction: [task, tag]
fields:
  id: UuidValue?, defaultPersist=random_v7
  customerId: UuidValue, relation(parent=customer, onDelete=Cascade)
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
`;
        const model = ServerpodYamlParser.parse(yamlContent);
        assert.strictEqual(model.entity1, 'task');
        assert.strictEqual(model.entity2, 'tag');
    });

    test('CRLF: маркер читается в файлах с Windows line endings', () => {
        const yamlContent = '# codegen:junction: [task, tag]\r\n'
            + 'class: TaskTagMap\r\n'
            + 'table: task_tag_map\r\n'
            + 'fields:\r\n'
            + '  id: UuidValue?, defaultPersist=random_v7\r\n'
            + '  customerId: UuidValue, relation(parent=customer, onDelete=Cascade)\r\n'
            + '  taskId: UuidValue, relation(parent=task, onDelete=Cascade)\r\n'
            + '  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)\r\n';
        const model = ServerpodYamlParser.parse(yamlContent);
        assert.strictEqual(model.entity1, 'task');
        assert.strictEqual(model.entity2, 'tag');
    });

    test('FK alias: # codegen:junction: [terminal_set, role] резолвится через relatedModel', () => {
        const yamlContent = `# codegen:junction: [terminal_set, role]
class: SetRoleMap
table: set_role_map
fields:
  id: UuidValue?, defaultPersist=random_v7
  defaultTerminalSetId: UuidValue, relation(parent=terminal_set)
  roleId: UuidValue, relation(parent=role)
`;
        const model = ServerpodYamlParser.parse(yamlContent);
        assert.strictEqual(model.entity1, 'terminalSet');
        assert.strictEqual(model.entity2, 'role');
    });

    // ── Форма true (TASK-013 explicit override) ──────────────────────────────

    test('форма true: # codegen:junction: true → explicit override классификации', () => {
        // Entity с business-полем `assignedAt` — структурно НЕ junction.
        const yamlContent = `# codegen:junction: true
class: UserPermission
table: user_permission
fields:
  id: UuidValue?, defaultPersist=random_v7
  userId: UuidValue, relation(parent=user, onDelete=Cascade)
  permissionId: UuidValue, relation(parent=permission, onDelete=Cascade)
  assignedAt: DateTime
`;
        const model = ServerpodYamlParser.parse(yamlContent);
        assert.strictEqual(model.isRelation, true, '# codegen:junction: true → isRelation=true');
    });

    test('форма true: FK<2 → JunctionValidationError (валидация сохранена)', () => {
        const yamlContent = `# codegen:junction: true
class: BadJunction
table: bad_junction
fields:
  id: UuidValue?
  onlyOneFk: UuidValue, relation(parent=other, onDelete=Cascade)
`;
        assert.throws(
            () => ServerpodYamlParser.parse(yamlContent),
            JunctionValidationError,
        );
    });

    // ── Ровно один маркер ────────────────────────────────────────────────────

    test('дубликат маркера → fail-fast', () => {
        const yamlContent = `# codegen:junction: [task, tag]
# codegen:junction: [task, tag]
class: TaskTagMap
table: task_tag_map
fields:
  id: UuidValue?, defaultPersist=random_v7
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
`;
        assert.throws(
            () => ServerpodYamlParser.parse(yamlContent),
            /codegen:junction.*(дубликат|duplicate|ровно один|exactly one)/i,
            'два маркера → ошибка, а не «взять первый»',
        );
    });

    // ── Якорь на колонку 0 ───────────────────────────────────────────────────

    test('якорь колонка 0: маркер с отступом НЕ читается (block scalar / вложенный комментарий)', () => {
        // Маркер с отступом — часть чужого контекста, не top-level директива.
        // Поведение = как будто директивы нет → эвристика (первые 2 relation-поля).
        const yamlContent = `class: TaskTagMap
table: task_tag_map
fields:
  # codegen:junction: [task, tag]
  id: UuidValue?, defaultPersist=random_v7
  customerId: UuidValue, relation(parent=customer, onDelete=Cascade)
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
`;
        const model = ServerpodYamlParser.parse(yamlContent);
        assert.strictEqual(model.entity1, 'customer', 'отступ → директива игнорируется, работает эвристика');
        assert.strictEqual(model.entity2, 'task');
    });

    test('якорь колонка 0: маркер внутри block scalar НЕ читается', () => {
        // Содержимое block scalar обязано быть с отступом, поэтому текст маркера
        // внутри него на колонку 0 не попадает и директивой не считается.
        const yamlContent = `class: TaskTagMap
table: task_tag_map
description: |
  # codegen:junction: [foo, bar]
fields:
  id: UuidValue?, defaultPersist=random_v7
  customerId: UuidValue, relation(parent=customer, onDelete=Cascade)
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
`;
        const model = ServerpodYamlParser.parse(yamlContent);
        // Директивы нет → эвристика; главное — нет throw про несуществующий `foo`.
        assert.strictEqual(model.entity1, 'customer');
        assert.strictEqual(model.entity2, 'task');
    });

    // ── Вариации пробела после # (review minor #1) ───────────────────────────

    test('пробел после #: варианты #codegen / # codegen / #  codegen эквивалентны', () => {
        // Опечатка в числе пробелов НЕ должна молча ронять директиву в fallback.
        // Якорь колонки 0 сохраняется — послаблен только горизонтальный отступ [ \t]*.
        for (const marker of [
            '#codegen:junction: [task, tag]',       // без пробела
            '# codegen:junction: [task, tag]',      // один пробел (канон)
            '#  codegen:junction: [task, tag]',     // два пробела
            '#\tcodegen:junction: [task, tag]',     // таб
        ]) {
            const yamlContent = `${marker}
class: TaskTagMap
table: task_tag_map
fields:
  id: UuidValue?, defaultPersist=random_v7
  customerId: UuidValue, relation(parent=customer, onDelete=Cascade)
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
`;
            const model = ServerpodYamlParser.parse(yamlContent);
            assert.strictEqual(model.entity1, 'task', `директива должна примениться для "${marker}"`);
            assert.strictEqual(model.entity2, 'tag', `директива должна примениться для "${marker}"`);
        }
    });

    test('послабление пробела НЕ ломает якорь колонки 0: отступ по-прежнему игнорируется', () => {
        // [ \t]* стоит ПОСЛЕ ^# — отступ перед # (block scalar / вложенный) не матчится.
        const yamlContent = `class: TaskTagMap
table: task_tag_map
fields:
  #codegen:junction: [task, tag]
  id: UuidValue?, defaultPersist=random_v7
  customerId: UuidValue, relation(parent=customer, onDelete=Cascade)
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
`;
        const model = ServerpodYamlParser.parse(yamlContent);
        assert.strictEqual(model.entity1, 'customer', 'отступ перед # → директива игнорируется даже без пробела');
        assert.strictEqual(model.entity2, 'task');
    });

    // ── Malformed RHS → fail-fast, не деградация ─────────────────────────────

    test('malformed: [task] (1 элемент) → ошибка, не тихая деградация к эвристике', () => {
        const yamlContent = `# codegen:junction: [task]
class: TaskTagMap
table: task_tag_map
fields:
  id: UuidValue?, defaultPersist=random_v7
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
`;
        assert.throws(
            () => ServerpodYamlParser.parse(yamlContent),
            /junction.*exactly 2|ровно 2|2 elements/i,
        );
    });

    test('malformed: [a, b, c] (3 элемента) → ошибка', () => {
        const yamlContent = `# codegen:junction: [task, tag, note]
class: TaskTagMap
table: task_tag_map
fields:
  id: UuidValue?, defaultPersist=random_v7
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
`;
        assert.throws(
            () => ServerpodYamlParser.parse(yamlContent),
            /junction/i,
        );
    });

    test('malformed: мусорный RHS (не true и не массив) → ошибка', () => {
        const yamlContent = `# codegen:junction: yes-please
class: TaskTagMap
table: task_tag_map
fields:
  id: UuidValue?, defaultPersist=random_v7
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
`;
        assert.throws(
            () => ServerpodYamlParser.parse(yamlContent),
            /junction/i,
        );
    });

    test('malformed: пустой RHS → ошибка', () => {
        const yamlContent = `# codegen:junction:
class: TaskTagMap
table: task_tag_map
fields:
  id: UuidValue?, defaultPersist=random_v7
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
`;
        assert.throws(
            () => ServerpodYamlParser.parse(yamlContent),
            /junction/i,
        );
    });

    // ── Cross-validation пары ────────────────────────────────────────────────

    test('cross-validation: несуществующий родитель → ошибка с его именем', () => {
        const yamlContent = `# codegen:junction: [task, missing]
class: TaskTagMap
table: task_tag_map
fields:
  id: UuidValue?, defaultPersist=random_v7
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
`;
        assert.throws(
            () => ServerpodYamlParser.parse(yamlContent),
            /junction.*missing/i,
        );
    });

    test('cross-validation: не-relation поле → ошибка (не silent)', () => {
        const yamlContent = `# codegen:junction: [task, note]
class: TaskTagMap
table: task_tag_map
fields:
  id: UuidValue?, defaultPersist=random_v7
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
  note: String
`;
        assert.throws(
            () => ServerpodYamlParser.parse(yamlContent),
            /junction.*note/i,
        );
    });

    test('cross-validation: дубликат родителя [task, task] → ошибка (guard TASK-039)', () => {
        const yamlContent = `# codegen:junction: [task, task]
class: TaskTagMap
table: task_tag_map
fields:
  id: UuidValue?, defaultPersist=random_v7
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
`;
        assert.throws(
            () => ServerpodYamlParser.parse(yamlContent),
            /junction.*distinct.*task.*twice/i,
        );
    });

    // ── Migration-guard на старый YAML-ключ ──────────────────────────────────

    test('migration-guard: YAML-ключ junction: [a, b] → ошибка с инструкцией переноса', () => {
        const yamlContent = `class: TaskTagMap
table: task_tag_map
junction: [task, tag]
fields:
  id: UuidValue?, defaultPersist=random_v7
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
`;
        assert.throws(
            () => ServerpodYamlParser.parse(yamlContent),
            /# codegen:junction/,
            'сообщение обязано содержать новый носитель',
        );
    });

    test('migration-guard: YAML-ключ junction: true → та же ошибка переноса', () => {
        const yamlContent = `class: UserPermission
table: user_permission
junction: true
fields:
  id: UuidValue?, defaultPersist=random_v7
  userId: UuidValue, relation(parent=user, onDelete=Cascade)
  permissionId: UuidValue, relation(parent=permission, onDelete=Cascade)
  assignedAt: DateTime
`;
        assert.throws(
            () => ServerpodYamlParser.parse(yamlContent),
            /# codegen:junction/,
        );
    });

    test('migration-guard упоминает Serverpod как причину', () => {
        const yamlContent = `class: TaskTagMap
table: task_tag_map
junction: [task, tag]
fields:
  id: UuidValue?, defaultPersist=random_v7
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
`;
        assert.throws(
            () => ServerpodYamlParser.parse(yamlContent),
            /Serverpod/i,
        );
    });

    // ── Fallback НЕ тронут (TASK-041 — отдельная задача) ─────────────────────

    test('fallback не тронут: без маркера — эвристика «первые 2 relation-поля»', () => {
        const yamlContent = `class: TaskTagMap
table: task_tag_map
fields:
  id: UuidValue?, defaultPersist=random_v7
  customerId: UuidValue, relation(parent=customer, onDelete=Cascade)
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
`;
        const model = ServerpodYamlParser.parse(yamlContent);
        assert.strictEqual(model.entity1, 'customer', 'эвристика без изменений (TASK-041 — отдельно)');
        assert.strictEqual(model.entity2, 'task');
    });

    test('обычный комментарий (# manifest: / произвольный) не мешает парсингу', () => {
        const yamlContent = `# manifest: entity
# просто комментарий про junction
class: TaskTagMap
table: task_tag_map
fields:
  id: UuidValue?, defaultPersist=random_v7
  taskId: UuidValue, relation(parent=task, onDelete=Cascade)
  tagId: UuidValue, relation(parent=tag, onDelete=Cascade)
`;
        const model = ServerpodYamlParser.parse(yamlContent);
        assert.strictEqual(model.entity1, 'task');
        assert.strictEqual(model.entity2, 'tag');
    });
});
