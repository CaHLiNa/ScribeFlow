import { normalizeReferenceTypeKey } from '../../domains/references/referencePresentation.js'

function parseAuthorNames(raw = '') {
  return String(raw || '')
    .split(/\s+and\s+/i)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((name) => {
      if (name.includes(',')) {
        const [family, given] = name.split(',').map((part) => part.trim())
        return given && family ? `${given} ${family}` : name
      }
      return name
    })
}

function parseEntryType(type = '') {
  const normalized = String(type || '').trim().toLowerCase()
  if (normalized === 'article') return 'journal-article'
  if (normalized === 'inproceedings' || normalized === 'conference') return 'conference-paper'
  if (normalized === 'book') return 'book'
  if (normalized === 'phdthesis' || normalized === 'mastersthesis') return 'thesis'
  return 'other'
}

function normalizeFieldValue(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[{}]/g, '')
    .trim()
}

function parseBibTeXFields(block = '') {
  const fields = {}
  let index = 0

  while (index < block.length) {
    while (index < block.length && /[\s,]/.test(block[index])) index += 1
    if (index >= block.length) break

    const keyStart = index
    while (index < block.length && block[index] !== '=') index += 1
    if (index >= block.length) break

    const key = block.slice(keyStart, index).trim().toLowerCase()
    index += 1
    while (index < block.length && /\s/.test(block[index])) index += 1

    let value = ''
    if (block[index] === '{') {
      let depth = 1
      index += 1
      const valueStart = index
      while (index < block.length && depth > 0) {
        if (block[index] === '{') depth += 1
        if (block[index] === '}') depth -= 1
        index += 1
      }
      value = block.slice(valueStart, index - 1)
    } else if (block[index] === '"') {
      index += 1
      const valueStart = index
      while (index < block.length && block[index] !== '"') index += 1
      value = block.slice(valueStart, index)
      index += 1
    } else {
      const valueStart = index
      while (index < block.length && block[index] !== ',') index += 1
      value = block.slice(valueStart, index)
    }

    fields[key] = normalizeFieldValue(value)
    while (index < block.length && block[index] !== ',') index += 1
    if (block[index] === ',') index += 1
  }

  return fields
}

export function parseBibTeXText(content = '') {
  const text = String(content || '')
  const entries = []
  const entryRegex = /@(\w+)\s*\{\s*([^,]+)\s*,([\s\S]*?)\n?\}\s*(?=@|$)/g
  let match

  while ((match = entryRegex.exec(text)) !== null) {
    const [, entryType, citationKey, fieldBlock] = match
    const fields = parseBibTeXFields(fieldBlock)
    const authors = parseAuthorNames(fields.author)
    const title = fields.title || 'Untitled'
    const year = Number.parseInt(fields.year || '', 10) || null
    const identifier = fields.doi || fields.url || ''

    entries.push({
      id: `ref-${crypto.randomUUID()}`,
      typeKey: normalizeReferenceTypeKey(parseEntryType(entryType)),
      title,
      authors,
      authorLine: authors.join('; '),
      year,
      source: fields.journal || fields.booktitle || fields.publisher || '',
      identifier,
      volume: fields.volume || '',
      issue: fields.number || '',
      pages: fields.pages || '',
      citationKey: String(citationKey || '').trim(),
      hasPdf: false,
      collections: [],
      tags: [],
      rating: 0,
      abstract: fields.abstract || '',
      notes: [],
      annotations: [],
    })
  }

  return entries
}

function normalizedTitle(value = '') {
  return String(value || '').trim().toLowerCase()
}

export function mergeImportedReferences(existing = [], imported = []) {
  const merged = [...existing]

  for (const candidate of imported) {
    const duplicate = merged.some((current) => {
      if (candidate.citationKey && current.citationKey) {
        return candidate.citationKey === current.citationKey
      }
      if (candidate.identifier && current.identifier) {
        return candidate.identifier === current.identifier
      }
      return (
        normalizedTitle(candidate.title) === normalizedTitle(current.title) &&
        Number(candidate.year || 0) === Number(current.year || 0)
      )
    })

    if (!duplicate) merged.push(candidate)
  }

  return merged
}
