import { invoke } from '@tauri-apps/api/core'
import { getGlobalConfigDir } from './appDirs.js'
import { isNativeDesktopRuntime } from './runtimeGuard.js'

export async function loadI18nRuntime(preferredLocale = 'system') {
  if (!isNativeDesktopRuntime()) {
    const locale = String(preferredLocale || 'system').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
    return {
      locale,
      systemLocale: locale,
      messages: {},
      aliases: {},
    }
  }
  return invoke('i18n_runtime_load', {
    params: {
      preferredLocale: String(preferredLocale || 'system'),
    },
  })
}

export async function loadSavedLocalePreference(defaultPreference = 'system') {
  if (!isNativeDesktopRuntime()) return defaultPreference
  const globalConfigDir = await getGlobalConfigDir()
  const preferences = await invoke('workspace_preferences_load', {
    params: {
      globalConfigDir: String(globalConfigDir || ''),
    },
  })
  return preferences?.preferredLocale || defaultPreference
}
