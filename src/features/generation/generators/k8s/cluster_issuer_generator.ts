import * as path from 'path';
import { BaseGenerator } from '../../../../core/generators/base_generator';
import { IFileSystem } from '../../../../core/interfaces/file_system';
import { ServerDataConfig } from '../../parsers/server_data_parser';

export class ClusterIssuerGenerator extends BaseGenerator<ServerDataConfig> {
    constructor(fileSystem: IFileSystem) {
        super(fileSystem);
    }

    protected getPath(basePath: string, _name?: string, _data?: ServerDataConfig): string {
        const projectName = path.basename(basePath);
        return path.join(basePath, `${projectName}_server`, 'k8s_1', 'cluster_issuer.yaml');
    }

    protected getContent(data?: ServerDataConfig): string {
        const email = data?.server?.email || 'admin@example.com';

        return `apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    # Let's Encrypt production server URL
    server: https://acme-v02.api.letsencrypt.org/directory
    
    # Email for notifications from Let's Encrypt
    email: ${email}
    
    # Secret name for ACME account private key
    privateKeySecretRef:
      name: letsencrypt-prod-private-key

    # Domain ownership verification method
    solvers:
    - http01:
        ingress:
          class: traefik
`;
    }
}
