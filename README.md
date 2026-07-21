# Code Generator

VS Code extension for generating Serverpod/Flutter projects and entities.

## Features

- **Create New Project**: Generate a complete Serverpod monorepo with Flutter, Server, and Admin apps
- **Create Data Files from YAML**: Parse Serverpod YAML models and generate entity files with Drift tables
- **sync_core 0.3.0 multi-entity sync**: generates outbox-first sync infrastructure (5 adapter файлов на entity + mutation-first Repository + idempotent orchestrator registration patcher), validated cross-device на Windows + Android (через t115/TASK-001). См. [docs-code-generator/sync-core-integration.md](docs-code-generator/sync-core-integration.md).

## Usage

1. Open Command Palette (Ctrl+Shift+P)
2. Type "Flutter handler"
3. Select an action:
   - "New project with serverpod" - Creates a new Serverpod project
   - "Create data files from yaml" - Generates entity files from current YAML file

## Requirements

- Serverpod CLI installed
- Flutter SDK installed

## AI workflow (`ai/`)

AI-агентам — входная точка: [`ai/core/docs/INDEX.md`](ai/core/docs/INDEX.md) (upstream-фреймворк) и проектный индекс [`ai/project/docs/INDEX.md`](ai/project/docs/INDEX.md) (состояние проекта, onboarding). Граница `core/` (upstream, синхронизируется через `sync.py`) и `project/` (проектный контент) описана в гайде миграции `ai/core/guides/migration-v1-to-v2.md`.
