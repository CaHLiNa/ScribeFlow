import { REFERENCE_DOCK_PDF_PAGE } from './referenceDockPages.js'

export function normalizeCollectionMembershipValue(value = '') {
  return String(value || '').trim().toLowerCase()
}

export function normalizeTagKey(value = '') {
  return String(value || '').trim().toLowerCase()
}

const REFERENCE_SORT_KEYS = [
  'year-desc',
  'year-asc',
  'title-asc',
  'title-desc',
  'author-asc',
  'author-desc',
]

export function resolveReferenceSectionKey(sections = [], sectionKey = '', fallbackKey = '') {
  const normalizedKey = String(sectionKey || '').trim()
  if (!normalizedKey) return fallbackKey
  const exists = (Array.isArray(sections) ? sections : []).some(
    (section) => String(section?.key || '') === normalizedKey,
  )
  return exists ? normalizedKey : fallbackKey
}

export function normalizeReferenceSortKey(value = '') {
  const normalizedKey = String(value || '').trim()
  return REFERENCE_SORT_KEYS.includes(normalizedKey) ? normalizedKey : 'year-desc'
}

export function resolveCollection(collections = [], collectionKey = '') {
  const normalizedKey = normalizeCollectionMembershipValue(collectionKey)
  if (!normalizedKey) return null

  return (
    (Array.isArray(collections) ? collections : []).find(
      (collection) => normalizeCollectionMembershipValue(collection?.key) === normalizedKey,
    ) ||
    (Array.isArray(collections) ? collections : []).find(
      (collection) => normalizeCollectionMembershipValue(collection?.label) === normalizedKey,
    ) ||
    null
  )
}

export function resolveTag(tags = [], tagKey = '') {
  const normalizedKey = normalizeTagKey(tagKey)
  if (!normalizedKey) return null

  return (
    (Array.isArray(tags) ? tags : []).find(
      (tag) => normalizeTagKey(tag?.key) === normalizedKey,
    ) || null
  )
}

export function resolveDocumentReferenceSelections(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value
}

function normalizeDocumentReferencePath(texPath = '') {
  const normalizedTexPath = String(texPath || '').trim()
  return normalizedTexPath
}

function resolveDocumentReferenceEntry(resolvedQueryState = {}, texPath = '') {
  const normalizedTexPath = normalizeDocumentReferencePath(texPath)
  const state = resolvedQueryState?.documentReferenceState
  if (!state || typeof state !== 'object' || Array.isArray(state)) return {}
  if (!normalizedTexPath) return state.default || {}
  return state.byPath?.[normalizedTexPath] || state.default || {}
}

function resolveLookupEntry(lookup = {}, bucket = '', key = '') {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey || !lookup || typeof lookup !== 'object' || Array.isArray(lookup)) return null
  const entries = lookup?.[bucket]
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return null
  return entries[normalizedKey] || null
}

export function resolveDocumentReferenceIds(resolvedQueryState = {}, texPath = '') {
  const entry = resolveDocumentReferenceEntry(resolvedQueryState, texPath)
  return Array.isArray(entry.referenceIds) ? entry.referenceIds : []
}

export function resolveDocumentReferences(resolvedQueryState = {}, texPath = '') {
  const entry = resolveDocumentReferenceEntry(resolvedQueryState, texPath)
  return Array.isArray(entry.references) ? entry.references : []
}

export function resolveReferenceByKey(resolvedQueryState = {}, referenceKey = '') {
  return resolveLookupEntry(resolvedQueryState?.referenceLookup, 'byKey', referenceKey)
}

export function resolveReferenceById(resolvedQueryState = {}, referenceId = '') {
  return resolveLookupEntry(resolvedQueryState?.referenceLookup, 'byId', referenceId)
}

export function hasReferenceById(resolvedQueryState = {}, referenceId = '') {
  return Boolean(resolveReferenceById(resolvedQueryState, referenceId))
}

export function resolveSelectedReference(
  resolvedQueryState = {},
) {
  return (
    (resolvedQueryState?.selectedReference &&
      typeof resolvedQueryState.selectedReference === 'object' &&
      !Array.isArray(resolvedQueryState.selectedReference)
      ? resolvedQueryState.selectedReference
      : null) ||
    (Array.isArray(resolvedQueryState?.filteredReferences) ? resolvedQueryState.filteredReferences[0] : null) ||
    null
  )
}

export function resolveReferenceCitationUsageKeys(citationUsageIndex = {}) {
  if (!citationUsageIndex || typeof citationUsageIndex !== 'object' || Array.isArray(citationUsageIndex)) {
    return new Set()
  }
  return new Set(Object.keys(citationUsageIndex))
}

export function resolveReferenceCitationStyleId(style = '', hasStyle = false) {
  const normalizedStyle = String(style || '').trim()
  return normalizedStyle && hasStyle ? normalizedStyle : 'apa'
}

export function resolveReferenceWorkspaceCitationStyles(styles = []) {
  return Array.isArray(styles) ? styles : []
}

