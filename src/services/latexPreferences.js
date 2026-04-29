import { invoke } from '@tauri-apps/api/core'

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
    },
  })

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

  return {
    ...createLatexPreferenceState(),
    ...normalized,
  }
}
