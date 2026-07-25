/**
 * TASK-042 / BUG-029 — разбор marker-регионов `generated_start:<name>` …
 * `generated_end:<name>` как переиспользуемый helper.
 *
 * До этой задачи разбор жил inline-регуляркой внутри
 * `GenerationService._mergeBaseContent`, и у неё было три проблемы:
 *
 * 1. «маркеров нет вообще» и «маркеры сломаны» не различались — оба случая
 *    молча возвращали содержимое target-файла (третий silent-режим BUG-029,
 *    он же «silent staleness»: файл навсегда переставал получать обновления
 *    шаблона, и никто об этом не узнавал).
 * 2. Дублированный / незакрытый / осиротевший маркер не детектился вовсе —
 *    regex просто брал первое совпадение.
 * 3. Результат нельзя было переиспользовать для хеширования регионов
 *    (инвариант «б» ADR-0007: для merge-файлов хешируются РЕГИОНЫ, не файл
 *    целиком).
 *
 * Парсер намеренно **последовательный, без вложенности**: в шаблонах t115
 * регионы идут строго друг за другом (проверено 2026-07-25 —
 * `task_dao.dart`: `base` 3…178, `oneToManyMethods` 180…196). Вложенный
 * `generated_start` внутри незакрытого региона считается порчей (`unclosed`),
 * а не легальной структурой.
 */

/** Форма порчи marker-разметки. */
export type RegionProblemKind =
    /** Регион с таким именем встречается повторно. */
    | 'duplicate'
    /** `generated_start:X` без парного `generated_end:X`. */
    | 'unclosed'
    /** `generated_end:X` без предшествующего `generated_start:X`. */
    | 'orphanEnd'
    /** `generated_end:Y` закрывает открытый `generated_start:X` (X ≠ Y). */
    | 'mismatched';

export interface RegionProblem {
    kind: RegionProblemKind;
    /**
     * Имя региона, к которому относится проблема. Для `mismatched` — имя
     * ОТКРЫТОГО региона (тот, что пострадал), см. `counterpart`.
     */
    name: string;
    /** Номер строки (1-based) маркера, на котором обнаружена проблема. */
    line: number;
    /**
     * Второе имя, участвующее в проблеме. Сейчас заполняется только для
     * `mismatched`: имя из закрывающего маркера, который закрыл чужой регион.
     * Проблема относится к ОБОИМ именам — `problemsFor` учитывает и это поле,
     * иначе `generated_start:base … generated_end:other` давал бы пустой
     * `problemsFor(scan, 'base')`, и вызывающий сообщал бы «маркеров нет»
     * о файле, в котором `generated_start:base` присутствует.
     */
    counterpart?: string;
}

export interface RegionScan {
    /** Здоровые регионы: имя → тело между маркерами (сами маркеры не входят). */
    regions: Map<string, string>;
    /** Обнаруженные формы порчи. Пустой массив = разметка целостная. */
    problems: RegionProblem[];
    /**
     * Был ли в контенте хотя бы один marker-токен. Отличает
     * «маркеров нет вообще» (`false` + пустые regions/problems) от
     * «маркеры есть, но битые» (`true` + непустой problems).
     */
    hasAnyMarker: boolean;
}

/**
 * Маркер: `// === generated_start:base ===` либо `# === generated_end:base ===`.
 *
 * Пробельные классы намеренно `[ \t]*`, а НЕ `\s*` — `\s` матчит перевод строки
 * и позволил бы «маркеру» растянуться на несколько строк, склеив комментарий
 * с последующим кодом.
 */
