export function normalizeCollectionMembershipValue(value = '') {
  return String(value || '').trim().toLowerCase()
}

export function normalizeTagKey(value = '') {
  return String(value || '').trim().toLowerCase()
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

export function buildDefaultResolvedQueryState(state = {}) {
  const references = Array.isArray(state.references) ? state.references : []
  return {
    query: {
      selectedSectionKey: state.selectedSectionKey || 'all',
      selectedSourceKey: state.selectedSourceKey || '',
      selectedCollectionKey: state.selectedCollectionKey || '',
      selectedTagKey: state.selectedTagKey || '',
      sortKey: state.sortKey || 'year-desc',
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
