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

export function resolveDocumentReferenceIds(documentReferenceSelections = {}, texPath = '') {
  const normalizedTexPath = String(texPath || '').trim()
  if (!normalizedTexPath) return []
  return Array.isArray(documentReferenceSelections?.[normalizedTexPath])
    ? documentReferenceSelections[normalizedTexPath]
    : []
}

export function resolveDocumentReferences(documentReferenceSelections = {}, references = [], texPath = '') {
  const selectedIds = new Set(resolveDocumentReferenceIds(documentReferenceSelections, texPath))
  if (selectedIds.size === 0) return []
  return (Array.isArray(references) ? references : [])
    .filter((reference) => selectedIds.has(String(reference?.id || '')))
}

export function resolveReferenceByKey(references = [], referenceKey = '') {
  const normalizedKey = String(referenceKey || '').trim()
  if (!normalizedKey) return null
  return (
    (Array.isArray(references) ? references : []).find(
      (reference) => reference?.citationKey === normalizedKey || reference?.id === normalizedKey,
    ) || null
  )
}

export function resolveReferenceById(references = [], referenceId = '') {
  const normalizedId = String(referenceId || '').trim()
  if (!normalizedId) return null
  return (
    (Array.isArray(references) ? references : []).find(
      (reference) => String(reference?.id || '') === normalizedId,
    ) || null
  )
}

export function hasReferenceById(references = [], referenceId = '') {
  return Boolean(resolveReferenceById(references, referenceId))
}

export function resolveReferencesForExport(references = [], referenceIds = []) {
  const referenceList = Array.isArray(references) ? references : []
  if (!Array.isArray(referenceIds) || referenceIds.length === 0) return referenceList
  return referenceIds
    .map((referenceId) => resolveReferenceById(referenceList, referenceId))
    .filter(Boolean)
}

export function buildReferenceEmptyImportResult() {
  return {
    importedCount: 0,
    selectedReferenceId: '',
    selectedReference: null,
    reusedExisting: false,
  }
}

export function buildReferenceImportInputState(importedReferences = []) {
  const references = Array.isArray(importedReferences) ? importedReferences : []
  return {
    canImport: references.length > 0,
    importedReferences: references,
    emptyResult: buildReferenceEmptyImportResult(),
  }
}

export function buildReferenceImportMutationResultState(references = [], mutation = {}) {
  const selectedReferenceId = String(mutation?.result?.selectedReferenceId || '')
  return {
    importedCount: Number(mutation?.result?.importedCount || 0),
    selectedReferenceId,
    selectedReference: resolveReferenceById(references, selectedReferenceId),
    reusedExisting: mutation?.result?.reusedExisting === true,
  }
}

export function buildReferenceAddMutationResultState(references = [], mutation = {}) {
  const selectedReferenceId = String(mutation?.result?.selectedReferenceId || '')
  return {
    selectedReferenceId,
    selectedReference: resolveReferenceById(references, selectedReferenceId),
  }
}

export function buildReferenceMetadataRefreshTargetState(references = [], referenceId = '') {
  const normalizedReferenceId = String(referenceId || '').trim()
  const reference = resolveReferenceById(references, normalizedReferenceId)
  return {
    canRefresh: Boolean(reference),
    referenceId: normalizedReferenceId,
    reference,
  }
}

export function buildReferencePdfImportTargetState(mutation = {}, fallbackSnapshot = {}) {
  const selectedReferenceId = String(mutation?.result?.selectedReferenceId || '').trim()
  const importedSnapshot = mutation?.snapshot || fallbackSnapshot || {}
  const targetReference = Array.isArray(importedSnapshot?.references)
    ? resolveReferenceById(importedSnapshot.references, selectedReferenceId)
    : null

  return {
    canImport: Boolean(selectedReferenceId && targetReference),
    selectedReferenceId,
    importedSnapshot,
    targetReference,
  }
}

export function buildReferenceCollectionMutationResultState(mutation = {}) {
  const collection = mutation?.result?.collection
  return {
    changed: mutation?.result?.changed === true,
    collection: collection && typeof collection === 'object' && !Array.isArray(collection)
      ? collection
      : null,
  }
}

export function buildReferenceRemoveCollectionMutationResultState(mutation = {}) {
  return {
    removed: mutation?.result?.removed === true,
  }
}

export function buildReferenceDocumentIdsMutationResultState(mutation = {}) {
  return {
    changed: mutation?.result?.changed === true,
  }
}

export function buildReferenceToggleCollectionMutationResultState(mutation = {}) {
  return {
    changed: mutation?.result?.changed === true,
    toggledOn: mutation?.result?.toggledOn === true,
  }
}

