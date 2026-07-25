import { LedgerEntry, sha256 } from './ledger';
import { RegionScan, describeProblems, problemsFor } from './region_parser';

/**
 * TASK-042 / BUG-029 — классификация файла ДО записи (фаза plan).
 *
 * Инвариант «а» (ADR-0007): решение принимается по трём точкам сравнения
 * `existing ↔ ledger ↔ render` и НЕ трогает filesystem. Запись начинается только
 * после того, как классифицированы ВСЕ файлы (см. `GenerationService.generate`).
 */

/**
 * Регионы merge-файла, которыми владеет генератор. Сейчас ровно один — `base`:
 * это единственный регион, который заменяет merge-стратегия
 * (`GenerationService`). Регион `oneToManyMethods` пишет `RelationPatcher`
 * в обход plan/apply — он вне guard'а этой итерации (см. report TASK-042).
 * Список вынесен в константу, чтобы расширение (ownership-директива в шаблонах)
 * не требовало правки логики классификации.
 */
export const MACHINE_OWNED_REGIONS: readonly string[] = ['base'];

export type PlannedAction =
    /** Файла нет — обычное создание. */
    | 'create'
    /** Файл на диске побайтово совпал с ledger — молчаливая перезапись. */
    | 'overwrite-clean'
    /**
     * Писать нечего: на диске уже ровно то, что дал бы render. Нужен только
     * baseline. Два источника: legacy-проект без записи в ledger и запись,
     * разошедшаяся с диском не по вине пользователя (см. `classifyGeneratedFile`).
     */
    | 'seed'
    /** Fail-closed: есть что потерять. */
    | 'conflict';

export type ConflictReason =
    /** `generated`-файл отличается от ledger — правил пользователь. */
    | 'user-modified'
    /** merge-файл: изменён machine-owned регион. */
    | 'region-modified'
    /** Записи в ledger нет и содержимое не совпадает с render. */
    | 'legacy-mismatch'
    /** Шаблон содержит `:base`, а target потерял маркеры (silent staleness). */
    | 'missing-markers'
    /** Маркеры в target дублированы / не закрыты / осиротели. */
    | 'broken-markers';

export interface GenerationConflict {
    /** Project-relative путь (как в ledger). */
    path: string;
    absolutePath: string;
    reason: ConflictReason;
    /** Человекочитаемое объяснение, что именно произошло. */
    message: string;
    /** Компактный diff «на диске → что записал бы генератор». */
    diff: string;
}

export interface Classification {
    action: PlannedAction;
    reason?: ConflictReason;
    message?: string;
}

/**
 * Классификация файла, которым генератор владеет целиком (СТРАТЕГИЯ 2 —
 * 65 из 81 шаблона t115).
 */
export function classifyGeneratedFile(
    existing: string | null,
    render: string,
    entry: LedgerEntry | undefined,
): Classification {
    if (existing === null) {
        return { action: 'create' };
    }

    if (entry && entry.ownership === 'generated') {
        if (sha256(existing) === entry.sha256) {
            // Ключевой анти-prompt-fatigue кейс: render мог измениться (добавили
            // поле в YAML) — это НЕ повод спрашивать, файла никто не касался.
            return { action: 'overwrite-clean' };
        }
        if (existing === render) {
            // Ledger разошёлся с диском НЕ по вине пользователя: на диске
            // побайтово то, что генератор и записал бы, — терять нечего по
            // определению. Такое состояние достижимо без единой ручной правки:
            // `ledger.save()` упал после успешного apply (на Windows `rename`
            // отдаёт EPERM/EBUSY, если файл держит антивирус/индексатор), throw
            // между apply и save (напр. `OrchestratorPatcher` по дизайну бросает
            // при отсутствии маркеров, BUG-025), Ctrl-C в том же промежутке,
            // разрешение git-конфликта в закоммиченном `.codegen/ledger.json`.
            // Требовать здесь деструктивный `--overwrite-existing` значит
            // тренировать рефлекс жать его там, где терять нечего, — ровно тот
            // prompt fatigue, против которого заведён ledger. Пересеиваем
            // baseline: ledger становится самовосстанавливающимся.
            //
            // Ограничение: для сущностей со связями `RelationPatcher` дописывает
            // `:oneToManyMethods` уже ПОСЛЕ apply, поэтому на диске лежит не
            // «чистый» render — самовосстановление там не сработает и устаревшая
            // запись всё же даст конфликт. Генератор в этой точке не может
            // отличить правку патчера от правки пользователя, а fail-closed
            // требует выбрать конфликт.
            return { action: 'seed' };
        }
        return {
            action: 'conflict',
            reason: 'user-modified',
            message: 'файл на диске отличается от последнего машинного вывода — в нём есть ручные правки',
        };
    }

    // Инвариант «в»: записи нет (legacy-проект / первый запуск после апгрейда).
    // Усыновлять existing как generated НЕЛЬЗЯ — внутри может быть custom-код,
    // и на следующем regen `existing == ledger` молча его сотрёт.
    if (existing === render) {
        return { action: 'seed' };
    }
    return {
        action: 'conflict',
        reason: 'legacy-mismatch',
        message: 'нет записи в ledger, а содержимое не совпадает с выводом генератора — неизвестно, есть ли внутри ручные правки',
    };
}

