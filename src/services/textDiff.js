import { invoke } from '@tauri-apps/api/core'

export async function computeMinimalChange(oldText, newText) {
  return invoke('text_diff_compute_minimal_change', { oldText, newText })
}
