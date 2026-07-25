import * as assert from 'assert';
import {
    describeProblems,
    isRegionHealthy,
    problemsFor,
    replaceRegionBody,
    scanRegions,
} from '../../features/generation/generators/region_parser';

/**
 * TASK-042 / BUG-029 — region-парсер.
 *
 * Ключевое требование контракта: отличать «маркеров нет вообще» от «маркеры
 * битые». До TASK-042 `_mergeBaseContent` в обоих случаях тихо возвращал
 * содержимое target-файла — третий silent-режим BUG-029 (silent staleness).
 */
suite('TASK-042: region_parser', () => {

    suite('здоровая разметка', () => {

        test('один регион → тело извлечено побайтово (маркеры не входят)', () => {
            const content = [
                'header',
                '// === generated_start:base ===',
                'body line 1',
                '// === generated_end:base ===',
                'footer',
            ].join('\n');

            const scan = scanRegions(content);
            assert.strictEqual(scan.problems.length, 0);
            assert.strictEqual(scan.hasAnyMarker, true);
            assert.strictEqual(scan.regions.get('base'), '\nbody line 1\n');
            assert.strictEqual(isRegionHealthy(scan, 'base'), true);
        });

        test('два последовательных региона (как task_dao.dart: base + oneToManyMethods)', () => {
            const content = [
                '// === generated_start:base ===',
                'A',
                '  // === generated_end:base ===',
                '',
                '  // === generated_start:oneToManyMethods ===',
                'B',
                '  // === generated_end:oneToManyMethods ===',
            ].join('\n');

            const scan = scanRegions(content);
            assert.strictEqual(scan.problems.length, 0, describeProblems(scan.problems));
            assert.strictEqual(scan.regions.size, 2);
            assert.ok(scan.regions.get('base')!.includes('A'));
            assert.ok(scan.regions.get('oneToManyMethods')!.includes('B'));
        });

        test('# -комментарий (yaml/python шаблоны) распознаётся наравне с //', () => {
            const content = '# === generated_start:base ===\nX\n# === generated_end:base ===';
            const scan = scanRegions(content);
            assert.strictEqual(scan.problems.length, 0);
            assert.strictEqual(scan.regions.get('base'), '\nX\n');
        });

        test('маркеры с отступом (внутри класса) распознаются', () => {
            const content = '  // === generated_start:base ===\nX\n  // === generated_end:base ===';
            assert.strictEqual(isRegionHealthy(scanRegions(content), 'base'), true);
        });
    });

    suite('маркеров нет вообще ≠ маркеры битые', () => {

        test('контент без маркеров → hasAnyMarker=false, ни regions, ни problems', () => {
            const scan = scanRegions('просто файл\nбез единого маркера\n');
            assert.strictEqual(scan.hasAnyMarker, false);
            assert.strictEqual(scan.regions.size, 0);
            assert.strictEqual(scan.problems.length, 0);
            assert.strictEqual(isRegionHealthy(scan, 'base'), false);
        });

        test('битые маркеры → hasAnyMarker=true и непустой problems', () => {
            const scan = scanRegions('// === generated_start:base ===\nX\n');
            assert.strictEqual(scan.hasAnyMarker, true);
            assert.ok(scan.problems.length > 0);
            assert.strictEqual(isRegionHealthy(scan, 'base'), false);
        });
    });

    suite('формы порчи', () => {

        test('unclosed: start без end', () => {
            const scan = scanRegions('// === generated_start:base ===\nbody\n');
            assert.deepStrictEqual(scan.problems.map(p => p.kind), ['unclosed']);
            assert.strictEqual(scan.problems[0].name, 'base');
            assert.strictEqual(scan.problems[0].line, 1);
            assert.strictEqual(scan.regions.has('base'), false);
        });

        test('orphanEnd: end без start', () => {
            const scan = scanRegions('body\n// === generated_end:base ===\n');
            assert.deepStrictEqual(scan.problems.map(p => p.kind), ['orphanEnd']);
            assert.strictEqual(scan.problems[0].line, 2);
        });

        test('duplicate: регион встречается дважды', () => {
            const content = [
                '// === generated_start:base ===',
                'first',
                '// === generated_end:base ===',
                '// === generated_start:base ===',
                'second',
                '// === generated_end:base ===',
            ].join('\n');

            const scan = scanRegions(content);
            assert.deepStrictEqual(scan.problems.map(p => p.kind), ['duplicate']);
            assert.strictEqual(problemsFor(scan, 'base').length, 1);
            // Первое вхождение сохраняется, но регион считается нездоровым.
            assert.ok(scan.regions.get('base')!.includes('first'));
            assert.strictEqual(isRegionHealthy(scan, 'base'), false);
        });

        test('unclosed при вложенности: start:other внутри незакрытого base', () => {
            const content = [
                '// === generated_start:base ===',
                '// === generated_start:other ===',
                'x',
                '// === generated_end:other ===',
            ].join('\n');

            const scan = scanRegions(content);
            assert.ok(scan.problems.some(p => p.kind === 'unclosed' && p.name === 'base'));
            assert.strictEqual(isRegionHealthy(scan, 'base'), false);
        });

        test('mismatched: end:other закрывает открытый base', () => {
            const content = '// === generated_start:base ===\nx\n// === generated_end:other ===';
            const scan = scanRegions(content);
            assert.deepStrictEqual(scan.problems.map(p => p.kind), ['mismatched']);
            assert.strictEqual(isRegionHealthy(scan, 'base'), false);
        });

        test('mismatched относится к ОБОИМ именам — иначе вызывающий соврёт «маркеров нет»', () => {
            // `generated_start:base` в файле присутствует; если проблему приписать
            // только закрывающему имени, `problemsFor(scan, 'base')` пуст и
            // classifyMergeFile выдаёт `missing-markers` — прямая дезинформация.
            const content = '// === generated_start:base ===\nx\n// === generated_end:other ===';
            const scan = scanRegions(content);

            assert.strictEqual(problemsFor(scan, 'base').length, 1,
                'проблема обязана относиться к открытому региону');
            assert.strictEqual(problemsFor(scan, 'other').length, 1,
                'закрывающее имя тоже участвует в проблеме');
            assert.strictEqual(scan.problems[0].name, 'base');
            assert.strictEqual(scan.problems[0].counterpart, 'other');
        });

        test('describeProblems для mismatched называет оба региона', () => {
            const scan = scanRegions('// === generated_start:base ===\nx\n// === generated_end:other ===');
            const text = describeProblems(scan.problems);
            assert.ok(text.includes('"base"'), text);
            assert.ok(text.includes('generated_end:other'), text);
        });

        test('describeProblems даёт человекочитаемое описание с номером строки', () => {
            const scan = scanRegions('// === generated_start:base ===\nx\n');
            const text = describeProblems(scan.problems);
            assert.ok(text.includes('base'), text);
            assert.ok(/строка\s+1/.test(text), text);
        });
    });

    suite('replaceRegionBody', () => {

        test('заменяет тело, сохраняя маркеры и остальной файл дословно', () => {
            const content = [
                'import "a.dart";',
                '// === generated_start:base ===',
                'OLD',
                '// === generated_end:base ===',
                'void custom() {}',
            ].join('\n');

            const result = replaceRegionBody(content, 'base', '\nNEW\n');
            assert.strictEqual(result, [
                'import "a.dart";',
                '// === generated_start:base ===',
                'NEW',
                '// === generated_end:base ===',
                'void custom() {}',
            ].join('\n'));
        });

        test('регион отсутствует → null (вызывающий обязан поднять конфликт)', () => {
            assert.strictEqual(replaceRegionBody('no markers here', 'base', 'X'), null);
        });

        test('регион повреждён → null, а не молчаливый возврат исходника', () => {
            const broken = '// === generated_start:base ===\nX\n';
            assert.strictEqual(replaceRegionBody(broken, 'base', 'Y'), null);
        });

        test('дублированный регион → null (silent staleness закрыт)', () => {
            const dup = [
                '// === generated_start:base ===', 'a', '// === generated_end:base ===',
                '// === generated_start:base ===', 'b', '// === generated_end:base ===',
            ].join('\n');
            assert.strictEqual(replaceRegionBody(dup, 'base', 'Y'), null);
        });

        test('соседний регион не затрагивается', () => {
            const content = [
                '// === generated_start:base ===', 'A', '// === generated_end:base ===',
                '// === generated_start:oneToManyMethods ===', 'KEEP', '// === generated_end:oneToManyMethods ===',
            ].join('\n');

            const result = replaceRegionBody(content, 'base', '\nB\n')!;
            assert.ok(result.includes('KEEP'), result);
            assert.ok(result.includes('\nB\n'), result);
            assert.ok(!result.includes('\nA\n'), result);
        });
    });
});
