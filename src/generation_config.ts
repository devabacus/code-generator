
interface IGenerationConfig {
    templPath?: string;
    targetPath?: string;
}


export class GenerationConfig {

    public templPath: string;
    public targetPath: string;
    
    constructor(config: IGenerationConfig) {
        this.templPath = config.templPath || '';
        this.targetPath = config.targetPath || '';
    }
}