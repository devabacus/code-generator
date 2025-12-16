/**
 * OpenAPI Parser for FastAPI
 * Parses OpenAPI 3.x spec and extracts endpoints/models for Serverpod code generation
 */

// ============== OpenAPI Types ==============

interface OpenApiSpec {
    openapi: string;
    info: { title: string; version: string };
    paths: Record<string, OpenApiPathItem>;
    components?: { schemas?: Record<string, OpenApiSchema> };
}

interface OpenApiPathItem {
    get?: OpenApiOperation;
    post?: OpenApiOperation;
    put?: OpenApiOperation;
    delete?: OpenApiOperation;
}

interface OpenApiOperation {
    summary?: string;
    description?: string;
    operationId?: string;
    tags?: string[];
    requestBody?: {
        content?: { 'application/json'?: { schema?: OpenApiSchemaRef } };
        required?: boolean;
    };
    responses?: Record<string, {
        content?: { 'application/json'?: { schema?: OpenApiSchemaRef } };
    }>;
}

interface OpenApiSchemaRef {
    $ref?: string;
    type?: string;
    items?: OpenApiSchemaRef;
    properties?: Record<string, OpenApiSchemaRef>;
    required?: string[];
    anyOf?: OpenApiSchemaRef[];
}

interface OpenApiSchema {
    type?: string;
    properties?: Record<string, OpenApiSchemaRef>;
    required?: string[];
    description?: string;
}

// ============== Parsed Result Types ==============

export interface ParsedEndpoint {
    name: string;           // camelCase method name
    path: string;           // /api/v1/process-text
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    description?: string;
    requestFields: ParsedField[];
    responseType: string;   // Model name or 'String'
}

export interface ParsedField {
    name: string;           // camelCase field name
    originalName: string;   // snake_case original
    type: string;           // Dart type
    nullable: boolean;
}

export interface ParsedModel {
    name: string;
    fields: ParsedField[];
}

export interface OpenApiParseResult {
    endpoints: ParsedEndpoint[];
    models: ParsedModel[];
    serviceTitle: string;
}

// ============== Parser Functions ==============

/**
 * Parse OpenAPI JSON into code-generation friendly format
 */
export function parseOpenApi(jsonContent: string): OpenApiParseResult {
    const spec = JSON.parse(jsonContent) as OpenApiSpec;

    const endpoints: ParsedEndpoint[] = [];
    const models: ParsedModel[] = [];
    const seenModels = new Set<string>();

    // Parse paths → endpoints
    for (const [path, pathItem] of Object.entries(spec.paths)) {
        // Skip health/internal endpoints
        if (isInternalPath(path)) continue;

        for (const method of ['get', 'post', 'put', 'delete'] as const) {
            const op = pathItem[method];
            if (!op) continue;

            const endpoint = parseOperation(path, method.toUpperCase() as any, op, spec);
            if (endpoint) endpoints.push(endpoint);
        }
    }

    // Parse schemas → models
    if (spec.components?.schemas) {
        for (const [name, schema] of Object.entries(spec.components.schemas)) {
            if (isInternalSchema(name)) continue;
            if (seenModels.has(name)) continue;

            const model = parseSchema(name, schema, spec);
            if (model) {
                models.push(model);
                seenModels.add(name);
            }
        }
    }

    return {
        endpoints,
        models,
        serviceTitle: spec.info.title,
    };
}

function isInternalPath(path: string): boolean {
    return path === '/health'
        || path === '/ready'
        || path === '/'
        || path.startsWith('/docs')
        || path.startsWith('/openapi');
}

function isInternalSchema(name: string): boolean {
    return name === 'HTTPValidationError'
        || name === 'ValidationError';
}

function parseOperation(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    op: OpenApiOperation,
    spec: OpenApiSpec
): ParsedEndpoint | null {
    // Method name from operationId or path
    const name = op.operationId
        ? cleanOperationId(op.operationId)
        : pathToMethodName(path);

    // Request fields
    const requestFields: ParsedField[] = [];
    if (op.requestBody?.content?.['application/json']?.schema) {
        const schemaRef = op.requestBody.content['application/json'].schema;
        const resolved = resolveRef(schemaRef, spec);

        if (resolved?.properties) {
            const required = resolved.required || [];
            for (const [fieldName, fieldSchema] of Object.entries(resolved.properties)) {
                requestFields.push({
                    name: snakeToCamel(fieldName),
                    originalName: fieldName,
                    type: schemaToType(fieldSchema, spec),
                    nullable: !required.includes(fieldName),
                });
            }
        }
    }

    // Response type
    let responseType = 'String';
    const resp200 = op.responses?.['200'];
    if (resp200?.content?.['application/json']?.schema) {
        const ref = resp200.content['application/json'].schema.$ref;
        if (ref) {
            responseType = ref.replace('#/components/schemas/', '');
        }
    }

    return {
        name,
        path,
        method,
        description: op.summary || op.description,
        requestFields,
        responseType,
    };
}

function parseSchema(name: string, schema: OpenApiSchema, spec: OpenApiSpec): ParsedModel | null {
    if (!schema.properties) return null;

    const required = schema.required || [];
    const fields: ParsedField[] = [];

    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
        fields.push({
            name: snakeToCamel(fieldName),
            originalName: fieldName,
            type: schemaToType(fieldSchema, spec),
            nullable: !required.includes(fieldName),
        });
    }

    return { name, fields };
}

// ============== Helpers ==============

function resolveRef(schemaRef: OpenApiSchemaRef | undefined, spec: OpenApiSpec): OpenApiSchema | undefined {
    if (!schemaRef) return undefined;
    if (schemaRef.$ref) {
        const name = schemaRef.$ref.replace('#/components/schemas/', '');
        return spec.components?.schemas?.[name];
    }
    return schemaRef as OpenApiSchema;
}

function schemaToType(schema: OpenApiSchemaRef, spec: OpenApiSpec): string {
    // $ref → Model type
    if (schema.$ref) {
        return schema.$ref.replace('#/components/schemas/', '');
    }

    // anyOf with null → nullable type
    if (schema.anyOf) {
        const nonNull = schema.anyOf.find(s => s.type !== 'null');
        if (nonNull) {
            return schemaToType(nonNull, spec);
        }
    }

    // Basic types
    switch (schema.type) {
        case 'string': return 'String';
        case 'integer': return 'int';
        case 'number': return 'double';
        case 'boolean': return 'bool';
        case 'array':
            const items = schema.items ? schemaToType(schema.items, spec) : 'dynamic';
            return `List<${items}>`;
        case 'object': return 'Map<String, dynamic>';
        default: return 'dynamic';
    }
}

function cleanOperationId(opId: string): string {
    // e.g. "process_text_api_v1_process_text_post" → "processText"
    const parts = opId.split('_');
    // Take first meaningful parts before api/v1/post/get
    const meaningful = parts.filter(p =>
        !['api', 'v1', 'v2', 'post', 'get', 'put', 'delete'].includes(p)
    );
    // Take first 2-3 meaningful words
    const name = meaningful.slice(0, 3).join('_');
    return snakeToCamel(name);
}

function pathToMethodName(path: string): string {
    return path
        .replace(/^\/api\/v\d+\//, '')
        .replace(/^\//, '')
        .replace(/[{}\/:-]/g, '_')
        .split('_')
        .filter(Boolean)
        .map((w, i) => i === 0 ? w : w[0].toUpperCase() + w.slice(1))
        .join('');
}

function snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Convert camelCase to snake_case
 */
export function camelToSnake(str: string): string {
    return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}
