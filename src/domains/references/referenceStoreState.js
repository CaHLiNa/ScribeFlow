import { REFERENCE_DOCK_PDF_PAGE } from './referenceDockPages.js'

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
    : (fallbackState?.resolvedQueryState || null)
}

export function buildReferenceStoreInitialState(defaults = {}) {
  return {
    librarySections: Array.isArray(defaults.librarySections) ? defaults.librarySections : [],
    sourceSections: Array.isArray(defaults.sourceSections) ? defaults.sourceSections : [],
    collections: Array.isArray(defaults.collections) ? defaults.collections : [],
    tags: Array.isArray(defaults.tags) ? defaults.tags : [],
    references: Array.isArray(defaults.references) ? defaults.references : [],
    documentReferenceSelections: defaults.documentReferenceSelections &&
      typeof defaults.documentReferenceSelections === 'object' &&
      !Array.isArray(defaults.documentReferenceSelections)
      ? defaults.documentReferenceSelections
      : {},
    citationStyle: String(defaults.citationStyle || 'apa'),
    selectedSectionKey: String(defaults.selectedSectionKey || 'all'),
    selectedSourceKey: String(defaults.selectedSourceKey || ''),
    selectedCollectionKey: String(defaults.selectedCollectionKey || ''),
    selectedTagKey: String(defaults.selectedTagKey || ''),
    selectedReferenceId: String(defaults.selectedReferenceId ?? defaults.references?.[0]?.id ?? ''),
    referenceDockPdfOpen: false,
    referenceDockPdfReferenceId: '',
    sortKey: String(defaults.sortKey || 'year-desc'),
    resolvedQueryState: null,
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

export function buildReferenceQuerySelectionState(resolvedQueryState = {}, currentState = {}) {
  const query = resolvedQueryState?.query && typeof resolvedQueryState.query === 'object'
    ? resolvedQueryState.query
    : {}
  return {
    selectedSectionKey: String(query.selectedSectionKey || 'all'),
    selectedSourceKey: String(query.selectedSourceKey || ''),
    selectedCollectionKey: String(query.selectedCollectionKey || ''),
    selectedTagKey: String(query.selectedTagKey || ''),
    sortKey: String(query.sortKey || ''),
    selectedReferenceId: String(
      resolvedQueryState?.selectedReferenceId ||
      query.selectedReferenceId ||
      currentState?.selectedReferenceId ||
      ''
    ),
  }
}
