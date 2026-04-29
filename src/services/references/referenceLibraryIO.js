import { invoke } from '@tauri-apps/api/core'
import {
  REFERENCE_COLLECTIONS,
  REFERENCE_FIXTURES,
  REFERENCE_TAGS,
} from './referenceLibraryFixtures.js'
import {
  resolveGlobalReferencesDir,
} from './referenceAssets.js'

export const REFERENCE_LIBRARY_FILENAME = 'library.json'

export function resolveReferencesDataDir(projectRoot = '') {
  return resolveGlobalReferencesDir(projectRoot)
}

export function resolveReferenceLibraryFile(globalConfigDir = '') {
  const dir = resolveReferencesDataDir(globalConfigDir)
  if (!dir) return ''
  return `${dir}/${REFERENCE_LIBRARY_FILENAME}`
}

export function buildDefaultReferenceLibrarySnapshot() {
  return {
    version: 2,
    citationStyle: 'apa',
    documentReferenceSelections: {},
    collections: REFERENCE_COLLECTIONS,
    tags: REFERENCE_TAGS,
    references: REFERENCE_FIXTURES,
  }
}

function normalizeDocumentReferenceSelections(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value)
      .map(([path, referenceIds]) => {
        const normalizedPath = String(path || '').trim()
        if (!normalizedPath || !Array.isArray(referenceIds)) return null
        const ids = Array.from(
          new Set(
            referenceIds
              .map((referenceId) => String(referenceId || '').trim())
              .filter(Boolean)
          )
        )
        return ids.length > 0 ? [normalizedPath, ids] : null
      })
      .filter(Boolean)
  )
}

export function normalizeReferenceLibrarySnapshot(raw = {}) {
  return {
    version: Number(raw?.version) || 2,
    citationStyle: String(raw?.citationStyle || 'apa').trim() || 'apa',
    documentReferenceSelections: normalizeDocumentReferenceSelections(raw?.documentReferenceSelections),
    collections: Array.isArray(raw?.collections) ? raw.collections : [],
    tags: Array.isArray(raw?.tags) ? raw.tags : [],
    references: Array.isArray(raw?.references) ? raw.references : [],
  }
}

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

export async function readOrCreateReferenceLibrarySnapshot(globalConfigDir = '') {
  const referencesDir = resolveReferencesDataDir(globalConfigDir)
  const libraryFile = resolveReferenceLibraryFile(globalConfigDir)
  if (!referencesDir || !libraryFile) {
    return buildDefaultReferenceLibrarySnapshot()
  }

  const backendSnapshot = await invoke('references_library_load_workspace', {
    params: {
      globalConfigDir,
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
