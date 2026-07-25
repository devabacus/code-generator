import crypto from 'crypto';
import path from 'path';
import { IFileSystem } from '../../../core/interfaces/file_system';

/**
 * TASK-042 / BUG-029 — ledger хешей машинного вывода.
 *
 * **Зачем.** Preflight, сравнивающий только `existing ↔ render`, выдаёт конфликт
 * на КАЖДОМ штатном regen (добавили поле → изменился вывод во всех ~21 файле
 * сущности). Пользователь начинает рефлекторно жать `--overwrite-existing`, и
 * guard перестаёт защищать ровно тогда, когда custom-код действительно есть
 * (prompt fatigue). Ledger даёт недостающую третью точку сравнения — хеш того,
 * что записал сам генератор:
 *
 * | Состояние | Значение | Действие |
 * | --- | --- | --- |
 * | `sha(existing) == ledger` | нетронутый машинный вывод | перезаписать молча |
 * | `sha(existing) != ledger` | пользователь правил файл | conflict, fail-closed |
 * | записи нет | legacy / первый запуск | state machine инварианта «в» |
 *
 * **Инварианты (ADR-0007):**
 * - хеш — точный SHA-256 по UTF-8 содержимому, БЕЗ lossy-нормализации
 *   (в Dart пробелы внутри строковых литералов и комментариев — содержимое;
 *   схлопывание пробелов способно сделать разные программы одинаковыми для
 *   guard'а). Format-on-save иногда даст ложный conflict — безопасная деградация;
 * - для `ownership: merge` хешируются РЕГИОНЫ, не файл целиком — иначе легальная
 *   правка custom-зоны даёт conflict на пустом месте;
 * - пути только project-relative (ledger живёт в git и переезжает с проектом);
 * - файл пишется ПОСЛЕДНИМ и атомарно (temp + rename): ledger, записанный до
 *   успешного apply, при падении оставит ложное «файл нетронут» — а это хуже
 *   отсутствия ledger'а.
 */

export const LEDGER_SCHEMA_VERSION = 1;
export const LEDGER_DIR_NAME = '.codegen';
export const LEDGER_FILE_NAME = 'ledger.json';

export type LedgerOwnership = 'generated' | 'merge';

/** Файл целиком принадлежит генератору — хеш всего содержимого. */
export interface GeneratedLedgerEntry {
    ownership: 'generated';
    sha256: string;
}

/** Merge-файл — хеш каждого machine-owned региона; custom-зоны в ledger не входят. */
export interface MergeLedgerEntry {
    ownership: 'merge';
    regions: Record<string, string>;
}

export type LedgerEntry = GeneratedLedgerEntry | MergeLedgerEntry;

export interface LedgerDocument {
    schemaVersion: number;
    files: Record<string, LedgerEntry>;
}

/**
 * Точный SHA-256 по UTF-8 содержимому. Никакой нормализации (line endings,
 * trailing whitespace, BOM) — см. докстринг модуля.
 */
export function sha256(content: string): string {
    return crypto.createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex');
}

/** Ошибка чтения ledger'а — намеренно громкая (fail-closed, а не «считаем пустым»). */
export class LedgerReadError extends Error {
    constructor(public readonly ledgerPath: string, reason: string) {
        super(
            `Не удалось прочитать ledger "${ledgerPath}": ${reason}. ` +
            `Ledger — baseline машинного вывода; молча считать его пустым нельзя ` +
            `(это увело бы все файлы в legacy-режим). Почини файл или удали его, ` +
            `чтобы пересеять baseline осознанно.`,
        );
        this.name = 'LedgerReadError';
    }
}

function isLedgerEntry(value: unknown): value is LedgerEntry {
    if (!value || typeof value !== 'object') { return false; }
    const entry = value as Record<string, unknown>;
    if (entry.ownership === 'generated') { return typeof entry.sha256 === 'string'; }
    if (entry.ownership === 'merge') {
        const regions = entry.regions;
        if (!regions || typeof regions !== 'object') { return false; }
        return Object.values(regions as Record<string, unknown>).every(v => typeof v === 'string');
    }
    return false;
}

export class CodegenLedger {
    private constructor(
        private readonly fileSystem: IFileSystem,
        /** Корень целевого проекта — база для project-relative путей. */
        public readonly projectRoot: string,
        private readonly document: LedgerDocument,
    ) { }

    /** Абсолютный путь к `<project>/.codegen/ledger.json`. */
    public static filePath(projectRoot: string): string {
        return path.join(projectRoot, LEDGER_DIR_NAME, LEDGER_FILE_NAME);
    }

    /**
     * Читает ledger. Отсутствие файла — НЕ ошибка (первый запуск / legacy-проект),
     * возвращается пустой ledger. Битый JSON или незнакомая `schemaVersion` —
     * ошибка (см. `LedgerReadError`).
     */
    public static async load(fileSystem: IFileSystem, projectRoot: string): Promise<CodegenLedger> {
        const filePath = CodegenLedger.filePath(projectRoot);
        const empty: LedgerDocument = { schemaVersion: LEDGER_SCHEMA_VERSION, files: {} };

        if (!(await fileSystem.exists(filePath))) {
            return new CodegenLedger(fileSystem, projectRoot, empty);
        }

        const raw = await fileSystem.readFile(filePath);
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            throw new LedgerReadError(filePath, `некорректный JSON (${String(error)})`);
        }

