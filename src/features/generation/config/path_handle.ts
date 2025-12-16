import { GenerationConfig } from "./generation_config";

export interface PathInfo {
    sourceBasePath: string;
    destinationBasePath: string;
}

export function getPathInfo(config: GenerationConfig, dirKey: string): PathInfo {
    switch (dirKey) {
        case 'flutter/':
            return {
                sourceBasePath: config.templFlutterProjectPath,
                destinationBasePath: config.targetFlutterProjectPath,
            };

        case 'server/':
            return {
                sourceBasePath: config.templServerProjectPath,
                destinationBasePath: config.targetServerProjectPath,
            };

        case 'admin/':
            return {
                sourceBasePath: config.templAdminProjectPath,
                destinationBasePath: config.targetAdminProjectPath,
            };

        case 'feature/':
            return {
                sourceBasePath: config.sourceFeaturePath,
                destinationBasePath: config.targetFeaturePath,
            };

            return {
                sourceBasePath: config.templPythonProjectPath,
                destinationBasePath: config.targetPythonProjectPath,
            };

        case 'go/':
            return {
                sourceBasePath: config.templGoProjectPath,
                destinationBasePath: config.targetGoProjectPath,
            };

        case 'node/':
            return {
                sourceBasePath: config.templNodeProjectPath,
                destinationBasePath: config.targetNodeProjectPath,
            };

        default:
            throw new Error(`[getPathInfo] Unknown directory key: ${dirKey}`);
    }
}

