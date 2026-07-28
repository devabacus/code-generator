import path from 'path';
import { IFileSystem } from '../../../core/interfaces/file_system';
import { DefaultFileSystem } from '../../../core/implementations/default_file_system';
import { GenerationConfig } from '../config/generation_config';
import { getDictionaryRules, DictionaryName } from '../replacement/replacement_util';
import { ReplacingFileProcessor, ReplaceTask, ReplacementRule } from './replacing_file_processor';
import { SectionReplacer } from './section_config';
import { ServerpodModel } from '../parsers/formatters/types';
import { getPathInfo } from '../config/path_handle';
import { FileManifest, MarkerAnalyzer } from './marker_analyzer';
import { allManifests, manifestType } from './manifests';

/**
 * TASK-029 Bug 5: determines whether a given (manifest, scan_dir) pair должен
 * быть scanned, учитывая `withServer` opt-in.
 *
 * **Design:** explicit blacklist `entity | manyToMany` (а НЕ generic
 * "filter everything except whitelist"). Trade-off:
 *   - **Pro:** новые manifest types (e.g. `softDelete`, `tombstone`) которые
 *     добавятся в `manifests.ts` получают default-safe behaviour — `server/`
 *     scan не блокируется, server bootstrap не ломается accidentally.
 *   - **Con:** если новый manifest type семантически = entity-like (e.g.,
 *     `oneToManyExplicit`), developer **должен** руками добавить его в blacklist —
 *     иначе server writes leak. Добавление нового manifest type требует
 *     code review с заметкой "TASK-029 filter applicability".
 *
 * Для `startProject` exempt оправдано независимо от naming: create-project
 * bootstrap абсолютно требует server baseline (иначе пустой `<project>_server/`).
 *
 * Exported для unit-тестирования (см. `with_server_filter.test.ts`).
 */
export function shouldScanDir(
    manifestName: manifestType,
    dir: string,
    withServer: boolean,
): boolean {
    if (dir === 'server/') {
        const isEntityScan = manifestName === 'entity' || manifestName === 'manyToMany';
        if (isEntityScan && !withServer) {
            return false;
        }
    }
    return true;
}

/**
 * TASK-029 Bug 5: computes effective scan_dirs Set для config'а — применяет
 * `shouldScanDir` filter ко всем manifests + dirs.
 *
 * Exported для unit-тестирования.
 */
export function computeScanDirs(
    manifestNames: readonly manifestType[],
    withServer: boolean,
): Set<string> {
    const result = new Set<string>();
    for (const name of manifestNames) {
        const manifest = allManifests[name];
        if (manifest?.scan_dirs) {
            manifest.scan_dirs.forEach(dir => {
                if (shouldScanDir(name, dir, withServer)) {
                    result.add(dir);
                }
            });
        }
    }
    return result;
}
import { RelationAnalyzer } from '../parsers/relation-analyzer';
import { RelationPatcher } from './relation_patcher';
import { OrchestratorPatcher } from './orchestrator_patcher';
import { scanWithIgnore } from '../../../utils/dir_handle_adv';
import { toSnakeCase, unCap } from '../../../utils/text_work/text_util';
import { CodegenLedger, LedgerOwnership } from './ledger';
import {
    Classification,
    GenerationConflict,
    GenerationConflictError,
    MACHINE_OWNED_REGIONS,
    OverwriteSelection,
    PlannedAction,
    PreservedFiles,
    classifyGeneratedFile,
    classifyMergeFile,
    formatConflictDiff,
    resolveOverwriteSelection,
} from './preflight';
import { ConflictBackup } from './backup';
import { problemsFor, replaceRegionBody, scanRegions } from './region_parser';

