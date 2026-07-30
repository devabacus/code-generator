import * as fs from 'fs';
import * as path from 'path';

/**
 * TASK-051 / BUG-033 — единая точка резолва пути к шаблонам для тестов.
 *
 * **Зачем.** Шаблоны (`t115`, `simplified`) лежат ВНЕ репозитория. Четыре тест-файла
 * обращались к ним по захардкоженным абсолютным путям `G:/Templates/...`, и на
 * ubuntu-раннере молча уходили в pending: 31 тест из 468 не исполнялся, а CI был зелёный.
 * Среди непроверенного — гарды тихой порчи данных (TASK-028 LWW) и BUG-001.
 *
 * Здесь путь резолвится в одном месте и настраивается переменной, чтобы окружение
 * (CI, другая машина, временный каталог в тесте) могло его подменить.
 */

/**
 * Пути отдаются в forward-slash виде.
 *
 * Так было в захардкоженных константах, которые этот helper заменяет, и так их сравнивают
 * некоторые тесты. `path.join` на Windows дал бы `\`, и drop-in замена перестала бы быть
 * drop-in — поэтому нормализуем явно, а не полагаемся на «обычно работает».
 */
function fwd(p: string): string {
    return p.replace(/\\/g, '/');
}

/** Корень каталога шаблонов. Переопределяется `CODEGEN_TEMPLATES_PATH`. */
export function templatesRoot(): string {
    return fwd(process.env.CODEGEN_TEMPLATES_PATH ?? 'G:/Templates');
}

/** Корень flutter-части шаблона: `<root>/flutter/<id>/<id>_flutter`. */
export function templateFlutterRoot(id: string): string {
    return fwd(path.join(templatesRoot(), 'flutter', id, `${id}_flutter`));
}

/** Корень admin-части шаблона: `<root>/flutter/<id>/<id>_admin`. */
export function templateAdminRoot(id: string): string {
    return fwd(path.join(templatesRoot(), 'flutter', id, `${id}_admin`));
}

/** Есть ли шаблон на диске в текущем окружении. */
export function templateAvailable(id: string): boolean {
    return fs.existsSync(templateFlutterRoot(id));
}

/** Шаблоны, по которым идут parity-проверки. Держать в синхроне с `TEMPLATES` тестов. */
export const KNOWN_TEMPLATES = ['t115', 'simplified'] as const;

/**
 * Требовать наличие шаблонов вместо тихого пропуска.
 *
 * По умолчанию **выключено**: на раннере шаблонов нет, и падать там бессмысленно —
 * это не дефект кода, а отсутствие внешнего каталога. Включается явно (`REQUIRE_TEMPLATES=1`)
 * там, где пропуск недопустим: локальный прогон перед правкой шаблона, будущий job с
 * настоящими шаблонами.
 */
export function templatesRequired(): boolean {
    const v = (process.env.REQUIRE_TEMPLATES ?? '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Единая реакция шаблонного теста на отсутствие шаблона.
 *
 * Возвращает `true`, если тест надо пропустить (вызывающий делает `this.skip()`).
 * Бросает, если пропуск запрещён через `REQUIRE_TEMPLATES` — тогда «не проверено»
 * становится красным, а не невидимым.
 */
export function skipUnlessTemplate(id: string): boolean {
    if (templateAvailable(id)) { return false; }
    if (templatesRequired()) {
        throw new Error(
            `REQUIRE_TEMPLATES=1, но шаблон '${id}' не найден: ${templateFlutterRoot(id)}. ` +
            'Пропуск запрещён — тест обязан выполниться. Проверь CODEGEN_TEMPLATES_PATH ' +
            `(сейчас: ${templatesRoot()}).`,
        );
    }
    return true;
}

/** Какие шаблоны доступны, а какие нет — для канареечного отчёта. */
export function templateAvailability(): { available: string[]; missing: string[] } {
    const available: string[] = [];
    const missing: string[] = [];
    for (const id of KNOWN_TEMPLATES) {
        (templateAvailable(id) ? available : missing).push(id);
    }
    return { available, missing };
}
