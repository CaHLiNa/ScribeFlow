import { cslToReferenceRecord } from '../../domains/references/referenceInterop.js'
import { invoke } from '@tauri-apps/api/core'
import { lookupByDoi, searchByMetadata } from './crossref.js'
import { extractPdfMetadata } from './pdfMetadata.js'

function normalized(value = '') {
  return String(value || '').trim().toLowerCase()
}

function tokenizeTitle(value = '') {
  return new Set(
    normalized(value)
      .split(/\s+/)
      .map((part) => part.replace(/[^\p{L}\p{N}]+/gu, ''))
      .filter(Boolean)
  )
}

function titleSimilarity(left = '', right = '') {
  const leftTokens = tokenizeTitle(left)
  const rightTokens = tokenizeTitle(right)
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0
  const intersection = new Set([...leftTokens].filter((token) => rightTokens.has(token)))
  const union = new Set([...leftTokens, ...rightTokens])
  return union.size === 0 ? 0 : intersection.size / union.size
}

function requireTauriInvoke() {
  if (typeof window === 'undefined' || typeof window.__TAURI_INTERNALS__?.invoke !== 'function') {
    throw new Error('Tauri invoke is required for reference import.')
  }
}

export async function parseBibTeXText(content = '') {
  requireTauriInvoke()
  const parsed = await invoke('references_import_parse_text', {
    params: {
      content,
      format: 'bibtex',
    },
  })
  return Array.isArray(parsed) ? parsed : []
}

export async function parseRisText(content = '') {
  requireTauriInvoke()
  const parsed = await invoke('references_import_parse_text', {
    params: {
      content,
      format: 'ris',
    },
  })
  return Array.isArray(parsed) ? parsed : []
}

export async function parseCSLJSONText(content = '') {
  requireTauriInvoke()
  const parsed = await invoke('references_import_parse_text', {
    params: {
      content,
      format: 'csl-json',
    },
  })
  return Array.isArray(parsed) ? parsed : []
}

export async function detectReferenceImportFormat(content = '') {
  requireTauriInvoke()
  return invoke('references_import_detect_format', {
    params: {
      content,
    },
  })
}

export async function parseReferenceImportText(content = '', format = 'auto') {
  requireTauriInvoke()
  const parsed = await invoke('references_import_parse_text', {
    params: {
      content,
      format,
    },
  })
  return Array.isArray(parsed) ? parsed : []
}

export async function importReferencesFromText(content = '') {
  const trimmed = String(content || '').trim()
  if (!trimmed) return []
  const imported = await invoke('references_import_from_text', {
    params: {
      content: trimmed,
      format: 'auto',
    },
  })
  return Array.isArray(imported) ? imported : []
}

export async function importReferenceFromPdf(filePath = '') {
  const { firstText, metadata } = await extractPdfMetadata(filePath)

  if (metadata.doi) {
    const verified = await lookupByDoi(metadata.doi)
    if (verified) return cslToReferenceRecord(verified)
  }

  const title = metadata.title || firstText.split('\n').find(Boolean) || ''
  const author = metadata.author || ''
  const match = await searchByMetadata(title, author, metadata.year)
  if (match?.csl) return cslToReferenceRecord(match.csl)

  return cslToReferenceRecord({
    _key: '',
    type: 'article',
    title: title || filePath.split('/').pop()?.replace(/\.pdf$/i, '') || 'Untitled',
    author: author
      ? author
          .split(/[;,]/)
          .map((item) => item.trim())
          .filter(Boolean)
          .map((item) => {
            const parts = item.split(/\s+/)
            return {
              family: parts.at(-1) || item,
              given: parts.slice(0, -1).join(' '),
            }
          })
      : [],
    issued: metadata.year ? { 'date-parts': [[metadata.year]] } : undefined,
    DOI: metadata.doi || '',
  })
}

export function findDuplicateReference(existing = [], candidate = {}) {
  if (!candidate) return null

  const candidateCitationKey = normalized(candidate.citationKey)
  const candidateIdentifier = normalized(candidate.identifier)
  const candidateTitle = normalized(candidate.title)
  const candidateYear = Number(candidate.year || 0) || 0

  return (
    existing.find((current) => {
      const currentCitationKey = normalized(current.citationKey)
      if (candidateCitationKey && currentCitationKey && candidateCitationKey === currentCitationKey) return true

      const currentIdentifier = normalized(current.identifier)
      if (candidateIdentifier && currentIdentifier && candidateIdentifier === currentIdentifier) return true

      const currentTitle = normalized(current.title)
      const currentYear = Number(current.year || 0) || 0
      if (candidateTitle && currentTitle && candidateYear && currentYear && candidateYear === currentYear) {
        if (candidateTitle === currentTitle) return true
        if (titleSimilarity(candidateTitle, currentTitle) >= 0.85) return true
      }

      return false
    }) || null
  )
}

export function mergeImportedReferences(existing = [], imported = []) {
  const merged = [...existing]

  for (const candidate of imported) {
    if (!findDuplicateReference(merged, candidate)) {
      merged.push(candidate)
    }
  }

  return merged
}