export function buildReferenceZoteroSyncResultState(result = {}, options = {}) {
  const counts = {
    imported: Number(result?.imported || 0),
    linked: Number(result?.linked || 0),
    updated: Number(result?.updated || 0),
  }

  if (result?.skipped === true) {
    return {
      skipped: true,
      snapshot: {},
      selectedReferenceId: '',
      zoteroSyncStatus: 'disconnected',
      zoteroSyncLastSyncTime: '',
      counts,
    }
  }

  return {
    skipped: false,
    snapshot: result?.snapshot || {},
    selectedReferenceId: String(result?.selectedReferenceId || '').trim(),
    zoteroSyncStatus: 'synced',
    zoteroSyncLastSyncTime: String(result?.lastSyncTime || options.fallbackLastSyncTime || ''),
    counts,
  }
}

export function resolveReferenceCitationStyleId(style = '', hasStyle = false) {
  const normalizedStyle = String(style || '').trim()
  return normalizedStyle && hasStyle ? normalizedStyle : 'apa'
}

export function resolveReferenceWorkspaceCitationStyles(styles = []) {
  return Array.isArray(styles) ? styles : []
}

export function resolveDocumentReferenceByKey(
  documentReferenceSelections = {},
  references = [],
  texPath = '',
  referenceKey = '',
) {
  return resolveReferenceByKey(
    resolveDocumentReferences(documentReferenceSelections, references, texPath),
    referenceKey,
  )
}

export function isReferenceSelectedForDocument(
  documentReferenceSelections = {},
  references = [],
  texPath = '',
  referenceIdOrKey = '',
) {
  return Boolean(resolveDocumentReferenceByKey(
    documentReferenceSelections,
    references,
    texPath,
    referenceIdOrKey,
  ))
}

export function searchReferences(references = [], query = '') {
  const normalizedQuery = String(query || '').trim().toLowerCase()
  const referenceList = Array.isArray(references) ? references : []
  if (!normalizedQuery) return referenceList

  return referenceList.filter((reference) => {
    const haystack = [
      reference?.title,
      ...(Array.isArray(reference?.authors) ? reference.authors : []),
      reference?.authorLine,
      reference?.source,
      reference?.citationKey,
      reference?.identifier,
      reference?.pages,
      ...(Array.isArray(reference?.tags) ? reference.tags : []),
    ].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(normalizedQuery)
  })
}

export function resolveAvailableDocumentReferences(
  documentReferenceSelections = {},
  references = [],
  texPath = '',
  query = '',
) {
  const selectedIds = new Set(resolveDocumentReferenceIds(documentReferenceSelections, texPath))
  return searchReferences(references, query)
    .filter((reference) => !selectedIds.has(String(reference?.id || '')))
}

export function buildDocumentReferenceIdsMutationState(texPath = '', referenceIds = []) {
  const normalizedTexPath = String(texPath || '').trim()
  return {
    canMutate: Boolean(normalizedTexPath),
    texPath: normalizedTexPath,
    referenceIds: Array.isArray(referenceIds) ? referenceIds : [],
  }
}

export function buildAddDocumentReferenceMutationState(
  documentReferenceSelections = {},
  references = [],
  texPath = '',
  referenceId = '',
) {
  const normalizedReferenceId = String(referenceId || '').trim()
  const currentIds = resolveDocumentReferenceIds(documentReferenceSelections, texPath)
  if (!hasReferenceById(references, normalizedReferenceId) || currentIds.includes(normalizedReferenceId)) {
    return {
      ...buildDocumentReferenceIdsMutationState(texPath, currentIds),
      canMutate: false,
      referenceId: normalizedReferenceId,
    }
  }

  return {
    ...buildDocumentReferenceIdsMutationState(texPath, [...currentIds, normalizedReferenceId]),
    referenceId: normalizedReferenceId,
  }
}

