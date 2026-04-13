import { invoke } from '@tauri-apps/api/core'
import { normalizeReferenceRecord } from '../../domains/references/referencePresentation.js'
import {
  LEGACY_REFERENCE_FIXTURE_IDS,
  LEGACY_REFERENCE_FIXTURE_TITLES,
  REFERENCE_COLLECTIONS,
  REFERENCE_FIXTURES,
  REFERENCE_TAGS,
} from './referenceLibraryFixtures.js'

export const REFERENCE_LIBRARY_FILENAME = 'library.json'

export function resolveReferencesDataDir(workspaceDataDir = '') {
  const base = String(workspaceDataDir || '').trim().replace(/\/+$/, '')
  if (!base) return ''
  return `${base}/references`
}

export function resolveReferenceLibraryFile(workspaceDataDir = '') {
  const dir = resolveReferencesDataDir(workspaceDataDir)
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
    version: 1,
    collections: REFERENCE_COLLECTIONS,
    tags: REFERENCE_TAGS,
    references: REFERENCE_FIXTURES,
  }
}

export function normalizeReferenceLibrarySnapshot(raw = {}) {
  return {
    version: Number(raw?.version) || 1,
    collections: Array.isArray(raw?.collections) ? raw.collections : [],
    tags: Array.isArray(raw?.tags) ? raw.tags : [],
    references: Array.isArray(raw?.references)
      ? raw.references
          .map((reference) => normalizeReferenceRecord(reference))
          .filter((reference) => !isLegacyFixtureReference(reference))
      : [],
  }
}

export async function readOrCreateReferenceLibrarySnapshot(workspaceDataDir = '') {
  const referencesDir = resolveReferencesDataDir(workspaceDataDir)
  const libraryFile = resolveReferenceLibraryFile(workspaceDataDir)
  if (!referencesDir || !libraryFile) {
    return buildDefaultReferenceLibrarySnapshot()
  }

  await invoke('create_dir', { path: referencesDir })

  const exists = await invoke('path_exists', { path: libraryFile }).catch(() => false)
  if (!exists) {
    const initialSnapshot = buildDefaultReferenceLibrarySnapshot()
    await invoke('write_file', {
      path: libraryFile,
      content: JSON.stringify(initialSnapshot, null, 2),
    })
    return initialSnapshot
  }

  const content = await invoke('read_file', { path: libraryFile })
  const parsed = JSON.parse(content)
  return normalizeReferenceLibrarySnapshot(parsed)
}

export async function writeReferenceLibrarySnapshot(workspaceDataDir = '', snapshot = {}) {
  const referencesDir = resolveReferencesDataDir(workspaceDataDir)
  const libraryFile = resolveReferenceLibraryFile(workspaceDataDir)
  if (!referencesDir || !libraryFile) return

  await invoke('create_dir', { path: referencesDir })
  await invoke('write_file', {
    path: libraryFile,
    content: JSON.stringify(normalizeReferenceLibrarySnapshot(snapshot), null, 2),
  })
}
