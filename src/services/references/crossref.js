import { invoke } from '@tauri-apps/api/core'

const CROSSREF_API = 'https://api.crossref.org/works'
const DOI_ORG = 'https://doi.org'

function normalizeDoi(value = '') {
  return String(value || '')
    .replace(/^https?:\/\/doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim()
}

function tokenize(value = '') {
  return new Set(
    String(value || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .split(/\s+/)
      .filter(Boolean)
  )
}

function titleSimilarity(left = '', right = '') {
  const leftTokens = tokenize(left)
  const rightTokens = tokenize(right)
  if (leftTokens.size === 0 && rightTokens.size === 0) return 1
  const intersection = new Set([...leftTokens].filter((token) => rightTokens.has(token)))
  const union = new Set([...leftTokens, ...rightTokens])
  return union.size > 0 ? intersection.size / union.size : 0
}

async function fetchJson(url = '', headers = {}) {
  const response = await invoke('proxy_api_call_full', {
    request: {
      url,
      method: 'GET',
      headers: {
        'User-Agent': 'Altals/1.0 (desktop references)',
        ...headers,
      },
      body: '',
    },
  })

  if (Number(response.status) < 200 || Number(response.status) >= 300) {
    return null
  }

  return JSON.parse(response.body || 'null')
}

export async function lookupByDoi(doi = '') {
  const normalized = normalizeDoi(doi)
  if (!normalized) return null

  const direct = await fetchJson(`${CROSSREF_API}/${encodeURIComponent(normalized)}`)
  if (direct?.status === 'ok' && direct.message) {
    return crossrefToCsl(direct.message)
  }

  const negotiated = await fetchJson(`${DOI_ORG}/${encodeURIComponent(normalized)}`, {
    Accept: 'application/vnd.citationstyles.csl+json',
  }).catch(() => null)
  if (negotiated?.type) return negotiated

  return null
}

export async function searchByMetadata(title = '', author = '', year = null) {
  const normalizedTitle = String(title || '').trim()
  if (!normalizedTitle) return null

  const params = new URLSearchParams()
  params.set('query.bibliographic', normalizedTitle)
  if (author) params.set('query.author', String(author))
  params.set('rows', '5')

  const data = await fetchJson(`${CROSSREF_API}?${params}`)
  const items = Array.isArray(data?.message?.items) ? data.message.items : []
  if (items.length === 0) return null

  let bestMatch = null
  let bestScore = 0
  for (const item of items) {
    let score = 0
    if (item.title?.[0]) {
      score += titleSimilarity(normalizedTitle, item.title[0]) * 0.5
    }

    if (author && Array.isArray(item.author) && item.author.length > 0) {
      const normalizedAuthor = String(author).toLowerCase()
      const matched = item.author.some((candidate) => {
        const family = String(candidate.family || '').toLowerCase()
        return family && (family.includes(normalizedAuthor) || normalizedAuthor.includes(family))
      })
      if (matched) score += 0.25
    }

    const matchedYear = item.issued?.['date-parts']?.[0]?.[0] || item.published?.['date-parts']?.[0]?.[0]
    if (year && matchedYear && String(year) === String(matchedYear)) {
      score += 0.25
    }

    if (score > bestScore) {
      bestMatch = item
      bestScore = score
    }
  }

  if (bestMatch && bestScore >= 0.6) {
    return { csl: crossrefToCsl(bestMatch), score: bestScore }
  }
  return null
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
