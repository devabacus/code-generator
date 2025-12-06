import { CodeFormatter } from "../parsers/formatters/code_formatter";
import { ServerpodModel } from "../parsers/formatters/types";
import { generateDriftTableImports, generateEntityToServerpodParams, generateServerpodToModelParams } from "./relation_generation";

export const GENERATORS = {
    DRIFT_TABLE_COLUMNS: 'driftTableColumns',
    DRIFT_TABLE_IMPORTS: 'driftTableImports',
    FREEZED_FIELDS: 'freezedFields',
    FREEZED_CONSTRUCTOR: 'freezedConstructor',
    DAO_METHODS: 'daoMethods',
    VALUE_WRAPPED_FIELDS: 'valueWrappedFields',
    SIMPLE_FIELDS: 'simpleFields',
    SERVERPOD_TO_MODEL_PARAMS: 'serverpodToModelParams',
    ENTITY_TO_SERVERPOD_PARAMS: 'entityToServerpodParams',
    ENTITY_RELATION_FIELDS: 'entityRelationFields',
} as const;

export const DEFAULT_MARKERS = {
    START: '// === GENERATED_START ===',
    END: '// === GENERATED_END ==='
} as const;

type SectionGenerator = (model: ServerpodModel) => string;

const sectionGeneratorRegistry: Record<string, SectionGenerator> = {

    [GENERATORS.DRIFT_TABLE_COLUMNS]: (model) => {
        const codeFormatter = new CodeFormatter();
        return codeFormatter.generateDriftTableColumns(model.fields);
    },

    [GENERATORS.FREEZED_FIELDS]: (model) => {
        const formatter = new CodeFormatter();
        return formatter.formatClassFields(model.fields);
    },

    [GENERATORS.FREEZED_CONSTRUCTOR]: (model) => {
        const formatter = new CodeFormatter();
        return formatter.formatRequiredTypeFields(model.fields);
    },

    [GENERATORS.VALUE_WRAPPED_FIELDS]: (model) => {
        const formatter = new CodeFormatter();
        return formatter.formatValueWrappedFields(model.fields);
    },
    [GENERATORS.SIMPLE_FIELDS]: (model) => {
        const formatter = new CodeFormatter();
        return formatter.formatSimpleFields(model.fields);
    },
    [GENERATORS.DRIFT_TABLE_IMPORTS]: (model) => {
        return generateDriftTableImports(model);
    },

    [GENERATORS.SERVERPOD_TO_MODEL_PARAMS]: (model) => {
        return generateServerpodToModelParams(model);
    },

    [GENERATORS.ENTITY_TO_SERVERPOD_PARAMS]: (model) => generateEntityToServerpodParams(model),

};

export function getSectionGenerator(name: string): SectionGenerator | undefined {
    return sectionGeneratorRegistry[name];
}
