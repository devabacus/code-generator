import * as assert from 'assert';
import { TemplateService, TemplateInfo } from '../../core/services/template_service';
import { MockFileSystem } from '../mocks/mock_file_system';

suite('TemplateService Test Suite', () => {
    let mockFs: MockFileSystem;
    let service: TemplateService;

    setup(() => {
        mockFs = new MockFileSystem();
        service = new TemplateService(mockFs);
    });

    test('should scan templates from directory', async () => {
        // Setup template structure
        mockFs.setDirectory('/templates/python/python-fastapi');
        mockFs.setDirectory('/templates/python/python-flask');
        mockFs.setDirectory('/templates/node/node-fastify');
        mockFs.setFile('/templates/python/python-fastapi/main.py', '# main');
        mockFs.setFile('/templates/python/python-flask/app.py', '# app');
        mockFs.setFile('/templates/node/node-fastify/index.ts', '// index');

        const templates = await service.scanTemplates('/templates');

        assert.strictEqual(templates.length, 3);

        const pythonTemplates = templates.filter((t: TemplateInfo) => t.category === 'python');
        assert.strictEqual(pythonTemplates.length, 2);

        const nodeTemplates = templates.filter((t: TemplateInfo) => t.category === 'node');
        assert.strictEqual(nodeTemplates.length, 1);
    });

    test('should filter templates by category', async () => {
        mockFs.setDirectory('/templates/python/python-fastapi');
        mockFs.setDirectory('/templates/node/node-fastify');
        mockFs.setFile('/templates/python/python-fastapi/main.py', '# main');
        mockFs.setFile('/templates/node/node-fastify/index.ts', '// index');

        const pythonOnly = await service.scanTemplates('/templates', 'python');

        assert.strictEqual(pythonOnly.length, 1);
        assert.strictEqual(pythonOnly[0].category, 'python');
        assert.strictEqual(pythonOnly[0].name, 'python-fastapi');
    });

    test('should read description from template.json', async () => {
        mockFs.setDirectory('/templates/go/go-gin');
        mockFs.setFile('/templates/go/go-gin/main.go', 'package main');
        mockFs.setFile('/templates/go/go-gin/template.json', JSON.stringify({
            description: 'Go microservice with Gin framework'
        }));

        const templates = await service.scanTemplates('/templates', 'go');

        assert.strictEqual(templates.length, 1);
        assert.strictEqual(templates[0].description, 'Go microservice with Gin framework');
    });

    test('should copy template to destination', async () => {
        // Setup source template
        mockFs.setFile('/templates/test/src/main.ts', 'console.log("hello")');
        mockFs.setFile('/templates/test/package.json', '{"name": "test"}');
        mockFs.setDirectory('/templates/test/src');

        await service.copyTemplate('/templates/test', '/projects/myapp');

        // Check files were copied
        const mainContent = await mockFs.readFile('/projects/myapp/src/main.ts');
        assert.strictEqual(mainContent, 'console.log("hello")');

        const pkgContent = await mockFs.readFile('/projects/myapp/package.json');
        assert.strictEqual(pkgContent, '{"name": "test"}');
    });

    test('should ignore specified patterns when copying', async () => {
        mockFs.setFile('/templates/test/main.ts', 'code');
        mockFs.setFile('/templates/test/node_modules/dep/index.js', 'dependency');
        mockFs.setFile('/templates/test/.git/config', 'git config');
        mockFs.setDirectory('/templates/test/node_modules');
        mockFs.setDirectory('/templates/test/.git');

        await service.copyTemplate('/templates/test', '/projects/myapp', [
            'node_modules',
            '.git'
        ]);

        // Main file should be copied
        assert.ok(await mockFs.exists('/projects/myapp/main.ts'));

        // Ignored files should not exist
        assert.ok(!(await mockFs.exists('/projects/myapp/node_modules')));
        assert.ok(!(await mockFs.exists('/projects/myapp/.git')));
    });

    test('should return empty array for non-existent path', async () => {
        const templates = await service.scanTemplates('/nonexistent');
        assert.strictEqual(templates.length, 0);
    });

    test('should handle template without template.json', async () => {
        mockFs.setDirectory('/templates/simple/basic-app');
        mockFs.setFile('/templates/simple/basic-app/index.js', '// app');

        const templates = await service.scanTemplates('/templates', 'simple');

        assert.strictEqual(templates.length, 1);
        assert.strictEqual(templates[0].name, 'basic-app');
        assert.strictEqual(templates[0].description, undefined);
    });
});