const MARKER_REGEX = /(?:\/\/|#)[ \t]*===[ \t]*generated_(start|end):([A-Za-z0-9_.-]+)[ \t]*===/g;

function lineOf(content: string, index: number): number {
    let line = 1;
    for (let i = 0; i < index; i++) {
        if (content.charCodeAt(i) === 10 /* \n */) { line++; }
    }
    return line;
}

/**
 * Разбирает контент на marker-регионы.
 *
 * Тело региона — ровно то, что лежит между концом start-маркера и началом
 * end-маркера (побайтово, без нормализации: см. инвариант «хеш по точному
 * UTF-8 содержимому» в ADR-0007).
 */
export function scanRegions(content: string): RegionScan {
    const regions = new Map<string, string>();
    const problems: RegionProblem[] = [];
    let hasAnyMarker = false;

    let open: { name: string; bodyStart: number; markerIndex: number } | null = null;

    MARKER_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = MARKER_REGEX.exec(content)) !== null) {
        hasAnyMarker = true;
        const kind = match[1];
        const name = match[2];
        const markerStart = match.index;
        const markerEnd = match.index + match[0].length;

        if (kind === 'start') {
            if (open) {
                // Новый start до закрытия предыдущего — предыдущий регион не закрыт.
                problems.push({ kind: 'unclosed', name: open.name, line: lineOf(content, open.markerIndex) });
            }
            if (regions.has(name)) {
                problems.push({ kind: 'duplicate', name, line: lineOf(content, markerStart) });
            }
            open = { name, bodyStart: markerEnd, markerIndex: markerStart };
            continue;
        }

        // kind === 'end'
        if (!open) {
            problems.push({ kind: 'orphanEnd', name, line: lineOf(content, markerStart) });
            continue;
        }
        if (open.name !== name) {
            problems.push({
                kind: 'mismatched',
                name: open.name,
                counterpart: name,
                line: lineOf(content, markerStart),
            });
            open = null;
            continue;
        }
        if (!regions.has(name)) {
            regions.set(name, content.slice(open.bodyStart, markerStart));
        }
        open = null;
    }

    if (open) {
        problems.push({ kind: 'unclosed', name: open.name, line: lineOf(content, open.markerIndex) });
    }

    return { regions, problems, hasAnyMarker };
}

/**
 * Есть ли проблемы, относящиеся к конкретному региону. Учитывается и
 * `counterpart` — проблема вида `mismatched` касается обоих имён сразу.
 */
export function problemsFor(scan: RegionScan, name: string): RegionProblem[] {
    return scan.problems.filter(p => p.name === name || p.counterpart === name);
}

/**
 * Целостен ли конкретный регион: присутствует ровно один раз и не задет
 * ни одной формой порчи.
 */
export function isRegionHealthy(scan: RegionScan, name: string): boolean {
    return scan.regions.has(name) && problemsFor(scan, name).length === 0;
}

/**
 * Заменяет тело региона `name`, сохраняя сами маркеры и весь остальной контент
 * дословно. Возвращает `null`, если регион отсутствует или повреждён — вызывающий
 * обязан обработать это как конфликт (fail-closed), а не молча вернуть исходник.
 */
export function replaceRegionBody(content: string, name: string, newBody: string): string | null {
    const scan = scanRegions(content);
    if (!isRegionHealthy(scan, name)) { return null; }

    MARKER_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    let bodyStart = -1;
    while ((match = MARKER_REGEX.exec(content)) !== null) {
        if (match[2] !== name) { continue; }
        if (match[1] === 'start') {
            bodyStart = match.index + match[0].length;
            continue;
        }
        if (bodyStart >= 0) {
            return content.slice(0, bodyStart) + newBody + content.slice(match.index);
        }
    }
    return null;
}

/** Человекочитаемое описание порчи — для сообщения о конфликте. */
export function describeProblems(problems: RegionProblem[]): string {
    return problems
        .map(p => {
            switch (p.kind) {
                case 'duplicate': return `дублирован маркер "${p.name}" (строка ${p.line})`;
                case 'unclosed': return `не закрыт маркер "${p.name}" (строка ${p.line})`;
                case 'orphanEnd': return `generated_end:${p.name} без открывающего маркера (строка ${p.line})`;
                case 'mismatched':
                    return `generated_end:${p.counterpart} закрывает открытый регион "${p.name}" (строка ${p.line})`;
            }
        })
        .join('; ');
}
