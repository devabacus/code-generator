import { Command } from 'commander';
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CliLogger } from '../utils/cli_logger';

interface VerifyOptions {
    name: string;
    projectsPath: string;
    skipServerpod?: boolean;
    skipBuildRunner?: boolean;
    skipPubGet?: boolean;
    json?: boolean;
    human?: boolean;
}

interface StepResult {
    ok: boolean;
    ms: number;
    summary?: string;
    error?: string;
    counts?: { errors: number; warnings: number; infos: number };
}

interface VerifyResult {
    success: boolean;
    command: string;
    project: string;
    project_path: string;
    steps: {
        pubGet?: StepResult;
        serverpodGenerate?: StepResult;
        buildRunner?: StepResult;
        flutterAnalyze: StepResult;
    };
    errors: string[];
    duration_ms: number;
}

const isWindows = process.platform === 'win32';

function runCommand(command: string, cwd: string, timeoutMs = 600_000): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
        // На Windows запускаем через PowerShell — иначе .bat (flutter, serverpod, dart) не находятся.
        const child = exec(
            command,
            { cwd, maxBuffer: 50 * 1024 * 1024, ...(isWindows ? { shell: 'powershell.exe' } : {}), timeout: timeoutMs },
            () => { /* колбэк не используем — ждём 'close' для exit code */ },
        );
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (d) => { stdout += d.toString(); });
        child.stderr?.on('data', (d) => { stderr += d.toString(); });
        child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
        child.on('error', (e) => resolve({ code: -1, stdout, stderr: stderr + '\n' + String(e) }));
    });
}

export function parseAnalyzerCounts(combined: string): { errors: number; warnings: number; infos: number } {
    // flutter analyze формат:
    //    error - desc - file.dart:1:1 - rule
    //    warning - desc - file.dart:1:1 - rule
    //    info - desc - file.dart:1:1 - rule
    let errors = 0, warnings = 0, infos = 0;
    for (const line of combined.split(/\r?\n/)) {
        const m = line.match(/^\s*(error|warning|info)\s+-\s/);
        if (!m) { continue; }
        if (m[1] === 'error') { errors++; }
        else if (m[1] === 'warning') { warnings++; }
        else { infos++; }
    }
    return { errors, warnings, infos };
}

export function lastLines(s: string, n: number): string {
    const lines = s.split(/\r?\n/).filter(l => l.trim().length > 0);
    return lines.slice(-n).join('\n');
}

export function registerVerify(program: Command): void {
    program
        .command('verify')
        .description('Verify generated project end-to-end: serverpod generate + build_runner + flutter analyze. Use this to confirm that generator/template changes produce a working project.')
        .requiredOption('--name <name>', 'Project name (folder under --projects-path)')
        .option('--projects-path <path>', 'Base path for projects', 'G:/Projects/Flutter/serverpod')
        .option('--skip-pub-get', 'Skip flutter/dart pub get')
        .option('--skip-serverpod', 'Skip serverpod generate')
        .option('--skip-build-runner', 'Skip dart run build_runner')
        .option('--json', 'Output as JSON (default)', true)
        .option('--human', 'Output as human-readable text')
        .action(async (opts: VerifyOptions) => {
            await handleVerify(opts);
        });
}

