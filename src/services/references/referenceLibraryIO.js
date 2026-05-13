import { invoke } from '@tauri-apps/api/core'

export function buildDefaultReferenceLibrarySnapshot() {
  return {
    version: 2,
    citationStyle: 'apa',
    documentReferenceSelections: {},
    collections: [],
    tags: [],
    references: [],
  }
}

export async function normalizeReferenceLibrarySnapshotWithBackend(snapshot = {}) {
  return invoke('references_snapshot_normalize', {
    params: {
      snapshot,
    },
  })
}

export async function readOrCreateReferenceLibrarySnapshot(globalConfigDir = '') {
  return invoke('references_library_load_workspace', {
    params: {
      globalConfigDir,
    },
  })
}

export async function writeReferenceLibrarySnapshot(globalConfigDir = '', snapshot = {}) {
  return invoke('references_library_write', {
    params: {
      globalConfigDir,
      snapshot,
    },
  })
}
