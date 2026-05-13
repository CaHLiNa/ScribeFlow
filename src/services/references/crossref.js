import { invoke } from '@tauri-apps/api/core'

export async function refreshReferenceMetadata(reference = {}) {
  return invoke('references_refresh_metadata', {
    params: {
      reference,
    },
  })
}
