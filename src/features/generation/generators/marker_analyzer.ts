import { DictionaryName } from "../replacement/replacement_util";

export type ManifestType = 'ignore' | 'startProject' | 'entity' | 'manyToMany' | 'serverpod' | 'deploy' | 'pythonStart' | 'goStart' | 'nodeStart';

export interface FileManifest {
    types: ManifestType[];
    dictionaries: DictionaryName[];
    isTemplated: boolean;
    /**
     * Опциональные булевы флаги-условия из маркера `// flags: <name>[, <name>...]`.
     * Используются для взаимоисключающего выбора альтернативных шаблонов одного
     * destination (например `withInterfaces` / `withoutInterfaces` для opt-in
     * repository-интерфейса поверх simplified). Файл без маркера → пустой массив
     * → всегда включается (backward compat).
     */
    flags: string[];
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

        // Опциональный маркер `// flags: withInterfaces` (или `# flags:`, `<!-- flags: -->`).
        // Класс символов БЕЗ переносов строк (`[ \t]`, не `\s`) — иначе жадный
        // захват съедает следующую строку кода (например `import ...`) и флаг
        // перестаёт совпадать с ожидаемым значением.
        const flagsLine = content.match(/(?:\/\/|#|<!--)\s*flags:\s*([A-Za-z_,\t ]+)/);
        let flags: string[] = [];
        if (flagsLine && flagsLine[1]) {
            flags = flagsLine[1].split(',').map(f => f.trim().replace(/-->/g, '').trim()).filter(Boolean);
        }

        return { types, dictionaries, isTemplated, flags };
    }

    /**
     * Проверяет, проходит ли файл по флагу `withInterfaces`.
     * - файл с `flags: withInterfaces`    → включается только при withInterfaces=true
     * - файл с `flags: withoutInterfaces` → включается только при withInterfaces=false
     * - файл без соответствующего флага   → включается всегда (backward compat)
     */
    public static matchesInterfaceFlag(manifest: FileManifest, withInterfaces: boolean): boolean {
        if (manifest.flags.includes('withInterfaces')) { return withInterfaces; }
        if (manifest.flags.includes('withoutInterfaces')) { return !withInterfaces; }
        return true;
    }
}

