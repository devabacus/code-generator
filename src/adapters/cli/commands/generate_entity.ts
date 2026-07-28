import { Command, Option } from 'commander';
import fs from 'fs/promises';
import { ServerpodYamlParser } from '../../../features/generation/parsers/server_yaml_parser';
import { EntityYamlValidator, ValidationError } from '../../../features/generation/parsers/entity_yaml_validator';
import { GenerationConfig } from '../../../features/generation/config/generation_config';
import { GenerationService } from '../../../features/generation/generators/generation_service';
import {
    GenerationConflictError,
    OverwriteSelection,
    UnknownOverwriteSelectionError,
    formatConflictReport,
    formatOverwriteReport,
    formatPatchSkipReport,
} from '../../../features/generation/generators/preflight';
import { AppDatabaseGenerator } from '../../../features/generation/generators/app_database_generator';
import { DefaultFileSystem } from '../../../core/implementations/default_file_system';
import { TrackingFileSystem } from '../utils/cli_file_system';
import { CliLogger } from '../utils/cli_logger';
import { readStdin } from '../utils/stdin_reader';
import { manifestType } from '../../../features/generation/generators/manifests';
import { resolveTemplateProfile, DEFAULT_TEMPLATE } from '../utils/template_profile';

function snakeToCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

interface GenerateEntityOptions {
    yaml?: string;
    stdin?: boolean;
    featurePath: string;
    workspace: string;
    projectsPath?: string;
    templatesPath: string;
    /** TASK-024 Session E3d / Round 2: --template <name> (default 't115' post-pivot). */
    template?: string;
    templProject?: string;
    templEntity?: string;
    templFeature?: string;
    json: boolean;
    human?: boolean;
    skipValidation?: boolean;
    /** Phase D opt-in: сохранить repository-интерфейс поверх stripped-шаблона. */
    withInterfaces?: boolean;
    /** TASK-029 Bug 5: opt-in server writes (default false, см. CLI flag docstring). */
    withServer?: boolean;
    /** BUG-023: ceremony-профиль (`full` default | `minimal`). */
    ceremony?: 'full' | 'minimal';
    /**
     * TASK-043 R2-3: поля `overwriteExisting` здесь НЕТ намеренно. Значение,
     * которое собирает commander, не различает «список путей» и «голый флаг»
     * достаточно надёжно (см. `resolveOverwriteFlag`), поэтому единственный
     * источник истины — поток событий `option:overwrite-existing`.
     */
}

/**
 * TASK-043: аккумулятор значений `--overwrite-existing`. Принимает и список через
 * запятую, и повторение флага — обе формы естественны для shell'а. Голый флаг
 * сюда не попадает: commander для `[paths]` без значения передаёт `null` и
 * parseArg не вызывает (проверено пробником на commander 14.0.3).
 */
export function collectOverwritePaths(value: string, previous: boolean | string[]): string[] {
    const items = value.split(',').map(item => item.trim()).filter(item => item.length > 0);
    return Array.isArray(previous) ? [...previous, ...items] : items;
}

/**
 * TASK-043 R2-3: смешение голого флага и списка путей в одной команде.
 *
 * Почему отказ, а не «выбрать одно из двух». Пробник на commander 14.0.3:
 * `--overwrite-existing a.dart --overwrite-existing` → `true`, то есть точечный
 * выбор МОЛЧА превращается в тотальную перезапись (реалистично для скрипта-обёртки,
 * дописывающего флаг в конец), а обратный порядок так же молча выбрасывает голый
 * флаг. Обе трактовки — угадывание намерения там, где цена ошибки равна потере
 * кода. Отказ до первой записи стоит пользователю одного повтора команды.
 */
export class ConflictingOverwriteFormsError extends Error {
    constructor(public readonly paths: string[]) {
        super(
            `--overwrite-existing указан и со списком путей (${paths.join(', ')}), и без него. ` +
            `Это два разных действия: список перезаписывает только перечисленное, ` +
            `голый флаг — ВСЕ конфликтующие файлы. Угадывать намерение генератор не будет, ` +
            `ни один файл не записан.\n` +
            `Оставь одну форму: либо --overwrite-existing ${paths.join(',')}, либо голый ` +
            `--overwrite-existing (осознанно, со всеми последствиями).`,
        );
        this.name = 'ConflictingOverwriteFormsError';
    }
}

/**
 * TASK-043 R2-3: сводит поток вхождений флага `--overwrite-existing` в подтверждение.
 *
 * На вход — то, что отдаёт commander событием `option:overwrite-existing`:
 * `null` за голое вхождение, строку за вхождение со значением. Читать
 * `opts.overwriteExisting` нельзя: там уже схлопнутое значение, в котором
 * эскалация «список → всё» неотличима от честного голого флага.
 *
 * @throws {ConflictingOverwriteFormsError} если формы смешаны.
 */
