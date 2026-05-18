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

export function resolveReferenceResolvedQueryState(resolved = null, fallbackState = {}) {
  return resolved && typeof resolved === 'object' && !Array.isArray(resolved)
    ? resolved
    : buildDefaultResolvedQueryState(fallbackState)
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
