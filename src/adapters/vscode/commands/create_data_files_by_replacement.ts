import { window } from "vscode";
import { ServiceLocator } from "../../../core/services/service_locator";
import { getRootWorkspaceFolders } from "../utils/path_util";
import { pickPath } from "../ui/ui_ask_folder";
import { getDocText } from "../ui/ui_util";
import { AppDatabaseGenerator } from "../../../features/generation/generators/app_database_generator";
import { GenerationService } from "../../../features/generation/generators/generation_service";
import { manifestType } from "../../../features/generation/generators/manifests";
import { GenerationConfig } from "../../../features/generation/config/generation_config";
import { ServerpodYamlParser } from "../../../features/generation/parsers/server_yaml_parser";
import { EntityYamlValidator, ValidationError } from "../../../features/generation/parsers/entity_yaml_validator";

function snakeToCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export async function createDataFilesByReplacement() {
    const fileSystem = ServiceLocator.getInstance().getFileSystem();

    const model = ServerpodYamlParser.parse(getDocText());

    const errors: ValidationError[] = [];
    errors.push(...EntityYamlValidator.validate(model));
    const activeUri = window.activeTextEditor?.document.uri.fsPath;
    if (activeUri) {
        errors.push(...EntityYamlValidator.validateSyncEvent(activeUri, model));
    }
    if (errors.length > 0) {
        const action = await window.showErrorMessage(
            EntityYamlValidator.formatErrors(errors),
            'Generate anyway',
            'Cancel',
        );
        if (action !== 'Generate anyway') { return; }
    }

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
        // TASK-014: prokid'аем PascalCase className для junction — необходимо для
        // правильного rewrite `task_tag_map/` → `<target>/` в `_getDestinationPath`
        // и replacement_util.MANY_TO_MANY (RolePermission case).
        targetJunctionClassName: model.isRelation ? model.className : undefined,
        manifest: features,
        templatesPath: templatesPath
    });

    // TASK-029 Bug 5: explicit scope choice ДО feature pickPath — user может
    // abort'нуть scope раньше, не теряя времени на feature selection. Esc на
    // quickPick = abort с info message. ignoreFocusOut предотвращает silent
    // dismissal при переключении на другие окна.
    const SERVER_SCOPE_CLIENT_ONLY = 'Client only (default)';
    const SERVER_SCOPE_CLIENT_SERVER = 'Client + Server';
    const writeServerChoice = await window.showQuickPick(
        [
            { label: SERVER_SCOPE_CLIENT_ONLY, description: 'Generate Flutter side only — recommended' },
            { label: SERVER_SCOPE_CLIENT_SERVER, description: 'Also write endpoint + sync_event files to <project>_server/' },
        ],
        {
            placeHolder: 'Choose what to generate: client-only (recommended) or client + server',
            ignoreFocusOut: true,
        },
    );
    if (writeServerChoice === undefined) {
        window.showInformationMessage('Generation cancelled (scope not selected)');
        return;
    }
    config.withServer = writeServerChoice.label === SERVER_SCOPE_CLIENT_SERVER;

    const featurePath = await pickPath("Select feature", config.featuresPath);

    if (featurePath) {
        config.targetFeaturePath = featurePath;
    } else { return; }

    const generationService = new GenerationService(fileSystem);
    await generationService.generate(config, model);
    const appDatabaseGenerator = new AppDatabaseGenerator(fileSystem, config);
    await appDatabaseGenerator.generate();
}