export function resolveOverwriteFlag(occurrences: readonly (string | null)[]): OverwriteSelection {
    if (occurrences.length === 0) { return undefined; }

    const listed = occurrences.filter((value): value is string => value !== null);
    const hasBare = listed.length < occurrences.length;

    let paths: string[] = [];
    for (const raw of listed) { paths = collectOverwritePaths(raw, paths); }

    if (hasBare && listed.length > 0) {
        throw new ConflictingOverwriteFormsError(paths);
    }
    // Голый флаг — историческое «перезаписать все конфликты» (обратная совместимость).
    return hasBare ? true : paths;
}

export function registerGenerateEntity(program: Command): void {
    /**
     * TASK-043 R2-3: каждое вхождение `--overwrite-existing` — `null` за голое,
     * строка за вхождение со значением. Событийный API commander'а — единственная
     * точка, где эти формы ещё различимы (к моменту `.action()` они уже схлопнуты).
     */
    const overwriteOccurrences: (string | null)[] = [];

    const command = program
        .command('generate-entity')
        .description('Generate Serverpod entity files from YAML definition')
        .option('--yaml <path>', 'Path to .spy.yaml file')
        .option('--stdin', 'Read YAML from stdin instead of file')
        .requiredOption('--feature-path <path>', 'Target feature directory path')
        .requiredOption('--workspace <path>', 'Workspace root path')
        .option('--projects-path <path>', 'Base path for projects (overrides default G:/Projects/Flutter/serverpod, used for E2E template re-population)')
        .option('--templates-path <path>', 'Path to templates', 'G:/Templates')
        // TASK-024 Session E3d / Round 2: --template flag — single source of truth.
        // Default = t115 (post-pivot Discussion #12 — 2026-05-04). Defaults для
        // --templ-project/--templ-entity/--templ-feature derive от template profile
        // (override only when caller explicitly passes flag). .choices() validates
        // value на parse step.
        .addOption(
            new Option('--template <name>', 'Template variant: t115 (default) or simplified (opt-in)')
                .choices(['t115', 'simplified'])
                .default(DEFAULT_TEMPLATE),
        )
        .option('--templ-project <id>', 'Override template project directory id (default derived from --template)')
        .option('--templ-entity <name>', 'Override template entity placeholder (default derived from --template)')
        .option('--templ-feature <name>', 'Override template feature name (default derived from --template)')
        .option('--json', 'Output as JSON (default)', true)
        .option('--human', 'Output as human-readable text')
        .option('--skip-validation', 'Skip pre-flight validation of YAML (6-field pattern, sync-event)', false)
        // Phase D opt-in: сохранить repository-интерфейс поверх stripped-шаблона
        // (simplified). Управляет взаимоисключающим выбором шаблонов через
        // `flags: withInterfaces` / `flags: withoutInterfaces` маркеры.
        .option('--with-interfaces', 'Keep repository interface layer (simplified opt-in)', false)
        // TASK-029 Bug 5: opt-in server writes. Default OFF — predotvращает silent
        // scope creep в <project>_server/ (TASK-019 B2 incident: vanilla generate-entity
        // молча модифицировал 6 endpoint'ов + создал snake-дубли). startProject
        // manifest exempt — create-project продолжает генерить server baseline.
        .option('--with-server', 'Also write server-side endpoint/sync_event files (default: client-only). TASK-029: prevents silent scope creep.', false)
        // BUG-023: ceremony-профиль. `full` (default) — исторический t115 layout
        // (usecases + ds-интерфейсы + presentation через usecases). `minimal` —
        // урезанный layout (как в weight): repository-интерфейс сохранён, usecases
        // и ds-интерфейсы не эмитятся, repository_impl/data_providers/presentation
        // ссылаются на конкретный datasource напрямую. Ортогонален --with-interfaces.
        .addOption(
            new Option('--ceremony <profile>', 'Ceremony layers: full (default, usecases+ds-interfaces) or minimal (concrete datasource, no usecases — weight layout)')
                .choices(['full', 'minimal'])
                .default('full'),
        )
        // TASK-042 / BUG-029: узкий флаг подтверждения (НЕ универсальный --force).
        // Без него preflight останавливает генерацию ДО первой записи, если хотя бы
        // один целевой файл содержит правки, которых нет в ledger машинного вывода.
        //
        // TASK-043: значение опционально. Голый флаг = историческое «перезаписать
        // все конфликты» (обратная совместимость с существующими вызовами), со
        // списком project-relative путей — перезаписываются ТОЛЬКО они, остальные
        // конфликты остаются нетронутыми и без baseline в ledger.
        //
        // TASK-043 R2-3: без `parseArg` намеренно — значение читается из потока
        // событий ниже, иначе «список + голый флаг» молча схлопывается в «все».
        .option(
            '--overwrite-existing [paths]',
            'Confirm overwriting files that contain manual edits (BUG-029 preflight). ' +
            'Bare flag = ALL conflicting files; with a comma-separated list of project-relative ' +
            'paths (repeatable) = only those, the rest stay untouched. Mixing both forms is ' +
            'rejected. Previous content is copied to .codegen/backup/<timestamp>/ before every ' +
            'destructive write.',
        )
        .action(async (opts: GenerateEntityOptions) => {
            await handleGenerateEntity(opts, overwriteOccurrences);
        });

    command.on('option:overwrite-existing', (value: string | null) => {
        overwriteOccurrences.push(value === null || value === undefined ? null : String(value));
    });
}