export function resolveDocumentReferenceByKey(
  resolvedQueryState = {},
  texPath = '',
  referenceKey = '',
) {
  const entry = resolveDocumentReferenceEntry(resolvedQueryState, texPath)
  return resolveLookupEntry(entry.referenceLookup, 'byKey', referenceKey)
}

export function isReferenceSelectedForDocument(
  resolvedQueryState = {},
  texPath = '',
  referenceIdOrKey = '',
) {
  return Boolean(resolveDocumentReferenceByKey(
    resolvedQueryState,
    texPath,
    referenceIdOrKey,
  ))
}

export function searchReferences(resolvedQueryState = {}, query = '') {
  const normalizedQuery = String(query || '').trim().toLowerCase()
  const referenceList = Array.isArray(resolvedQueryState?.sortedReferences)
    ? resolvedQueryState.sortedReferences
    : []
  if (!normalizedQuery) return referenceList
  const searchIndex = resolvedQueryState?.referenceSearchIndex
  if (!searchIndex || typeof searchIndex !== 'object' || Array.isArray(searchIndex)) return []

  return referenceList.filter((reference) => {
    const searchText = String(searchIndex?.[String(reference?.id || '')] || '')
    return searchText.includes(normalizedQuery)
  })
}

export function resolveAvailableDocumentReferences(
  resolvedQueryState = {},
  texPath = '',
  query = '',
) {
  const entry = resolveDocumentReferenceEntry(resolvedQueryState, texPath)
  const scopedState = {
    sortedReferences: Array.isArray(entry.availableReferences)
      ? entry.availableReferences
      : [],
    referenceSearchIndex: entry.referenceSearchIndex || {},
  }
  return searchReferences(scopedState, query)
}

export function buildReferenceDockPdfOpenState(referenceId = '') {
  const normalizedReferenceId = String(referenceId || '').trim()
  return {
    canOpen: Boolean(normalizedReferenceId),
    referenceDockPdfOpen: Boolean(normalizedReferenceId),
    referenceDockPdfReferenceId: normalizedReferenceId,
  }
}

export function buildReferenceDockPdfCloseState(state = {}, referenceId = '') {
  const normalizedReferenceId = String(referenceId || '').trim()
  const currentReferenceId = String(state.referenceDockPdfReferenceId || '')
  if (normalizedReferenceId && normalizedReferenceId !== currentReferenceId) {
    return {
      changed: false,
      referenceDockPdfOpen: state.referenceDockPdfOpen === true,
      referenceDockPdfReferenceId: currentReferenceId,
    }
  }

  return {
    changed: currentReferenceId !== '' || state.referenceDockPdfOpen === true,
    referenceDockPdfOpen: false,
    referenceDockPdfReferenceId: '',
  }
}

export function buildReferenceDockPdfResetState() {
  return {
    referenceDockPdfOpen: false,
    referenceDockPdfReferenceId: '',
  }
}

export function isReferenceDockPdfSelected(state = {}) {
  return (
    state.referenceDockPdfOpen === true &&
    String(state.referenceDockPdfReferenceId || '') === String(state.selectedReferenceId || '')
  )
}

export function buildReferenceDockPdfSnapshotState(state = {}) {
  const hasDockReference = Array.isArray(state.references)
    ? state.references.some((reference) => String(reference?.id || '') === String(state.referenceDockPdfReferenceId || ''))
    : hasReferenceById(state.resolvedQueryState, state.referenceDockPdfReferenceId)
  if (
    state.referenceDockPdfReferenceId &&
    !hasDockReference
  ) {
    return {
      ...buildReferenceDockPdfResetState(),
      shouldFallbackToDetails: false,
    }
  }

  return {
    referenceDockPdfOpen: state.referenceDockPdfOpen === true,
    referenceDockPdfReferenceId: String(state.referenceDockPdfReferenceId || ''),
    shouldFallbackToDetails: state.referenceDockActivePage === REFERENCE_DOCK_PDF_PAGE &&
      !isReferenceDockPdfSelected(state),
  }
}

export function resolveReferenceResolvedQueryState(resolved = null, fallbackState = {}) {
  return resolved && typeof resolved === 'object' && !Array.isArray(resolved)
    ? resolved
    : buildDefaultResolvedQueryState(fallbackState)
}

