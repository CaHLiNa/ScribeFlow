import { invoke } from '@tauri-apps/api/core'
import {
  LEGACY_REFERENCE_FIXTURE_IDS,
  LEGACY_REFERENCE_FIXTURE_TITLES,
  REFERENCE_COLLECTIONS,
  REFERENCE_FIXTURES,
  REFERENCE_TAGS,
} from './referenceLibraryFixtures.js'
import {
  resolveGlobalReferencesDir,
} from './referenceAssets.js'

export const REFERENCE_LIBRARY_FILENAME = 'library.json'

export function resolveLegacyReferencesDataDir(workspaceDataDir = '') {
  const base = String(workspaceDataDir || '').trim().replace(/\/+$/, '')
  if (!base) return ''
  return `${base}/references`
}

export function resolveReferencesDataDir(projectRoot = '') {
  return resolveGlobalReferencesDir(projectRoot)
}

export function resolveLegacyReferenceLibraryFile(workspaceDataDir = '') {
  const dir = resolveLegacyReferencesDataDir(workspaceDataDir)
  if (!dir) return ''
  return `${dir}/${REFERENCE_LIBRARY_FILENAME}`
}

export function resolveProjectLegacyReferencesDataDir(projectRoot = '') {
  const base = String(projectRoot || '').trim().replace(/\/+$/, '')
  if (!base) return ''
  return `${base}/references`
}

export function resolveProjectLegacyReferenceLibraryFile(projectRoot = '') {
  const dir = resolveProjectLegacyReferencesDataDir(projectRoot)
  if (!dir) return ''
  return `${dir}/${REFERENCE_LIBRARY_FILENAME}`
}

export function resolveReferenceLibraryFile(globalConfigDir = '') {
  const dir = resolveReferencesDataDir(globalConfigDir)
  if (!dir) return ''
  return `${dir}/${REFERENCE_LIBRARY_FILENAME}`
}

function isLegacyFixtureReference(reference = {}) {
  const referenceId = String(reference.id || '').trim()
  const title = String(reference.title || '').trim()

  return (
    LEGACY_REFERENCE_FIXTURE_IDS.includes(referenceId) &&
    LEGACY_REFERENCE_FIXTURE_TITLES.includes(title)
  )
}

export function buildDefaultReferenceLibrarySnapshot() {
  return {
    version: 2,
    legacyMigrationComplete: false,
    citationStyle: 'apa',
    collections: REFERENCE_COLLECTIONS,
    tags: REFERENCE_TAGS,
    references: REFERENCE_FIXTURES,
  }
}

export function normalizeReferenceLibrarySnapshot(raw = {}) {
  return {
    version: Number(raw?.version) || 2,
    legacyMigrationComplete: raw?.legacyMigrationComplete === true,
    citationStyle: String(raw?.citationStyle || 'apa').trim() || 'apa',
    collections: Array.isArray(raw?.collections) ? raw.collections : [],
    tags: Array.isArray(raw?.tags) ? raw.tags : [],
    references: Array.isArray(raw?.references)
      ? raw.references.filter((reference) => !isLegacyFixtureReference(reference))
      : [],
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
