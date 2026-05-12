import { invoke } from '@tauri-apps/api/core'
import { isNativeDesktopRuntime } from './runtimeGuard.js'

export function createLatexPreferenceState() {
  return {
    compilerPreference: 'auto',
    enginePreference: 'auto',
    autoCompile: false,
    formatOnSave: false,
    buildExtraArgs: '',
    customSystemTexPath: '',
  }
}

export async function loadLatexPreferences(globalConfigDir = '') {
  if (!isNativeDesktopRuntime()) {
    return createLatexPreferenceState()
  }
  const preferences = await invoke('latex_preferences_load', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
    },
  })

  return {
    ...createLatexPreferenceState(),
    ...preferences,
  }
}

export async function normalizeLatexPreferences(preferences = {}) {
  if (!isNativeDesktopRuntime()) {
    return {
      ...createLatexPreferenceState(),
      ...preferences,
    }
  }
  const normalized = await invoke('latex_preferences_normalize', {
    params: {
      preferences,
    },
  })

  return {
    ...createLatexPreferenceState(),
    ...normalized,
  }
}

export async function saveLatexPreferences(
  globalConfigDir = '',
  preferences = {},
) {
  if (!isNativeDesktopRuntime()) {
    return {
      ...createLatexPreferenceState(),
      ...preferences,
    }
  }
  const normalized = await invoke('latex_preferences_save', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
      preferences,
    },
  })

  return {
    ...createLatexPreferenceState(),
    ...normalized,
  }
}
