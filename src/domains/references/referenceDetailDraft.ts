const REFERENCE_DETAIL_EDITABLE_DRAFT_FIELDS = Object.freeze([
  'title',
  'authorsText',
  'citationKey',
  'year',
  'source',
  'identifier',
  'volume',
  'issue',
  'pages',
  'abstract',
  'note',
])

export const REFERENCE_DETAIL_EDITABLE_FIELDS = REFERENCE_DETAIL_EDITABLE_DRAFT_FIELDS

export function normalizeReferenceDetailText(value = '') {
  return String(value || '').trim()
}

export function normalizeReferenceDetailAuthors(value = '') {
  return String(value || '')
    .split(/[\n;]+/g)
    .map((part) => normalizeReferenceDetailText(part))
    .filter(Boolean)
}

export function normalizeReferenceDetailTagValues(value = '') {
  return String(value || '')
    .split(/[,\n;]+/g)
    .map((part) => normalizeReferenceDetailText(part).replace(/^#/, ''))
    .filter(Boolean)
}

export function resolveReferenceDetailCollection(collections = [], value = '') {
  const normalized = normalizeReferenceDetailText(value).toLowerCase()
  if (!normalized) return null
  const normalizedCollections = Array.isArray(collections) ? collections : []
  return (
    normalizedCollections.find(
      (collection) => String(collection?.key || '').trim().toLowerCase() === normalized,
    ) ||
    normalizedCollections.find(
      (collection) => String(collection?.label || '').trim().toLowerCase() === normalized,
    ) ||
    null
  )
}

export function normalizeReferenceDetailCollectionMemberships(collections = [], values = []) {
  return (Array.isArray(values) ? values : [])
    .map((value) => resolveReferenceDetailCollection(collections, value)?.key || String(value || '').trim())
    .filter(Boolean)
}

export function resolveReferenceDetailCollectionLabel(collections = [], value = '') {
  return resolveReferenceDetailCollection(collections, value)?.label || String(value || '').trim()
}

export function buildReferenceDetailDraftSnapshot(reference = null, collections = []) {
  return {
    title: String(reference?.title || ''),
    authorsText: Array.isArray(reference?.authors) ? reference.authors.join('; ') : '',
    citationKey: String(reference?.citationKey || ''),
    year: reference?.year != null && reference?.year !== '' ? String(reference.year) : '',
    source: String(reference?.source || ''),
    identifier: String(reference?.identifier || ''),
    volume: String(reference?.volume || ''),
    issue: String(reference?.issue || ''),
    pages: String(reference?.pages || ''),
    abstract: String(reference?.abstract || ''),
    note: Array.isArray(reference?.notes) ? reference.notes.join('\n\n') : '',
    collections: normalizeReferenceDetailCollectionMemberships(
      collections,
      reference?.collections || [],
    ),
    tags: Array.isArray(reference?.tags) ? [...reference.tags] : [],
  }
}

export function resolveReferenceDetailPdfPath(reference = null) {
  return String(reference?.pdfPath || '').trim()
}

export function buildReferenceDetailHeroMetaItems(draft = {}) {
  return [
    draft?.year ? String(draft.year) : '',
    draft?.source ? String(draft.source) : '',
    draft?.citationKey ? String(draft.citationKey) : '',
  ].filter(Boolean)
}

export function normalizeReferenceDetailDraftFieldForCompare(field = '', value = '') {
  if (field === 'authorsText') return normalizeReferenceDetailAuthors(value).join('; ')
  if (field === 'year') {
    const trimmed = normalizeReferenceDetailText(value)
    const year = trimmed ? Number.parseInt(trimmed, 10) : null
    return Number.isFinite(year) ? String(year) : ''
  }
  return String(value || '').trim()
}

export function hasReferenceDetailDraftFieldChanged({
  field = '',
  draft = {},
  reference = null,
  collections = [],
} = {}) {
  if (!reference?.id) return false
  const snapshot = buildReferenceDetailDraftSnapshot(reference, collections)
  return (
    normalizeReferenceDetailDraftFieldForCompare(field, draft?.[field]) !==
    normalizeReferenceDetailDraftFieldForCompare(field, snapshot[field])
  )
}

export function buildReferenceDetailDirtyUpdates({
  draft = {},
  tagInput = '',
  fields = new Set(),
} = {}) {
  const updates = {}
  const nextDraft = {
    ...draft,
    tags: Array.isArray(draft.tags) ? [...draft.tags] : [],
  }
  let clearTagInput = false

  if (fields.has('title')) {
    updates.title = String(nextDraft.title || '').trim()
    nextDraft.title = updates.title
  }
  if (fields.has('authorsText')) {
    const authors = normalizeReferenceDetailAuthors(nextDraft.authorsText)
    nextDraft.authorsText = authors.join('; ')
    updates.authors = authors
    updates.authorLine = authors.join('; ')
  }
  if (fields.has('citationKey')) {
    updates.citationKey = normalizeReferenceDetailText(nextDraft.citationKey)
    nextDraft.citationKey = updates.citationKey
  }
  if (fields.has('year')) {
    const trimmed = normalizeReferenceDetailText(nextDraft.year)
    const year = trimmed ? Number.parseInt(trimmed, 10) : null
    nextDraft.year = Number.isFinite(year) ? String(year) : ''
    updates.year = Number.isFinite(year) ? year : null
  }

  for (const field of ['source', 'identifier', 'volume', 'issue', 'pages']) {
    if (fields.has(field)) {
      updates[field] = normalizeReferenceDetailText(nextDraft[field])
      nextDraft[field] = updates[field]
    }
  }

  if (fields.has('abstract')) {
    updates.abstract = String(nextDraft.abstract || '').trim()
    nextDraft.abstract = updates.abstract
  }
  if (fields.has('note')) {
    nextDraft.note = String(nextDraft.note || '').trim()
    updates.notes = nextDraft.note ? [nextDraft.note] : []
  }
  if (fields.has('tagInput') && normalizeReferenceDetailTagValues(tagInput).length > 0) {
    const existing = new Set(
      nextDraft.tags.map((tag) =>
        normalizeReferenceDetailText(tag).toLowerCase(),
      ),
    )
    for (const tag of normalizeReferenceDetailTagValues(tagInput)) {
      const normalized = tag.toLowerCase()
      if (!existing.has(normalized)) {
        existing.add(normalized)
        nextDraft.tags.push(tag)
      }
    }
    clearTagInput = true
    updates.tags = [...nextDraft.tags]
  }

  return {
    clearTagInput,
    draft: nextDraft,
    updates,
  }
}
