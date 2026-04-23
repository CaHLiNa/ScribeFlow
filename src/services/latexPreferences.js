import { invoke } from '@tauri-apps/api/core'
import {
  clearStorageKeys,
  hasDesktopInvoke,
  readStorageBoolean,
  readStorageSnapshot,
  readStorageValue,
  writeStorageValue,
} from './bridgeStorage.js'

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
    buildRecipe: 'default',
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
  const normalized = String(value || '').trim().toLowerCase()
  return ['auto', 'system', 'tectonic'].includes(normalized) ? normalized : 'auto'
}

function normalizeEnginePreference(compilerPreference, value) {
  if (compilerPreference === 'tectonic') return 'auto'
  const normalized = String(value || '').trim().toLowerCase()
  return ['auto', 'xelatex', 'pdflatex', 'lualatex'].includes(normalized) ? normalized : 'auto'
}

function normalizeBuildRecipe(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return ['default', 'shell-escape', 'clean-build', 'shell-escape-clean'].includes(normalized)
    ? normalized
    : 'default'
}

function normalizeBrowserPreviewPreferences(preferences = {}) {
  const compilerPreference = normalizeCompilerPreference(preferences.compilerPreference)
  return {
    ...createLatexPreferenceState(),
    ...preferences,
    compilerPreference,
    enginePreference: normalizeEnginePreference(compilerPreference, preferences.enginePreference),
    autoCompile: false,
    formatOnSave: false,
    buildRecipe: normalizeBuildRecipe(preferences.buildRecipe),
    buildExtraArgs: String(preferences.buildExtraArgs || '').trim(),
    customSystemTexPath: String(preferences.customSystemTexPath || '').trim(),
  }
}

function loadBrowserPreviewLatexPreferences() {
  const preferences = normalizeBrowserPreviewPreferences({
    compilerPreference: readStorageValue('latex.compilerPreference', 'auto'),
    enginePreference: readStorageValue('latex.enginePreference', 'auto'),
    buildRecipe: readStorageValue('latex.buildRecipe', 'default'),
    buildExtraArgs: readStorageValue('latex.buildExtraArgs', ''),
    customSystemTexPath: readStorageValue('latex.customSystemTexPath', ''),
  })

  clearLegacyLatexPreferenceStorage()
  return preferences
}

function saveBrowserPreviewLatexPreferences(preferences = {}) {
  const normalized = normalizeBrowserPreviewPreferences(preferences)

  writeStorageValue('latex.compilerPreference', normalized.compilerPreference)
  writeStorageValue('latex.enginePreference', normalized.enginePreference)
  writeStorageValue('latex.autoCompile', null)
  writeStorageValue('latex.formatOnSave', null)
  writeStorageValue('latex.buildRecipe', normalized.buildRecipe)
  writeStorageValue('latex.buildExtraArgs', normalized.buildExtraArgs)
  writeStorageValue('latex.customSystemTexPath', normalized.customSystemTexPath)
  writeStorageValue('latex.customLatexmkPath', null)

  return normalized
}

export async function loadLatexPreferences(globalConfigDir = '') {
  if (!hasDesktopInvoke()) {
    return loadBrowserPreviewLatexPreferences()
  }

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
  if (!hasDesktopInvoke()) {
    return saveBrowserPreviewLatexPreferences(preferences)
  }

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
