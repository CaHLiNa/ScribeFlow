import { invoke } from '@tauri-apps/api/core'
import {
  clearLegacyWorkspacePreferenceStorage,
  readLegacyWorkspacePreferenceSnapshot,
} from './workspacePreferenceLegacyStorage.js'

export async function loadWorkspacePreferences(globalConfigDir = '') {
  const preferences = await invoke('workspace_preferences_load', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
      legacyPreferences: readLegacyWorkspacePreferenceSnapshot(),
    },
  })

  clearLegacyWorkspacePreferenceStorage()
  return preferences
}

export async function saveWorkspacePreferences(globalConfigDir = '', preferences = {}) {
  const normalized = await invoke('workspace_preferences_save', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
      preferences,
    },
  })

  clearLegacyWorkspacePreferenceStorage()
  return normalized
}

export async function normalizeWorkbenchState(state = {}) {
  return invoke('workbench_state_normalize', {
    params: {
      primarySurface: String(state.primarySurface || ''),
      leftSidebarOpen: state.leftSidebarOpen !== false,
      leftSidebarPanel: String(state.leftSidebarPanel || ''),
      rightSidebarOpen: state.rightSidebarOpen === true,
      rightSidebarPanel: String(state.rightSidebarPanel || ''),
    },
  })
}
