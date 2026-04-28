import { invoke } from '@tauri-apps/api/core'

export async function getGlobalConfigDir() {
  return invoke('get_global_config_dir')
}

export async function prepareWorkspaceOpen(globalConfigDir = '', path = '') {
  return invoke('workspace_lifecycle_prepare_open', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
      path: String(path || ''),
    },
  })
}

export async function resolveWorkspaceBootstrapPlan(options = {}) {
  return invoke('workspace_lifecycle_resolve_bootstrap_plan', {
    params: {
      hasCachedTree: options.hasCachedTree === true,
      restoreEditorSession: options.restoreEditorSession !== false,
    },
  })
}

export async function loadWorkspaceBootstrapData(params = {}) {
  return invoke('workspace_lifecycle_load_bootstrap_data', {
    params: {
      globalConfigDir: String(params.globalConfigDir || ''),
      workspaceDataDir: String(params.workspaceDataDir || ''),
      workspacePath: String(params.workspacePath || ''),
      legacyWorkspaceDataDir: String(params.legacyWorkspaceDataDir || ''),
      legacyProjectRoot: String(params.legacyProjectRoot || ''),
      restoreEditorSession: params.restoreEditorSession !== false,
      currentTree: Array.isArray(params.currentTree) ? params.currentTree : [],
      cachedRootExpandedDirs: Array.isArray(params.cachedRootExpandedDirs)
        ? params.cachedRootExpandedDirs
        : [],
      includeHidden: params.includeHidden !== false,
      hasCachedTree: params.hasCachedTree === true,
    },
  })
}

export async function prepareWorkspaceClose() {
  return invoke('workspace_lifecycle_prepare_close')
}
