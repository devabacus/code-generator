import { cap, pluralConvert, unCap } from "../../../utils/text_work/text_util";
import { ReplacementRule } from "../generators/replacing_file_processor";
import { GenerationConfig } from "../config/generation_config";

export const Dictionaries = {
    COMMON: 'common',
    ENTITY: 'entity',
    MANY_TO_MANY: 'manyToMany',
} as const;

export type DictionaryName = typeof Dictionaries[keyof typeof Dictionaries];

type RuleGenerator = (config: GenerationConfig) => ReplacementRule[];

const dictionaryRegistry: Record<DictionaryName, RuleGenerator> = {
    [Dictionaries.COMMON]: (config) => [
        { from: config.templProject, to: config.targetProject },
    ],
    [Dictionaries.ENTITY]: (config) => {
        if (!config.targetEntity) { return []; }

        const baseForms = {
            Ds: pluralConvert(cap(config.templEntity)),
            ds: pluralConvert(unCap(config.templEntity)),
            D: cap(config.templEntity),
            d: unCap(config.templEntity),
        };

        const newForms = {
            Ds: pluralConvert(cap(config.targetEntity)),
            ds: pluralConvert(unCap(config.targetEntity)),
            D: cap(config.targetEntity),
            d: unCap(config.targetEntity),
        };

        return [
            { from: baseForms.Ds, to: newForms.Ds },
            { from: baseForms.ds, to: newForms.ds },
            { from: baseForms.D, to: newForms.D },
            { from: baseForms.d, to: newForms.d },
        ];
    },

    [Dictionaries.MANY_TO_MANY]: (config) => {
        if (!config.targetEntity1 || !config.targetEntity2) { return []; }
        const templEntity1 = 'task';
        const templEntity2 = 'tag';

        const rules: ReplacementRule[] = [];
        rules.push(
            { from: pluralConvert(cap(templEntity1)), to: pluralConvert(cap(config.targetEntity1)) },
            { from: cap(templEntity1), to: cap(config.targetEntity1) },
            { from: unCap(templEntity1), to: unCap(config.targetEntity1) },
        );

        rules.push(
            { from: pluralConvert(cap(templEntity2)), to: pluralConvert(cap(config.targetEntity2)) },
            { from: cap(templEntity2), to: cap(config.targetEntity2) },
            { from: unCap(templEntity2), to: unCap(config.targetEntity2) },
        );
        return rules;
    },
};


export function getDictionaryRules(dictionaries: readonly DictionaryName[], config: GenerationConfig): ReplacementRule[] {
    const allRules: ReplacementRule[] = [];

    for (const dictName of dictionaries) {
        const ruleGenerator = dictionaryRegistry[dictName];
        if (ruleGenerator) {
            allRules.push(...ruleGenerator(config));
        }
    }

    return allRules;
}
