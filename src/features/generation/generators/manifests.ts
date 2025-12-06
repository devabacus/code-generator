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

} as const;

export type manifestType = keyof typeof allManifests;
