import path from "path";
import { manifestType as ManifestType } from "../generators/manifests";

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
    sourceFeaturePath?: string;
    workspacesPath?: string;
}

export class GenerationConfig {
    public templProject: string;
    public projectsPath: string;
    public templEntity: string;
    public targetProject: string;
    public targetEntity: string;
    public targetEntity1: string;
    public targetEntity2: string;
    public sourceFeaturePath: string;
    public templFeatureName: string;
    public targetFeaturePath: string;
    public allManifests: ManifestType[];
    public workspacesPath: string;


    constructor(config: IGenerationConfig) {
        this.templProject = config.templProject || 't2';
        this.allManifests = config.manifest || [];
        this.templFeatureName = config.templFeatureName || 'tasks';
        this.projectsPath = config.projectsPath || 'G:/Projects/Flutter/serverpod';
        this.templEntity = config.templEntity || 'category';
        this.workspacesPath = config.workspacesPath || '';
        this.targetProject = config.targetProject || path.basename(this.workspacesPath);
        this.targetFeaturePath = config.targetFeaturePath || `G:/Projects/Flutter/serverpod/${this.targetProject}/${this.targetProject}_flutter/lib/features/home`;
        this.targetEntity = config.targetEntity || '';
        this.targetEntity1 = config.targetEntity1 || '';
        this.targetEntity2 = config.targetEntity2 || '';
        this.sourceFeaturePath = config.sourceFeaturePath || `G:/Projects/Flutter/serverpod/${this.templProject}/${this.templProject}_flutter/lib/features/${this.templFeatureName}`;
    }


    get monoRepoTargetPath(): string {
        return path.join(this.projectsPath, this.targetProject);
    }

    get monoRepoTemplPath(): string {
        return path.join(this.projectsPath, this.templProject);
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
    get templFlutterProjectPath(): string { return this.getFlutterPath(this.templProject); }

    get targetFlutterLibPath(): string { return this.flutterLibPath(this.targetProject); }
    get templFlutterLibPath(): string { return this.flutterLibPath(this.templProject); }

    get targetServerProjectPath(): string {
        return path.join(this.projectsPath, `${this.targetProject}`, `${this.targetProject}_server`);
    }

    get templServerProjectPath(): string {
        return path.join(this.projectsPath, `${this.templProject}`, `${this.templProject}_server`);
    }

    get templAdminProjectPath(): string {
        return path.join(this.projectsPath, `${this.templProject}`, `${this.templProject}_admin`);
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

