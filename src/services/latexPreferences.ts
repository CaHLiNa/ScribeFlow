import { invokeCommand as invoke } from './tauriBridge.ts'
import { isNativeDesktopRuntime } from './runtimeGuard.ts'

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
  return invoke('latex_preferences_load', {
    params: {
      globalConfigDir,
    },
  })
}

export async function normalizeLatexPreferences(preferences = {}) {
  if (!isNativeDesktopRuntime()) {
    return {
      ...createLatexPreferenceState(),
      ...preferences,
    }
  }
  return invoke('latex_preferences_normalize', {
    params: {
      preferences,
    },
  })
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
  return invoke('latex_preferences_save', {
    params: {
      globalConfigDir,
      preferences,
    },
  })
}
