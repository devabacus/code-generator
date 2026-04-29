import { Command } from 'commander';
import fs from 'fs/promises';
import { ServerpodYamlParser } from '../../../features/generation/parsers/server_yaml_parser';
import { EntityYamlValidator, ValidationError } from '../../../features/generation/parsers/entity_yaml_validator';
import { GenerationConfig } from '../../../features/generation/config/generation_config';
import { GenerationService } from '../../../features/generation/generators/generation_service';
import { AppDatabaseGenerator } from '../../../features/generation/generators/app_database_generator';
import { DefaultFileSystem } from '../../../core/implementations/default_file_system';
import { TrackingFileSystem } from '../utils/cli_file_system';
import { CliLogger } from '../utils/cli_logger';
import { readStdin } from '../utils/stdin_reader';
import { manifestType } from '../../../features/generation/generators/manifests';

function snakeToCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

interface GenerateEntityOptions {
    yaml?: string;
    stdin?: boolean;
    featurePath: string;
    workspace: string;
    templatesPath: string;
    templProject: string;
    templEntity: string;
    templFeature: string;
    json: boolean;
    human?: boolean;
    skipValidation?: boolean;
}

export function registerGenerateEntity(program: Command): void {
    program
        .command('generate-entity')
        .description('Generate Serverpod entity files from YAML definition')
        .option('--yaml <path>', 'Path to .spy.yaml file')
        .option('--stdin', 'Read YAML from stdin instead of file')
        .requiredOption('--feature-path <path>', 'Target feature directory path')
        .requiredOption('--workspace <path>', 'Workspace root path')
        .option('--templates-path <path>', 'Path to templates', 'G:/Templates')
        .option('--templ-project <id>', 'Template project ID', 't115')
        .option('--templ-entity <name>', 'Template entity placeholder', 'category')
        .option('--templ-feature <name>', 'Template feature name', 'tasks')
        .option('--json', 'Output as JSON (default)', true)
        .option('--human', 'Output as human-readable text')
        .option('--skip-validation', 'Skip pre-flight validation of YAML (6-field pattern, sync-event)', false)
        .action(async (opts: GenerateEntityOptions) => {
            await handleGenerateEntity(opts);
        });
}

async function handleGenerateEntity(opts: GenerateEntityOptions): Promise<void> {
    const jsonMode = !opts.human;
    const logger = new CliLogger(jsonMode);
    const startTime = Date.now();

    try {
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

        const config = new GenerationConfig({
            templProject: opts.templProject,
            workspacesPath: opts.workspace,
            templFeatureName: opts.templFeature,
            targetFeaturePath: opts.featurePath,
            targetEntity: snakeToCamelCase(model.tableName),
            targetEntity1: model.entity1,
            targetEntity2: model.entity2,
            manifest: features,
            templatesPath: opts.templatesPath,
        });

        const inner = new DefaultFileSystem();
        const fileSystem = new TrackingFileSystem(inner, logger);

        logger.info(`Generating files...`);
        const generationService = new GenerationService(fileSystem);
        await generationService.generate(config, model);

        logger.info(`Updating AppDatabase...`);
        const appDatabaseGenerator = new AppDatabaseGenerator(fileSystem, config);
        await appDatabaseGenerator.generate();

        logger.emitResult('generate-entity', true, startTime);
    } catch (error) {
        logger.error(String(error));
        logger.emitResult('generate-entity', false, startTime);
        process.exit(1);
    }
}
