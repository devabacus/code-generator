import * as assert from 'assert';
import {
    templatesRoot, templateAvailability, templatesRequired, KNOWN_TEMPLATES,
} from '../helpers/templates';

/**
 * TASK-051 / BUG-033 — канарейка покрытия шаблонов.
 *
 * **Проблема, которую она закрывает.** Тесты, читающие шаблоны с диска, при отсутствии
 * `G:/Templates` уходят в pending. На ubuntu-раннере это 31 тест из 468 — включая гарды
 * тихой порчи данных (TASK-028 LWW skip-stale) и BUG-001 (`ref.mounted`). CI при этом
 * зелёный и ничего не сообщает: «468 тестов» звучит как покрытие, которого нет.
 *
 * Канарейка **исполняется всегда** (никаких skip) и делает непроверенное видимым:
 * печатает, какие шаблоны верифицированы, а какие нет. При `REQUIRE_TEMPLATES=1`
 * отсутствие шаблона становится падением.
 *
 * Она НЕ заменяет защиту в CI — полное решение упирается в приватность t115 и отсутствие
 * remote у simplified, это решение владельца (см. bug-reports/033).
 */

suite('TASK-051 / BUG-033: канарейка покрытия шаблонов', () => {

    test('отчёт: какие шаблоны реально проверены в этом прогоне', () => {
        const { available, missing } = templateAvailability();

        const lines = [
            '',
            '  ── покрытие шаблонов ─────────────────────────────',
            `     корень: ${templatesRoot()}`,
            `     проверяются: ${available.length ? available.join(', ') : '— НИ ОДНОГО —'}`,
            `     ПРОПУЩЕНЫ:   ${missing.length ? missing.join(', ') : 'нет'}`,
        ];
        if (missing.length) {
            lines.push(
                '     ⚠ тесты этих шаблонов ушли в pending и НИЧЕГО не проверили.',
                '       Зелёный прогон не означает, что шаблоны целы (BUG-033).',
                '       Локально перед правкой шаблона: REQUIRE_TEMPLATES=1 + 0 pending.',
            );
        }
        lines.push('  ──────────────────────────────────────────────────', '');
        console.log(lines.join('\n'));

        // Сам факт отчёта — не повод падать: на раннере шаблонов нет по построению.
        // Утверждение здесь только о том, что список известных шаблонов не опустел
        // (иначе канарейка молча перестала бы что-либо охранять).
        assert.ok(
            KNOWN_TEMPLATES.length > 0,
            'список известных шаблонов пуст — канарейка потеряла предмет охраны',
        );
    });

    test('REQUIRE_TEMPLATES=1 → отсутствующий шаблон роняет прогон, а не пропускается', () => {
        const { missing } = templateAvailability();

        if (!templatesRequired()) {
            // Режим по умолчанию: пропуск разрешён. Проверяем сам контракт переключателя,
            // не трогая глобальное окружение прогона.
            const saved = process.env.REQUIRE_TEMPLATES;
            try {
                process.env.REQUIRE_TEMPLATES = '1';
                assert.strictEqual(templatesRequired(), true, 'REQUIRE_TEMPLATES=1 обязан включать строгий режим');
                process.env.REQUIRE_TEMPLATES = '0';
                assert.strictEqual(templatesRequired(), false, 'REQUIRE_TEMPLATES=0 обязан оставлять мягкий режим');
            } finally {
                if (saved === undefined) { delete process.env.REQUIRE_TEMPLATES; }
                else { process.env.REQUIRE_TEMPLATES = saved; }
            }
            return;
        }

        // Строгий режим включён явно — значит пропусков быть не должно.
        assert.deepStrictEqual(
            missing, [],
            `REQUIRE_TEMPLATES=1, но шаблоны отсутствуют: [${missing.join(', ')}]. ` +
            `Корень: ${templatesRoot()}. Прогон не проверил то, ради чего запускался.`,
        );
    });
});
