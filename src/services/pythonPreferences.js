import { invoke } from '@tauri-apps/api/core'

export function createPythonPreferenceState() {
  return {
    interpreterPreference: 'auto',
  }
}

export async function loadPythonPreferences(globalConfigDir = '') {
  return invoke('python_preferences_load', {
    params: {
      globalConfigDir,
    },
  })
}

export async function normalizePythonPreferences(preferences = {}) {
  return invoke('python_preferences_normalize', {
    params: {
      preferences,
    },
  })
}

export async function savePythonPreferences(globalConfigDir = '', preferences = {}) {
  return invoke('python_preferences_save', {
    params: {
      globalConfigDir,
      preferences,
    },
  })
}
