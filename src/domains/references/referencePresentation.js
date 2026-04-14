const REFERENCE_SECTION_LABEL_KEYS = {
  all: 'All References',
  unfiled: 'Unfiled',
  'missing-identifier': 'Missing Identifier',
  'missing-pdf': 'Missing PDF',
}

const REFERENCE_SOURCE_LABEL_KEYS = {
  zotero: 'Zotero',
  manual: 'Imported Manually',
}

const REFERENCE_TYPE_LABEL_KEYS = {
  'journal-article': 'Journal Article',
  'conference-paper': 'Conference Paper',
  book: 'Book',
  thesis: 'Thesis',
  other: 'Other Reference',
}

const LEGACY_REFERENCE_TYPE_KEYS = {
  article: 'journal-article',
  'journal-article': 'journal-article',
  'journal article': 'journal-article',
  '期刊论文': 'journal-article',
  inproceedings: 'conference-paper',
  conference: 'conference-paper',
  'conference-paper': 'conference-paper',
  'conference paper': 'conference-paper',
  '会议论文': 'conference-paper',
  book: 'book',
  '图书': 'book',
  thesis: 'thesis',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  '学位论文': 'thesis',
  other: 'other',
  'other reference': 'other',
  '其他文献': 'other',
}

export function getReferenceSectionLabelKey(sectionKey = '') {
  return REFERENCE_SECTION_LABEL_KEYS[sectionKey] || REFERENCE_SECTION_LABEL_KEYS.all
}

export function getReferenceSourceLabelKey(sourceKey = '') {
  return REFERENCE_SOURCE_LABEL_KEYS[sourceKey] || REFERENCE_SOURCE_LABEL_KEYS.manual
}

export function normalizeReferenceTypeKey(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  return LEGACY_REFERENCE_TYPE_KEYS[normalized] || 'other'
}

export function getReferenceTypeLabelKey(typeKey = '') {
  const normalizedTypeKey = normalizeReferenceTypeKey(typeKey)
  return REFERENCE_TYPE_LABEL_KEYS[normalizedTypeKey] || REFERENCE_TYPE_LABEL_KEYS.other
}

export function normalizeReferenceRecord(reference = {}) {
  const authors = Array.isArray(reference.authors) ? reference.authors : []
  const pdfPath = String(reference.pdfPath || '').trim()
  const fulltextPath = String(reference.fulltextPath || '').trim()

  return {
    ...reference,
    authors,
    authorLine: String(reference.authorLine || authors.join('; ')),
    collections: Array.isArray(reference.collections) ? reference.collections : [],
    tags: Array.isArray(reference.tags) ? reference.tags : [],
    notes: Array.isArray(reference.notes) ? reference.notes : [],
    annotations: Array.isArray(reference.annotations) ? reference.annotations : [],
    pdfPath,
    fulltextPath,
    hasPdf: pdfPath ? true : reference.hasPdf === true,
    hasFullText: fulltextPath ? true : reference.hasFullText === true,
    typeKey: normalizeReferenceTypeKey(reference.typeKey || reference.typeLabel),
  }
}
