import { invoke } from '@tauri-apps/api/core'
import { basenamePath } from '../utils/path'
import { getGlobalConfigDir as getAppGlobalConfigDir } from './appDirs.js'

const MAX_RECENT_WORKSPACES = 10

export function createWorkspaceLifecycleState() {
  return {
    recentWorkspaces: [],
    lastWorkspace: '',
    setupComplete: false,
    reopenLastWorkspaceOnLaunch: true,
    reopenLastSessionOnLaunch: true,
  }
}

function normalizeRecentWorkspaces(recentWorkspaces = []) {
  const seen = new Set()
  const next = []

  for (const item of Array.isArray(recentWorkspaces) ? recentWorkspaces : []) {
    const path = String(item?.path || '').replace(/\/+$/, '')
    if (!path || seen.has(path)) continue
    seen.add(path)
    next.push({
      path,
      name: basenamePath(path) || String(item?.name || path),
      lastOpened: String(item?.lastOpened || ''),
    })
    if (next.length >= MAX_RECENT_WORKSPACES) break
  }

  return next
}

export async function loadWorkspaceLifecycleState(globalConfigDir = '') {
  return invoke('workspace_lifecycle_load', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
    },
  })
}

export async function saveWorkspaceLifecycleState(globalConfigDir = '', state = {}) {
  const normalized = await invoke('workspace_lifecycle_save', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
      state,
    },
  })

  return normalized
}

export async function recordWorkspaceOpened(globalConfigDir = '', path = '') {
  const state = await invoke('workspace_lifecycle_record_opened', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
      path: String(path || ''),
    },
  })

  return state
}

export async function getGlobalConfigDir() {
  return getAppGlobalConfigDir()
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
