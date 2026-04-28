import { invoke } from '@tauri-apps/api/core'
import {
  resolveReferenceLibraryFile,
  resolveReferencesDataDir,
} from './referenceLibraryPaths.js'
import {
  buildDefaultReferenceLibrarySnapshot,
  normalizeReferenceLibrarySnapshot,
} from './referenceLibraryState.js'

export async function normalizeReferenceLibrarySnapshotWithBackend(snapshot = {}) {
  const normalized = await invoke('references_snapshot_normalize', {
    params: {
      snapshot,
    },
  })

  return normalizeReferenceLibrarySnapshot(normalized)
}

export async function normalizeReferenceRecordWithBackend(reference = {}) {
  const normalized = await invoke('references_record_normalize', {
    params: {
      reference,
    },
  })

  return normalized && typeof normalized === 'object' ? normalized : {}
}

export async function readOrCreateReferenceLibrarySnapshot(globalConfigDir = '', options = {}) {
  const { legacyWorkspaceDataDir = '', legacyProjectRoot = '' } = options
  const referencesDir = resolveReferencesDataDir(globalConfigDir)
  const libraryFile = resolveReferenceLibraryFile(globalConfigDir)
  if (!referencesDir || !libraryFile) {
    return buildDefaultReferenceLibrarySnapshot()
  }

  const backendSnapshot = await invoke('references_library_load_workspace', {
    params: {
      globalConfigDir,
      legacyWorkspaceDataDir,
      legacyProjectRoot,
    },
  })

  return normalizeReferenceLibrarySnapshot(backendSnapshot)
}

export async function writeReferenceLibrarySnapshot(globalConfigDir = '', snapshot = {}) {
  const normalizedSnapshot = await normalizeReferenceLibrarySnapshotWithBackend({
    ...snapshot,
  })

  await invoke('references_library_write', {
    params: {
      globalConfigDir,
      snapshot: normalizedSnapshot,
    },
  })
  return normalizedSnapshot
}
