import path from "path";
import { manifestType as ManifestType } from "../generators/manifests";
import { TemplateConfig, t115TemplateConfig } from "./template_config";

export interface IGenerationConfig {
    templProject?: string;
    manifest?: ManifestType[];
    templFeatureName?: string;
    targetFeaturePath?: string;
    targetProject?: string;
    projectsPath?: string;
    templEntity?: string;
    targetEntity?: string;
    targetEntity1?: string;
    targetEntity2?: string;
    /**
     * TASK-014: template junction entity names. Default = `task` / `tag` (соответствует
     * t115 TaskTagMap baseline directory `task_tag_map/` + file prefix). Используются
     * в `replacement_util.MANY_TO_MANY` + `generation_service._getDestinationPath` +
     * `orchestrator_patcher._JUNCTION_REGISTER_TEMPLATE` для two-entity rename.
     */
    templEntity1?: string;
    templEntity2?: string;
    /**
     * TASK-014: PascalCase className целевой junction (e.g. `RolePermission`). Используется
     * `_getDestinationPath` + `JUNCTION_REGISTER_TEMPLATE` для substitution
     * `task_tag_map/` → `<targetSnakeCase>/`. Если не set — fallback в
     * `${targetEntity1}_${targetEntity2}_map` (legacy *Map shape для backward compat).
     */
    targetJunctionClassName?: string;
    sourceFeaturePath?: string;
    workspacesPath?: string;
    templatesPath?: string;
    /**
     * TASK-022 / Phase B1: template-specific configuration injected в generators
     * (`RelationPatcher`, `OrchestratorPatcher`, `AppDatabaseGenerator`). Default
     * через `t115TemplateConfig()` factory когда не указано — backwards compat
     * для всех existing call-sites.
     *
     * Phase D `--template <name>` CLI flag будет переключать между t115 и simplified
     * (TASK-B2 scope) через подмену этого field в config builder.
     *
     * См. [ADR-0005 amendment 2026-05-03 stack lock](../../docs/decisions/adr-0005-multi-template-plurality.md).
     */
    templateConfig?: TemplateConfig;
    /**
     * Opt-in флаг (Phase D): сохранить repository-интерфейс поверх stripped
     * шаблона. Управляет взаимоисключающим выбором шаблонов через
     * `MarkerAnalyzer.matchesInterfaceFlag` (`flags: withInterfaces` /
     * `flags: withoutInterfaces`). Default false — backward compat: шаблоны без
     * flags-маркера не реагируют на флаг.
     */
    withInterfaces?: boolean;
}

export class GenerationConfig {
    public templProject: string;
    public projectsPath: string;
    public templEntity: string;
    public targetProject: string;
    public targetEntity: string;
    public targetEntity1: string;
    public targetEntity2: string;
    /** TASK-014: template junction entity names (default `task`/`tag` для t115 baseline). */
    public templEntity1: string;
    public templEntity2: string;
    /** TASK-014: PascalCase className целевой junction (e.g. `RolePermission`). */
    public targetJunctionClassName: string;
    public sourceFeaturePath: string;
    public templFeatureName: string;
    public targetFeaturePath: string;
    public allManifests: ManifestType[];
    public workspacesPath: string;


    public templatesPath: string;

    /**
     * TASK-022 / Phase B1: template-specific configuration. Default через
     * `t115TemplateConfig()` factory если caller не передаёт — backwards compat.
     */
    public templateConfig: TemplateConfig;

    /** Opt-in: сохранить repository-интерфейс поверх stripped-шаблона (Phase D). */
    public withInterfaces: boolean;


