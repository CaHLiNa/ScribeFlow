import { invoke } from '@tauri-apps/api/core'

export async function normalizeReferenceLibrarySnapshotWithBackend(snapshot = {}) {
  return invoke('references_snapshot_normalize', {
    params: {
      snapshot,
    },
  })
}

export async function buildReferenceLibrarySnapshotPayloadWithBackend(state = {}) {
  return invoke('references_snapshot_payload_build', {
    params: {
      state,
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
