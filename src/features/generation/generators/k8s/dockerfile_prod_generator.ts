import * as path from 'path';
import { BaseGenerator } from '../../../../core/generators/base_generator';
import { IFileSystem } from '../../../../core/interfaces/file_system';
import { ServerDataConfig } from '../../parsers/server_data_parser';

export class DockerfileProdGenerator extends BaseGenerator<ServerDataConfig> {
    constructor(fileSystem: IFileSystem) {
        super(fileSystem);
    }

    protected getPath(basePath: string, _name?: string, _data?: ServerDataConfig): string {
        const projectName = path.basename(basePath);
        return path.join(basePath, `${projectName}_server`, 'Dockerfile.prod');
    }

    protected getContent(_data?: ServerDataConfig): string {
        return `# --- Stage 1: Build application ---
FROM dart:stable AS builder

ARG GITHUB_PAT
ARG GITHUB_USER

WORKDIR /app

COPY pubspec.yaml pubspec.lock ./

RUN if [ -n "$GITHUB_PAT" ] && [ -n "$GITHUB_USER" ]; then \\
    echo "Configuring Git to use provided GitHub token..."; \\
    git config --global url."https://\${GITHUB_USER}:\${GITHUB_PAT}@github.com/".insteadOf "https://github.com/"; \\
    else \\
    echo "No GitHub token provided. Skipping Git configuration..."; \\
    fi

RUN dart pub get

COPY . .

RUN dart compile exe bin/main.dart -o /server


# --- Stage 2: Production image ---
FROM debian:12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \\
    ca-certificates \\
    libssl3 \\
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 serverpod && \\
    useradd --system --uid 1001 --gid 1001 serverpod

COPY --from=builder /server /usr/local/bin/server

COPY --from=builder /app/config/ /app/config/
COPY --from=builder /app/web/ /app/web/
COPY --from=builder /app/migrations/ /app/migrations/

WORKDIR /app
RUN chown -R serverpod:serverpod /app

USER serverpod

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:8082/ || exit 1

EXPOSE 8080
EXPOSE 8081
EXPOSE 8082

ENTRYPOINT ["/usr/local/bin/server"]

CMD ["--mode", "production", "--role", "monolith"]
`;
    }
}