/** TASK-042: опции запуска генерации. */
export interface GenerationOptions {
    /**
     * Явное подтверждение перезаписи файлов, в которых preflight нашёл
     * пользовательские правки (CLI `--overwrite-existing`, VS Code confirm).
     * Флаг намеренно узкий: он НЕ отключает preflight и НЕ трогает ничего,
     * кроме перечисленных в отчёте конфликтов.
     *
     * **TASK-043:** гранулярность — по файлу. `true` — все конфликты (историческая
     * форма голого флага), массив project-relative путей — только перечисленные,
     * `false`/`undefined` — ни одного. Не выбранные конфликты сохраняются: файл не
     * трогается И его baseline не сеется в ledger — см. `_recordBaseline`.
     */
    overwriteExisting?: OverwriteSelection;
}

/** TASK-042: результат генерации (фаза apply завершена, ledger записан). */
export interface GenerationResult {
    /** Project-relative пути записанных файлов. */
    written: string[];
    /** Legacy-файлы, совпавшие с render: запись не требовалась, засеян baseline. */
    seeded: string[];
    /** Конфликты, перезаписанные по явному подтверждению. */
    overwritten: GenerationConflict[];
    /**
     * TASK-043: конфликты, оставленные как есть (не попали в выбор). Файлы не
     * тронуты, baseline им НЕ засеян — следующий запуск снова даст конфликт.
     */
    preserved: GenerationConflict[];
    /** TASK-043: каталог копий прежнего содержимого; `undefined` — деструктивных записей не было. */
    backupDir?: string;
    /**
     * TASK-043 (R2-1): гард «не трогать сохранённые файлы». Возвращается наружу,
     * потому что `AppDatabaseGenerator` вызывается адаптерами ПОСЛЕ `generate()`
     * (см. `generate_entity.ts`) — ему нужен тот же гард, а список пропусков
     * должен накапливаться в одном месте, иначе отчёт покажет половину правды.
     */
    preservedFiles: PreservedFiles;
    /** Абсолютный путь к ledger'у. */
    ledgerPath: string;
}

/** TASK-042: единица плана — что и куда будет записано, если apply состоится. */
interface PlannedFile {
    destinationPath: string;
    /** Project-relative путь (ключ ledger'а). */
    relativePath: string;
    ownership: LedgerOwnership;
    /** Итоговое содержимое для записи. */
    content: string;
    action: PlannedAction;
    /** Имена machine-owned регионов (только для `ownership: merge`). */
    ownedRegions: string[];
    conflict?: GenerationConflict;
    /**
     * TASK-043: содержимое на диске на момент plan'а (`null` — файла не было).
     * Нужно фазе apply для backup'а: копия снимается до записи, а перечитывать
     * файл в этот момент нечестно — между plan и apply он мог бы измениться, и
     * в копию попало бы не то, что видел preflight.
     */
    existing: string | null;
}

/**
 * TASK-042: корень целевого проекта — база для project-relative путей ledger'а.
 * `workspacesPath` — то, что передаёт `generate-entity --workspace` и VS Code
 * (корень открытого монорепо); для `create-project` он пуст, там корень —
 * `monoRepoTargetPath`.
 */
export function resolveLedgerRoot(config: GenerationConfig): string {
    return config.workspacesPath && config.workspacesPath.length > 0
        ? config.workspacesPath
        : config.monoRepoTargetPath;
}

/**
 * Сервис для генерации кода.
 * Отвечает за обход директорий, анализ шаблонов и применение правил замены данных.
 */
export class GenerationService {
    private readonly fileSystem: IFileSystem;
    private readonly replacingProcessor: ReplacingFileProcessor;
    private readonly sectionReplacer: SectionReplacer;
    private readonly relationPatcher: RelationPatcher;
    private readonly orchestratorPatcher: OrchestratorPatcher;

    constructor(fileSystem?: IFileSystem) {
        this.fileSystem = fileSystem || new DefaultFileSystem();
        this.replacingProcessor = new ReplacingFileProcessor(this.fileSystem);
        this.sectionReplacer = new SectionReplacer();
        this.relationPatcher = new RelationPatcher(this.fileSystem);
        this.orchestratorPatcher = new OrchestratorPatcher(this.fileSystem);
    }

