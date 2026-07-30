import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { templateFlutterRoot, templateAvailable, skipUnlessTemplate } from '../helpers/templates';

/**
 * TASK-050 / BUG-032 — целостность шаблона по enum-хелперу.
 *
 * **Что защищаем.** `generateEntityToServerpodParams` эмитит вызов `tryParseEnum(...)`
 * для любого enum-поля — код общий для всех шаблонов
 * (`relation_generation.ts`). Сам хелпер живёт не в генераторе, а в **шаблоне**:
 * `lib/core/utils/enum_parse.dart` с маркером `manifest: startProject`, плюс статический
 * импорт в `*_entity_extension.dart`.
 *
 * **Почему тест появился.** TASK-027 довёз обе половины в `simplified`, но в `t115`
 * приехала только emit-сторона. Итог: t115-проект с enum-полем не собирается —
 * `undefined_method: tryParseEnum`. На копии weight регенерация ОДНОГО файла дала
 * `errors=0 → 5`.
 *
 * **Почему существующих тестов не хватило.** `enum_parse_helper.test.ts` (TASK-027)
 * проверяет чистую функцию: модель на входе → строка на выходе. Он зелёный и при
 * полностью отсутствующем хелпере — эмиссия-то корректна. Разрыв «эмитим вызов, но
 * не поставляем определение» не виден ни одному unit-тесту на генератор, а `verify`
 * его не ловит, потому что в фикстурах обоих шаблонов enum-полей нет (класс
 * «verify-blind», родня BUG-024/BUG-025).
 *
 * Тест намеренно ходит в **реальные шаблоны на диске**, а не в MockFileSystem: предмет
 * проверки — комплектность поставки, её нельзя замокать.
 */

interface TemplateSpec {
    /** Имя каталога шаблона: G:/Templates/flutter/<id>/ */
    id: string;
    /** Сущности-фикстуры, чьи *_entity_extension.dart обязаны импортировать хелпер. */
    entities: string[];
}

const TEMPLATES: TemplateSpec[] = [
    { id: 't115', entities: ['category', 'tag', 'task'] },
    { id: 'simplified', entities: ['category', 'tag', 'task'] },
];

function flutterRoot(spec: TemplateSpec): string {
    return templateFlutterRoot(spec.id);
}

function helperPath(spec: TemplateSpec): string {
    return path.join(flutterRoot(spec), 'lib', 'core', 'utils', 'enum_parse.dart');
}

function entityExtensionPath(spec: TemplateSpec, entity: string): string {
    return path.join(
        flutterRoot(spec), 'lib', 'features', 'tasks', 'domain', 'entities', 'extensions',
        `${entity}_entity_extension.dart`,
    );
}

/**
 * Шаблоны лежат вне репозитория — на машине без них тест бессмысленно «красить».
 * TASK-051: пропуск идёт через общий helper, который при `REQUIRE_TEMPLATES=1`
 * превращает «не проверено» в падение вместо невидимого pending (BUG-033).
 */
function available(spec: TemplateSpec): boolean {
    return templateAvailable(spec.id);
}

suite('TASK-050 / BUG-032: enum-хелпер поставляется шаблоном, а не подразумевается', () => {

    for (const spec of TEMPLATES) {

        test(`${spec.id}: lib/core/utils/enum_parse.dart существует и помечен manifest: startProject`, function () {
            if (skipUnlessTemplate(spec.id)) { this.skip(); }

            const p = helperPath(spec);
            assert.ok(
                fs.existsSync(p),
                `${spec.id}: генератор эмитит вызовы tryParseEnum(...), но хелпер отсутствует: ${p}. ` +
                'Любая сущность с enum-полем даст undefined_method (BUG-032).',
            );

            const content = fs.readFileSync(p, 'utf-8');
            assert.ok(
                /^\/\/\s*manifest:\s*startProject/m.test(content),
                `${spec.id}: у ${p} нет маркера "// manifest: startProject" — MarkerAnalyzer поставит ` +
                'ignore, и файл НЕ попадёт в создаваемый проект.',
            );
            assert.ok(
                /\btryParseEnum\b/.test(content),
                `${spec.id}: в ${p} нет определения tryParseEnum.`,
            );
        });

        for (const entity of spec.entities) {
            test(`${spec.id}: ${entity}_entity_extension.dart импортирует enum_parse.dart`, function () {
                if (skipUnlessTemplate(spec.id)) { this.skip(); }

                const p = entityExtensionPath(spec, entity);
                assert.ok(fs.existsSync(p), `${spec.id}: не найден шаблон ${p}`);

                const content = fs.readFileSync(p, 'utf-8');
                const importRe = /import\s+'[^']*core\/utils\/enum_parse\.dart'\s*;/;
                assert.ok(
                    importRe.test(content),
                    `${spec.id}/${entity}: нет импорта core/utils/enum_parse.dart. ` +
                    'Эмиссия tryParseEnum(...) без импорта = undefined_method (BUG-032).',
                );

                // Импорт безусловный (решение TASK-027: "acceptable trade-off vs conditional
                // emission complexity"), поэтому для сущностей без enum-полей он не используется.
                // Без ignore-комментария это давало бы unused_import на КАЖДОЙ такой сущности.
                const importIdx = content.search(importRe);
                const before = content.slice(0, importIdx);
                assert.ok(
                    /\/\/\s*ignore:\s*unused_import\s*$/m.test(before.trimEnd()),
                    `${spec.id}/${entity}: перед импортом enum_parse.dart нет "// ignore: unused_import". ` +
                    'Импорт безусловный — без ignore каждая сущность без enum-полей получит предупреждение.',
                );
            });
        }
    }

    test('оба шаблона согласованы между собой (parity не разъезжается в любую сторону)', function () {
        const present = TEMPLATES.filter(available);
        if (present.length < 2) { this.skip(); }

        const missing = present.filter(s => !fs.existsSync(helperPath(s))).map(s => s.id);
        assert.deepStrictEqual(
            missing, [],
            `хелпер есть не во всех шаблонах: нет в [${missing.join(', ')}]. ` +
            'Emit-сторона общая, значит и поставка хелпера обязана быть общей.',
        );
    });
});
