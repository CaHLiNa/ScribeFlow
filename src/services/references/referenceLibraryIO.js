import { invoke } from '@tauri-apps/api/core'
import { normalizeReferenceRecord } from '../../domains/references/referencePresentation.js'
import {
  LEGACY_REFERENCE_FIXTURE_IDS,
  LEGACY_REFERENCE_FIXTURE_TITLES,
  REFERENCE_COLLECTIONS,
  REFERENCE_FIXTURES,
  REFERENCE_TAGS,
} from './referenceLibraryFixtures.js'
import { mergeImportedReferences } from './referenceImport.js'
import {
  resolveGlobalReferencesDir,
  migrateReferenceAssets,
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
      ? raw.references
          .map((reference) => normalizeReferenceRecord(reference))
          .filter((reference) => !isLegacyFixtureReference(reference))
      : [],
  }
}

async function readSnapshotFromFile(path = '') {
  const content = await invoke('read_file', { path })
  const parsed = JSON.parse(content)
  return normalizeReferenceLibrarySnapshot(parsed)
}

async function readFirstExistingLegacySnapshot(legacyProjectRoot = '', legacyWorkspaceDataDir = '') {
  const candidates = [
    resolveProjectLegacyReferenceLibraryFile(legacyProjectRoot),
    resolveLegacyReferenceLibraryFile(legacyWorkspaceDataDir),
  ].filter(Boolean)

  for (const candidate of candidates) {
    const exists = await invoke('path_exists', { path: candidate }).catch(() => false)
    if (exists) {
      return readSnapshotFromFile(candidate)
    }
  }

  return null
}

async function migrateLegacySnapshot(globalConfigDir = '', legacyProjectRoot = '', legacyWorkspaceDataDir = '') {
  const legacySnapshot = await readFirstExistingLegacySnapshot(legacyProjectRoot, legacyWorkspaceDataDir)
  if (!legacySnapshot) return null

  const migratedReferences = await migrateReferenceAssets(globalConfigDir, legacySnapshot.references)
  return {
    ...legacySnapshot,
    version: 2,
    legacyMigrationComplete: true,
    citationStyle: String(legacySnapshot.citationStyle || 'apa'),
    references: migratedReferences,
  }
}

function isEffectivelyEmptySnapshot(snapshot = {}) {
  return (
    (!Array.isArray(snapshot.references) || snapshot.references.length === 0) &&
    (!Array.isArray(snapshot.collections) || snapshot.collections.length === 0) &&
    (!Array.isArray(snapshot.tags) || snapshot.tags.length === 0)
  )
}

function mergeLibraryEntries(primary = [], secondary = [], field = 'key') {
  const merged = []
  const seen = new Set()

  for (const item of [...primary, ...secondary]) {
    if (!item || typeof item !== 'object') continue
    const identity = String(item[field] || item.label || item.id || '').trim().toLowerCase()
    if (!identity || seen.has(identity)) continue
    seen.add(identity)
    merged.push(item)
  }

  return merged
}

function mergeLibrarySnapshots(current = {}, legacy = {}) {
  const normalizedCurrent = normalizeReferenceLibrarySnapshot(current)
  const normalizedLegacy = normalizeReferenceLibrarySnapshot(legacy)

  if (isEffectivelyEmptySnapshot(normalizedCurrent) && !isEffectivelyEmptySnapshot(normalizedLegacy)) {
    return normalizedLegacy
  }
  if (isEffectivelyEmptySnapshot(normalizedLegacy)) {
    return normalizedCurrent
  }

  return {
    version: 2,
    legacyMigrationComplete: true,
    citationStyle: String(normalizedCurrent.citationStyle || normalizedLegacy.citationStyle || 'apa'),
    collections: mergeLibraryEntries(normalizedCurrent.collections, normalizedLegacy.collections, 'key'),
    tags: mergeLibraryEntries(normalizedCurrent.tags, normalizedLegacy.tags, 'key'),
    references: mergeImportedReferences(normalizedCurrent.references, normalizedLegacy.references),
  }
}

