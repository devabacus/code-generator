export type RelationType = 'oneToMany' | 'manyToOne' | 'manyToMany';

export interface ServerpodField {
    name: string;
    type: string;
    nullable: boolean;
    defaultValue?: string;
    defaultPersist?: string;
    isRelation?: boolean;
    isEnum?: boolean;
    relationType?: RelationType;
    relatedModel?: string;
    scope?: string;
}

export interface ServerpodIndex {
    name: string;
    fields: string[];
    unique: boolean;
}

export interface ServerpodModel {
    className: string;
    tableName: string;
    fields: ServerpodField[];
    indexes?: ServerpodIndex[];
    isRelation: boolean;
    entity1?: string;
    entity2?: string;
}

export interface ManyToManyRelation {
    table1: string;
    table2: string;
    junctionTable: string;
    field1: string;
    field2: string;
}
