import { invoke } from '@tauri-apps/api/core'
import { getGlobalConfigDir as getAppGlobalConfigDir } from './appDirs.js'
import { isNativeDesktopRuntime } from './runtimeGuard.js'

export function createWorkspaceLifecycleState() {
  return {
    recentWorkspaces: [],
    lastWorkspace: '',
    setupComplete: false,
    reopenLastWorkspaceOnLaunch: true,
    reopenLastSessionOnLaunch: true,
  }
}

export async function loadWorkspaceLifecycleState(globalConfigDir = '') {
  if (!isNativeDesktopRuntime()) return createWorkspaceLifecycleState()
  return invoke('workspace_lifecycle_load', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
    },
  })
}

export async function saveWorkspaceLifecycleState(globalConfigDir = '', state = {}) {
  if (!isNativeDesktopRuntime()) {
    return {
      ...createWorkspaceLifecycleState(),
      ...state,
    }
  }
  const normalized = await invoke('workspace_lifecycle_save', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
      state,
    },
  })

  return normalized
}

export async function getGlobalConfigDir() {
  return getAppGlobalConfigDir()
}

export async function prepareWorkspaceOpen(globalConfigDir = '', path = '') {
  if (!isNativeDesktopRuntime()) {
    throw new Error('Opening a workspace requires the Tauri desktop runtime.')
  }
  return invoke('workspace_lifecycle_prepare_open', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
      path: String(path || ''),
    },
  })
}

export async function resolveWorkspaceBootstrapPlan(options = {}) {
  if (!isNativeDesktopRuntime()) {
    return { tasks: [], backgroundWindowMs: 0, ...options }
  }
  return invoke('workspace_lifecycle_resolve_bootstrap_plan', {
    params: {
      hasCachedTree: options.hasCachedTree === true,
      restoreEditorSession: options.restoreEditorSession !== false,
    },
  })
}

export async function loadWorkspaceBootstrapData(params = {}) {
  if (!isNativeDesktopRuntime()) {
    throw new Error('Loading workspace bootstrap data requires the Tauri desktop runtime.')
  }
  return invoke('workspace_lifecycle_load_bootstrap_data', {
    params: {
      globalConfigDir: String(params.globalConfigDir || ''),
      workspaceDataDir: String(params.workspaceDataDir || ''),
      workspacePath: String(params.workspacePath || ''),
      restoreEditorSession: params.restoreEditorSession !== false,
      currentTree: Array.isArray(params.currentTree) ? params.currentTree : [],
      cachedRootExpandedDirs: Array.isArray(params.cachedRootExpandedDirs)
        ? params.cachedRootExpandedDirs
        : [],
      includeHidden: params.includeHidden !== false,
      hasCachedTree: params.hasCachedTree === true,
      displayPreferences: params.displayPreferences || {},
    },
  })
}

export async function prepareWorkspaceClose() {
  if (!isNativeDesktopRuntime()) return
  return invoke('workspace_lifecycle_prepare_close')
}
