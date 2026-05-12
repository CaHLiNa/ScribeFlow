import { invoke } from '@tauri-apps/api/core'

export function createPythonPreferenceState() {
  return {
    interpreterPreference: 'auto',
  }
}

export async function loadPythonPreferences(globalConfigDir = '') {
  const preferences = await invoke('python_preferences_load', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
    },
  })

  return {
    ...createPythonPreferenceState(),
    ...preferences,
  }
}

export async function normalizePythonPreferences(preferences = {}) {
  const normalized = await invoke('python_preferences_normalize', {
    params: {
      preferences,
    },
  })

  return {
    ...createPythonPreferenceState(),
    ...normalized,
  }
}

export async function savePythonPreferences(globalConfigDir = '', preferences = {}) {
  const normalized = await invoke('python_preferences_save', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
      preferences,
    },
  })

  return {
    ...createPythonPreferenceState(),
    ...normalized,
  }
}