    /**
     * Основной метод запуска генерации.
     *
     * **TASK-042 / BUG-029 — поток строго двухфазный:**
     *
     * 1. **plan** — вычисляются все destination-пути и всё новое содержимое,
     *    читается existing, каждый файл классифицируется по трём точкам
     *    сравнения (`existing ↔ ledger ↔ render`). Filesystem НЕ меняется.
     * 2. **apply** — записи выполняются, только если конфликтов нет либо
     *    получено явное подтверждение (`options.overwriteExisting`).
     *
     * Раньше проверка «файл существует» жила внутри `_processFile`, который
     * запускался через `Promise.all`: бросок в одном promise не остановил бы
     * остальные и оставил бы полузаписанное дерево. Теперь `Promise.all`
     * остаётся ТОЛЬКО в фазе plan (она read-only).
     *
     * @param config Конфигурация генерации (какие фичи генерировать, пути и т.д.)
     * @param model Опциональная модель Serverpod (используется для генерации сущностей)
     * @param options Подтверждение перезаписи (см. `GenerationOptions`)
     * @throws {GenerationConflictError} если найдены конфликты и подтверждения нет —
     *         до этого момента НИ ОДИН файл не записан.
     */
    public async generate(
        config: GenerationConfig,
        model?: ServerpodModel,
        options: GenerationOptions = {},
    ): Promise<GenerationResult> {

        const ledgerRoot = resolveLedgerRoot(config);
        const ledger = await CodegenLedger.load(this.fileSystem, ledgerRoot);
        const allPromises: Promise<PlannedFile>[] = [];

        // Собираем все директории, которые нужно просканировать исходя из выбранных
        // манифестов. TASK-029 Bug 5: для entity/manyToMany manifests `server/`
        // исключается из scan если `!config.withServer` (least-surprise default —
        // см. `shouldScanDir` docstring).
        const directoriesToScan = computeScanDirs(config.allManifests, config.withServer);

        // Проверяем, идет ли генерация сущностей (entity) или связей Many-to-Many
        const isEntityBasedGeneration = config.allManifests.includes('entity') || config.allManifests.includes('manyToMany');
        const processedDestinations = new Set<string>();

        for (const dir of directoriesToScan) {
            const pathInfo = getPathInfo(config, dir);
            const fullDirSourcePath = pathInfo.sourceBasePath;
            if (!await this.fileSystem.exists(fullDirSourcePath)) { continue; }

            // Рекурсивно сканируем файлы в директории с учетом правил игнорирования
            const filesInDir = await scanWithIgnore(fullDirSourcePath, this.fileSystem);

            for (const templateFullPath of filesInDir) {
                // Фильтрация файлов: если генерируем конкретную сущность, пропускаем файлы, не относящиеся к ней
                if (isEntityBasedGeneration && !config.allManifests.includes('manyToMany') && !templateFullPath.includes(config.templEntity)) { continue; }

                // Пропускаем уже сгенерированные файлы (например, .g.dart или .freezed.dart)
                if (templateFullPath.includes('.g.') || templateFullPath.includes('.freezed.')) { continue; }

                const templateContent = await this.fileSystem.readFile(templateFullPath);
                // Анализируем маркеры внутри файла (например, @manifest, @dictionary)
                const fileManifest = MarkerAnalyzer.analyze(templateContent);

                // Если файл помечен как 'ignore', проверяем, не включен ли он явно в какой-либо манифест
                if (fileManifest.types.includes('ignore')) {
                    const fileName = path.basename(templateFullPath);
                    for (const mName of config.allManifests) {
                        const m = allManifests[mName as manifestType];
                        if (m && (m as any).include_files?.includes(fileName)) {
                            fileManifest.types = [mName as any];
                            break;
                        }
                    }
                }

                // Если файл всё еще в игноре — пропускаем
                if (fileManifest.types.includes('ignore')) { continue; }

                // Проверяем, релевантен ли файл для текущего набора активированных фич
                const isRelevant = config.allManifests.some(feature => fileManifest.types.includes(feature as any));
                if (!isRelevant) { continue; }

                // Взаимоисключающий выбор по флагу --with-interfaces:
                // шаблоны с `flags: withInterfaces` / `withoutInterfaces` фильтруются
                // здесь. Файлы без flags-маркера всегда проходят (backward compat).
                if (!MarkerAnalyzer.matchesInterfaceFlag(fileManifest, config.withInterfaces)) { continue; }

                // BUG-023: ceremony-профиль (`--ceremony full|minimal`, Design 1).
                // Файлы с `flags: fullCeremony` отсекаются при minimal (usecases +
                // usecase-провайдеры + interface-вариант presentation), файлы с
                // `flags: minimalCeremony` (`.minc` presentation, repository-direct)
                // — при full. Файлы без ceremony-флага проходят всегда
                // (datasource-интерфейсы, repository_impl, data_providers — общие для
                // обоих режимов). Default `full` сохраняет исторический t115 output.
                if (!MarkerAnalyzer.matchesCeremonyFlag(fileManifest, config.ceremony)) { continue; }

                // Добавляем задачу обработки файла в очередь
                const relativePath = path.relative(pathInfo.sourceBasePath, templateFullPath).replace(/\\/g, '/');
                const destinationPath = path.join(pathInfo.destinationBasePath, this._getDestinationPath(relativePath, config, model));

                if (processedDestinations.has(destinationPath)) { continue; }
                processedDestinations.add(destinationPath);

                allPromises.push(this._plan(config, templateFullPath, templateContent, fileManifest, ledger, model, destinationPath));
            }
        }

        // ── ФАЗА 1 (plan) — read-only. Ждём классификацию ВСЕХ файлов. ─────────
        const plans = await Promise.all(allPromises);

        const conflicts = plans.filter(p => p.conflict).map(p => p.conflict!);

        // TASK-043: выбор по файлу. Опечатка в списке путей бросает ДО фазы apply —
        // «подтвердил, но не перезаписалось» хуже отказа.
        const confirmed = resolveOverwriteSelection(options.overwriteExisting, conflicts);
        if (conflicts.length > 0 && confirmed.size === 0) {
            // Fail-closed: ни одной записи не было и не будет.
            throw new GenerationConflictError(conflicts, CodegenLedger.filePath(ledgerRoot));
        }

        const overwritten = conflicts.filter(c => confirmed.has(c.path));
        const preserved = conflicts.filter(c => !confirmed.has(c.path));
        const preservedPaths = new Set(preserved.map(c => c.path));
        // TASK-043 R2-1: тот же выбор пользователя, но в форме, понятной писателям
        // в обход plan/apply (они оперируют абсолютными путями).
        const preservedFiles = new PreservedFiles(ledgerRoot, preservedPaths);
        const backup = new ConflictBackup(this.fileSystem, ledgerRoot);

        // ── ФАЗА 2 (apply) — записи. ──────────────────────────────────────────
        const written: string[] = [];
        const seeded: string[] = [];
        for (const plan of plans) {
            if (plan.action === 'seed') {
                // Писать нечего: на диске уже ровно то, что дал бы render.
                seeded.push(plan.relativePath);
                continue;
            }
            if (preservedPaths.has(plan.relativePath)) {
                // TASK-043 preserve: пользователь оставил файл за собой. Не трогаем
                // его и НЕ сеем baseline (см. фазу 3) — иначе следующий regen увидел
                // бы `existing == ledger` и молча стёр custom-код (BUG-029).
                continue;
            }
            if (plan.conflict && plan.existing !== null) {
                // Единственная действительно деструктивная запись за весь прогон:
                // содержимое, отличающееся от машинного вывода, исчезнет. Копия — до
                // записи, иначе сохранять уже нечего.
                await backup.save(plan.relativePath, plan.existing);
            }
            await this.fileSystem.createFolder(path.dirname(plan.destinationPath));
            await this.fileSystem.createFile(plan.destinationPath, plan.content);
            written.push(plan.relativePath);
        }

        // Если есть модель и в ней найдены связи many-to-one, применяем патчер связей.
        // ВНИМАНИЕ (TASK-042 п.7): патчеры пишут в обход plan/apply. Их правки
        // попадают в ledger, потому что baseline снимается с ДИСКА уже после них
        // (иначе каждый regen сущности со связями давал бы ложный конфликт).
        //
        // TASK-043 R2-1: им передаётся `preservedFiles` — без этого «оставить как
        // есть» не было бы preserve: патчер переписывал бы регион в файле, который
        // пользователь явно попросил сохранить, молча и без backup'а (backup
        // снимается только для ПОДТВЕРЖДЁННЫХ конфликтов).
        if (model && RelationAnalyzer.manyToOneFields(model.fields).length > 0) {
            await this.relationPatcher.patch(config, model, preservedFiles);
        }

        // Patch orchestrator: добавление import + entityType + register block в
        // sync_orchestrator_provider.dart. Работает только при entity-based generation
        // (manifest: entity или manyToMany), для startProject — no-op.
        if (model && isEntityBasedGeneration) {
            await this.orchestratorPatcher.patch(config, model, preservedFiles);
        }

        // ── ФАЗА 3 (ledger) — ПОСЛЕДНИМ, атомарно. ────────────────────────────
        // Порядок критичен: ledger, записанный до успешного apply, при падении
        // посередине оставил бы ложное «файл нетронут» — а это опаснее, чем
        // отсутствие baseline.
        for (const plan of plans) {
            if (preservedPaths.has(plan.relativePath)) {
                // Инвариант «в» ADR-0007: preserve НЕ сеет baseline. Здесь это уже
                // не «просто не дошло» (как при полном отказе в TASK-042), а активный
                // пропуск: остальные файлы того же прогона baseline получают.
                continue;
            }
            await this._recordBaseline(ledger, plan);
        }
        await ledger.save();

        return {
            written,
            seeded,
            overwritten,
            preserved,
            backupDir: backup.files.length > 0 ? backup.root : undefined,
            preservedFiles,
            ledgerPath: CodegenLedger.filePath(ledgerRoot),
        };
    }

