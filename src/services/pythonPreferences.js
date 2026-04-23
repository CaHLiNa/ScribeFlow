import { invoke } from '@tauri-apps/api/core'
import {
  hasDesktopInvoke,
  readStorageValue,
  writeStorageValue,
} from './bridgeStorage.js'

export function createPythonPreferenceState() {
  return {
    interpreterPreference: 'auto',
  }
}

function normalizeInterpreterPreference(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed || trimmed.toLowerCase() === 'auto') {
    return 'auto'
  }
  return trimmed
}

function normalizePythonPreferences(preferences = {}) {
  return {
    ...createPythonPreferenceState(),
    ...preferences,
    interpreterPreference: normalizeInterpreterPreference(preferences.interpreterPreference),
  }
}

function loadBrowserPreviewPythonPreferences() {
  return normalizePythonPreferences({
    interpreterPreference: readStorageValue('python.interpreterPreference', 'auto'),
  })
}

function saveBrowserPreviewPythonPreferences(preferences = {}) {
  const normalized = normalizePythonPreferences(preferences)
  writeStorageValue('python.interpreterPreference', normalized.interpreterPreference)
  return normalized
}

export async function loadPythonPreferences(globalConfigDir = '') {
  if (!hasDesktopInvoke()) {
    return loadBrowserPreviewPythonPreferences()
  }

  const preferences = await invoke('python_preferences_load', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
    },
  })

  return normalizePythonPreferences(preferences)
}

export async function savePythonPreferences(globalConfigDir = '', preferences = {}) {
  if (!hasDesktopInvoke()) {
    return saveBrowserPreviewPythonPreferences(preferences)
  }

  const normalized = await invoke('python_preferences_save', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
      preferences,
    },
  })

  return normalizePythonPreferences(normalized)
}
