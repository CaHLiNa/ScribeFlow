import { invoke } from '@tauri-apps/api/core'
import { FALLBACK_SYSTEM_FONT_FAMILIES } from '../domains/settings/workspacePreferencePresentation.js'
import { isNativeDesktopRuntime } from './runtimeGuard.js'

export async function loadWorkspacePreferences(globalConfigDir = '') {
  if (!isNativeDesktopRuntime()) return {}
  return invoke('workspace_preferences_load', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
    },
  })
}

export async function saveWorkspacePreferences(globalConfigDir = '', preferences = {}) {
  if (!isNativeDesktopRuntime()) return preferences
  const normalized = await invoke('workspace_preferences_save', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
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
    params: state || {},
  })
}

export async function loadWorkspaceSystemFontFamilies() {
  try {
    const fonts = await invoke('workspace_preferences_list_system_fonts')
    const normalized = Array.isArray(fonts)
      ? fonts
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      : []
    return normalized.length > 0 ? normalized : [...FALLBACK_SYSTEM_FONT_FAMILIES]
  } catch {
    return [...FALLBACK_SYSTEM_FONT_FAMILIES]
  }
}
