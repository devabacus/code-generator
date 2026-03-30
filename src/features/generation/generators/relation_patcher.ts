import path from 'path';
import { IFileSystem } from '../../../core/interfaces/file_system';
import { GenerationConfig } from '../config/generation_config';
import { getDictionaryRules } from '../replacement/replacement_util';
import { ServerpodModel } from '../parsers/formatters/types';
import { getPathInfo } from '../config/path_handle';
import { RelationAnalyzer } from '../parsers/relation-analyzer';
import { DictionaryPresets } from '../replacement/dictionary_presets';

export class RelationPatcher {
    constructor(private fileSystem: IFileSystem) { }

    public async patch(config: GenerationConfig, model: ServerpodModel): Promise<void> {
        console.log('Relations detected, starting patching process...');

        const relationTemplateEntity = 'task';
        const templateRelatedEntity = 'category';
        const markerName = 'oneToManyMethods';
        const startMarker = `// === generated_start:${markerName} ===`;
        const endMarker = `// === generated_end:${markerName} ===`;
        const regex = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, 'g');

        const relationFields = RelationAnalyzer.manyToOneFields(model.fields);

        if (relationFields.length === 0 || model.className.includes('Map')) {
            return;
        }

        const directories = ['feature/', 'server/'];

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

                const matched = relationTemplateContent.match(regex);
                if (!matched) {
                    continue;
                }
                const blockContent = matched[0];

                const isBlockInClass = relationTemplateContent.trim().endsWith('}');

                let allProcessedBlocks = '';

                for (const relationField of relationFields) {
                    if (!relationField.relatedModel) {
                        continue;
                    }

                    let templateBlock = blockContent;

                    const mainEntityConfig = new GenerationConfig({ ...config, templEntity: relationTemplateEntity, targetEntity: model.className });
                    const mainEntityRules = getDictionaryRules(DictionaryPresets.ENTITY, mainEntityConfig);
                    for (const rule of mainEntityRules) {
                        templateBlock = templateBlock.replace(new RegExp(rule.from, 'g'), rule.to);
                    }

                    const relatedEntityConfig = new GenerationConfig({ ...config, templEntity: templateRelatedEntity, targetEntity: relationField.relatedModel });
                    const relatedEntityRules = getDictionaryRules(DictionaryPresets.ENTITY, relatedEntityConfig);
                    for (const rule of relatedEntityRules) {
                        templateBlock = templateBlock.replace(new RegExp(rule.from, 'g'), rule.to);
                    }

                    const targetIdName = relationField.name.endsWith('Id') ? relationField.name : `${relationField.name}Id`;
                    templateBlock = templateBlock.replace(new RegExp(`${templateRelatedEntity}Id`, 'g'), targetIdName);

                    allProcessedBlocks += '\n\n' + templateBlock;
                }

                if (allProcessedBlocks.length > 0) {
                    const relativePath = path.relative(sourceBasePath, templateFilePath).replace(/\\/g, '/');
                    const destinationPath = path.join(destinationBasePath, this._getDestinationPath(new GenerationConfig({ ...config, templEntity: 'category' }), relativePath));

                    if (!await this.fileSystem.exists(destinationPath)) {
                        continue;
                    }

                    let destinationContent = await this.fileSystem.readFile(destinationPath);

                    // Skip if already patched (avoid duplicate methods)
                    if (destinationContent.includes(startMarker)) {
                        continue;
                    }

                    if (isBlockInClass) {
                        const lastBraceIndex = destinationContent.lastIndexOf('}');
                        if (lastBraceIndex !== -1) {
                            const indentedBlock = allProcessedBlocks.trim();
                            const newContent =
                                destinationContent.slice(0, lastBraceIndex) +
                                `\n  ${indentedBlock}\n` +
                                destinationContent.slice(lastBraceIndex);
                            await this.fileSystem.createFile(destinationPath, newContent);
                        }
                    } else {
                        await this.fileSystem.createFile(destinationPath, destinationContent + allProcessedBlocks);
                    }
                }
            }
        }
    }

    private _getDestinationPath(config: GenerationConfig, relativePath: string): string {
        let destinationRelativePath = relativePath.replaceAll(config.templEntity, config.targetEntity);
        destinationRelativePath = destinationRelativePath.replaceAll(config.templProject, config.targetProject);
        return destinationRelativePath;
    }
}
