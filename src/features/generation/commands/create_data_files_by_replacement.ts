import { ServiceLocator } from "../../../core/services/service_locator";
import { getRootWorkspaceFolders } from "../../../utils/path_util";
import { pickPath } from "../../../utils/ui/ui_ask_folder";
import { getDocText } from "../../../utils/ui/ui_util";
import { AppDatabaseGenerator } from "../generators/app_database_generator";
import { GenerationService } from "../generators/generation_service";
import { manifestType } from "../generators/manifests";
import { GenerationConfig } from "../config/generation_config";
import { ServerpodYamlParser } from "../parsers/server_yaml_parser";

function snakeToCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export async function createDataFilesByReplacement() {
    const fileSystem = ServiceLocator.getInstance().getFileSystem();

    const model = ServerpodYamlParser.parse(getDocText());
    const features: manifestType[] = model.isRelation ? ['manyToMany'] : ['entity'];

    const workspacePath = getRootWorkspaceFolders();

    const templatesPath = ServiceLocator.getInstance().getTemplatesPath();
    const config = new GenerationConfig({
        templProject: 't115',
        workspacesPath: workspacePath,
        templFeatureName: 'tasks',
        targetFeaturePath: 'configuration',
        targetEntity: snakeToCamelCase(model.tableName),
        targetEntity1: model.entity1,
        targetEntity2: model.entity2,
        manifest: features,
        templatesPath: templatesPath
    });

    const featurePath = await pickPath("Select feature", config.featuresPath);

    if (featurePath) {
        config.targetFeaturePath = featurePath;
    } else { return; }

    const generationService = new GenerationService(fileSystem);
    await generationService.generate(config, model);
    const appDatabaseGenerator = new AppDatabaseGenerator(fileSystem, config);
    await appDatabaseGenerator.generate();
}
