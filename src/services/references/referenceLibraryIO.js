import { invoke } from '@tauri-apps/api/core'
import { normalizeReferenceRecord } from '../../domains/references/referencePresentation.js'
import {
  LEGACY_REFERENCE_FIXTURE_IDS,
  LEGACY_REFERENCE_FIXTURE_TITLES,
  REFERENCE_COLLECTIONS,
  REFERENCE_FIXTURES,
  REFERENCE_TAGS,
} from './referenceLibraryFixtures.js'
import {
  resolveGlobalReferencesDir,
  migrateReferenceAssets,
} from './referenceAssets.js'

export const REFERENCE_LIBRARY_FILENAME = 'library.json'

function hasTauriInvoke() {
  return typeof window !== 'undefined' && typeof window.__TAURI_INTERNALS__?.invoke === 'function'
}

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
      ? raw.references
          .map((reference) => normalizeReferenceRecord(reference))
          .filter((reference) => !isLegacyFixtureReference(reference))
      : [],
  }
}

export async function readOrCreateReferenceLibrarySnapshot(globalConfigDir = '', options = {}) {
  const { legacyWorkspaceDataDir = '', legacyProjectRoot = '' } = options
  const referencesDir = resolveReferencesDataDir(globalConfigDir)
  const libraryFile = resolveReferenceLibraryFile(globalConfigDir)
  if (!referencesDir || !libraryFile) {
    return buildDefaultReferenceLibrarySnapshot()
  }

  if (!hasTauriInvoke()) throw new Error('Tauri invoke is required for reference library IO.')

  const backendSnapshot = await invoke('references_library_read_or_create', {
    params: {
      globalConfigDir,
      legacyWorkspaceDataDir,
      legacyProjectRoot,
    },
  })

  const normalizedSnapshot = normalizeReferenceLibrarySnapshot(backendSnapshot)
  const migratedReferences = await migrateReferenceAssets(globalConfigDir, normalizedSnapshot.references)
  if (JSON.stringify(migratedReferences) === JSON.stringify(normalizedSnapshot.references)) {
    return normalizedSnapshot
  }

  const migratedSnapshot = {
    ...normalizedSnapshot,
    version: 2,
    legacyMigrationComplete: true,
    citationStyle: String(normalizedSnapshot.citationStyle || 'apa'),
    references: migratedReferences,
  }
  await writeReferenceLibrarySnapshot(globalConfigDir, migratedSnapshot)
  return migratedSnapshot
}

export async function writeReferenceLibrarySnapshot(globalConfigDir = '', snapshot = {}) {
  const normalizedSnapshot = normalizeReferenceLibrarySnapshot({
    ...snapshot,
  })

  if (!hasTauriInvoke()) throw new Error('Tauri invoke is required for reference library IO.')

  await invoke('references_library_write', {
    params: {
      globalConfigDir,
      snapshot: normalizedSnapshot,
    },
  })
  return normalizedSnapshot
}
