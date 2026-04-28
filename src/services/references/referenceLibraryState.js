import {
  LEGACY_REFERENCE_FIXTURE_IDS,
  LEGACY_REFERENCE_FIXTURE_TITLES,
  REFERENCE_COLLECTIONS,
  REFERENCE_FIXTURES,
  REFERENCE_TAGS,
} from './referenceLibraryFixtures.js'

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
