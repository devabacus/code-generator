import { DictionaryPresets } from "../replacement/dictionary_presets";

export const allManifests = {
    startProject: {
        dictionaries: DictionaryPresets.PROJECT_ONLY,
        scan_dirs: [
            'flutter/',
            'server/',
            'admin/',
            'feature/',
        ],
    },

    entity: {
        dictionaries: DictionaryPresets.ENTITY,
        scan_dirs: [
            'feature/',
            'server/',
        ]
    },

    manyToMany: {
        dictionaries: DictionaryPresets.M2M,
        scan_dirs: [
            'feature/',
            'server/'
        ]
    },

    deploy: {
        dictionaries: DictionaryPresets.PROJECT_ONLY,
        scan_dirs: [
            'server/',
        ],
    },

    pythonStart: {
        dictionaries: DictionaryPresets.PROJECT_ONLY,
        scan_dirs: [
            'python/',
            'flutter/',  // For python_health_check_card.dart
            'server/',   // For python_endpoint.dart
        ],
    },

} as const;

export type manifestType = keyof typeof allManifests;

