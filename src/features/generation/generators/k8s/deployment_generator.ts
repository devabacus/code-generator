import * as path from 'path';
import { BaseGenerator } from '../../../../core/generators/base_generator';
import { IFileSystem } from '../../../../core/interfaces/file_system';
import { ServerDataConfig } from '../../parsers/server_data_parser';

export class DeploymentGenerator extends BaseGenerator<ServerDataConfig> {
    constructor(fileSystem: IFileSystem) {
        super(fileSystem);
    }

    protected getPath(basePath: string, _name?: string, _data?: ServerDataConfig): string {
        const projectName = path.basename(basePath);
        return path.join(basePath, `${projectName}_server`, 'k8s', 'deployment.yaml');
    }

    protected getContent(data?: ServerDataConfig): string {
        if (!data) {
            throw new Error('ServerDataConfig not provided');
        }

        const appName = data.project.name;

        return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${appName}-server-deployment
  namespace: ${appName}
  labels:
    app: ${appName}-server
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${appName}-server
  template:
    metadata:
      labels:
        app: ${appName}-server
    spec:
      imagePullSecrets:
        - name: timeweb-registry-secret

      containers:
        - name: ${appName}-server

          image: ...registry.twcstorage.ru/${appName}-server:latest
          command:
            [
              "/usr/local/bin/server",
              "--mode",
              "production",
              "--role",
              "monolith",
            ]

          imagePullPolicy: Always

          ports:
            - containerPort: 8080
            - containerPort: 8081
            - containerPort: 8082

          envFrom:
            - configMapRef:
                name: serverpod-config-${appName}

          env:
            - name: SERVERPOD_DATABASE_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: serverpod-secrets-${appName}
                  key: database-password
            - name: SERVERPOD_REDIS_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: serverpod-secrets-${appName}
                  key: redis-password
            - name: SERVERPOD_SERVICE_SECRET
              valueFrom:
                secretKeyRef:
                  name: serverpod-secrets-${appName}
                  key: service-secret
            - name: GO_SERVICE_URL
              value: "http://${appName}-go-service:8001"
            - name: NODE_SERVICE_URL
              value: "http://${appName}-node-service:8002"
            - name: PYTHON_SERVICE_URL
              value: "http://${appName}-python-service:8000"

          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"

          readinessProbe:
            httpGet:
              path: /
              port: 8082
            initialDelaySeconds: 20
            periodSeconds: 15

          livenessProbe:
            httpGet:
              path: /
              port: 8082
            initialDelaySeconds: 60
            periodSeconds: 30
`;
    }
}
