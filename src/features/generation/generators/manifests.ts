import { DictionaryPresets } from "../replacement/dictionary_presets";

export const allManifests = {
    startProject: {
        dictionaries: DictionaryPresets.PROJECT_ONLY,
        scan_dirs: [
            'root/',
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

    goStart: {
        dictionaries: DictionaryPresets.PROJECT_ONLY,
        scan_dirs: [
            'go/',
            'flutter/',
            'server/',
        ],
        include_files: ['go.sum'],
    },

    nodeStart: {
        dictionaries: DictionaryPresets.PROJECT_ONLY,
        scan_dirs: [
            'node/',
            'flutter/',
            'server/',
        ],
        include_files: ['package-lock.json', 'package.json'],
    },

} as const;

export type manifestType = keyof typeof allManifests;

