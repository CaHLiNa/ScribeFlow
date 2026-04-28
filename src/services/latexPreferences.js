import { invoke } from '@tauri-apps/api/core'
import { clearStorageKeys, readStorageSnapshot } from './bridgeStorage.js'

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

function readLegacyLatexPreferenceSnapshot() {
  return readStorageSnapshot(LEGACY_LATEX_PREFERENCE_KEYS)
}

function clearLegacyLatexPreferenceStorage() {
  clearStorageKeys(LEGACY_LATEX_PREFERENCE_KEYS)
}

function normalizeCompilerPreference(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return ['auto', 'system', 'tectonic'].includes(normalized)
    ? normalized
    : 'auto'
}

function normalizeEnginePreference(compilerPreference, value) {
  if (compilerPreference === 'tectonic') return 'auto'
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return ['auto', 'xelatex', 'pdflatex', 'lualatex'].includes(normalized)
    ? normalized
    : 'auto'
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

export async function saveLatexPreferences(
  globalConfigDir = '',
  preferences = {},
) {
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