export interface MergeClassificationInput {
    /** Содержимое target-файла; `null` — файла нет. */
    existing: string | null;
    /** Разбор target-файла на регионы (только если `existing !== null`). */
    existingScan: RegionScan | null;
    /** Тела machine-owned регионов после подстановки словарей. */
    renderedRegions: ReadonlyMap<string, string>;
    entry: LedgerEntry | undefined;
}

/**
 * Классификация merge-файла (СТРАТЕГИЯ 1 — 16 из 81 шаблона t115).
 *
 * Сравниваются ТОЛЬКО machine-owned регионы (инвариант «б»): правка в
 * custom-зоне — легальный, обкатанный способ расширения, она не обязана давать
 * conflict. Сломанные / отсутствующие маркеры — conflict независимо от хешей:
 * это тот самый silent staleness, из-за которого файл навсегда переставал
 * получать обновления шаблона.
 */
export function classifyMergeFile(input: MergeClassificationInput): Classification {
    const { existing, existingScan, renderedRegions, entry } = input;

    if (existing === null || existingScan === null) {
        return { action: 'create' };
    }

    for (const name of renderedRegions.keys()) {
        const problems = problemsFor(existingScan, name);
        if (problems.length > 0) {
            return {
                action: 'conflict',
                reason: 'broken-markers',
                message: `marker-разметка региона "${name}" повреждена: ${describeProblems(problems)}`,
            };
        }
        if (!existingScan.regions.has(name)) {
            return {
                action: 'conflict',
                reason: 'missing-markers',
                message:
                    `шаблон содержит регион "${name}", а в файле его маркеров нет — ` +
                    `файл перестал получать обновления шаблона (silent staleness)`,
            };
        }
    }

    if (entry && entry.ownership === 'merge') {
        // Разошёлся ли ledger с диском (см. `classifyGeneratedFile` — тот же
        // список причин) и нужно ли вообще что-то писать.
        let ledgerDiverged = false;
        let everyRegionMatchesRender = true;

        for (const [name, renderedBody] of renderedRegions) {
            const baseline = entry.regions[name];
            const actual = existingScan.regions.get(name)!;
            const matchesRender = actual === renderedBody;
            if (!matchesRender) { everyRegionMatchesRender = false; }

            if (baseline !== undefined && sha256(actual) === baseline) { continue; }

            if (matchesRender) {
                // Тело региона побайтово равно тому, что записал бы генератор:
                // расхождение с ledger'ом — не правка пользователя, а устаревшая
                // запись. Терять нечего, baseline пересеивается ниже.
                ledgerDiverged = true;
                continue;
            }
            if (baseline === undefined) {
                // Регион появился в шаблоне уже после того, как ledger был записан —
                // baseline'а для него нет, усыновлять нельзя (инвариант «в»).
                return {
                    action: 'conflict',
                    reason: 'legacy-mismatch',
                    message: `в ledger нет baseline для региона "${name}" — он появился после последней генерации`,
                };
            }
            return {
                action: 'conflict',
                reason: 'region-modified',
                message: `machine-owned регион "${name}" изменён вручную`,
            };
        }

        // Писать нечего только если КАЖДЫЙ owned-регион уже равен render'у;
        // иначе (часть регионов чиста по ledger'у, но шаблон обновился) merge
        // обязан состояться.
        if (ledgerDiverged && everyRegionMatchesRender) { return { action: 'seed' }; }
        return { action: 'overwrite-clean' };
    }

    // Legacy merge-файл: правило инварианта «в» применяется по каждому
    // owned-региону отдельно. Custom-зоны принимаются без baseline — apply их
    // не заменяет.
    for (const [name, renderedBody] of renderedRegions) {
        if (existingScan.regions.get(name) !== renderedBody) {
            return {
                action: 'conflict',
                reason: 'legacy-mismatch',
                message: `нет записи в ledger, а регион "${name}" не совпадает с выводом генератора`,
            };
        }
    }
    return { action: 'seed' };
}

