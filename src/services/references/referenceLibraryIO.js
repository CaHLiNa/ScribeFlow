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

function snapshotOrDefault(snapshot = {}) {
  return snapshot && typeof snapshot === 'object'
    ? snapshot
    : buildDefaultReferenceLibrarySnapshot()
}

export async function normalizeReferenceLibrarySnapshotWithBackend(snapshot = {}) {
  const normalized = await invoke('references_snapshot_normalize', {
    params: {
      snapshot,
    },
  })

  return snapshotOrDefault(normalized)
}

export async function readOrCreateReferenceLibrarySnapshot(globalConfigDir = '') {
  const backendSnapshot = await invoke('references_library_load_workspace', {
    params: {
      globalConfigDir,
    },
  })

  return snapshotOrDefault(backendSnapshot)
}

export async function writeReferenceLibrarySnapshot(globalConfigDir = '', snapshot = {}) {
  const normalizedSnapshot = await invoke('references_library_write', {
    params: {
      globalConfigDir,
      snapshot,
    },
  })
  return snapshotOrDefault(normalizedSnapshot)
}
