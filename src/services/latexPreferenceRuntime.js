import { invoke } from '@tauri-apps/api/core'
import { clearStorageKeys, readStorageSnapshot } from './bridgeStorage.js'
import { createLatexPreferenceState } from './latexPreferenceState.js'

const LEGACY_LATEX_PREFERENCE_KEYS = [
  'latex.compilerPreference',
  'latex.enginePreference',
  'latex.autoCompile',
  'latex.formatOnSave',
  'latex.buildRecipe',
  'latex.buildExtraArgs',
  'latex.customSystemTexPath',
  'latex.customLatexmkPath',
]

function readLegacyLatexPreferenceSnapshot() {
  return readStorageSnapshot(LEGACY_LATEX_PREFERENCE_KEYS)
}

function clearLegacyLatexPreferenceStorage() {
  clearStorageKeys(LEGACY_LATEX_PREFERENCE_KEYS)
}

export async function loadLatexPreferences(globalConfigDir = '') {
  const preferences = await invoke('latex_preferences_load', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
      legacyPreferences: readLegacyLatexPreferenceSnapshot(),
    },
  })

  clearLegacyLatexPreferenceStorage()
  return {
    ...createLatexPreferenceState(),
    ...preferences,
  }
}

export async function saveLatexPreferences(globalConfigDir = '', preferences = {}) {
  const normalized = await invoke('latex_preferences_save', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
      preferences,
    },
  })

  clearLegacyLatexPreferenceStorage()
  return {
    ...createLatexPreferenceState(),
    ...normalized,
  }
}