        const doc = parsed as Partial<LedgerDocument>;
        if (!doc || typeof doc !== 'object' || typeof doc.schemaVersion !== 'number') {
            throw new LedgerReadError(filePath, 'отсутствует поле schemaVersion');
        }
        if (doc.schemaVersion > LEDGER_SCHEMA_VERSION) {
            throw new LedgerReadError(
                filePath,
                `schemaVersion=${doc.schemaVersion} новее поддерживаемой (${LEDGER_SCHEMA_VERSION}) — обнови codegen`,
            );
        }
        const files: Record<string, LedgerEntry> = {};
        for (const [key, value] of Object.entries(doc.files || {})) {
            if (!isLedgerEntry(value)) {
                throw new LedgerReadError(filePath, `повреждена запись для "${key}"`);
            }
            files[key] = value;
        }

        return new CodegenLedger(fileSystem, projectRoot, { schemaVersion: doc.schemaVersion, files });
    }

    /** Project-relative posix-путь для абсолютного destination. */
    public toRelative(absolutePath: string): string {
        return path.relative(this.projectRoot, absolutePath).replace(/\\/g, '/');
    }

    public get(relativePath: string): LedgerEntry | undefined {
        return this.document.files[relativePath];
    }

    public get size(): number {
        return Object.keys(this.document.files).length;
    }

    /** Записывает baseline файла, который генератор владеет целиком. */
    public setGenerated(relativePath: string, content: string): void {
        this.document.files[relativePath] = { ownership: 'generated', sha256: sha256(content) };
    }

    /** Записывает baseline merge-файла: по хешу на каждый machine-owned регион. */
    public setMerge(relativePath: string, regions: ReadonlyMap<string, string>): void {
        const hashed: Record<string, string> = {};
        for (const [name, body] of regions) {
            hashed[name] = sha256(body);
        }
        this.document.files[relativePath] = { ownership: 'merge', regions: hashed };
    }

    public remove(relativePath: string): void {
        delete this.document.files[relativePath];
    }

    /** Снимок документа (для тестов и диагностики). */
    public snapshot(): LedgerDocument {
        return JSON.parse(JSON.stringify(this.document)) as LedgerDocument;
    }

    /**
     * Сериализация с сортировкой ключей — детерминированный diff в git
     * (порядок обхода шаблонов не должен рождать шум в коммитах).
     */
    public serialize(): string {
        const sortedFiles: Record<string, LedgerEntry> = {};
        for (const key of Object.keys(this.document.files).sort()) {
            const entry = this.document.files[key];
            if (entry.ownership === 'merge') {
                const sortedRegions: Record<string, string> = {};
                for (const region of Object.keys(entry.regions).sort()) {
                    sortedRegions[region] = entry.regions[region];
                }
                sortedFiles[key] = { ownership: 'merge', regions: sortedRegions };
            } else {
                sortedFiles[key] = entry;
            }
        }
        const doc: LedgerDocument = { schemaVersion: LEDGER_SCHEMA_VERSION, files: sortedFiles };
        return JSON.stringify(doc, null, 2) + '\n';
    }

    /**
     * Атомарная запись: temp-файл + rename. Вызывать ПОСЛЕ успешного apply всех
     * файлов — иначе падение посередине оставит ledger, утверждающий «файл
     * нетронут» для того, что записано не было.
     */
    public async save(): Promise<void> {
        const target = CodegenLedger.filePath(this.projectRoot);
        const temp = `${target}.tmp`;
        await this.fileSystem.createFolder(path.dirname(target));
        try {
            await this.fileSystem.createFile(temp, this.serialize());
            await this.fileSystem.rename(temp, target);
        } finally {
            // Успешный rename уносит temp сам; сбой — оставляет. Мусор нельзя
            // держать на диске: `create-project` делает `git add .`, и
            // `.codegen/ledger.json.tmp` (в `.gitignore` его нет) уехал бы в
            // первый коммит проекта. На Windows сбой rename реален — EPERM/EBUSY,
            // если целевой файл держит антивирус/индексатор/редактор.
            await this._discardTemp(temp);
        }
    }

    /**
     * Уборка temp-файла. Ошибки самой уборки глушатся намеренно и только здесь:
     * этот метод вызывается из `finally`, и брошенное отсюда исключение
     * ПОДМЕНИЛО БЫ исходную причину сбоя (та же блокировка, из-за которой упал
     * rename, вероятнее всего не даст и удалить). Диагностика важнее уборки.
     */
    private async _discardTemp(temp: string): Promise<void> {
        try {
            if (await this.fileSystem.exists(temp)) {
                await this.fileSystem.deleteFile(temp);
            }
        } catch {
            // Осознанно проглочено — см. докстринг.
        }
    }
}
