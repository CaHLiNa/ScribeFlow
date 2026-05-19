import { invokeCommand as invoke } from './tauriBridge.ts'
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
      preferredLocale,
    },
  })
}

export async function loadSavedLocalePreference(defaultPreference = 'system') {
  if (!isNativeDesktopRuntime()) return defaultPreference
  const globalConfigDir = await getGlobalConfigDir()
  const preferences = await invoke('workspace_preferences_load', {
    params: {
      globalConfigDir,
    },
  })
  return preferences?.preferredLocale || defaultPreference
}
