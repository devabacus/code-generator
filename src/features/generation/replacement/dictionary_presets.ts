import { Dictionaries, DictionaryName } from "./replacement_util";

export const DictionaryPresets = {
    ENTITY: [Dictionaries.COMMON, Dictionaries.ENTITY],
    PROJECT_ONLY: [Dictionaries.COMMON],
    M2M: [Dictionaries.COMMON, Dictionaries.MANY_TO_MANY],
} as const;

export type DictionaryPresetName = keyof typeof DictionaryPresets;
