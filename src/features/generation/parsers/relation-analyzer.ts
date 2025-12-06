import { RelationType, ServerpodModel, ManyToManyRelation } from './formatters/types';

export class RelationAnalyzer {

    static analyzeRelationType(type: string): RelationType | undefined {
        if (type.startsWith('List<') && type.endsWith('>')) {
            return 'oneToMany';
        } else {
            return 'manyToOne';
        }
    }

    static manyToOneFields(fields: ServerpodModel['fields']): ServerpodModel['fields'] {
        return fields.filter(field => field.isRelation && field.relationType === 'manyToOne' && field.name !== 'customerId');
    }

    static extractRelatedModel(type: string): string | undefined {
        if (type.startsWith('List<') && type.endsWith('>')) {
            return type.slice(5, -1);
        } else {
            return type;
        }
    }

    static detectManyToMany(models: ServerpodModel[]): ManyToManyRelation[] {
        const manyToManyRelations: ManyToManyRelation[] = [];

        const junctionTables = models.filter(model =>
            this.isJunctionTable(model)
        );

        for (const junction of junctionTables) {
            const relationFields = junction.fields.filter(field => field.isRelation);

            if (relationFields.length === 2) {
                const field1 = relationFields[0];
                const field2 = relationFields[1];

                if (field1.relatedModel && field2.relatedModel) {
                    manyToManyRelations.push({
                        table1: field1.relatedModel,
                        table2: field2.relatedModel,
                        junctionTable: junction.className,
                        field1: field1.name,
                        field2: field2.name
                    });
                }
            }
        }

        return manyToManyRelations;
    }

    private static isJunctionTable(model: ServerpodModel): boolean {
        const relationFields = model.fields.filter(field => field.isRelation);
        const nonRelationFields = model.fields.filter(field => !field.isRelation);

        return relationFields.length === 2 &&
            nonRelationFields.every(field => field.name === 'id');
    }

    static getModelRelations(model: ServerpodModel) {
        return {
            oneToMany: model.fields.filter(f => f.relationType === 'oneToMany'),
            manyToOne: model.fields.filter(f => f.relationType === 'manyToOne'),
            belongsTo: model.fields.filter(f => f.relationType === 'manyToOne')
        };
    }
}
