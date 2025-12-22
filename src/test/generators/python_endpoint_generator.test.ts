import * as assert from 'assert';
import { PythonEndpointGenerator } from '../../features/generation/generators/python/python_endpoint_generator';
import { ParsedEndpoint } from '../../features/generation/parsers/openapi_parser';
import { MockFileSystem } from '../mocks/mock_file_system';

suite('PythonEndpointGenerator Test Suite', () => {
    let mockFs: MockFileSystem;
    let generator: PythonEndpointGenerator;

    setup(() => {
        mockFs = new MockFileSystem();
        generator = new PythonEndpointGenerator(mockFs);
    });

    test('should generate correct path for endpoint file', () => {
        const path = generator.getPath('/workspace/myproject', 'python');
        assert.ok(path.includes('myproject_server'));
        assert.ok(path.includes('endpoints'));
        assert.ok(path.endsWith('python_endpoint.dart'));
    });

    test('should create initial file with markers', async () => {
        const basePath = '/workspace/testproject';
        const endpoints: ParsedEndpoint[] = [];

        // Create endpoints directory structure
        mockFs.setDirectory('/workspace/testproject/testproject_server/lib/src/endpoints');

        await generator.generate(basePath, endpoints, 'python', 8000);

        const filePath = generator.getPath(basePath, 'python');
        const content = await mockFs.readFile(filePath);

        assert.ok(content.includes('class PythonEndpoint'));
        assert.ok(content.includes('MicroserviceEndpoint'));
        assert.ok(content.includes('// === generated_start:methods ==='));
        assert.ok(content.includes('// === generated_end:methods ==='));
        assert.ok(content.includes('PYTHON_SERVICE_URL'));
        assert.ok(content.includes('8000'));
    });

    test('should generate method for GET endpoint', async () => {
        const basePath = '/workspace/testproject';
        const endpoints: ParsedEndpoint[] = [{
            name: 'getExample',
            path: '/api/v1/example',
            method: 'GET',
            description: 'Get example data',
            requestFields: [],
            responseType: 'String'
        }];

        mockFs.setDirectory('/workspace/testproject/testproject_server/lib/src/endpoints');

        await generator.generate(basePath, endpoints, 'test', 3000);

        const filePath = generator.getPath(basePath, 'test');
        const content = await mockFs.readFile(filePath);

        assert.ok(content.includes('Future<String> getExample'));
        assert.ok(content.includes("callGet(session, '/api/v1/example')"));
    });

    test('should generate method for POST endpoint with body', async () => {
        const basePath = '/workspace/testproject';
        const endpoints: ParsedEndpoint[] = [{
            name: 'createItem',
            path: '/api/v1/items',
            method: 'POST',
            description: 'Create new item',
            requestFields: [
                { name: 'name', originalName: 'name', type: 'String', nullable: false },
                { name: 'count', originalName: 'count', type: 'int', nullable: true }
            ],
            responseType: 'String'
        }];

        mockFs.setDirectory('/workspace/testproject/testproject_server/lib/src/endpoints');

        await generator.generate(basePath, endpoints, 'items', 8000);

        const filePath = generator.getPath(basePath, 'items');
        const content = await mockFs.readFile(filePath);

        assert.ok(content.includes('Future<String> createItem'));
        assert.ok(content.includes('String name'));
        assert.ok(content.includes('int? count')); // nullable
        assert.ok(content.includes("'name': name"));
        assert.ok(content.includes("callPost(session, '/api/v1/items'"));
    });

    test('should handle duplicate method names by adding HTTP method suffix', async () => {
        const basePath = '/workspace/testproject';
        const endpoints: ParsedEndpoint[] = [
            {
                name: 'example',
                path: '/api/v1/example',
                method: 'GET',
                requestFields: [],
                responseType: 'String'
            },
            {
                name: 'example',
                path: '/api/v1/example',
                method: 'POST',
                requestFields: [],
                responseType: 'String'
            }
        ];

        mockFs.setDirectory('/workspace/testproject/testproject_server/lib/src/endpoints');

        await generator.generate(basePath, endpoints, 'dup', 8000);

        const filePath = generator.getPath(basePath, 'dup');
        const content = await mockFs.readFile(filePath);

        // Should have both methods with suffixes
        assert.ok(content.includes('exampleGet'));
        assert.ok(content.includes('examplePost'));
    });

    test('should replace content between markers', async () => {
        const basePath = '/workspace/testproject';
        const filePath = '/workspace/testproject/testproject_server/lib/src/endpoints/update_endpoint.dart';

        // Set up existing file with markers
        const existingContent = `import 'package:serverpod/serverpod.dart';

class UpdateEndpoint extends MicroserviceEndpoint {
  // === generated_start:methods ===
  // Old methods here
  Future<String> oldMethod(Session session) => callGet(session, '/old');
  // === generated_end:methods ===
}`;

        mockFs.setFile(filePath, existingContent);

        const endpoints: ParsedEndpoint[] = [{
            name: 'newMethod',
            path: '/api/v1/new',
            method: 'GET',
            requestFields: [],
            responseType: 'String'
        }];

        await generator.generate(basePath, endpoints, 'update', 8000);

        const content = await mockFs.readFile(filePath);

        // Old method should be replaced
        assert.ok(!content.includes('oldMethod'));
        // New method should be present
        assert.ok(content.includes('newMethod'));
        // Markers should still exist
        assert.ok(content.includes('// === generated_start:methods ==='));
        assert.ok(content.includes('// === generated_end:methods ==='));
    });
});