export function buildRemoveDocumentReferenceMutationState(
  documentReferenceSelections = {},
  texPath = '',
  referenceId = '',
) {
  const normalizedReferenceId = String(referenceId || '').trim()
  const currentIds = resolveDocumentReferenceIds(documentReferenceSelections, texPath)
  if (!normalizedReferenceId || !currentIds.includes(normalizedReferenceId)) {
    return {
      ...buildDocumentReferenceIdsMutationState(texPath, currentIds),
      canMutate: false,
      referenceId: normalizedReferenceId,
    }
  }

  return {
    ...buildDocumentReferenceIdsMutationState(
      texPath,
      currentIds.filter((id) => id !== normalizedReferenceId)
    ),
    referenceId: normalizedReferenceId,
  }
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
  if (
    state.referenceDockPdfReferenceId &&
    !hasReferenceById(state.references, state.referenceDockPdfReferenceId)
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

export function buildReferenceSnapshotApplyState(state = {}, snapshot = {}, options = {}) {
  const defaultSnapshot = options?.defaultSnapshot && typeof options.defaultSnapshot === 'object'
    ? options.defaultSnapshot
    : {
        citationStyle: 'apa',
        documentReferenceSelections: {},
        collections: [],
        tags: [],
        references: [],
      }
  const normalized = {
    ...defaultSnapshot,
    ...(snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {}),
  }
  const collections = Array.isArray(normalized.collections) ? normalized.collections : []
  const tags = Array.isArray(normalized.tags) ? normalized.tags : []
  const references = Array.isArray(normalized.references) ? normalized.references : []
  const documentReferenceSelections = resolveDocumentReferenceSelections(normalized.documentReferenceSelections)
  const citationStyle = String(normalized.citationStyle || 'apa')
  const selection = buildReferenceSnapshotSelectionState({
    collections,
    tags,
    sourceSections: state.sourceSections,
    references,
    selectedCollectionKey: state.selectedCollectionKey,
    selectedTagKey: state.selectedTagKey,
    selectedSourceKey: state.selectedSourceKey,
    selectedReferenceId: state.selectedReferenceId,
    preferredSelectedReferenceId: options.preferredSelectedReferenceId,
  })

  return {
    collections,
    tags,
    references,
    documentReferenceSelections,
    citationStyle,
    selectedCollectionKey: selection.selectedCollectionKey,
    selectedTagKey: selection.selectedTagKey,
    selectedSourceKey: selection.selectedSourceKey,
    selectedReferenceId: selection.selectedReferenceId,
    dockPdfState: buildReferenceDockPdfSnapshotState({
      references,
      selectedReferenceId: selection.selectedReferenceId,
      referenceDockPdfOpen: state.referenceDockPdfOpen,
      referenceDockPdfReferenceId: state.referenceDockPdfReferenceId,
      referenceDockActivePage: state.referenceDockActivePage,
    }),
  }
}

export function buildReferenceUpdateMutationCommitState(state = {}, mutation = {}, options = {}) {
  return {
    preferredSelectedReferenceId: options.preferredSelectedReferenceId !== undefined
      ? String(options.preferredSelectedReferenceId || '')
      : String(state.selectedReferenceId || mutation?.result?.selectedReferenceId || ''),
  }
}

export function buildReferenceRemoveMutationCommitState(state = {}, referenceId = '') {
  const selectedReferenceId = String(state.selectedReferenceId || '')
  const normalizedReferenceId = String(referenceId || '').trim()
  return {
    preferredSelectedReferenceId: selectedReferenceId.trim() === normalizedReferenceId
      ? ''
      : selectedReferenceId,
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

export function buildReferenceSectionSelectionState(state = {}, sectionKey = '') {
  return {
    selectedSectionKey: resolveReferenceSectionKey(state.librarySections, sectionKey, 'all'),
    selectedSourceKey: '',
    selectedCollectionKey: '',
    selectedTagKey: '',
  }
}

export function buildReferenceSourceSelectionState(state = {}, sourceKey = '') {
  return {
    selectedSectionKey: 'all',
    selectedSourceKey: resolveReferenceSectionKey(state.sourceSections, sourceKey, ''),
    selectedCollectionKey: '',
    selectedTagKey: '',
  }
}

export function buildReferenceCollectionSelectionState(state = {}, collectionKey = '') {
  const collection = resolveCollection(state.collections, collectionKey)
  return {
    selectedSectionKey: 'all',
    selectedSourceKey: '',
    selectedCollectionKey: collection?.key || '',
    selectedTagKey: '',
  }
}

export function buildReferenceTagSelectionState(state = {}, tagKey = '') {
  const normalizedTagKey = normalizeTagKey(tagKey)
  return {
    selectedSectionKey: 'all',
    selectedSourceKey: '',
    selectedCollectionKey: '',
    selectedTagKey: resolveTag(state.tags, normalizedTagKey) ? normalizedTagKey : '',
  }
}

export function buildReferenceSortSelectionState(sortKey = '') {
  return {
    sortKey: normalizeReferenceSortKey(sortKey),
  }
}

export function resolveReferenceSelectionId(references = [], referenceId = '', fallbackReferenceId = '') {
  const normalizedReferenceId = String(referenceId || '').trim()
  return hasReferenceById(references, normalizedReferenceId)
    ? normalizedReferenceId
    : String(fallbackReferenceId || '')
}

export function buildReferenceSnapshotSelectionState(state = {}) {
  const preferredSelectedReferenceId = state.preferredSelectedReferenceId
  const nextSelectedReferenceId =
    preferredSelectedReferenceId !== null && preferredSelectedReferenceId !== undefined
      ? String(preferredSelectedReferenceId || '')
      : hasReferenceById(state.references, state.selectedReferenceId)
        ? String(state.selectedReferenceId || '')
        : ''

  return {
    selectedCollectionKey: resolveCollection(state.collections, state.selectedCollectionKey)
      ? String(state.selectedCollectionKey || '')
      : '',
    selectedTagKey: resolveTag(state.tags, state.selectedTagKey)
      ? String(state.selectedTagKey || '')
      : '',
    selectedSourceKey: resolveReferenceSectionKey(
      state.sourceSections,
      state.selectedSourceKey,
      ''
    ),
    selectedReferenceId: nextSelectedReferenceId,
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
