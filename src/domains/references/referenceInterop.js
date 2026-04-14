import { normalizeReferenceTypeKey } from './referencePresentation.js'

const REFERENCE_TO_CSL_TYPE = {
  'journal-article': 'article-journal',
  'conference-paper': 'paper-conference',
  book: 'book',
  thesis: 'thesis',
  other: 'article',
}

const CSL_TO_REFERENCE_TYPE = {
  'article-journal': 'journal-article',
  'paper-conference': 'conference-paper',
  article: 'journal-article',
  book: 'book',
  chapter: 'book',
  thesis: 'thesis',
  report: 'other',
  manuscript: 'other',
  webpage: 'other',
}

function normalizeWhitespace(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function extractCslYear(csl = {}) {
  return Number(csl?.issued?.['date-parts']?.[0]?.[0] || 0) || null
}

function stringifyAuthor(person = {}) {
  const given = normalizeWhitespace(person?.given || '')
  const family = normalizeWhitespace(person?.family || '')
  return [given, family].filter(Boolean).join(' ').trim()
}

function toReferenceTypeKey(cslType = '') {
  return normalizeReferenceTypeKey(CSL_TO_REFERENCE_TYPE[String(cslType || '').trim()] || 'other')
}

function toCslType(typeKey = '') {
  const normalized = normalizeReferenceTypeKey(typeKey)
  return REFERENCE_TO_CSL_TYPE[normalized] || REFERENCE_TO_CSL_TYPE.other
}

function buildCitationKey(csl = {}) {
  const explicit = normalizeWhitespace(csl._key || csl.id || '')
  if (explicit) return explicit

  const family = normalizeWhitespace(csl?.author?.[0]?.family || 'ref')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
  const year = extractCslYear(csl)
  return `${family || 'ref'}${year || ''}` || `ref-${crypto.randomUUID().slice(0, 8)}`
}

export function buildAuthorNamesFromCsl(csl = {}) {
  const authors = Array.isArray(csl.author) ? csl.author : []
  return authors.map((author) => stringifyAuthor(author)).filter(Boolean)
}

export function cslToReferenceRecord(csl = {}, overrides = {}) {
  const authors = buildAuthorNamesFromCsl(csl)
  const citationKey = buildCitationKey(csl)
  const identifier = normalizeWhitespace(csl.DOI || csl.URL || overrides.identifier || '')
  const pdfPath = normalizeWhitespace(overrides.pdfPath || csl._pdfPath || csl.pdfPath || '')
  const fulltextPath = normalizeWhitespace(
    overrides.fulltextPath || csl._textPath || csl.fulltextPath || ''
  )
  const collections = Array.isArray(overrides.collections)
    ? overrides.collections
    : Array.isArray(csl._collections)
      ? csl._collections
      : []
  const tags = Array.isArray(overrides.tags)
    ? overrides.tags
    : Array.isArray(csl._tags)
      ? csl._tags
      : []

  return {
    id: normalizeWhitespace(overrides.id || citationKey || `ref-${crypto.randomUUID()}`),
    typeKey: toReferenceTypeKey(csl.type),
    title: normalizeWhitespace(csl.title || overrides.title || 'Untitled'),
    authors,
    authorLine: authors.join('; '),
    year: overrides.year ?? extractCslYear(csl),
    source: normalizeWhitespace(csl['container-title'] || csl.publisher || overrides.source || ''),
    identifier,
    volume: normalizeWhitespace(csl.volume || overrides.volume || ''),
    issue: normalizeWhitespace(csl.issue || overrides.issue || ''),
    pages: normalizeWhitespace(csl.page || overrides.pages || ''),
    citationKey,
    hasPdf: Boolean(pdfPath || overrides.hasPdf),
    pdfPath,
    hasFullText: Boolean(fulltextPath || overrides.hasFullText),
    fulltextPath,
    collections,
    tags,
    rating: Number(overrides.rating || 0) || 0,
    abstract: normalizeWhitespace(csl.abstract || overrides.abstract || ''),
    notes: Array.isArray(overrides.notes) ? overrides.notes : [],
    annotations: Array.isArray(overrides.annotations) ? overrides.annotations : [],
  }
}

export function referenceRecordToCsl(reference = {}) {
  const authors = Array.isArray(reference.authors) ? reference.authors : []
  const year = Number(reference.year || 0) || null

  const csl = {
    id: normalizeWhitespace(reference.citationKey || reference.id || ''),
    _key: normalizeWhitespace(reference.citationKey || reference.id || ''),
    type: toCslType(reference.typeKey),
    title: normalizeWhitespace(reference.title || ''),
  }

  if (authors.length > 0) {
    csl.author = authors.map((name) => {
      const normalized = normalizeWhitespace(name)
      if (!normalized) return { family: 'Unknown' }
      const parts = normalized.split(/\s+/)
      if (parts.length === 1) return { family: parts[0] }
      return {
        family: parts.at(-1),
        given: parts.slice(0, -1).join(' '),
      }
    })
  }

  if (year) {
    csl.issued = { 'date-parts': [[year]] }
  }
  if (reference.source) csl['container-title'] = normalizeWhitespace(reference.source)
  if (reference.volume) csl.volume = normalizeWhitespace(reference.volume)
  if (reference.issue) csl.issue = normalizeWhitespace(reference.issue)
  if (reference.pages) csl.page = normalizeWhitespace(reference.pages)
  if (reference.abstract) csl.abstract = normalizeWhitespace(reference.abstract)

  const identifier = normalizeWhitespace(reference.identifier)
  if (identifier) {
    if (/^10\.\d{4,9}\//i.test(identifier)) csl.DOI = identifier
    else csl.URL = identifier
  }

  if (reference.pdfPath) csl._pdfPath = normalizeWhitespace(reference.pdfPath)
  if (reference.fulltextPath) csl._textPath = normalizeWhitespace(reference.fulltextPath)
  if (Array.isArray(reference.tags) && reference.tags.length > 0) csl._tags = [...reference.tags]
  if (Array.isArray(reference.collections) && reference.collections.length > 0) {
    csl._collections = [...reference.collections]
  }

  return csl
}

export function normalizeReferenceSearchTokens(reference = {}) {
  return [
    reference.title,
    ...(Array.isArray(reference.authors) ? reference.authors : []),
    reference.authorLine,
    reference.source,
    reference.citationKey,
    reference.identifier,
    reference.pages,
    ...(Array.isArray(reference.tags) ? reference.tags : []),
  ]
    .filter(Boolean)
    .map((value) => normalizeWhitespace(value).toLowerCase())
}
