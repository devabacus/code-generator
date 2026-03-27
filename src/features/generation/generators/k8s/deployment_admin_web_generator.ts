import * as path from 'path';
import { BaseGenerator } from '../../../../core/generators/base_generator';
import { IFileSystem } from '../../../../core/interfaces/file_system';
import { ServerDataConfig } from '../../parsers/server_data_parser';

export class DeploymentAdminWebGenerator extends BaseGenerator<ServerDataConfig> {
    constructor(fileSystem: IFileSystem) {
        super(fileSystem);
    }

    protected getPath(basePath: string, _name?: string, _data?: ServerDataConfig): string {
        return path.join(basePath, '.github', 'workflows', 'deployment-admin-web.yml');
    }

    protected getContent(data?: ServerDataConfig): string {
        if (!data) {
            throw new Error('ServerDataConfig not provided');
        }

        const appName = data.project.name;

        return `name: Deploy Admin Web to Kubernetes

# Этот workflow НЕ собирает Flutter - предполагается, что build/web уже готов локально
# Локальная сборка: flutter build web --wasm
# Затем: git push (workflow задеплоит готовый build/web)

on:
    push:
        branches: [master]
        paths:
            - "${appName}_admin/build/web/**"
    workflow_dispatch:

jobs:
    build-and-push-image:
        runs-on: ubuntu-latest
        permissions:
            contents: read
            packages: write
        outputs:
            tag: \${{ steps.meta.outputs.version }}

        steps:
            - name: Checkout repository
              uses: actions/checkout@v4

            - name: Verify build/web exists
              run: |
                  if [ ! -d "${appName}_admin/build/web" ]; then
                    echo "ERROR: ${appName}_admin/build/web not found!"
                    echo "Please run 'flutter build web --wasm' locally before pushing."
                    exit 1
                  fi
                  echo "Found build/web with \$(find ${appName}_admin/build/web -type f | wc -l) files"

            - name: Set up Docker Buildx
              uses: docker/setup-buildx-action@v3

            - name: Extract Docker metadata
              id: meta
              uses: docker/metadata-action@v5
              with:
                  images: \${{ secrets.REGISTRY_DOMAIN }}/${appName}-admin-web
                  tags: |
                      type=sha,prefix=,format=short

            - name: Log in to Container Registry
              uses: docker/login-action@v3
              with:
                  registry: \${{ secrets.REGISTRY_DOMAIN }}
                  username: \${{ secrets.REGISTRY_USER }}
                  password: \${{ secrets.REGISTRY_PASSWORD }}

            - name: Build and push Docker image
              uses: docker/build-push-action@v5
              with:
                  context: ./${appName}_admin
                  file: ./${appName}_admin/Dockerfile
                  push: true
                  tags: \${{ steps.meta.outputs.tags }}
                  labels: \${{ steps.meta.outputs.labels }}

    deploy-to-cluster:
        needs: build-and-push-image
        runs-on: ubuntu-latest

        steps:
            - name: Checkout repository
              uses: actions/checkout@v4

            - name: Set up Kubeconfig
              uses: azure/k8s-set-context@v4
              with:
                  kubeconfig: \${{ secrets.KUBE_CONFIG }}

            - name: Update manifests with new image tag
              env:
                  REGISTRY_DOMAIN: \${{ secrets.REGISTRY_DOMAIN }}
                  IMAGE_TAG: \${{ needs.build-and-push-image.outputs.tag }}
              run: |
                  echo "Updating manifests with image tag: \$IMAGE_TAG"
                  sed -i "s|^\\(\\s*image:\\s*\\).*$|\\1\${REGISTRY_DOMAIN}/${appName}-admin-web:\${IMAGE_TAG}|" ${appName}_admin/k8s/deployment.yaml
                  echo "Updated deployment image:"
                  grep "image:" ${appName}_admin/k8s/deployment.yaml

            - name: Apply Kubernetes manifests
              run: |
                  kubectl apply -f ${appName}_admin/k8s/service.yaml
                  kubectl apply -f ${appName}_admin/k8s/ingress.yaml
                  kubectl apply -f ${appName}_admin/k8s/deployment.yaml

            - name: Wait for deployment rollout
              run: |
                  kubectl rollout status deployment/${appName}-admin-web -n ${appName} --timeout=3m
                  kubectl get pods -n ${appName} -l app=${appName}-admin-web
`;
    }
}
