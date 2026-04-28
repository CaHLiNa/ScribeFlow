import { invoke } from '@tauri-apps/api/core'

export async function findDuplicateReference(existing = [], candidate = {}) {
  const duplicate = await invoke('references_find_duplicate', {
    params: {
      existing,
      candidate,
    },
  })
  return duplicate && typeof duplicate === 'object' ? duplicate : null
}

export async function mergeImportedReferences(existing = [], imported = []) {
  const merged = await invoke('references_merge_imported', {
    params: {
      existing,
      imported,
    },
  })
  return Array.isArray(merged) ? merged : []
}
