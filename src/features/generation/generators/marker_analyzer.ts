import { DictionaryName } from "../replacement/replacement_util";

export type ManifestType = 'ignore' | 'startProject' | 'entity' | 'manyToMany' | 'serverpod' | 'deploy' | 'pythonStart';

export interface FileManifest {
    types: ManifestType[];
    dictionaries: DictionaryName[];
    isTemplated: boolean;
}

export class MarkerAnalyzer {
    public static analyze(content: string): FileManifest {
        // Support: // manifest:, # manifest:, <!-- manifest: -->
        const manifestLine = content.match(/(?:\/\/|#|<!--)\s*manifest:\s*([^\r\n>]+)/);
        let types: ManifestType[] = [];

        if (manifestLine && manifestLine[1]) {
            types = manifestLine[1].split(',').map(t => t.trim().replace(/\s*-*>?$/g, '').trim() as ManifestType).filter(Boolean);
        }

        if (types.length === 0) {
            types.push('ignore');
        }

        const dictionariesLine = content.match(/(?:\/\/|#|<!--)\s*dictionaries:\s*([A-Z_,\s]+)/i);

        let dictionaries: DictionaryName[] = [];

        if (dictionariesLine && dictionariesLine[1]) {
            dictionaries = dictionariesLine[1].split(',').map(d => d.trim().toLowerCase().replace(/-->/g, '') as DictionaryName).filter(Boolean);
        }

        const isTemplated = /(?:\/\/|#)\s*===\s*generated_start:/.test(content);

        return { types, dictionaries, isTemplated };
    }
}

