import { invoke } from '@tauri-apps/api/core'

function normalizeDoi(value = '') {
  return String(value || '')
    .replace(/^https?:\/\/doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim()
}

export async function lookupByDoi(doi = '') {
  const normalized = normalizeDoi(doi)
  if (!normalized) return null
  const result = await invoke('references_crossref_lookup_by_doi', {
    params: {
      doi: normalized,
    },
  })
  return result && typeof result === 'object' ? result : null
}

export async function searchByMetadata(title = '', author = '', year = null) {
  const normalizedTitle = String(title || '').trim()
  if (!normalizedTitle) return null
  const result = await invoke('references_crossref_search_by_metadata', {
    params: {
      title: normalizedTitle,
      author,
      year,
    },
  })
  return result && typeof result === 'object' ? result : null
}

export async function hydrateReferenceFromCsl(csl = {}, overrides = {}) {
  const result = await invoke('references_record_from_csl', {
    params: {
      csl,
      overrides,
    },
  })
  return result && typeof result === 'object' ? result : null
}

export function crossrefToCsl(work = {}) {
  const typeMap = {
    'journal-article': 'article-journal',
    'proceedings-article': 'paper-conference',
    'book-chapter': 'chapter',
    'posted-content': 'article',
    monograph: 'book',
    'edited-book': 'book',
    'reference-book': 'book',
    dissertation: 'thesis',
    report: 'report',
    'peer-review': 'article-journal',
    book: 'book',
  }

  const csl = {
    type: typeMap[work.type] || 'article',
    title: work.title?.[0] || '',
    DOI: work.DOI || '',
  }

  if (Array.isArray(work.author) && work.author.length > 0) {
    csl.author = work.author.map((author) => ({
      family: author.family || '',
      given: author.given || '',
    }))
  }

  const issued = work.issued?.['date-parts']?.[0] || work.published?.['date-parts']?.[0]
  if (issued) csl.issued = { 'date-parts': [issued] }
  if (work['container-title']?.[0]) csl['container-title'] = work['container-title'][0]
  if (work.volume) csl.volume = work.volume
  if (work.issue) csl.issue = work.issue
  if (work.page) csl.page = work.page
  if (work.publisher) csl.publisher = work.publisher
  if (work.abstract) csl.abstract = String(work.abstract).replace(/<[^>]+>/g, '')
  if (work.URL) csl.URL = work.URL
  return csl
}
