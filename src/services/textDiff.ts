import { invokeCommand as invoke } from './tauriBridge.ts'

export async function computeMinimalChange(oldText, newText) {
  return invoke('text_diff_compute_minimal_change', { params: { oldText, newText } })
}