    constructor(config: IGenerationConfig) {
        this.templProject = config.templProject || 't2';
        this.allManifests = config.manifest || [];
        this.templFeatureName = config.templFeatureName || 'tasks';
        this.projectsPath = config.projectsPath || 'G:/Projects/Flutter/serverpod';
        this.templatesPath = config.templatesPath || 'G:/Templates';
        this.templEntity = config.templEntity || 'category';
        this.workspacesPath = config.workspacesPath || '';
        this.targetProject = config.targetProject || path.basename(this.workspacesPath);
        this.targetFeaturePath = config.targetFeaturePath || `G:/Projects/Flutter/serverpod/${this.targetProject}/${this.targetProject}_flutter/lib/features/home`;
        this.targetEntity = config.targetEntity || '';
        this.targetEntity1 = config.targetEntity1 || '';
        this.targetEntity2 = config.targetEntity2 || '';
        // TASK-014: template junction entity names. Default `task`/`tag` соответствуют
        // t115 TaskTagMap baseline (директория `task_tag_map/`, file prefix `task_tag_map_`,
        // class `TaskTagMap`). Backward compat: TaskTagMap caller'ы вообще их не передают
        // и получают тот же template как до TASK-014.
        this.templEntity1 = config.templEntity1 || 'task';
        this.templEntity2 = config.templEntity2 || 'tag';
        this.targetJunctionClassName = config.targetJunctionClassName || '';
        this.sourceFeaturePath = config.sourceFeaturePath || path.join(this.templatesPath, 'flutter', this.templProject, `${this.templProject}_flutter`, 'lib', 'features', this.templFeatureName);
        // TASK-022 / Phase B1: default template config = t115 если не указано.
        // Backwards compat для всех existing call-sites (create_project / generate_entity / tests).
        this.templateConfig = config.templateConfig || t115TemplateConfig();
        this.withInterfaces = config.withInterfaces || false;
    }


    get monoRepoTargetPath(): string {
        return path.join(this.projectsPath, this.targetProject);
    }

    get monoRepoTemplPath(): string {
        return path.join(this.templatesPath, 'flutter', this.templProject);
    }

    get featuresPath(): string {
        return path.join(this.workspacesPath, `${this.targetProject}_flutter`, 'lib', 'features');
    }

    get targetFeatureName(): string {
        return path.basename(this.targetFeaturePath);
    }

    get featureTablesPath(): string {
        return path.join(this.targetFeaturePath, 'data', 'datasources', 'local', 'tables');
    }

    get targetFlutterProjectPath(): string { return this.getFlutterPath(this.targetProject); }
    get templFlutterProjectPath(): string {
        return path.join(this.templatesPath, 'flutter', this.templProject, `${this.templProject}_flutter`);
    }

    get targetFlutterLibPath(): string { return this.flutterLibPath(this.targetProject); }
    get templFlutterLibPath(): string { return this.flutterLibPath(this.templProject); }

    get targetServerProjectPath(): string {
        return path.join(this.projectsPath, `${this.targetProject}`, `${this.targetProject}_server`);
    }

    get templServerProjectPath(): string {
        return path.join(this.templatesPath, 'flutter', `${this.templProject}`, `${this.templProject}_server`);
    }

    get templAdminProjectPath(): string {
        return path.join(this.templatesPath, 'flutter', `${this.templProject}`, `${this.templProject}_admin`);
    }

    get targetAdminProjectPath(): string {
        return path.join(this.projectsPath, `${this.targetProject}`, `${this.targetProject}_admin`);
    }

    private getFlutterPath(projectName: string): string {
        return path.join(this.projectsPath, `${projectName}`, `${projectName}_flutter`);
    }

    flutterLibPath(project: string): string {
        return path.join(this.getFlutterPath(project), "lib");
    }

    get corePath(): string {
        return path.join(this.targetFlutterLibPath, 'core');
    }

    get coreDataLocalPath(): string {
        return path.join(this.corePath, 'data', 'datasources', 'local');
    }

    get coreTablesPath(): string {
        return path.join(this.coreDataLocalPath, 'tables');
    }

    get templPythonProjectPath(): string {
        return path.join(this.projectsPath, `${this.templProject}`, `${this.templProject}_python`);
    }

    get targetPythonProjectPath(): string {
        return path.join(this.projectsPath, `${this.targetProject}`, `${this.targetProject}_python`);
    }

    get templGoProjectPath(): string {
        return path.join(this.projectsPath, `${this.templProject}`, `${this.templProject}_go`);
    }

    get targetGoProjectPath(): string {
        return path.join(this.projectsPath, `${this.targetProject}`, `${this.targetProject}_go`);
    }

    get templNodeProjectPath(): string {
        return path.join(this.projectsPath, `${this.templProject}`, `${this.templProject}_node`);
    }

    get targetNodeProjectPath(): string {
        return path.join(this.projectsPath, `${this.targetProject}`, `${this.targetProject}_node`);
    }
}

