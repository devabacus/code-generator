import * as path from 'path';
import { BaseGenerator } from '../../../../core/generators/base_generator';
import { IFileSystem } from '../../../../core/interfaces/file_system';
import { ServerDataConfig } from '../../parsers/server_data_parser';

export class IngressGenerator extends BaseGenerator<ServerDataConfig> {
    constructor(fileSystem: IFileSystem) {
        super(fileSystem);
    }

    protected getPath(basePath: string, _name?: string, _data?: ServerDataConfig): string {
        const projectName = path.basename(basePath);
        return path.join(basePath, `${projectName}_server`, 'k8s', 'ingress.yaml');
    }

    protected getContent(data?: ServerDataConfig): string {
        if (!data) {
            throw new Error('ServerDataConfig not provided');
        }

        const apiFqdn = `${data.server.subdomain.api}.${data.server.domain}`;
        const insightsFqdn = `${data.server.subdomain.insights}.${data.server.domain}`;
        const webFqdn = `${data.server.subdomain.web}.${data.server.domain}`;
        const appName = data.project.name;

        return `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${appName}-server-ingress
  namespace: ${appName}
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: traefik
  tls:
    - hosts:
        - ${apiFqdn}
        - ${webFqdn}
        - ${insightsFqdn}
      secretName: serverpod-tls-${appName}
  rules:
    - host: "${apiFqdn}"
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ${appName}-server-service
                port:
                  name: api
    - host: "${webFqdn}"
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ${appName}-server-service
                port:
                  name: web
    - host: "${insightsFqdn}"
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ${appName}-server-service
                port:
                  name: insights
`;
    }
}
