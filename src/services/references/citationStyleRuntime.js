import { invoke } from '@tauri-apps/api/core'

export async function getAvailableCitationStyles() {
  return invoke('citation_style_list_available')
}

export async function getCitationStyleInfo(styleId = '') {
  return invoke('citation_style_get_info', { styleId })
}

export async function normalizeCitationStyle(styleId = '') {
  return invoke('citation_style_normalize', { styleId })
}
