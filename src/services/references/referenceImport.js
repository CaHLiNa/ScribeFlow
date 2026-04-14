import { cslToReferenceRecord } from '../../domains/references/referenceInterop.js'
import { parseBibtex } from '../../utils/bibtexParser.js'
import { parseRis } from '../../utils/risParser.js'
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

function isJsonContent(content = '') {
  const trimmed = String(content || '').trim()
  return trimmed.startsWith('{') || trimmed.startsWith('[')
}

export function parseBibTeXText(content = '') {
  return parseBibtex(content).map((item) => cslToReferenceRecord(item))
}

export function parseRisText(content = '') {
  return parseRis(content).map((item) => cslToReferenceRecord(item))
}

export function parseCSLJSONText(content = '') {
  const trimmed = String(content || '').trim()
  if (!trimmed) return []

  const parsed = JSON.parse(trimmed)
  const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : [parsed]
  return items.map((item) => cslToReferenceRecord(item))
}

export function detectReferenceImportFormat(content = '') {
  const trimmed = String(content || '').trim()
  if (!trimmed) return 'unknown'
  if (/^@\w+\s*\{/m.test(trimmed)) return 'bibtex'
  if (/^TY\s{2}-/m.test(trimmed)) return 'ris'
  if (isJsonContent(trimmed)) return 'csl-json'
  return 'unknown'
}

export function parseReferenceImportText(content = '', format = 'auto') {
  const normalizedFormat = format === 'auto' ? detectReferenceImportFormat(content) : format
  if (normalizedFormat === 'bibtex') return parseBibTeXText(content)
  if (normalizedFormat === 'ris') return parseRisText(content)
  if (normalizedFormat === 'csl-json') return parseCSLJSONText(content)
  return []
}

export async function importReferencesFromText(content = '') {
  const trimmed = String(content || '').trim()
  if (!trimmed) return []

  if (/^(https?:\/\/doi\.org\/)?10\.\d{4,}/i.test(trimmed) && !trimmed.includes('\n')) {
    const doiMatch = await lookupByDoi(trimmed)
    return doiMatch ? [cslToReferenceRecord(doiMatch)] : []
  }

  const parsed = parseReferenceImportText(trimmed, 'auto')
  if (parsed.length > 0) return parsed

  const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean)
  const doiLines = lines.filter((line) => /^(https?:\/\/doi\.org\/)?10\.\d{4,}/i.test(line))
  if (doiLines.length > 1 && doiLines.length === lines.length) {
    const resolved = await Promise.all(doiLines.map((doi) => lookupByDoi(doi)))
    return resolved.filter(Boolean).map((item) => cslToReferenceRecord(item))
  }

  const match = await searchByMetadata(trimmed, '', null)
  return match?.csl ? [cslToReferenceRecord(match.csl)] : []
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