    /**
     * ФАЗА PLAN для одного файла шаблона: вычисляет destination, новое
     * содержимое и классификацию. **Не производит записей.**
     */
    private async _plan(
        config: GenerationConfig,
        templateFullPath: string,
        templateContent: string,
        fileManifest: FileManifest,
        ledger: CodegenLedger,
        model: ServerpodModel | undefined,
        destinationPath: string,
    ): Promise<PlannedFile> {
        const relativePath = ledger.toRelative(destinationPath);
        const entry = ledger.get(relativePath);

        // Правила замены словарей — общие для обеих стратегий.
        const dictionaries = fileManifest.dictionaries.length > 0
            ? fileManifest.dictionaries
            : allManifests[config.allManifests[0]]?.dictionaries || [];
        const rules = getDictionaryRules(dictionaries, config);
        const applyRules = (text: string): string => {
            let result = text;
            for (const rule of rules) {
                result = result.replace(new RegExp(rule.from, 'g'), rule.to);
            }
            return result;
        };

        // Разбор шаблона на регионы. Порча marker-разметки В ШАБЛОНЕ — ошибка
        // сборки, а не повод молча уйти в полную замену (раньше `_mergeBaseContent`
        // в этом случае тихо возвращал содержимое target-файла).
        const templateScan = scanRegions(templateContent);
        for (const name of MACHINE_OWNED_REGIONS) {
            const templateProblems = problemsFor(templateScan, name);
            if (templateProblems.length > 0) {
                throw new Error(
                    `Шаблон "${templateFullPath}": повреждена marker-разметка региона "${name}". ` +
                    `Генерация остановлена.`,
                );
            }
        }
        const ownedRegions = MACHINE_OWNED_REGIONS.filter(name => templateScan.regions.has(name));
        const ownership: LedgerOwnership = ownedRegions.length > 0 ? 'merge' : 'generated';

        // Полный render (СТРАТЕГИЯ 2): словари + секционные генераторы.
        //
        // Считается ЛЕНИВО: merge-ветка при живом target-файле полного render'а не
        // использует, а `SectionReplacer` на шаблоне с `:base` печатает в stderr
        // «Generator function not found for name: base» — по строке на каждый из 16
        // merge-шаблонов t115. До TASK-042 merge-ветка возвращалась ДО секционных
        // генераторов; ленивое вычисление восстанавливает ровно то поведение.
        let fullRenderCache: string | null = null;
        const fullRender = (): string => {
            if (fullRenderCache === null) {
                let rendered = applyRules(templateContent);
                if (fileManifest.isTemplated && model) {
                    rendered = this.sectionReplacer.process(rendered, config, model);
                }
                fullRenderCache = rendered;
            }
            return fullRenderCache;
        };

        const exists = await this.fileSystem.exists(destinationPath);
        const existing = exists ? await this.fileSystem.readFile(destinationPath) : null;

        // ── generated: генератор владеет файлом целиком ────────────────────────
        if (ownership === 'generated') {
            const rendered = fullRender();
            const classification = classifyGeneratedFile(existing, rendered, entry);
            return this._toPlannedFile({
                destinationPath, relativePath, ownership, ownedRegions,
                content: rendered, existing, classification,
            });
        }

        // ── merge: заменяется только тело machine-owned региона ───────────────
        // Тела регионов рендерятся ТОЛЬКО словарями — так же, как это делал
        // `_mergeBaseContent` до TASK-042 (секционные генераторы к `base` не
        // применяются: в реестре нет генератора с таким именем).
        const renderedRegions = new Map<string, string>();
        for (const name of ownedRegions) {
            renderedRegions.set(name, applyRules(templateScan.regions.get(name)!));
        }

        const existingScan = existing === null ? null : scanRegions(existing);
        const classification = classifyMergeFile({ existing, existingScan, renderedRegions, entry });

        // Содержимое для записи: при здоровых маркерах — слияние (custom-зоны
        // target-файла переносятся дословно); при отсутствующих/битых маркерах
        // подтверждённая перезапись кладёт полный render, восстанавливая разметку.
        const markersUsable = existing !== null
            && classification.reason !== 'missing-markers'
            && classification.reason !== 'broken-markers';

        let content: string;
        if (markersUsable) {
            let merged = existing!;
            for (const [name, body] of renderedRegions) {
                const next = replaceRegionBody(merged, name, body);
                if (next === null) {
                    throw new Error(
                        `Внутренняя ошибка: регион "${name}" в "${destinationPath}" прошёл классификацию, ` +
                        `но не поддался замене.`,
                    );
                }
                merged = next;
            }
            content = merged;
        } else {
            content = fullRender();
        }

        return this._toPlannedFile({
            destinationPath, relativePath, ownership, ownedRegions,
            content, existing, classification,
        });
    }

