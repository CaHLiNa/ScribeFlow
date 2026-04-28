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
