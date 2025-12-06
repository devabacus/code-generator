import * as path from 'path';
import { BaseGenerator } from '../../../../core/generators/base_generator';
import { IFileSystem } from '../../../../core/interfaces/file_system';
import { ServerDataConfig } from '../../parsers/server_data_parser';

export class ConfigMapGenerator extends BaseGenerator<ServerDataConfig> {
    constructor(fileSystem: IFileSystem) {
        super(fileSystem);
    }

    protected getPath(basePath: string, _name?: string, _data?: ServerDataConfig): string {
        const projectName = path.basename(basePath);
        return path.join(basePath, `${projectName}_server`, 'k8s', 'configmap.yaml');
    }

    protected getContent(data?: ServerDataConfig): string {
        if (!data) {
            throw new Error('ServerDataConfig not provided');
        }

        const apiFqdn = `${data.server.subdomain.api}.${data.server.domain}`;
        const insightsFqdn = `${data.server.subdomain.insights}.${data.server.domain}`;
        const webFqdn = `${data.server.subdomain.web}.${data.server.domain}`;
        const appName = data.project.name;
        const reddis = data.reddis;
        const db = data.database;

        return `# configmap-${appName}.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: serverpod-config-${appName}
  namespace: ${appName}
data:
  # --- Database settings for ${appName} ---
  SERVERPOD_DATABASE_HOST: "${db.host}"
  SERVERPOD_DATABASE_PORT: "${db.port}"
  SERVERPOD_DATABASE_NAME: "${db.name}"
  SERVERPOD_DATABASE_USER: "${db.user}"
  SERVERPOD_DATABASE_REQUIRE_SSL: "true"

  SERVERPOD_API_SERVER_PORT: "8080"
  SERVERPOD_INSIGHTS_SERVER_PORT: "8081"
  SERVERPOD_WEB_SERVER_PORT: "8082"

  SERVERPOD_REDIS_ENABLED: "true"
  SERVERPOD_REDIS_HOST: "${reddis.host}"
  SERVERPOD_REDIS_PORT: "${reddis.port}"
  SERVERPOD_REDIS_USER: "${reddis.user}"

  SERVERPOD_API_SERVER_PUBLIC_HOST: "${apiFqdn}"
  SERVERPOD_API_SERVER_PUBLIC_PORT: "443"
  SERVERPOD_API_SERVER_PUBLIC_SCHEME: "https"

  SERVERPOD_WEB_SERVER_PUBLIC_HOST: "${webFqdn}"
  SERVERPOD_WEB_SERVER_PUBLIC_PORT: "443"
  SERVERPOD_WEB_SERVER_PUBLIC_SCHEME: "https"

  SERVERPOD_INSIGHTS_SERVER_PUBLIC_HOST: "${insightsFqdn}"
  SERVERPOD_INSIGHTS_SERVER_PUBLIC_PORT: "443"
  SERVERPOD_INSIGHTS_SERVER_PUBLIC_SCHEME: "https"

  # --- General settings ---
  SERVERPOD_MAX_REQUEST_SIZE: "524288"
  SERVERPOD_LOGGING_MODE: "normal"
`;
    }
}
