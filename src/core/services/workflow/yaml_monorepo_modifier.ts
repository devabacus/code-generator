import path from 'path';
import { parseDocument, YAMLMap, YAMLSeq, isCollection, isScalar } from 'yaml';
import { WorkflowDependencies } from './types';
import { findWorkflowFile } from './workflow_file_finder';

/**
 * Модифицирует workflow для использования в монорепо с использованием YAML-парсера.
 */
export async function modifyForMonorepoYaml(
    deps: WorkflowDependencies,
    projectPath: string,
    projectName: string,
    relativePath: string,
    templateName: string
): Promise<void> {
    const workflowDir = path.join(projectPath, '.github', 'workflows');
    const workflowPath = await findWorkflowFile(deps, workflowDir);

    if (!workflowPath) {
        return;
    }

    let content = await deps.fileSystem.readFile(workflowPath);

    // Сначала делаем простую замену имен (как в оригинале)
    if (templateName !== projectName) {
        content = content.replace(new RegExp(templateName, 'g'), projectName);
    }

    const doc = parseDocument(content);

    // 1. Обновляем paths фильтр
    const on = doc.get('on') as any;
    if (on) {
        let push = on instanceof YAMLMap ? on.get('push') : on;
        if (push instanceof YAMLMap) {
            let paths = push.get('paths') as YAMLSeq;
            if (!paths) {
                paths = new YAMLSeq();
                push.set('paths', paths);
            }

            const requiredPaths = [
                `${relativePath}/**`,
                `.github/workflows/deployment-${projectName}.yml`
            ];

            for (const p of requiredPaths) {
                if (!paths.items.some(item => isScalar(item) && item.value === p)) {
                    paths.add(p);
                }
            }
        }
    }

    // 2. Обновляем jobs
    const jobs = doc.get('jobs') as YAMLMap;
    if (jobs) {
        // Задача test
        const testJob = jobs.get('test') as YAMLMap;
        if (testJob) {
            let defaults = testJob.get('defaults') as YAMLMap;
            if (!defaults) {
                defaults = new YAMLMap();
                testJob.set('defaults', defaults);
            }
            let run = defaults.get('run') as YAMLMap;
            if (!run) {
                run = new YAMLMap();
                defaults.set('run', run);
            }
            run.set('working-directory', relativePath);
        }

        // Задача build-and-push (Docker)
        const buildJob = jobs.get('build-and-push') as YAMLMap;
        if (buildJob) {
            const steps = buildJob.get('steps') as YAMLSeq;
            if (steps) {
                for (const step of steps.items as YAMLMap[]) {
                    const uses = step.get('uses') as string;
                    if (uses && uses.includes('docker/build-push-action')) {
                        let withBlock = step.get('with') as YAMLMap;
                        if (!withBlock) {
                            withBlock = new YAMLMap();
                            step.set('with', withBlock);
                        }

                        // Обновляем context и file
                        const context = withBlock.get('context') as string;
                        if (!context || !context.includes(relativePath)) {
                            withBlock.set('context', `./${relativePath}`);
                        }

                        const file = withBlock.get('file') as string;
                        if (file && !file.includes(relativePath)) {
                            // Заменяем ./ на ./${relativePath}/
                            withBlock.set('file', file.replace('./', `./${relativePath}/`));
                        }
                    }
                }
            }
        }

        // Задача deploy (K8s paths)
        const deployJob = jobs.get('deploy') as YAMLMap;
        if (deployJob) {
            const steps = deployJob.get('steps') as YAMLSeq;
            if (steps) {
                for (const step of steps.items as YAMLMap[]) {
                    const runScript = step.get('run') as string;
                    if (runScript) {
                        // Обновляем пути к манифестам в sed и kubectl
                        let updatedScript = runScript;
                        const k8sFiles = ['configmap.yaml', 'service.yaml', 'deployment.yaml'];
                        for (const file of k8sFiles) {
                            updatedScript = updatedScript.replace(
                                new RegExp(`(?<!${relativePath}/)k8s/${file}`, 'g'),
                                `${relativePath}/k8s/${file}`
                            );
                        }
                        if (updatedScript !== runScript) {
                            step.set('run', updatedScript);
                        }
                    }
                }
            }
        }
    }

    // 3. Специфично для Go (golangci-lint)
    const testSteps = doc.getIn(['jobs', 'test', 'steps']) as YAMLSeq;
    if (testSteps && testSteps.items) {
        testSteps.items.forEach((step: any) => {
            if (step instanceof YAMLMap) {
                const uses = step.get('uses') as string;
                if (uses && uses.includes('golangci/golangci-lint-action')) {
                    let withBlock = step.get('with') as YAMLMap;
                    if (!withBlock) {
                        withBlock = new YAMLMap();
                        step.set('with', withBlock);
                    }
                    withBlock.set('working-directory', relativePath);
                }
            }
        });
    }

    const finalContent = doc.toString();
    await deps.fileSystem.createFile(workflowPath, finalContent);

    // Переименовываем файл
    const newWorkflowPath = path.join(workflowDir, `deployment-${projectName}.yml`);
    if (workflowPath !== newWorkflowPath) {
        await deps.fileSystem.createFile(newWorkflowPath, finalContent);
        await deps.fileSystem.deleteFile(workflowPath);
    }
}
