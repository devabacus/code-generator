import * as assert from 'assert';
import { CodeFormatter } from '../../features/generation/parsers/formatters/code_formatter';
import { ServerpodYamlParser } from '../../features/generation/parsers/server_yaml_parser';
import { ServerpodField } from '../../features/generation/parsers/formatters/types';

/**
 * BUG-027 — collection back-relations (`<x>: List<Y>?, relation`) не должны протекать
 * ни в flutter entity/model (`fieldsFilter`), ни в drift-таблицу (`shouldSkipServerpodField`).
 *
 * Реальный root cause (НЕ тот, что в первичном bug-report): парсер ставит
 * `isRelation=false` на bare `relation` (regex `\brelation\s*\(` требует скобок),
 * поэтому `relationType` НЕ выставляется и проверки `relationType==='oneToMany'`
 * бесполезны. Дискриминатор — тип `List<...>`.
 *
 * До фикса:
 *  - `projectTasks: List<ProjectTask>?, relation` (regular, нет `Map`) → протекал в
 *    freezed entity/model БЕЗ импорта → `json_serializable InvalidType` → build FAIL.
 *  - drift-таблица обоих случаев (regular + junction) эмитила silent-wrong
 *    `TextColumn get <x> => text().nullable()()`.
 *
 * Тест использует РЕАЛЬНЫЙ парсер (а не ручные фикстуры — именно misrepresentation
 * фикстуры увела первичный анализ в неверный root cause).
 */
suite('BUG-027 — collection back-relation не протекает в flutter entity/model/drift', () => {

    const formatter = new CodeFormatter();

    const PROJECT_YAML = `class: Project
table: project
fields:
  id: UuidValue?, defaultPersist=random_v7
  userId: int
  customerId: UuidValue, relation(parent=customer, onDelete=Cascade)
  createdAt: DateTime
  lastModified: DateTime
  isDeleted: bool, default=false
  name: String
  projectTasks: List<ProjectTask>?, relation`;

    const AUTHOR_YAML = `class: Author
table: author
fields:
  id: UuidValue?, defaultPersist=random_v7
  userId: int
  customerId: UuidValue, relation(parent=customer, onDelete=Cascade)
  createdAt: DateTime
  lastModified: DateTime
  isDeleted: bool, default=false
  name: String
  authorBookMaps: List<AuthorBookMap>?, relation`;

    test('парсер действительно даёт isRelation=false на bare relation (закрепляем root cause)', () => {
        const model = ServerpodYamlParser.parse(PROJECT_YAML);
        const back = model.fields.find(f => f.name === 'projectTasks')!;
        assert.strictEqual(back.type, 'List<ProjectTask>');
        assert.strictEqual(back.isRelation, false, 'bare relation → isRelation=false (regex требует скобок)');
        assert.strictEqual(back.relationType, undefined, 'relationType не выставлен → relationType-проверки бесполезны');
    });

    test('fieldsFilter стрипает regular one-to-many back-relation (List, без Map)', () => {
        const model = ServerpodYamlParser.parse(PROJECT_YAML);
        const names = formatter.fieldsFilter(model.fields).map(f => f.name);
        assert.ok(!names.includes('projectTasks'), 'projectTasks отфильтрована');
        assert.ok(names.includes('name'), 'обычное поле name сохранено');
    });

    test('fieldsFilter стрипает junction back-relation (List<XMap>)', () => {
        const model = ServerpodYamlParser.parse(AUTHOR_YAML);
        const names = formatter.fieldsFilter(model.fields).map(f => f.name);
        assert.ok(!names.includes('authorBookMaps'), 'authorBookMaps отфильтрована');
    });

    test('freezed-конструктор не содержит незаимпорченный List<ProjectTask>', () => {
        const model = ServerpodYamlParser.parse(PROJECT_YAML);
        const emitted = formatter.formatRequiredTypeFields(model.fields);
        assert.ok(!emitted.includes('projectTasks'), 'нет projectTasks в freezed-конструкторе');
        assert.ok(!emitted.includes('List<'), 'нет List-типов в freezed-конструкторе');
        assert.ok(emitted.includes('name'), 'обычное поле name присутствует');
    });

    test('drift-таблица не эмитит колонку для collection back-relation (regular + junction)', () => {
        const project = ServerpodYamlParser.parse(PROJECT_YAML);
        const author = ServerpodYamlParser.parse(AUTHOR_YAML);

        const projectCols = formatter.generateDriftTableColumns(project.fields);
        const authorCols = formatter.generateDriftTableColumns(author.fields);

        assert.ok(!projectCols.includes('projectTasks'), 'нет drift-колонки projectTasks');
        assert.ok(!authorCols.includes('authorBookMaps'), 'нет drift-колонки authorBookMaps');
        assert.ok(projectCols.includes('get name'), 'обычная колонка name сгенерирована');
    });

    test('many-to-one FK (scalar) сохраняется — не задет List-фильтром', () => {
        const fk: ServerpodField = {
            name: 'projectId',
            type: 'UuidValue',
            nullable: true,
            isRelation: true,
            relationType: 'manyToOne',
            relatedModel: 'project',
        };
        const fields: ServerpodField[] = [{ name: 'title', type: 'String', nullable: false }, fk];
        const names = formatter.fieldsFilter(fields).map(f => f.name);
        assert.ok(names.includes('projectId'), 'FK projectId сохранена');
    });
});

