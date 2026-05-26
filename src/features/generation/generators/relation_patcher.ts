import path from 'path';
import { IFileSystem } from '../../../core/interfaces/file_system';
import { GenerationConfig } from '../config/generation_config';
import { getDictionaryRules } from '../replacement/replacement_util';
import { ServerpodModel } from '../parsers/formatters/types';
import { getPathInfo } from '../config/path_handle';
import { RelationAnalyzer } from '../parsers/relation-analyzer';
import { JunctionDetector } from '../parsers/junction_detector';
import { DictionaryPresets } from '../replacement/dictionary_presets';
import { toSnakeCase, unCap, cap } from '../../../utils/text_work/text_util';

export class RelationPatcher {
    constructor(private fileSystem: IFileSystem) { }

    public async patch(config: GenerationConfig, model: ServerpodModel): Promise<void> {
        console.log('Relations detected, starting patching process...');

        // TASK-022 / Phase B1: literals читаются из config.templateConfig.relationPatcher
        // (default = t115TemplateConfig() через GenerationConfig constructor).
        // Pre-TASK-022 hardcoded values: 'task' / 'category' / 'oneToManyMethods' / ['feature/', 'server/'].
        const relationTemplateEntity = config.templateConfig.relationPatcher.templateMainEntity;
        const templateRelatedEntity = config.templateConfig.relationPatcher.templateRelatedEntity;
        const markerName = config.templateConfig.relationPatcher.markerName;
        const startMarker = `// === generated_start:${markerName} ===`;
        const endMarker = `// === generated_end:${markerName} ===`;
        const blockRegex = new RegExp(`${startMarker}([\\s\\S]*?)${endMarker}`);
        const blockRegexAll = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, 'g');

        const relationFields = RelationAnalyzer.manyToOneFields(model.fields);

        // TASK-013: junction skip через shared JunctionDetector (Q3=A).
        // Replaces legacy `model.className.includes('Map')` (Q2=A — drop suffix).
        // Junction entities имеют свой relation patching через manyToMany manifest;
        // RelationPatcher предназначен только для regular oneToMany methods.
        if (relationFields.length === 0 || JunctionDetector.isJunctionEntity(model)) {
            return;
        }

        // TASK-029 Bug 5 consistency: skip `server/` scan когда `!config.withServer`.
        // Без этого RelationPatcher writes к existing `<project>_server/.../X_endpoint.dart`
        // на regen — даже хотя GenerationService filter уже отрезал server scan.
        // На fresh project это масked exists-check на line ~138 (no destination →
        // continue), но regen scenario был leak до TASK-029.
        const directories = config.templateConfig.relationPatcher.scanDirectories
            .filter(dir => dir !== 'server/' || config.withServer);

