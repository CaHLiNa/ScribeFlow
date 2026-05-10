import { invoke } from '@tauri-apps/api/core'

export async function applyFileTreeDisplayPreferences(entries = [], preferences = {}) {
  return invoke('file_tree_display_apply_preferences', { entries, preferences })
}