async function handleVerify(opts: VerifyOptions): Promise<void> {
    const jsonMode = !opts.human;
    const logger = new CliLogger(jsonMode);
    const startTime = Date.now();
    const projectPath = path.join(opts.projectsPath, opts.name);
    const flutterPath = path.join(projectPath, `${opts.name}_flutter`);
    const serverPath = path.join(projectPath, `${opts.name}_server`);

    const result: VerifyResult = {
        success: false,
        command: 'verify',
        project: opts.name,
        project_path: projectPath,
        steps: { flutterAnalyze: { ok: false, ms: 0 } },
        errors: [],
        duration_ms: 0,
    };

    try {
        // Pre-check: project exists
        try {
            await fs.access(flutterPath);
            await fs.access(serverPath);
        } catch {
            logger.error(`Project not found: missing ${flutterPath} or ${serverPath}`);
            result.errors.push(`Project not found at ${projectPath}`);
            emitVerifyResult(result, jsonMode, startTime);
            process.exit(1);
        }

        // Step 1: pub get (server + flutter)
        if (!opts.skipPubGet) {
            logger.info('[1/4] dart pub get (server)...');
            const t = Date.now();
            const r = await runCommand('dart pub get', serverPath, 180_000);
            result.steps.pubGet = {
                ok: r.code === 0,
                ms: Date.now() - t,
                summary: lastLines(r.stdout || r.stderr, 3),
            };
            if (r.code !== 0) {
                result.steps.pubGet.error = lastLines(r.stderr || r.stdout, 5);
                result.errors.push('dart pub get (server) failed');
                emitVerifyResult(result, jsonMode, startTime);
                process.exit(1);
            }

            logger.info('[1/4] flutter pub get (flutter)...');
            const t2 = Date.now();
            const r2 = await runCommand('flutter pub get', flutterPath, 240_000);
            // Объединяем оба прогона в один step.summary
            result.steps.pubGet.ms += Date.now() - t2;
            if (r2.code !== 0) {
                result.steps.pubGet.ok = false;
                result.steps.pubGet.error = lastLines(r2.stderr || r2.stdout, 5);
                result.errors.push('flutter pub get failed');
                emitVerifyResult(result, jsonMode, startTime);
                process.exit(1);
            }
            result.steps.pubGet.summary = lastLines(r2.stdout || r2.stderr, 3);
        }

        // Step 2: serverpod generate
        if (!opts.skipServerpod) {
            logger.info('[2/4] serverpod generate --experimental-features=all...');
            const t = Date.now();
            const r = await runCommand('serverpod generate --experimental-features=all', serverPath, 300_000);
            result.steps.serverpodGenerate = {
                ok: r.code === 0,
                ms: Date.now() - t,
                summary: lastLines(r.stdout, 5),
            };
            if (r.code !== 0) {
                result.steps.serverpodGenerate.error = lastLines(r.stderr || r.stdout, 10);
                result.errors.push('serverpod generate failed');
                emitVerifyResult(result, jsonMode, startTime);
                process.exit(1);
            }
        }

        // Step 3: build_runner
        if (!opts.skipBuildRunner) {
            logger.info('[3/4] dart run build_runner build --delete-conflicting-outputs...');
            const t = Date.now();
            const r = await runCommand(
                'dart run build_runner build --delete-conflicting-outputs',
                flutterPath,
                600_000,
            );
            result.steps.buildRunner = {
                ok: r.code === 0,
                ms: Date.now() - t,
                summary: lastLines(r.stdout, 5),
            };
            if (r.code !== 0) {
                result.steps.buildRunner.error = lastLines(r.stderr || r.stdout, 10);
                result.errors.push('build_runner failed');
                emitVerifyResult(result, jsonMode, startTime);
                process.exit(1);
            }
        }

        // Step 4: flutter analyze (всегда — это главный гейт)
        logger.info('[4/4] flutter analyze...');
        const t = Date.now();
        const r = await runCommand('flutter analyze', flutterPath, 300_000);
        const combined = (r.stdout || '') + '\n' + (r.stderr || '');
        const counts = parseAnalyzerCounts(combined);
        // flutter analyze возвращает non-zero если есть errors или warnings. Нам важны errors=0.
        const analyzerOk = counts.errors === 0;
        result.steps.flutterAnalyze = {
            ok: analyzerOk,
            ms: Date.now() - t,
            counts,
            summary: lastLines(combined, 3),
        };
        if (!analyzerOk) {
            result.errors.push(`flutter analyze: ${counts.errors} errors`);
        }

        result.success = result.errors.length === 0;
        emitVerifyResult(result, jsonMode, startTime);
        process.exit(result.success ? 0 : 1);
    } catch (e) {
        result.errors.push(String(e));
        emitVerifyResult(result, jsonMode, startTime);
        process.exit(1);
    }
}

function emitVerifyResult(result: VerifyResult, jsonMode: boolean, startTime: number): void {
    result.duration_ms = Date.now() - startTime;
    if (jsonMode) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
        const tag = result.success ? 'PASS' : 'FAIL';
        console.log(`\n${tag}: verify ${result.project}`);
        console.log(`  project: ${result.project_path}`);
        for (const [stepName, step] of Object.entries(result.steps)) {
            if (!step) { continue; }
            const mark = step.ok ? '✓' : '✗';
            const extra = step.counts
                ? ` (errors=${step.counts.errors}, warnings=${step.counts.warnings}, infos=${step.counts.infos})`
                : '';
            console.log(`  ${mark} ${stepName} — ${step.ms}ms${extra}`);
            if (step.error) {
                console.log(`    error: ${step.error.split('\n').join('\n      ')}`);
            }
        }
        if (result.errors.length > 0) {
            console.log(`Errors:`);
            result.errors.forEach(e => console.log(`  ! ${e}`));
        }
        console.log(`Total: ${result.duration_ms}ms`);
    }
}
