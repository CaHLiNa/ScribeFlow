import { invokeCommand as invoke } from './tauriBridge.ts'
import { isNativeDesktopRuntime } from './runtimeGuard.js'

export async function loadWorkspacePreferences(globalConfigDir = '') {
  if (!isNativeDesktopRuntime()) return {}
  return invoke('workspace_preferences_load', {
    params: {
      globalConfigDir,
    },
  })
}

export async function saveWorkspacePreferences(globalConfigDir = '', preferences = {}) {
  if (!isNativeDesktopRuntime()) return preferences
  const normalized = await invoke('workspace_preferences_save', {
    params: {
      globalConfigDir,
      preferences,
    },
  })

  return normalized
}

export async function normalizeWorkspacePreferences(preferences = {}) {
  if (!isNativeDesktopRuntime()) return preferences
  return invoke('workspace_preferences_normalize', {
    params: {
      preferences,
    },
  })
}

export async function normalizeWorkbenchState(state = {}) {
  if (!isNativeDesktopRuntime()) return state
  return invoke('workbench_state_normalize', {
    params: state,
  })
}

export async function loadWorkspaceSystemFontFamilies() {
  if (!isNativeDesktopRuntime()) return []
  return invoke('workspace_preferences_list_system_fonts')
}
