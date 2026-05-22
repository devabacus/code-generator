import path from 'path';
import { IFileSystem } from '../../../core/interfaces/file_system';
import { DefaultFileSystem } from '../../../core/implementations/default_file_system';
import { GenerationConfig } from '../config/generation_config';
import { getDictionaryRules, DictionaryName } from '../replacement/replacement_util';
import { ReplacingFileProcessor, ReplaceTask, ReplacementRule } from './replacing_file_processor';
import { SectionReplacer } from './section_config';
import { ServerpodModel } from '../parsers/formatters/types';
import { getPathInfo, PathInfo } from '../config/path_handle';
import { FileManifest, MarkerAnalyzer } from './marker_analyzer';
import { allManifests, manifestType } from './manifests';
import { RelationAnalyzer } from '../parsers/relation-analyzer';
import { RelationPatcher } from './relation_patcher';
import { OrchestratorPatcher } from './orchestrator_patcher';
import { scanWithIgnore } from '../../../utils/dir_handle_adv';
import { toSnakeCase, unCap } from '../../../utils/text_work/text_util';

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
     * @param config Конфигурация генерации (какие фичи генерировать, пути и т.д.)
     * @param model Опциональная модель Serverpod (используется для генерации сущностей)
     */
    public async generate(config: GenerationConfig, model?: ServerpodModel): Promise<void> {

        const allPromises: Promise<void>[] = [];
        const directoriesToScan = new Set<string>();

        // Собираем все директории, которые нужно просканировать исходя из выбранных манифестов
        for (const _manifest of config.allManifests) {
            const manifest = allManifests[_manifest as manifestType];
            if (manifest?.scan_dirs) {
                manifest.scan_dirs.forEach(dir => directoriesToScan.add(dir));
            }
        }

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

                // Добавляем задачу обработки файла в очередь
                const relativePath = path.relative(pathInfo.sourceBasePath, templateFullPath).replace(/\\/g, '/');
                const destinationPath = path.join(pathInfo.destinationBasePath, this._getDestinationPath(relativePath, config, model));

                if (processedDestinations.has(destinationPath)) { continue; }
                processedDestinations.add(destinationPath);

                allPromises.push(this._processFile(config, templateFullPath, templateContent, fileManifest, pathInfo, model, destinationPath));
            }
        }

        // Ждем завершения обработки всех файлов
        await Promise.all(allPromises);

        // Если есть модель и в ней найдены связи many-to-one, применяем патчер связей
        if (model && RelationAnalyzer.manyToOneFields(model.fields).length > 0) {
            await this.relationPatcher.patch(config, model);
        }

        // Patch orchestrator: добавление import + entityType + register block в
        // sync_orchestrator_provider.dart. Работает только при entity-based generation
        // (manifest: entity или manyToMany), для startProject — no-op.
        if (model && isEntityBasedGeneration) {
            await this.orchestratorPatcher.patch(config, model);
        }
    }

    /**
     * Обрабатывает отдельный файл шаблона.
     */
    private async _processFile(
        config: GenerationConfig,
        templateFullPath: string,
        templateContent: string,
        fileManifest: FileManifest,
        pathInfo: PathInfo,
        model?: ServerpodModel,
        precomputedDestinationPath?: string
    ): Promise<void> {
        // Вычисляем относительный путь и целевой путь назначения
        const relativePath = path.relative(pathInfo.sourceBasePath, templateFullPath).replace(/\\/g, '/');
        const destinationPath = precomputedDestinationPath || path.join(pathInfo.destinationBasePath, this._getDestinationPath(relativePath, config, model));

        const destinationExists = await this.fileSystem.exists(destinationPath);
        // Проверяем наличие маркера "base", который указывает на то, что нужно объединять контент, а не перезаписывать полностью
        const hasBaseMarker = /(?:\/\/|#) === generated_start:base ===/.test(templateContent);

        // --- СТРАТЕГИЯ 1: СЛИЯНИЕ (MERGE) ---
        // Используется, если файл уже существует и в шаблоне есть блок "base"
        if (destinationExists && hasBaseMarker) {
            const destinationContent = await this.fileSystem.readFile(destinationPath);
            const newContent = this._mergeBaseContent(templateContent, destinationContent, fileManifest, config);
            await this.fileSystem.createFile(destinationPath, newContent);
            return;
        }

        // --- СТРАТЕГИЯ 2: ПОЛНАЯ ЗАМЕНА (FULL REPLACE) ---
        // Определяем словари для замены (либо из файла, либо дефолтные из манифеста)
        const dictionaries = fileManifest.dictionaries.length > 0 ? fileManifest.dictionaries : allManifests[config.allManifests[0]]?.dictionaries || [];
        const rules = getDictionaryRules(dictionaries, config);

        let newContent = templateContent;
        // Применяем текстовые замены на основе словарей
        for (const rule of rules) {
            newContent = newContent.replace(new RegExp(rule.from, 'g'), rule.to);
        }

        // Если файл является шаблонизированным (секции [FOR_EACH_FIELD] и т.д.) и есть модель
        if (fileManifest.isTemplated && model) {
            newContent = this.sectionReplacer.process(newContent, config, model);
        }

        // Создаем папку (если нет) и записываем итоговый файл
        await this.fileSystem.createFolder(path.dirname(destinationPath));
        await this.fileSystem.createFile(destinationPath, newContent);
    }

    /**
     * Сливает обновленный базовый блок из шаблона в существующий файл.
     * Это позволяет сохранять кастомные изменения пользователя вне базового блока.
     */
    private _mergeBaseContent(
        templateContent: string,
        destinationContent: string,
        fileManifest: FileManifest,
        config: GenerationConfig,
    ): string {
        const baseBlockRegex = /((?:\/\/|#) === generated_start:base ===)([\s\S]*?)((?:\/\/|#) === generated_end:base ===)/;

        const templateMatch = templateContent.match(baseBlockRegex);
        if (!templateMatch || typeof templateMatch[2] !== 'string') {
            return destinationContent;
        }
        let newBlockContent = templateMatch[2];

        // К содержимому базового блока также применяем правила замены словарей
        const dictionaries = fileManifest.dictionaries.length > 0 ? fileManifest.dictionaries : allManifests[config.allManifests[0]]?.dictionaries || [];
        const rules = getDictionaryRules(dictionaries, config);

        for (const rule of rules) {
            newBlockContent = newBlockContent.replace(new RegExp(rule.from, 'g'), rule.to);
        }

        // Заменяем блок в существующем файле на новый обработанный блок из шаблона
        const finalContent = destinationContent.replace(
            baseBlockRegex,
            `$1${newBlockContent}$3`
        );

        return finalContent;
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

        // Сентинел `.withif` в имени файла — маркер альтернативного шаблона для
        // взаимоисключающего выбора по `--with-interfaces`. Срезаем его из
        // destination, чтобы `<entity>_repository_impl.withif.dart` лёг в тот же
        // путь, что и базовый `<entity>_repository_impl.dart`. Файл выбирается
        // фильтром `MarkerAnalyzer.matchesInterfaceFlag` ещё до этого шага, так
        // что коллизии destination между вариантами не возникает.
        destinationRelativePath = destinationRelativePath.replace(/\.withif(\.[^.]+)$/, '$1');

        return destinationRelativePath;
    }
}

