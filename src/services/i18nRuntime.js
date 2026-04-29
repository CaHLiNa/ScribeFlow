import { invoke } from '@tauri-apps/api/core'
import { getGlobalConfigDir } from './appDirs.js'

export async function loadI18nRuntime(preferredLocale = 'system') {
  return invoke('i18n_runtime_load', {
    params: {
      preferredLocale: String(preferredLocale || 'system'),
    },
  })
}

export async function loadSavedLocalePreference(defaultPreference = 'system') {
  const globalConfigDir = await getGlobalConfigDir()
  const preferences = await invoke('workspace_preferences_load', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
    },
  })
  return preferences?.preferredLocale || defaultPreference
}
