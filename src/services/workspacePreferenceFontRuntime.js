import { invoke } from '@tauri-apps/api/core'
import { FALLBACK_SYSTEM_FONT_FAMILIES } from './workspacePreferencesState.js'

export async function loadWorkspaceSystemFontFamilies() {
  try {
    const fonts = await invoke('workspace_preferences_list_system_fonts')
    const normalized = Array.isArray(fonts)
      ? fonts
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      : []
    return normalized.length > 0 ? normalized : [...FALLBACK_SYSTEM_FONT_FAMILIES]
  } catch {
    return [...FALLBACK_SYSTEM_FONT_FAMILIES]
  }
}
