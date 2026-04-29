#!/usr/bin/env node
import { Command } from 'commander';
import { registerGenerateEntity } from './commands/generate_entity';
import { registerGenerateK8s } from './commands/generate_k8s';
import { registerCreateProject } from './commands/create_project';
import { registerAddMicroservice } from './commands/add_microservice';
import { registerImportMicroservice } from './commands/import_microservice';
import { registerExportMicroservice } from './commands/export_microservice';
import { registerRemoveMicroservice } from './commands/remove_microservice';
import { registerSetupCicd } from './commands/setup_cicd';
import { registerGenerateOpenApiBridge } from './commands/generate_openapi_bridge';
import { registerLocalSetup } from './commands/local_setup';
import { registerVerify } from './commands/verify';

const program = new Command();

program
    .name('codegen')
    .description('Serverpod monorepo code generator CLI — for AI agents and terminal usage')
    .version('0.0.1');

// Generation commands
registerGenerateEntity(program);
registerGenerateK8s(program);
registerGenerateOpenApiBridge(program);

// Project commands
registerCreateProject(program);
registerAddMicroservice(program);
registerImportMicroservice(program);
registerExportMicroservice(program);
registerRemoveMicroservice(program);

// Infrastructure
registerLocalSetup(program);
registerSetupCicd(program);

// Verification (Definition of Done — обязательно после правок генератора/шаблона)
registerVerify(program);

program.parse();
