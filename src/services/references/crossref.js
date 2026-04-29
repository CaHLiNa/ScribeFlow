import { invoke } from '@tauri-apps/api/core'

export async function refreshReferenceMetadata(reference = {}) {
  const result = await invoke('references_refresh_metadata', {
    params: {
      reference: reference && typeof reference === 'object' ? reference : {},
    },
  })
  return result && typeof result === 'object' ? result : null
}