    private _toPlannedFile(input: {
        destinationPath: string;
        relativePath: string;
        ownership: LedgerOwnership;
        ownedRegions: string[];
        content: string;
        existing: string | null;
        classification: Classification;
    }): PlannedFile {
        const { destinationPath, relativePath, ownership, ownedRegions, content, existing, classification } = input;
        const planned: PlannedFile = {
            destinationPath,
            relativePath,
            ownership,
            ownedRegions,
            content,
            action: classification.action,
            existing,
        };
        if (classification.action === 'conflict') {
            planned.conflict = {
                path: relativePath,
                absolutePath: destinationPath,
                reason: classification.reason!,
                message: classification.message!,
                diff: formatConflictDiff(existing ?? '', content),
            };
        }
        return planned;
    }

    /**
     * Снимает baseline с ДИСКА после завершения apply и патчеров.
     *
     * Почему с диска, а не из `plan.content`: `RelationPatcher` дописывает в те же
     * файлы блок `:oneToManyMethods` уже после apply. Если бы ledger хранил хеш
     * до-патчевого содержимого, следующий regen любой сущности со связями видел
     * бы расхождение и выдавал конфликт на ровном месте.
     *
     * Инвариант «в» («оставить как есть» НЕ сеет baseline) обеспечен раньше и
     * жёстче: неподтверждённый конфликт бросает `GenerationConflictError` до
     * фазы apply, поэтому до записи baseline такой план просто не доживает.
     */
    private async _recordBaseline(ledger: CodegenLedger, plan: PlannedFile): Promise<void> {
        if (!(await this.fileSystem.exists(plan.destinationPath))) {
            return;
        }
        const onDisk = await this.fileSystem.readFile(plan.destinationPath);
        if (plan.ownership === 'generated') {
            ledger.setGenerated(plan.relativePath, onDisk);
            return;
        }
        const scan = scanRegions(onDisk);
        const regions = new Map<string, string>();
        for (const name of plan.ownedRegions) {
            const body = scan.regions.get(name);
            if (body === undefined) {
                // Маркеры не пережили запись — baseline'у неоткуда взяться.
                // Молча писать хеш всего файла нельзя: это объявило бы
                // неизвестное содержимое машинным.
                ledger.remove(plan.relativePath);
                return;
            }
            regions.set(name, body);
        }
        ledger.setMerge(plan.relativePath, regions);
    }