export async function readOrCreateReferenceLibrarySnapshot(globalConfigDir = '', options = {}) {
  const { legacyWorkspaceDataDir = '', legacyProjectRoot = '' } = options
  const referencesDir = resolveReferencesDataDir(globalConfigDir)
  const libraryFile = resolveReferenceLibraryFile(globalConfigDir)
  if (!referencesDir || !libraryFile) {
    return buildDefaultReferenceLibrarySnapshot()
  }

  await invoke('create_dir', { path: referencesDir })

  const exists = await invoke('path_exists', { path: libraryFile }).catch(() => false)
  if (exists) {
    const projectSnapshot = await readSnapshotFromFile(libraryFile)
    const shouldAttemptLegacyMigration =
      projectSnapshot.legacyMigrationComplete !== true && isEffectivelyEmptySnapshot(projectSnapshot)

    if (shouldAttemptLegacyMigration) {
      const legacySnapshot = await migrateLegacySnapshot(
        globalConfigDir,
        legacyProjectRoot,
        legacyWorkspaceDataDir
      )

      if (legacySnapshot) {
        const mergedSnapshot = mergeLibrarySnapshots(projectSnapshot, legacySnapshot)
        const migratedReferences = await migrateReferenceAssets(globalConfigDir, mergedSnapshot.references)
        const normalizedSnapshot = {
          ...mergedSnapshot,
          version: 2,
          legacyMigrationComplete: true,
          citationStyle: String(mergedSnapshot.citationStyle || 'apa'),
          references: migratedReferences,
        }
        await invoke('write_file', {
          path: libraryFile,
          content: JSON.stringify(normalizedSnapshot, null, 2),
        })
        return normalizedSnapshot
      }
    }

    const migratedReferences = await migrateReferenceAssets(globalConfigDir, projectSnapshot.references)
    const normalizedSnapshot = {
      ...projectSnapshot,
      version: 2,
      legacyMigrationComplete: true,
      citationStyle: String(projectSnapshot.citationStyle || 'apa'),
      references: migratedReferences,
    }
    await invoke('write_file', {
      path: libraryFile,
      content: JSON.stringify(normalizedSnapshot, null, 2),
    })
    return normalizedSnapshot
  }

  const migratedSnapshot = await migrateLegacySnapshot(
    globalConfigDir,
    legacyProjectRoot,
    legacyWorkspaceDataDir
  )
  if (migratedSnapshot) {
    await invoke('write_file', {
      path: libraryFile,
      content: JSON.stringify(migratedSnapshot, null, 2),
    })
    return migratedSnapshot
  }

  const initialSnapshot = buildDefaultReferenceLibrarySnapshot()
  initialSnapshot.legacyMigrationComplete = true
  await invoke('write_file', {
    path: libraryFile,
    content: JSON.stringify(initialSnapshot, null, 2),
  })
  return initialSnapshot
}

export async function writeReferenceLibrarySnapshot(globalConfigDir = '', snapshot = {}) {
  const referencesDir = resolveReferencesDataDir(globalConfigDir)
  const libraryFile = resolveReferenceLibraryFile(globalConfigDir)
  if (!referencesDir || !libraryFile) return

  await invoke('create_dir', { path: referencesDir })
  const exists = await invoke('path_exists', { path: libraryFile }).catch(() => false)
  const existingSnapshot = exists ? await readSnapshotFromFile(libraryFile).catch(() => null) : null
  const normalizedSnapshot = normalizeReferenceLibrarySnapshot({
    ...snapshot,
    legacyMigrationComplete:
      snapshot?.legacyMigrationComplete === true || existingSnapshot?.legacyMigrationComplete === true,
  })
  await invoke('write_file', {
    path: libraryFile,
    content: JSON.stringify(normalizedSnapshot, null, 2),
  })
}