        for (const dirKey of directories) {
            const { sourceBasePath, destinationBasePath } = getPathInfo(config, dirKey);

            if (!await this.fileSystem.exists(sourceBasePath)) {
                continue;
            }

            const templateFiles = await (this.fileSystem as any).readDirectoryRecursive(sourceBasePath);

            for (const templateFilePath of templateFiles) {
                if (!templateFilePath.includes(config.templEntity)) {
                    continue;
                }

                const relationTemplatePath = templateFilePath.replaceAll(config.templEntity, relationTemplateEntity);
                if (!await this.fileSystem.exists(relationTemplatePath)) {
                    continue;
                }

                const relationTemplateContent = await this.fileSystem.readFile(relationTemplatePath);

                const innerMatch = relationTemplateContent.match(blockRegex);
                if (!innerMatch) {
                    continue;
                }
                // innerBody — содержимое между маркерами в шаблоне (тело одного relation-метода)
                const innerBody = innerMatch[1];

                const isBlockInClass = relationTemplateContent.trim().endsWith('}');

                // Накапливаем тела методов БЕЗ маркеров — обёртка одна на блок (см. ниже)
                let processedBodies = '';

                for (const relationField of relationFields) {
                    if (!relationField.relatedModel) {
                        continue;
                    }

                    let body = innerBody;

                    // STEP 1: ENTITY rules для mainEntity (Task → targetClass).
                    // Меняет main entity literals: `Task`, `task`, `Tasks`, `tasks`, `task_*`.
                    const mainEntityConfig = new GenerationConfig({ ...config, templEntity: relationTemplateEntity, targetEntity: model.className });
                    const mainEntityRules = getDictionaryRules(DictionaryPresets.ENTITY, mainEntityConfig);
                    for (const rule of mainEntityRules) {
                        body = body.replace(new RegExp(rule.from, 'g'), rule.to);
                    }

                    // STEP 2: field-Id preservation FIRST (TASK-017, BUG-012 closure).
                    //
                    // Должно идти ДО related entity ENTITY rules, иначе rule
                    // `Category → TeamMember` уничтожает substring `CategoryId`
                    // в method/parameter/column refs (превращает в `TeamMemberId`),
                    // и subsequent field-Id substitution не находит `categoryId`
                    // что заменять — silent no-op, broken DAO column refs.
                    //
                    // FK alias case (`assigneeId, parent=member`):
                    //   field name = 'assigneeId', relatedModel = 'member'.
                    //   targetIdName = 'assigneeId' (preserves field alias)
                    //   targetIdNamePascal = 'AssigneeId' (preserves PascalCase part of method name)
                    //
                    // Identity case (`categoryId, parent=category`):
                    //   field name = 'categoryId', relatedModel = 'category'.
                    //   targetIdName = 'categoryId', targetIdNamePascal = 'CategoryId'
                    //   → identity substitution (no-op), backwards compat preserved.
                    //
                    // PascalCase variant (`CategoryId → AssigneeId`) обязателен:
                    // method literal `getTasksByCategoryId` содержит PascalCase
                    // `CategoryId`, не lowerCamel `categoryId`. Без Pascal variant
                    // method name стал бы `getInvoicesByTeamMemberId` после Step 3.
                    const targetIdName = relationField.name.endsWith('Id') ? relationField.name : `${relationField.name}Id`;
                    const targetIdNamePascal = cap(targetIdName);
                    body = body.replace(new RegExp(`${templateRelatedEntity}Id`, 'g'), targetIdName);
                    body = body.replace(new RegExp(`${cap(templateRelatedEntity)}Id`, 'g'), targetIdNamePascal);

                    // STEP 3: ENTITY rules для relatedEntity (Category → relatedModel).
                    // Замещает оставшиеся `Category`, `category`, `Categories`,
                    // `categories`, `category_*` — это контексты table reference
                    // (`CategoryTable`), import path (`category_table.dart`), etc.
                    // На этом этапе method/parameter/column refs уже preserved
                    // (Step 2), и rule `Category` matches только реальные class refs.
                    const relatedEntityConfig = new GenerationConfig({ ...config, templEntity: templateRelatedEntity, targetEntity: relationField.relatedModel });
                    const relatedEntityRules = getDictionaryRules(DictionaryPresets.ENTITY, relatedEntityConfig);
                    for (const rule of relatedEntityRules) {
                        body = body.replace(new RegExp(rule.from, 'g'), rule.to);
                    }

                    processedBodies += '\n' + body.replace(/^\n+|\n+$/g, '') + '\n';
                }

                if (processedBodies.length === 0) {
                    continue;
                }

                const relativePath = path.relative(sourceBasePath, templateFilePath).replace(/\\/g, '/');
                const destinationPath = path.join(destinationBasePath, this._getDestinationPath(new GenerationConfig({ ...config, templEntity: templateRelatedEntity }), relativePath));

                if (!await this.fileSystem.exists(destinationPath)) {
                    continue;
                }

                const destinationContent = await this.fileSystem.readFile(destinationPath);

                // Один маркерный блок на весь файл — все методы внутри.
                // Это делает patch идемпотентным и устраняет накопление дубликатов на повторных regen.
                const fullBlock = `${startMarker}${processedBodies}  ${endMarker}`;

                if (destinationContent.includes(startMarker)) {
                    // Заменяем первое вхождение marker-блока на единый свежий fullBlock,
                    // последующие вхождения (если есть — legacy-дубликаты) удаляем.
                    let firstReplaced = false;
                    let newContent = destinationContent.replace(blockRegexAll, () => {
                        if (!firstReplaced) {
                            firstReplaced = true;
                            return fullBlock;
                        }
                        return '';
                    });
                    // Подчищаем лишние пустые строки от удалённых дубликатов
                    newContent = newContent.replace(/\n{3,}/g, '\n\n');
                    await this.fileSystem.createFile(destinationPath, newContent);
                    continue;
                }

                if (isBlockInClass) {
                    const lastBraceIndex = destinationContent.lastIndexOf('}');
                    if (lastBraceIndex !== -1) {
                        const newContent =
                            destinationContent.slice(0, lastBraceIndex) +
                            `\n  ${fullBlock}\n` +
                            destinationContent.slice(lastBraceIndex);
                        await this.fileSystem.createFile(destinationPath, newContent);
                    }
                } else {
                    await this.fileSystem.createFile(destinationPath, destinationContent + '\n' + fullBlock + '\n');
                }
            }
        }
    }

    private _getDestinationPath(config: GenerationConfig, relativePath: string): string {
        // BUG-002: пути на диске должны быть snake_case
        const targetEntitySnake = toSnakeCase(unCap(config.targetEntity));
        let destinationRelativePath = relativePath.replaceAll(config.templEntity, targetEntitySnake);
        destinationRelativePath = destinationRelativePath.replaceAll(config.templProject, config.targetProject);
        return destinationRelativePath;
    }
}