/**
 * TASK-035 — после BUG-027 (junction back-relation `List<XMap>` ловится через
 * `startsWith('List<')`) name-эвристика `!field.name.includes('Map')` стала
 * избыточной и несёт latent false-positive: scalar-поле с camelCase-сегментом
 * `Map` (`siteMapUrl`, `heatMapConfig`, `roadMapId`) молча дропается из flutter
 * entity И drift. Эвристика удалена; junction back-relation по-прежнему стрипается
 * (через тип List<...>).
 */
suite('TASK-035 — Map-name-эвристика удалена, scalar-поля с `Map` в имени выживают', () => {

    const formatter = new CodeFormatter();

    const AUTHOR_WITH_MAPFIELD_YAML = `class: Author
table: author
fields:
  id: UuidValue?, defaultPersist=random_v7
  userId: int
  customerId: UuidValue, relation(parent=customer, onDelete=Cascade)
  createdAt: DateTime
  lastModified: DateTime
  isDeleted: bool, default=false
  name: String
  siteMapUrl: String
  authorBookMaps: List<AuthorBookMap>?, relation`;

    test('предусловие: имя содержит substring Map (закрепляем landmine)', () => {
        assert.ok('siteMapUrl'.includes('Map'), 'siteMapUrl содержит "Map" → старая эвристика бы его дропнула');
    });

    test('scalar siteMapUrl выживает в fieldsFilter, junction back-relation стрипается', () => {
        const model = ServerpodYamlParser.parse(AUTHOR_WITH_MAPFIELD_YAML);
        const names = formatter.fieldsFilter(model.fields).map(f => f.name);
        assert.ok(names.includes('siteMapUrl'), 'siteMapUrl НЕ дропнут (эвристика убрана)');
        assert.ok(!names.includes('authorBookMaps'), 'junction back-relation стрипается через List<...>');
    });

    test('scalar siteMapUrl получает drift-колонку, authorBookMaps — нет', () => {
        const model = ServerpodYamlParser.parse(AUTHOR_WITH_MAPFIELD_YAML);
        const cols = formatter.generateDriftTableColumns(model.fields);
        assert.ok(cols.includes('get siteMapUrl'), 'siteMapUrl эмитится как drift-колонка');
        assert.ok(!cols.includes('authorBookMaps'), 'нет drift-колонки для junction back-relation');
    });

    test('siteMapUrl присутствует в freezed-конструкторе', () => {
        const model = ServerpodYamlParser.parse(AUTHOR_WITH_MAPFIELD_YAML);
        const emitted = formatter.formatRequiredTypeFields(model.fields);
        assert.ok(emitted.includes('siteMapUrl'), 'siteMapUrl в freezed-конструкторе');
        assert.ok(!emitted.includes('authorBookMaps'), 'нет authorBookMaps в freezed-конструкторе');
    });
});
