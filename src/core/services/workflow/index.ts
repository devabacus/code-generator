/**
 * Модуль workflow — точка входа.
 * Реэкспортирует все функции для обратной совместимости.
 */
export { WorkflowDependencies, toPascalCase } from './types';
export { findWorkflowFile } from './workflow_file_finder';
export { updateK8sManifests, updateEnvExample } from './k8s_manifest_updater';
export { updateForStandalone, revertToStandalone } from './workflow_standalone_modifier';
export { modifyForMonorepo, moveWorkflowToRepoRoot } from './workflow_monorepo_modifier';
export { updateServerpodDeploymentEnv, removeServerpodDeploymentEnv } from './serverpod_deployment_updater';
export { copyFlutterHealthCheckWidget } from './flutter_integration';
export { patchDeveloperToolsPage, unpatchDeveloperToolsPage } from './developer_tools_patcher';
export { copyServerpodEndpoint } from './serverpod_endpoint_copier';
