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
import { scanWithIgnore } from '../../../utils/dir_handle_adv';


export class GenerationService {
    private readonly fileSystem: IFileSystem;
    private readonly replacingProcessor: ReplacingFileProcessor;
    private readonly sectionReplacer: SectionReplacer;
    private readonly relationPatcher: RelationPatcher;

    constructor(fileSystem?: IFileSystem) {
        this.fileSystem = fileSystem || new DefaultFileSystem();
        this.replacingProcessor = new ReplacingFileProcessor(this.fileSystem);
        this.sectionReplacer = new SectionReplacer();
        this.relationPatcher = new RelationPatcher(this.fileSystem);
    }

    public async generate(config: GenerationConfig, model?: ServerpodModel): Promise<void> {

        const allPromises: Promise<void>[] = [];
        const directoriesToScan = new Set<string>();
        for (const _manifest of config.allManifests) {
            const manifest = allManifests[_manifest as manifestType];
            if (manifest?.scan_dirs) {
                manifest.scan_dirs.forEach(dir => directoriesToScan.add(dir));
            }
        }
        const isEntityBasedGeneration = config.allManifests.includes('entity') || config.allManifests.includes('manyToMany');

        for (const dir of directoriesToScan) {
            const pathInfo = getPathInfo(config, dir);
            const fullDirSourcePath = pathInfo.sourceBasePath;
            if (!await this.fileSystem.exists(fullDirSourcePath)) { continue; }

            const filesInDir = await scanWithIgnore(fullDirSourcePath, this.fileSystem);

            for (const templateFullPath of filesInDir) {
                if (isEntityBasedGeneration && !config.allManifests.includes('manyToMany') && !templateFullPath.includes(config.templEntity)) { continue; }
                if (templateFullPath.includes('.g.') || templateFullPath.includes('.freezed.')) { continue; }
                const templateContent = await this.fileSystem.readFile(templateFullPath);
                const fileManifest = MarkerAnalyzer.analyze(templateContent);

                if (fileManifest.types.includes('ignore')) { continue; }
                const isRelevant = config.allManifests.some(feature => fileManifest.types.includes(feature as any));
                if (!isRelevant) { continue; }

                allPromises.push(this._processFile(config, templateFullPath, templateContent, fileManifest, pathInfo, model));
            }
        }

        await Promise.all(allPromises);

        if (model && RelationAnalyzer.manyToOneFields(model.fields).length > 0) {
            await this.relationPatcher.patch(config, model);
        }
    }

    private async _processFile(
        config: GenerationConfig,
        templateFullPath: string,
        templateContent: string,
        fileManifest: FileManifest,
        pathInfo: PathInfo,
        model?: ServerpodModel
    ): Promise<void> {
        const relativePath = path.relative(pathInfo.sourceBasePath, templateFullPath).replace(/\\/g, '/');
        const destinationPath = path.join(pathInfo.destinationBasePath, this._getDestinationPath(relativePath, config));

        const destinationExists = await this.fileSystem.exists(destinationPath);
        const hasBaseMarker = /(?:\/\/|#) === generated_start:base ===/.test(templateContent);

        // --- STRATEGY 1: MERGE ---
        if (destinationExists && hasBaseMarker) {
            const destinationContent = await this.fileSystem.readFile(destinationPath);
            const newContent = this._mergeBaseContent(templateContent, destinationContent, fileManifest, config);
            await this.fileSystem.createFile(destinationPath, newContent);
            return;
        }

        // --- STRATEGY 2: FULL REPLACE ---
        const dictionaries = fileManifest.dictionaries.length > 0 ? fileManifest.dictionaries : allManifests[config.allManifests[0]]?.dictionaries || [];
        const rules = getDictionaryRules(dictionaries, config);

        let newContent = templateContent;
        for (const rule of rules) {
            newContent = newContent.replace(new RegExp(rule.from, 'g'), rule.to);
        }

        if (fileManifest.isTemplated && model) {
            newContent = this.sectionReplacer.process(newContent, config, model);
        }

        await this.fileSystem.createFolder(path.dirname(destinationPath));
        await this.fileSystem.createFile(destinationPath, newContent);
    }

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

        const dictionaries = fileManifest.dictionaries.length > 0 ? fileManifest.dictionaries : allManifests[config.allManifests[0]]?.dictionaries || [];
        const rules = getDictionaryRules(dictionaries, config);

        for (const rule of rules) {
            newBlockContent = newBlockContent.replace(new RegExp(rule.from, 'g'), rule.to);
        }

        const finalContent = destinationContent.replace(
            baseBlockRegex,
            `$1${newBlockContent}$3`
        );

        return finalContent;
    }

    private _getDestinationPath(relativePath: string, config: GenerationConfig): string {
        let destinationRelativePath = relativePath.replaceAll(config.templEntity, config.targetEntity);
        destinationRelativePath = destinationRelativePath.replaceAll(config.templProject, config.targetProject);
        return destinationRelativePath;
    }
}
