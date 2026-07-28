import { window } from "vscode";
import { ServiceLocator } from "../../../core/services/service_locator";
import { getRootWorkspaceFolders } from "../utils/path_util";
import { pickPath } from "../ui/ui_ask_folder";
import { getDocText } from "../ui/ui_util";
import { AppDatabaseGenerator } from "../../../features/generation/generators/app_database_generator";
import { GenerationResult, GenerationService } from "../../../features/generation/generators/generation_service";
import {
    GenerationConflictError,
    UnknownOverwriteSelectionError,
    formatPatchSkipReport,
} from "../../../features/generation/generators/preflight";
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

    // TASK-042 / BUG-029: preflight fail-closed. Если target-файлы содержат правки,
    // которых нет в ledger машинного вывода, generate() бросает ДО первой записи.
    // TASK-043: выбор — по файлу. Ни одна галочка не стоит по умолчанию: значение
    // по умолчанию обязано быть безопасным (сохранить), а не разрушительным.
    let result: GenerationResult;
    try {
        result = await generationService.generate(config, model);
    } catch (error) {
        if (!(error instanceof GenerationConflictError)) { throw error; }

        const picked = await window.showQuickPick(
            error.conflicts.map(c => ({
                label: c.path,
                description: c.reason,
                detail: c.message,
            })),
            {
                canPickMany: true,
                ignoreFocusOut: true,
                title: `Файлы с ручными правками: ${error.conflicts.length}. Ничего пока не записано.`,
                placeHolder:
                    'Отметь ТОЛЬКО те файлы, которые можно перезаписать (прежнее содержимое уйдёт ' +
                    'в .codegen/backup/). Неотмеченные не тронет ни запись, ни патчеры. Esc — отменить.',
            },
        );

        // Esc → undefined, «ок» без единой галочки → []. Оба случая означают
        // «перезаписывать нечего»; продолжать генерацию после этого нельзя —
        // прежний контракт команды: отмена = ни один файл не изменён.
        if (picked === undefined || picked.length === 0) {
            window.showInformationMessage('Генерация отменена — ни один файл не изменён');
            return;
        }

        // TASK-043 R2-5: второй вызов обязан иметь собственную обработку. Он живёт
        // ВНУТРИ catch, своего try раньше не имел — и любая ошибка отсюда уходила
        // сырым исключением («command resulted in an error»). Сценарий достижим без
        // экзотики: QuickPick не показывает diff, пользователь уходит смотреть файлы
        // в редакторе, format-on-save устраняет конфликт — и подтверждённый путь
        // больше не значится конфликтом.
        try {
            result = await generationService.generate(config, model, {
                overwriteExisting: picked.map(item => item.label),
            });
        } catch (retryError) {
            if (retryError instanceof UnknownOverwriteSelectionError) {
                window.showErrorMessage(
                    'Набор конфликтов изменился, пока был открыт список (файлы правились в редакторе?). ' +
                    'Ни один файл не изменён — запусти генерацию заново. ' +
                    `Подробности: ${retryError.message}`,
                );
                return;
            }
            if (retryError instanceof GenerationConflictError) {
                window.showErrorMessage(
                    'Между показом списка и подтверждением появились новые конфликты — ' +
                    'ни один файл не изменён. Запусти генерацию заново.',
                );
                return;
            }
            window.showErrorMessage(`Генерация прервана: ${String(retryError)}`);
            return;
        }

        const preservedNote = result.preserved.length > 0
            ? ` Оставлено как есть: ${result.preserved.length} (не тронуты ни записью, ни патчерами, ` +
              `baseline им не засеян — при следующей генерации они снова попадут в этот список).`
            : '';
        window.showInformationMessage(
            `Перезаписано файлов: ${result.overwritten.length}. ` +
            `Копии прежнего содержимого: ${result.backupDir ?? '—'}.${preservedNote}`,
        );
    }

    // TASK-043 R2-1: `AppDatabaseGenerator` тоже пишет в обход plan/apply — ему
    // передаётся тот же гард, иначе `database.dart`, оставленный пользователю,
    // был бы перезаписан вопреки выбору.
    const appDatabaseGenerator = new AppDatabaseGenerator(fileSystem, config);
    await appDatabaseGenerator.generate(result.preservedFiles);

    const skipReport = formatPatchSkipReport(result.preservedFiles.skipped);
    if (skipReport.length > 0) { window.showWarningMessage(skipReport); }
}