/**
 * Компактный line-diff «что на диске → что записал бы генератор».
 *
 * Намеренно простой: срезаются общий префикс и общий суффикс строк, печатается
 * середина с ограничением по длине. Полноценный LCS не нужен — задача вывода
 * не «показать минимальный патч», а «дать увидеть, что именно будет потеряно»
 * перед подтверждением.
 */
export function formatConflictDiff(existing: string, incoming: string, maxLines = 20): string {
    if (existing === incoming) { return '(содержимое совпадает)'; }

    const a = existing.split('\n');
    const b = incoming.split('\n');

    let prefix = 0;
    while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) { prefix++; }

    let suffix = 0;
    while (
        suffix < a.length - prefix &&
        suffix < b.length - prefix &&
        a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
    ) { suffix++; }

    const removed = a.slice(prefix, a.length - suffix);
    const added = b.slice(prefix, b.length - suffix);

    const lines: string[] = [`@@ строка ${prefix + 1} @@`];
    const half = Math.max(1, Math.floor(maxLines / 2));

    const pushBlock = (block: string[], sign: string): void => {
        block.slice(0, half).forEach(line => lines.push(`${sign} ${line}`));
        if (block.length > half) {
            lines.push(`${sign} … ещё ${block.length - half} строк(и)`);
        }
    };

    pushBlock(removed, '-');
    pushBlock(added, '+');

    return lines.join('\n');
}

/** Ошибка fail-closed: генерация остановлена до первой записи. */
export class GenerationConflictError extends Error {
    constructor(
        public readonly conflicts: GenerationConflict[],
        public readonly ledgerPath: string,
    ) {
        super(
            `Генерация остановлена: ${conflicts.length} файл(ов) содержат изменения, ` +
            `которые перезапись потеряла бы. Ни один файл не записан.\n` +
            conflicts.map(c => `  - ${c.path} — ${c.message}`).join('\n') +
            `\nПроверь diff, затем повтори с --overwrite-existing (перезапишет ` +
            `перечисленное) либо перенеси свой код за пределы machine-owned зон.`,
        );
        this.name = 'GenerationConflictError';
    }
}

/** Полный человекочитаемый отчёт о конфликтах — CLI/VS Code печатают его как есть. */
export function formatConflictReport(conflicts: GenerationConflict[]): string {
    const header =
        `Обнаружено конфликтов: ${conflicts.length}. ` +
        `Ни один файл НЕ записан (fail-closed preflight, BUG-029).`;
    const body = conflicts
        .map(c => [
            ``,
            `  ✗ ${c.path}`,
            `    причина: ${c.reason} — ${c.message}`,
            ...c.diff.split('\n').map(line => `    ${line}`),
        ].join('\n'))
        .join('\n');
    return `${header}\n${body}`;
}
