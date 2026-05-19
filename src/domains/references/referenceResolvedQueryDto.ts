function normalizeDocumentReferencePath(texPath = '') {
  return String(texPath || '').trim()
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

export function resolveReferenceResolvedQueryState(resolved = null) {
  return resolved && typeof resolved === 'object' && !Array.isArray(resolved)
    ? resolved
    : null
}

export function buildReferenceQuerySelectionState(resolvedQueryState = {}) {
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
      ''
    ),
  }
}
