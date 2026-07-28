import path from 'path';
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
            `\nПроверь diff, затем повтори с --overwrite-existing <пути через запятую> ` +
            `(перезапишет ТОЛЬКО перечисленное, прежнее содержимое уйдёт в ` +
            `.codegen/backup/) либо перенеси свой код за пределы machine-owned зон. ` +
            `⚠ Голый --overwrite-existing без списка снесёт все ${conflicts.length} разом — ` +
            `это то самое all-or-nothing, от которого спасает список.`,
        );
        this.name = 'GenerationConflictError';
    }
}

/**
 * TASK-043: подтверждение перезаписи. `true` — все конфликты (историческая форма
 * голого `--overwrite-existing`), массив project-relative путей — только
 * перечисленные, `false`/`undefined` — ни одного (fail-closed).
 */
export type OverwriteSelection = boolean | readonly string[] | undefined;

/**
 * Приводит путь из пользовательского ввода к форме ключа ledger'а: разделители
 * в posix, без `./` и без обрамляющих пробелов. Абсолютные пути не «схлопываются» —
 * они сопоставляются отдельно (см. `resolveOverwriteSelection`).
 */
export function normalizeSelectionPath(raw: string): string {
    return raw.trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Опечатка в списке путей. Молчаливый пропуск здесь недопустим: пользователь
 * уверен, что подтвердил перезапись файла, а тот остался бы в конфликте — и
 * следующий прогон снова упал бы, теперь уже необъяснимо.
 */
export class UnknownOverwriteSelectionError extends Error {
    constructor(
        public readonly unknownPaths: string[],
        public readonly availablePaths: string[],
    ) {
        const available = availablePaths.length > 0
            ? `Доступные конфликты:\n${availablePaths.map(p => `  - ${p}`).join('\n')}`
            : `Конфликтов не обнаружено вовсе — перезаписывать нечего, убери флаг ` +
              `(это нормальное состояние, если файлы уже были перезаписаны прошлым запуском).`;
        super(
            `--overwrite-existing: путей нет среди конфликтов — ` +
            `${unknownPaths.map(p => `"${p}"`).join(', ')}. Ни один файл не записан.\n` +
            available,
        );
        this.name = 'UnknownOverwriteSelectionError';
    }
}

/**
 * Разрешает выбор пользователя в множество project-relative путей, которые
 * РАЗРЕШЕНО перезаписать. Всё, что не попало в множество, — preserve: файл не
 * трогается и его baseline не сеется (инвариант «в» ADR-0007).
 *
 * Пустой массив НЕ означает «перезаписать всё»: подтверждено ноль файлов —
 * значит подтверждения нет, и вызывающий обязан остаться в fail-closed. Это
 * прикрывает `--overwrite-existing "$FILES"` с незаполненной переменной.
 *
 * @throws {UnknownOverwriteSelectionError} если хоть один путь не найден среди конфликтов.
 */
export function resolveOverwriteSelection(
    selection: OverwriteSelection,
    conflicts: readonly GenerationConflict[],
): Set<string> {
    if (selection === true) {
        return new Set(conflicts.map(c => c.path));
    }
    if (selection === false || selection === undefined) {
        return new Set();
    }

    // И project-relative (то, что печатает отчёт), и абсолютный путь (то, что
    // под рукой у пользователя из редактора) ведут к одному ключу ledger'а.
    const index = new Map<string, string>();
    for (const conflict of conflicts) {
        index.set(normalizeSelectionPath(conflict.path), conflict.path);
        index.set(normalizeSelectionPath(conflict.absolutePath), conflict.path);
    }

    const confirmed = new Set<string>();
    const unknown: string[] = [];
    for (const raw of selection) {
        const key = normalizeSelectionPath(raw);
        if (key.length === 0) { continue; }
        const match = index.get(key);
        if (match === undefined) {
            unknown.push(raw);
            continue;
        }
        confirmed.add(match);
    }

    if (unknown.length > 0) {
        throw new UnknownOverwriteSelectionError(unknown, conflicts.map(c => c.path));
    }
    return confirmed;
}

/**
 * TASK-043 (R2-1): запрет на запись в файлы, которые пользователь оставил за собой.
 *
 * **Зачем отдельный объект, а не просто `Set<string>`.** Фаза apply — не
 * единственный писатель за прогон: `RelationPatcher`, `OrchestratorPatcher` и
 * `AppDatabaseGenerator` пишут в обход plan/apply (BUG-030) и оперируют
 * АБСОЛЮТНЫМИ путями, а выбор пользователя выражен в ключах ledger'а
 * (project-relative). Гард держит и корень проекта, и множество ключей, поэтому
 * каждому писателю достаточно одной строки `if (preserved.blocks(abs)) ...`.
 *
 * **Почему пропуск, а не перезапись и не отказ.** Пропуск оставляет файл
 * несогласованным (регион патчера остаётся от прошлой генерации). Это видимое
 * несоответствие — и оно предпочтительнее тихой потери кода, ради которой
 * пользователь и выбрал preserve. Отказать всему прогону тоже нельзя: остальные
 * подтверждённые файлы уже записаны фазой apply, откатывать их нечем.
 *
 * Каждый отказ ЗАПИСЫВАЕТСЯ (`skipped`): молчаливый пропуск — это тот же обман,
 * что и молчаливая запись, только в другую сторону. Вызывающий обязан показать
 * список пользователю.
 */
export class PreservedFiles {
    private readonly skippedPaths = new Set<string>();

    constructor(
        /** Корень проекта — база project-relative ключей (см. `resolveLedgerRoot`). */
        private readonly projectRoot: string,
        /** Project-relative пути, запись в которые запрещена. */
        private readonly paths: ReadonlySet<string>,
    ) { }

    /** Пустой гард: ничего не сохраняем — все писатели работают как раньше. */
    public static none(): PreservedFiles {
        return new PreservedFiles('', new Set());
    }

    public static from(projectRoot: string, paths: readonly string[]): PreservedFiles {
        return new PreservedFiles(projectRoot, new Set(paths));
    }

    public get isEmpty(): boolean {
        return this.paths.size === 0;
    }

    /**
     * `true` — писать в этот абсолютный путь запрещено (и факт отказа записан).
     * Вызывать ПЕРЕД записью, а не после: смысл гарда в том, чтобы записи не было.
     */
    public blocks(absolutePath: string): boolean {
        if (this.paths.size === 0) { return false; }
        const relative = path.relative(this.projectRoot, absolutePath).replace(/\\/g, '/');
        if (!this.paths.has(relative)) { return false; }
        this.skippedPaths.add(relative);
        return true;
    }

    /** Project-relative пути, запись в которые была отклонена (для отчёта пользователю). */
    public get skipped(): string[] {
        return [...this.skippedPaths].sort();
    }
}

/**
 * TASK-043 (R2-1/R2-6): предупреждение о том, что осталось несогласованным.
 * Пустая строка — если пропусков не было; вызывающий печатает как есть.
 */
export function formatPatchSkipReport(skipped: readonly string[]): string {
    if (skipped.length === 0) { return ''; }
    return [
        `Пропущено дописывание машинных регионов в сохранённых файлах: ${skipped.length}.`,
        ...skipped.map(p => `  ∅ ${p}`),
        `Эти файлы не тронуты вообще — значит их machine-owned регионы ` +
        `(:oneToManyMethods и т.п.) остались от прошлой генерации и могут быть устаревшими. ` +
        `Это осознанный размен: видимое несоответствие лучше тихой потери твоего кода. ` +
        `Чтобы согласовать — перенеси свой код за пределы машинных регионов и повтори ` +
        `с --overwrite-existing <этот путь>.`,
    ].join('\n');
}

/** Блок с diff'ом по каждому файлу — общий для отчёта о конфликте и о перезаписи. */
function formatConflictEntries(conflicts: readonly GenerationConflict[], marker: string): string {
    return conflicts
        .map(c => [
            ``,
            `  ${marker} ${c.path}`,
            `    причина: ${c.reason} — ${c.message}`,
            ...c.diff.split('\n').map(line => `    ${line}`),
        ].join('\n'))
        .join('\n');
}

/** Полный человекочитаемый отчёт о конфликтах — CLI/VS Code печатают его как есть. */
export function formatConflictReport(conflicts: GenerationConflict[]): string {
    const header =
        `Обнаружено конфликтов: ${conflicts.length}. ` +
        `Ни один файл НЕ записан (fail-closed preflight, BUG-029).`;
    return `${header}\n${formatConflictEntries(conflicts, '✗')}`;
}

/**
 * TASK-043: отчёт ПОДТВЕРЖДЁННОГО запуска. Печатает тот же diff, что и отчёт о
 * конфликте: раньше с флагом выводились только пути, и пользователь узнавал,
 * что именно затёр, только из `git diff` (а без коммита — никогда).
 */
export function formatOverwriteReport(
    overwritten: readonly GenerationConflict[],
    preserved: readonly GenerationConflict[],
    backupDir: string | undefined,
): string {
    const lines: string[] = [];

    if (overwritten.length > 0) {
        lines.push(
            `Перезаписано по явному подтверждению: ${overwritten.length}. ` +
            `Прежнее содержимое сохранено: ${backupDir ?? '(backup не создан)'}`,
        );
        lines.push(formatConflictEntries(overwritten, '⤳'));
    }

    if (preserved.length > 0) {
        // TASK-043 R2-6: формулировка проверяема — «не тронуты» держится не только
        // фазой apply, но и гардом `PreservedFiles` для писателей в обход plan/apply
        // (relation/orchestrator патчеры, AppDatabaseGenerator).
        lines.push(
            `\nОставлено как есть: ${preserved.length}. Эти файлы не записывались ни фазой ` +
            `apply, ни патчерами; baseline в ledger им НЕ засеян — следующий запуск снова ` +
            `покажет их как конфликт (это защита, а не сбой).`,
        );
        lines.push(...preserved.map(c => `  = ${c.path} — ${c.reason}`));
    }

    return lines.join('\n');
}