    /**
     * Преобразует относительный путь шаблона в путь назначения,
     * заменяя плейсхолдеры сущности и проекта на реальные имена.
     *
     * **TASK-014:** для junction entities (`model.isRelation === true`) применяем
     * two-entity rewrite — template directory `task_tag_map/` → `<targetSnakeCase>/`
     * и file prefix `task_tag_map_` → `<targetSnakeCase>_`. Также заменяем токены
     * `task` / `tag` (template entity1/entity2) на target FK names. Это закрывает
     * Bomb #2 из TASK-013 adversarial review — non-Map junctions (RolePermission,
     * CustomerUser) больше не получают пути под `task_tag_map/`.
     *
     * Backward compat: TaskTagMap target → `task_tag_map` substitution идентична
     * (no-op replacement). Single-entity rewrite (config.templEntity → targetEntity)
     * остаётся для regular entities — детектится через `model?.isRelation !== true`.
     */
    private _getDestinationPath(relativePath: string, config: GenerationConfig, model?: ServerpodModel): string {
        // Определяем junction context: `model.isRelation` set parser'ом через
        // JunctionDetector (TASK-013). Если model нет (legacy startProject flow) —
        // single-entity rewrite применяется по дефолту.
        const isJunction = model?.isRelation === true;

        let destinationRelativePath = relativePath;

        if (isJunction) {
            // TASK-014: junction-aware two-entity rewrite. Source template path содержит:
            //   - directory `task_tag_map/`
            //   - file prefix `task_tag_map_`
            //   - также fragments `task` / `tag` для FK name references
            // (например `task_tag_map_dao.dart`, `tasks/data/adapters/task_tag_map/...`).
            //
            // Target snake = snake_case(model.className), e.g. `RolePermission` → `role_permission`.
            const tplE1 = toSnakeCase(unCap(config.templEntity1));            // 'task'
            const tplE2 = toSnakeCase(unCap(config.templEntity2));            // 'tag'
            const tplJunctionSnake = `${tplE1}_${tplE2}_map`;                  // 'task_tag_map'

            // Determine target junction snake. Prefer explicit targetJunctionClassName
            // (from `model.className`). Fallback на `<E1>_<E2>_map` shape если class
            // name отсутствует (defensive — не должно случиться при generate-entity flow).
            let targetJunctionSnake: string;
            if (config.targetJunctionClassName && config.targetJunctionClassName.length > 0) {
                targetJunctionSnake = toSnakeCase(unCap(config.targetJunctionClassName));
            } else if (config.targetEntity1 && config.targetEntity2) {
                targetJunctionSnake = `${toSnakeCase(unCap(config.targetEntity1))}_${toSnakeCase(unCap(config.targetEntity2))}_map`;
            } else {
                targetJunctionSnake = tplJunctionSnake;
            }

            const targetE1 = toSnakeCase(unCap(config.targetEntity1 || tplE1));
            const targetE2 = toSnakeCase(unCap(config.targetEntity2 || tplE2));

            // 1) Replace junction directory + file prefix ПЕРВЫМ (длинный токен).
            //    Backward compat: TaskTagMap target → identity replacement.
            destinationRelativePath = destinationRelativePath.replaceAll(tplJunctionSnake, targetJunctionSnake);

            // 2) Replace entity1/entity2 tokens (FK names) в остальных path segments.
            //    Только если они отличаются от template (избегаем no-op).
            //    Use word-boundary-like lookahead на `_`/`/`/`.` чтобы не задеть e.g.
            //    `tasks` (но `task` без следующего символа `s` — заменим).
            if (targetE1 !== tplE1) {
                destinationRelativePath = destinationRelativePath.replace(
                    new RegExp(`${tplE1}(?=_|/|\\.|$)`, 'g'),
                    targetE1,
                );
            }
            if (targetE2 !== tplE2) {
                destinationRelativePath = destinationRelativePath.replace(
                    new RegExp(`${tplE2}(?=_|/|\\.|$)`, 'g'),
                    targetE2,
                );
            }
        } else {
            // BUG-002: пути на диске должны быть snake_case (lower_case_with_underscores).
            // targetEntity приходит как camelCase (например, 'correctionButton'), а имена файлов/папок
            // в Dart-конвенции — snake_case ('correction_button_table.dart', 'correction_button/').
            //
            // TASK-024 Session E3d (defensive guard): когда targetEntity = '' (startProject
            // flow без entity scope — simplified Configuration baseline copies as-is), нельзя
            // делать `replaceAll(templEntity, '')` — это превращает `configuration_dao.dart`
            // → `_dao.dart`. Если targetEntity пустой → пропускаем entity rewrite, файл
            // копируется с template name (Configuration baseline preserved verbatim).
            if (config.targetEntity && config.targetEntity.length > 0) {
                const targetEntitySnake = toSnakeCase(unCap(config.targetEntity));
                destinationRelativePath = relativePath.replaceAll(config.templEntity, targetEntitySnake);
            }
        }

        destinationRelativePath = destinationRelativePath.replaceAll(config.templProject, config.targetProject);

        // Сентинелы `.withif` (--with-interfaces) и `.minc` (BUG-023 ceremony
        // minimal) в имени файла — маркеры альтернативных шаблонов для
        // взаимоисключающего выбора. Срезаем их из destination, чтобы
        // `<entity>_repository_impl.minc.dart` лёг в тот же путь, что и базовый
        // `<entity>_repository_impl.dart`. Нужный вариант уже выбран фильтрами
        // `matchesInterfaceFlag` / `matchesCeremonyFlag` до этого шага, так что
        // коллизии destination между вариантами не возникает.
        destinationRelativePath = destinationRelativePath.replace(/\.(?:withif|minc)(\.[^.]+)$/, '$1');

        return destinationRelativePath;
    }
}

