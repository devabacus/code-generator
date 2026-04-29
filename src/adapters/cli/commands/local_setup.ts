import { Command } from 'commander';
import path from 'path';
import { DefaultFileSystem } from '../../../core/implementations/default_file_system';
import { CliLogger } from '../utils/cli_logger';
import { cliExec } from '../utils/cli_exec';

interface LocalSetupOptions {
    workspace: string;
    skipDockerCompose?: boolean;
    skipMigrations?: boolean;
    runServer?: boolean;
    human?: boolean;
}

export function registerLocalSetup(program: Command): void {
    program
        .command('local-setup')
        .description('Setup local dev environment: docker compose, migrations, build_runner')
        .requiredOption('--workspace <path>', 'Workspace root path (monorepo root)')
        .option('--skip-docker-compose', 'Skip docker compose up')
        .option('--skip-migrations', 'Skip serverpod migrations')
        .option('--run-server', 'Start the server after setup (dart bin/main.dart --apply-migrations)')
        .option('--json', 'Output as JSON (default)', true)
        .option('--human', 'Output as human-readable text')
        .action(async (opts: LocalSetupOptions) => {
            await handleLocalSetup(opts);
        });
}

async function handleLocalSetup(opts: LocalSetupOptions): Promise<void> {
    const jsonMode = !opts.human;
    const logger = new CliLogger(jsonMode);
    const startTime = Date.now();

    try {
        const inner = new DefaultFileSystem();
        const workspacePath = opts.workspace;
        const projectName = path.basename(workspacePath);
        const serverPath = path.join(workspacePath, `${projectName}_server`);
        const flutterPath = path.join(workspacePath, `${projectName}_flutter`);

        if (!await inner.exists(serverPath)) {
            logger.error(`Server project not found: ${serverPath}`);
            logger.emitResult('local-setup', false, startTime);
            process.exit(1);
        }

        // 1. Docker compose up (postgres + redis)
        if (!opts.skipDockerCompose) {
            logger.info('Stopping old containers...');
            await cliExec('docker compose down -v', serverPath, logger).catch(() => {});

            logger.info('Starting Docker containers (postgres + redis)...');
            await cliExec('docker compose up -d', serverPath, logger);

            logger.info('Waiting for PostgreSQL...');
            await waitForPostgres(serverPath, logger);
        }

        // 2. Migrations + generate
        if (!opts.skipMigrations) {
            logger.info('Creating migrations...');
            await cliExec('serverpod create-migration --experimental-features=all --force', serverPath, logger);

            logger.info('Running serverpod generate...');
            await cliExec('serverpod generate --experimental-features=all', serverPath, logger);
        }

        // 3. Build runner for flutter
        if (await inner.exists(flutterPath)) {
            logger.info('Running build_runner for Flutter...');
            await cliExec('dart run build_runner build --delete-conflicting-outputs', flutterPath, logger);
        }

        // 4. Run server with migrations (optional)
        if (opts.runServer) {
            logger.info('Starting server (applying migrations)...');
            await cliExec('dart bin/main.dart --apply-migrations', serverPath, logger);
        }

        logger.emitResult('local-setup', true, startTime);
    } catch (error) {
        logger.error(String(error));
        logger.emitResult('local-setup', false, startTime);
        process.exit(1);
    }
}

async function waitForPostgres(serverPath: string, logger: CliLogger): Promise<void> {
    for (let i = 0; i < 15; i++) {
        try {
            await cliExec('docker compose exec -T postgres pg_isready -U postgres', serverPath, logger, true);
            logger.info('PostgreSQL is ready.');
            return;
        } catch {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    logger.info('PostgreSQL readiness check timed out, proceeding anyway...');
}