async function handleGenerateEntity(
    opts: GenerateEntityOptions,
    overwriteOccurrences: readonly (string | null)[],
): Promise<void> {
    const jsonMode = !opts.human;
    const logger = new CliLogger(jsonMode);
    const startTime = Date.now();

    try {
        // TASK-043 R2-3: разбор флага — ДО чтения YAML и любой работы: если формы
        // подтверждения смешаны, отказ не должен зависеть от того, дошли ли мы до
        // генерации.
        const overwriteSelection = resolveOverwriteFlag(overwriteOccurrences);

        if (!opts.yaml && !opts.stdin) {
            logger.error('Either --yaml <path> or --stdin is required');
            logger.emitResult('generate-entity', false, startTime);
            process.exit(1);
        }

        const yamlContent = opts.stdin
            ? await readStdin()
            : await fs.readFile(opts.yaml!, 'utf-8');

        logger.info(`Parsing YAML model...`);
        const model = ServerpodYamlParser.parse(yamlContent);
        const features: manifestType[] = model.isRelation ? ['manyToMany'] : ['entity'];

        logger.info(`Entity: ${model.className} (${model.fields.length} fields, relation: ${model.isRelation})`);
        logger.info(`Scope: ${opts.withServer ? 'client + server' : 'client-only (TASK-029 default — use --with-server to also write server-side files)'}`);
        logger.info(`Ceremony: ${opts.ceremony === 'minimal' ? 'minimal (BUG-023 — concrete datasource, no usecases/ds-interfaces)' : 'full (default)'}`);

        if (!opts.skipValidation) {
            const errors: ValidationError[] = [];
            errors.push(...EntityYamlValidator.validate(model));
            if (opts.yaml) {
                errors.push(...EntityYamlValidator.validateSyncEvent(opts.yaml, model));
            }
            if (errors.length > 0) {
                logger.error(EntityYamlValidator.formatErrors(errors));
                logger.error(`Use --skip-validation to bypass at your own risk.`);
                logger.emitResult('generate-entity', false, startTime);
                process.exit(1);
            }
        }

        // TASK-024 Session E3d: resolve template profile (default 'simplified').
        // Каждый --templ-* flag overrides соответствующее поле profile при
        // explicit передаче; иначе используется profile default.
        const templateProfile = resolveTemplateProfile(opts.template);
        const config = new GenerationConfig({
            templProject: opts.templProject || templateProfile.templProject,
            templEntity: opts.templEntity || templateProfile.templEntity,
            templFeatureName: opts.templFeature || templateProfile.templFeatureName,
            templateConfig: templateProfile.templateConfig,
            workspacesPath: opts.workspace,
            projectsPath: opts.projectsPath,
            targetFeaturePath: opts.featurePath,
            targetEntity: snakeToCamelCase(model.tableName),
            targetEntity1: model.entity1,
            targetEntity2: model.entity2,
            // TASK-014: для junction передаём PascalCase className (`RolePermission`)
            // в targetJunctionClassName — это позволяет `_getDestinationPath` +
            // `replacement_util.MANY_TO_MANY` правильно substitut'ить `task_tag_map`
            // → `role_permission` (включая `TaskTagMap` PascalCase в классах).
            targetJunctionClassName: model.isRelation ? model.className : undefined,
            manifest: features,
            templatesPath: opts.templatesPath,
            withInterfaces: opts.withInterfaces,
            withServer: opts.withServer,
            ceremony: opts.ceremony,
        });

        // BUG-015 (TASK-039) loud-guard: junction с parent'ами в разных features
        // резолвится только когда известен featuresPath (нужен config). Проверяем
        // после сборки config, до генерации — громкий отказ вместо broken output.
        if (!opts.skipValidation) {
            const colocationErrors = EntityYamlValidator.validateJunctionColocation(model, config.featuresPath);
            if (colocationErrors.length > 0) {
                logger.error(EntityYamlValidator.formatErrors(colocationErrors));
                logger.error(`Use --skip-validation to bypass at your own risk.`);
                logger.emitResult('generate-entity', false, startTime);
                process.exit(1);
            }
        }

        const inner = new DefaultFileSystem();
        const fileSystem = new TrackingFileSystem(inner, logger);

        // TASK-043: голый флаг — это «перезаписать ВСЁ, что окажется в конфликте».
        // Предупреждение печатается ДО генерации: точное число известно только
        // после plan-фазы, но узнать о масштабе действия постфактум — поздно.
        if (overwriteSelection === true) {
            logger.info(
                `⚠ --overwrite-existing без списка путей: будут перезаписаны ВСЕ конфликтующие файлы ` +
                `(сколько именно и что в них теряется — в отчёте ниже). Нужен выбор по файлу — ` +
                `передай пути: --overwrite-existing <путь1>,<путь2>`,
            );
        }

        logger.info(`Generating files...`);
        const generationService = new GenerationService(fileSystem);
        const result = await generationService.generate(config, model, {
            overwriteExisting: overwriteSelection,
        });
        // TASK-043: с флагом раньше печатались только пути — пользователь не видел,
        // что именно затирает. Теперь тот же diff, что и в отчёте о конфликте.
        if (result.overwritten.length > 0 || result.preserved.length > 0) {
            logger.info(formatOverwriteReport(result.overwritten, result.preserved, result.backupDir));
        }
        logger.info(`Ledger: ${result.ledgerPath} (записано ${result.written.length}, seed ${result.seeded.length})`);

        logger.info(`Updating AppDatabase...`);
        // TASK-043 R2-1: тот же гард, что и у патчеров внутри `generate()` —
        // `AppDatabaseGenerator` тоже пишет в обход plan/apply, только вызывается
        // отсюда. Объект передаётся общий, чтобы список пропусков был один.
        const appDatabaseGenerator = new AppDatabaseGenerator(fileSystem, config);
        await appDatabaseGenerator.generate(result.preservedFiles);

        // TASK-043 R2-1/R2-6: отказ писать — такое же событие, как запись, и
        // сообщается так же явно. Молчаливый пропуск оставил бы пользователя с
        // устаревшим машинным регионом и без единого намёка на это.
        const skipReport = formatPatchSkipReport(result.preservedFiles.skipped);
        if (skipReport.length > 0) { logger.info(skipReport); }

        logger.emitResult('generate-entity', true, startTime);
    } catch (error) {
        // TASK-042 / BUG-029: конфликт preflight — отдельная, читаемая ветка.
        // Ни один файл не записан; выход non-zero, чтобы вызывающий скрипт
        // (или агент) не принял отказ за успех.
        if (error instanceof GenerationConflictError) {
            logger.error(formatConflictReport(error.conflicts));
            // TASK-043 R2-4: готовой строки `--overwrite-existing <ВСЕ пути>` здесь
            // намеренно НЕТ. Скопировать её — значит вернуть ровно то all-or-nothing,
            // ради устранения которого заведена задача; пути уже перечислены в
            // отчёте выше, и выбрать из них — осознанное действие пользователя.
            logger.error(
                `Ledger: ${error.ledgerPath}. Перепроверь diff выше и повтори, перечислив ` +
                `через запятую ТОЛЬКО те файлы (из списка выше), чьи правки не нужны:\n` +
                `  --overwrite-existing <путь1>,<путь2>\n` +
                `Прежнее содержимое перезаписанных файлов уйдёт в .codegen/backup/<timestamp>/. ` +
                `Не перечисленные файлы останутся нетронутыми — их не тронут ни запись, ни патчеры.`,
            );
            logger.emitResult('generate-entity', false, startTime);
            process.exit(1);
        }
        // TASK-043 R2-3: смешение форм подтверждения — отдельная ветка, ни один
        // файл не записан (разбор происходит до генерации).
        if (error instanceof ConflictingOverwriteFormsError) {
            logger.error(error.message);
            logger.emitResult('generate-entity', false, startTime);
            process.exit(1);
        }
        // TASK-043: опечатка в списке путей — отдельная ветка. Ни один файл не
        // записан, сообщение уже содержит перечень доступных конфликтов.
        if (error instanceof UnknownOverwriteSelectionError) {
            logger.error(error.message);
            logger.emitResult('generate-entity', false, startTime);
            process.exit(1);
        }
        logger.error(String(error));
        logger.emitResult('generate-entity', false, startTime);
        process.exit(1);
    }
}
