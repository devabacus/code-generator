import path from 'path';
import { IFileSystem } from '../../../core/interfaces/file_system';
import { LEDGER_DIR_NAME } from './ledger';

/**
 * TASK-043 / BUG-029 follow-up — копия прежнего содержимого ПЕРЕД деструктивной
 * перезаписью.
 *
 * **Зачем.** Ledger хранит только хеши: подтвердив перезапись, пользователь терял
 * код безвозвратно — «отменить» было нечем, а `git` спасает лишь то, что успели
 * закоммитить. Backup закрывает ровно этот разрыв: до записи каждого
 * ПОДТВЕРЖДЁННОГО конфликта прежнее содержимое кладётся в
 * `<project>/.codegen/backup/<timestamp>/<project-relative путь>`.
 *
 * **Почему именно `.codegen/`.** Каталог уже принадлежит генератору (там живёт
 * `ledger.json`), он один на монорепо и переезжает вместе с проектом. Альтернативы
 * отвергнуты: системный temp — теряется при уборке и не переживает перезагрузку
 * (а именно там пользователь будет искать пропавший код через час); каталог рядом
 * с файлом (`*.bak`) — засоряет дерево исходников и попадает под анализаторы
 * (`flutter analyze` увидел бы `.dart`-дубликаты); отдельный корень вне проекта —
 * теряет связь с проектом при переносе.
 *
 * **Почему бэкапятся ТОЛЬКО подтверждённые конфликты.** Остальные записи не
 * разрушают ничего: `create` — файла не было, `overwrite-clean` — на диске
 * побайтово прежний машинный вывод (его копия ничего не сохраняет), `seed` — записи
 * вообще нет. Бэкапить их значило бы плодить сотни копий на каждый штатный regen.
 *
 * **git.** Каталог прячется вложенным `.codegen/.gitignore` со строкой `backup/`.
 * Именно вложенным, а не правкой корневого `.gitignore` проекта: корневой —
 * территория пользователя (и часть шаблона), а `ledger.json` обязан остаться под
 * контролем git (ADR-0007), поэтому игнорировать весь `.codegen/` нельзя.
 */

export const BACKUP_DIR_NAME = 'backup';
export const BACKUP_IGNORE_LINE = 'backup/';

const BACKUP_IGNORE_BLOCK = [
    '# TASK-043: копии файлов, перезаписанных с подтверждением (--overwrite-existing).',
    '# Локальная страховка на случай «передумал» — не артефакт проекта.',
    '# ledger.json намеренно НЕ игнорируется: baseline машинного вывода живёт в git (ADR-0007).',
    BACKUP_IGNORE_LINE,
    '',
].join('\n');

/**
 * Метка запуска для каталога копий: `YYYYMMDD-HHmmss-SSS`. Миллисекунды нужны,
 * чтобы два прогона в одну секунду не смешали свои копии в одном каталоге.
 * Лексикографический порядок совпадает с хронологическим — каталоги сортируются
 * сами.
 */
export function backupStamp(now: Date = new Date()): string {
    const pad = (value: number, width = 2): string => String(value).padStart(width, '0');
    return (
        `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
        `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-` +
        `${pad(now.getMilliseconds(), 3)}`
    );
}

/**
 * Приводит project-relative путь к форме, которая гарантированно остаётся ВНУТРИ
 * каталога копий.
 *
 * Защита не теоретическая: ключ ledger'а вычисляется через `path.relative`, и при
 * `--feature-path` вне `--workspace` он принимает вид `../../…` (известное
 * ограничение, TASK-045). Без нормализации `path.join(backupRoot, '../../x')`
 * записал бы «копию» поверх живого дерева — то есть механизм страховки сам стал бы
 * разрушителем. Сегменты `..` заменяются на `__`, корень и буква диска срезаются:
 * путь остаётся читаемым, но перестаёт быть навигацией вверх.
 */
export function sanitizeBackupRelativePath(relativePath: string): string {
    const segments = relativePath
        .replace(/\\/g, '/')
        .split('/')
        .filter(segment => segment.length > 0 && segment !== '.')
        .map(segment => (segment === '..' ? '__' : segment.replace(/:/g, '')));
    return segments.join('/');
}

/** Каталог копий одного запуска. Создаётся лениво — при первой реальной копии. */
export class ConflictBackup {
    private readonly codegenDir: string;
    private readonly _root: string;
    private readonly saved: string[] = [];
    private ignoreEnsured = false;

    constructor(
        private readonly fileSystem: IFileSystem,
        projectRoot: string,
        stamp: string = backupStamp(),
    ) {
        this.codegenDir = path.join(projectRoot, LEDGER_DIR_NAME);
        this._root = path.join(this.codegenDir, BACKUP_DIR_NAME, stamp);
    }

    /** Абсолютный путь каталога копий этого запуска. */
    public get root(): string {
        return this._root;
    }

    /** Project-relative пути, копии которых сохранены (пусто — каталог не создавался). */
    public get files(): readonly string[] {
        return this.saved;
    }

    /**
     * Кладёт копию. Вызывать СТРОГО до записи нового содержимого: копия, сделанная
     * после, сохраняет уже затёртый файл.
     */
    public async save(relativePath: string, content: string): Promise<string> {
        await this._ensureIgnore();
        const destination = path.join(this._root, sanitizeBackupRelativePath(relativePath));
        await this.fileSystem.createFolder(path.dirname(destination));
        await this.fileSystem.createFile(destination, content);
        this.saved.push(relativePath);
        return destination;
    }

    /**
     * Гарантирует, что `backup/` не уедет в git. Существующий `.codegen/.gitignore`
     * НЕ затирается (там могут быть строки пользователя) — недостающая строка
     * дописывается.
     */
    private async _ensureIgnore(): Promise<void> {
        if (this.ignoreEnsured) { return; }
        this.ignoreEnsured = true;

        const ignorePath = path.join(this.codegenDir, '.gitignore');
        await this.fileSystem.createFolder(this.codegenDir);

        if (!(await this.fileSystem.exists(ignorePath))) {
            await this.fileSystem.createFile(ignorePath, BACKUP_IGNORE_BLOCK);
            return;
        }

        const current = await this.fileSystem.readFile(ignorePath);
        const alreadyIgnored = current
            .split(/\r?\n/)
            .some(line => line.trim() === BACKUP_IGNORE_LINE || line.trim() === '/' + BACKUP_IGNORE_LINE);
        if (alreadyIgnored) { return; }

        const separator = current.length === 0 || current.endsWith('\n') ? '' : '\n';
        await this.fileSystem.createFile(ignorePath, `${current}${separator}\n${BACKUP_IGNORE_BLOCK}`);
    }
}
