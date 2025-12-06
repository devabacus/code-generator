import * as path from 'path';
import { BaseGenerator } from '../../../../core/generators/base_generator';
import { IFileSystem } from '../../../../core/interfaces/file_system';
import { ServerDataConfig } from '../../parsers/server_data_parser';

export class PgProxyPodGenerator extends BaseGenerator<ServerDataConfig> {
    constructor(fileSystem: IFileSystem) {
        super(fileSystem);
    }

    protected getPath(basePath: string, _name?: string, _data?: ServerDataConfig): string {
        const projectName = path.basename(basePath);
        return path.join(basePath, `${projectName}_server`, 'k8s_1', 'pg-proxy-pod.yaml');
    }

    protected getContent(data?: ServerDataConfig): string {
        if (!data) {
            throw new Error('ServerDataConfig not provided');
        }

        const appName = data.project.name;
        const db = data.database;

        return `apiVersion: v1
kind: Pod
metadata:
  namespace: ${appName}
  name: pg-proxy-pod
spec:
  containers:
    - name: socat-proxy
      image: alpine/socat
      args:
        - "TCP-LISTEN:5432,fork,reuseaddr"
        - "TCP:${db.host}:${db.port}"
      ports:
        - name: postgres-port
          containerPort: 5432
      resources:
        requests:
          memory: "16Mi"
          cpu: "10m"
        limits:
          memory: "64Mi"
          cpu: "100m"
`;
    }
}
