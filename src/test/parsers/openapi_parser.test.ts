import * as assert from 'assert';
import { parseOpenApi, ParsedEndpoint } from '../../features/generation/parsers/openapi_parser';

suite('OpenAPI Parser Test Suite', () => {

    test('should parse valid OpenAPI 3.x spec', () => {
        const spec = JSON.stringify({
            openapi: '3.1.0',
            info: { title: 'Test API', version: '1.0' },
            paths: {
                '/api/v1/example': {
                    get: {
                        summary: 'Get example',
                        operationId: 'get_example_api_v1_example_get'
                    }
                }
            }
        });

        const result = parseOpenApi(spec);

        assert.strictEqual(result.serviceTitle, 'Test API');
        assert.strictEqual(result.endpoints.length, 1);
        assert.strictEqual(result.endpoints[0].method, 'GET');
    });

    test('should extract multiple endpoints from paths', () => {
        const spec = JSON.stringify({
            openapi: '3.1.0',
            info: { title: 'Multi API', version: '1.0' },
            paths: {
                '/api/v1/users': {
                    get: { summary: 'Get users', operationId: 'get_users' },
                    post: { summary: 'Create user', operationId: 'create_user' }
                },
                '/api/v1/items': {
                    get: { summary: 'Get items', operationId: 'get_items' }
                }
            }
        });

        const result = parseOpenApi(spec);

        assert.strictEqual(result.endpoints.length, 3);

        const methods = result.endpoints.map((e: ParsedEndpoint) => e.method);
        assert.ok(methods.includes('GET'));
        assert.ok(methods.includes('POST'));
    });

    test('should skip internal paths (health, openapi, docs)', () => {
        const spec = JSON.stringify({
            openapi: '3.1.0',
            info: { title: 'API', version: '1.0' },
            paths: {
                '/health': { get: { summary: 'Health' } },
                '/openapi.json': { get: { summary: 'OpenAPI' } },
                '/docs': { get: { summary: 'Docs' } },
                '/api/v1/real': { get: { summary: 'Real endpoint' } }
            }
        });

        const result = parseOpenApi(spec);

        // Only real endpoint should be parsed
        assert.strictEqual(result.endpoints.length, 1);
        assert.ok(result.endpoints[0].path.includes('real'));
    });

    test('should clean operationId correctly', () => {
        const spec = JSON.stringify({
            openapi: '3.1.0',
            info: { title: 'API', version: '1.0' },
            paths: {
                '/api/v1/process-text': {
                    post: {
                        summary: 'Process text',
                        operationId: 'process_text_api_v1_process_text_post'
                    }
                }
            }
        });

        const result = parseOpenApi(spec);

        assert.strictEqual(result.endpoints.length, 1);
        // operationId should be cleaned to camelCase
        assert.strictEqual(result.endpoints[0].name, 'processText');
    });

    test('should handle empty paths', () => {
        const spec = JSON.stringify({
            openapi: '3.1.0',
            info: { title: 'Empty API', version: '1.0' },
            paths: {}
        });

        const result = parseOpenApi(spec);

        assert.strictEqual(result.endpoints.length, 0);
        assert.strictEqual(result.serviceTitle, 'Empty API');
    });

    test('should extract request fields from requestBody', () => {
        const spec = JSON.stringify({
            openapi: '3.1.0',
            info: { title: 'API', version: '1.0' },
            paths: {
                '/api/v1/create': {
                    post: {
                        summary: 'Create item',
                        operationId: 'create_item',
                        requestBody: {
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            name: { type: 'string' },
                                            count: { type: 'integer' }
                                        },
                                        required: ['name']
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        const result = parseOpenApi(spec);

        assert.strictEqual(result.endpoints.length, 1);
        const ep = result.endpoints[0];
        assert.strictEqual(ep.requestFields.length, 2);

        const nameField = ep.requestFields.find((f: { name: string }) => f.name === 'name');
        assert.ok(nameField);
        assert.strictEqual(nameField!.nullable, false);

        const countField = ep.requestFields.find((f: { name: string }) => f.name === 'count');
        assert.ok(countField);
        assert.strictEqual(countField!.nullable, true);
    });
});
