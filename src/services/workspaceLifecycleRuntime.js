import { invoke } from '@tauri-apps/api/core'
import {
  clearLegacyWorkspaceLifecycleStorage,
  readLegacyWorkspaceLifecycleState,
} from './workspaceLifecycleState.js'

export async function loadWorkspaceLifecycleState(globalConfigDir = '') {
  const state = await invoke('workspace_lifecycle_load', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
      legacyState: readLegacyWorkspaceLifecycleState(),
    },
  })

  clearLegacyWorkspaceLifecycleStorage()
  return state
}

export async function saveWorkspaceLifecycleState(globalConfigDir = '', state = {}) {
  const normalized = await invoke('workspace_lifecycle_save', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
      state,
    },
  })

  clearLegacyWorkspaceLifecycleStorage()
  return normalized
}

export async function recordWorkspaceOpened(globalConfigDir = '', path = '') {
  const state = await invoke('workspace_lifecycle_record_opened', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
      path: String(path || ''),
    },
  })

  clearLegacyWorkspaceLifecycleStorage()
  return state
}
