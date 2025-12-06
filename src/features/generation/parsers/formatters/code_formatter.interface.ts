import { ServerpodField } from "./types";

export interface Field {
    type: string,
    name: string,
    nullable: boolean;
}

export interface ICodeFormatter {
    formatClassFields(fields: Field[]): string;
    formatRequiredFields(fields: Field[]): string;
    formatRequiredTypeFields(fields: Field[] | ServerpodField[]): string;
    formatConstructorParams(fields: Field[] | ServerpodField[], instanceName?: string): string;
    formatFieldsComma(fields: Field[] | ServerpodField[]): string;
    formatValueWrappedFields(fields: Field[]): string;
    formatSimpleFields(fields: Field[] | ServerpodField[]): string;
    formatSimpleFieldsWithoutId(fields: Field[] | ServerpodField[]): string;
    getParamsWithOutId(row: string): string;
    getFieldsValueForTest(fields: Field[]): string[];
    getFieldsExpectValueTest(fields: Field[]): string[];
    formatInsertCompanionParams(fields: Field[]): string;
    generateDriftTableColumns(fields: ServerpodField[]): string;
    shouldSkipServerpodField(field: ServerpodField): boolean;
}