function resolveReferenceStoreSeed(defaults = {}) {
  const librarySections = Array.isArray(defaults.librarySections) ? defaults.librarySections : []
  const sourceSections = Array.isArray(defaults.sourceSections) ? defaults.sourceSections : []
  const collections = Array.isArray(defaults.collections) ? defaults.collections : []
  const tags = Array.isArray(defaults.tags) ? defaults.tags : []
  const references = Array.isArray(defaults.references) ? defaults.references : []
  const selectedSectionKey = String(defaults.selectedSectionKey || 'all')
  const selectedSourceKey = String(defaults.selectedSourceKey || '')
  const selectedCollectionKey = String(defaults.selectedCollectionKey || '')
  const selectedTagKey = String(defaults.selectedTagKey || '')
  const sortKey = normalizeReferenceSortKey(defaults.sortKey)
  const selectedReferenceId = String(defaults.selectedReferenceId ?? references[0]?.id ?? '')

  return {
    librarySections,
    sourceSections,
    collections,
    tags,
    references,
    documentReferenceSelections: resolveDocumentReferenceSelections(defaults.documentReferenceSelections),
    citationStyle: String(defaults.citationStyle || 'apa'),
    selectedSectionKey,
    selectedSourceKey,
    selectedCollectionKey,
    selectedTagKey,
    selectedReferenceId,
    referenceDockPdfOpen: false,
    referenceDockPdfReferenceId: '',
    sortKey,
  }
}

function buildReferenceStoreResetQueryState(seed = {}) {
  return buildDefaultResolvedQueryState({
    librarySections: seed.librarySections,
    sourceSections: seed.sourceSections,
    collections: seed.collections,
    tags: seed.tags,
    references: seed.references,
    selectedSectionKey: seed.selectedSectionKey,
    selectedSourceKey: seed.selectedSourceKey,
    selectedCollectionKey: seed.selectedCollectionKey,
    selectedTagKey: seed.selectedTagKey,
    sortKey: seed.sortKey,
  })
}

export function buildReferenceLibrarySnapshotPayload(state = {}) {
  return {
    version: 2,
    citationStyle: state.citationStyle,
    documentReferenceSelections: state.documentReferenceSelections,
    collections: state.collections,
    tags: state.tags,
    references: state.references,
  }
}

export function buildReferenceStoreInitialState(defaults = {}) {
  const seed = resolveReferenceStoreSeed(defaults)
  return {
    ...seed,
    resolvedQueryState: buildReferenceStoreResetQueryState(seed),
    isLoading: false,
    loadError: '',
    zoteroSyncStatus: 'disconnected',
    zoteroSyncLastSyncTime: '',
    zoteroSyncError: '',
    zoteroSyncErrorType: '',
    zoteroMutationError: '',
    importInFlight: false,
    availableCitationStylesList: [],
  }
}

export function buildReferenceStoreCleanupState(state = {}, defaults = {}) {
  const seed = resolveReferenceStoreSeed({
    ...defaults,
    librarySections: state.librarySections || defaults.librarySections,
    sourceSections: state.sourceSections || defaults.sourceSections,
  })
  return {
    collections: seed.collections,
    tags: seed.tags,
    references: seed.references,
    documentReferenceSelections: {},
    citationStyle: 'apa',
    selectedSectionKey: 'all',
    selectedSourceKey: '',
    selectedCollectionKey: '',
    selectedTagKey: '',
    selectedReferenceId: String(seed.references[0]?.id || ''),
    referenceDockPdfOpen: false,
    referenceDockPdfReferenceId: '',
    sortKey: 'year-desc',
    resolvedQueryState: buildReferenceStoreResetQueryState({
      ...seed,
      documentReferenceSelections: {},
      citationStyle: 'apa',
      selectedSectionKey: 'all',
      selectedSourceKey: '',
      selectedCollectionKey: '',
      selectedTagKey: '',
      selectedReferenceId: String(seed.references[0]?.id || ''),
      sortKey: 'year-desc',
    }),
    isLoading: false,
    loadError: '',
    zoteroMutationError: '',
    importInFlight: false,
  }
}

export function buildReferenceQuerySelectionState(resolvedQueryState = {}, currentState = {}) {
  const query = resolvedQueryState?.query && typeof resolvedQueryState.query === 'object'
    ? resolvedQueryState.query
    : {}
  return {
    selectedSectionKey: String(query.selectedSectionKey || 'all'),
    selectedSourceKey: String(query.selectedSourceKey || ''),
    selectedCollectionKey: String(query.selectedCollectionKey || ''),
    selectedTagKey: String(query.selectedTagKey || ''),
    sortKey: normalizeReferenceSortKey(query.sortKey),
    selectedReferenceId: String(
      resolvedQueryState?.selectedReferenceId ||
      query.selectedReferenceId ||
      currentState?.selectedReferenceId ||
      ''
    ),
  }
}

export function buildDefaultResolvedQueryState(state = {}) {
  const references = Array.isArray(state.references) ? state.references : []
  return {
    query: {
      selectedSectionKey: state.selectedSectionKey || 'all',
      selectedSourceKey: state.selectedSourceKey || '',
      selectedCollectionKey: state.selectedCollectionKey || '',
      selectedTagKey: state.selectedTagKey || '',
      sortKey: normalizeReferenceSortKey(state.sortKey),
      selectedReferenceId: state.selectedReferenceId || '',
    },
    sectionCounts: {},
    sourceCounts: {},
    collectionCounts: {},
    tagCounts: {},
    sortedReferences: references,
    filteredReferences: references,
    citationUsageIndex: {},
    citationUsageDetails: {},
  }
}
