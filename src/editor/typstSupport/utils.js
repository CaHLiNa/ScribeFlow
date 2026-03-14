const LABEL_RE = /<([A-Za-z][\w:-]*)>/g
const HEADING_RE = /^(={1,6})\s+(.+)$/gm
const STRUCTURE_RE = /#(figure|table)\s*\(/g

export function extractTypstLabels(text = '') {
  const labels = []
  const seen = new Set()
  let match

  LABEL_RE.lastIndex = 0
  while ((match = LABEL_RE.exec(String(text))) !== null) {
    const label = match[1]
    if (!label || seen.has(label)) continue
    seen.add(label)
    labels.push(label)
  }

  return labels
}

export function buildTypstLabelSet(text = '') {
  return new Set(extractTypstLabels(text))
}

function skipTypstString(text, start) {
  let index = start + 1
  while (index < text.length) {
    const char = text[index]
    if (char === '\\') {
      index += 2
      continue
    }
    if (char === '"') return index
    index += 1
  }
  return text.length - 1
}

function skipTypstLineComment(text, start) {
  let index = start + 2
  while (index < text.length && text[index] !== '\n') index += 1
  return index
}

function findMatchingDelimiter(text, openIndex, openChar, closeChar) {
  let depth = 0
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index]

    if (char === '"') {
      index = skipTypstString(text, index)
      continue
    }

    if (char === '/' && text[index + 1] === '/') {
      index = skipTypstLineComment(text, index)
      continue
    }

    if (char === openChar) {
      depth += 1
      continue
    }

    if (char === closeChar) {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return -1
}

function normalizeOutlineText(text = '') {
  return String(text)
    .replace(/#([A-Za-z][\w-]*)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractTrailingLabel(text, startIndex) {
  let index = startIndex
  while (index < text.length && /\s/.test(text[index])) index += 1
  if (text[index] !== '<') return null

  const closeIndex = text.indexOf('>', index + 1)
  if (closeIndex === -1) return null

  const label = text.slice(index + 1, closeIndex).trim()
  if (!/^[A-Za-z][\w:-]*$/.test(label)) return null

  return {
    label,
    from: index,
    to: closeIndex + 1,
  }
}

function findCaptionStart(text) {
  const match = /\bcaption\s*:/.exec(text)
  if (!match) return -1
  return match.index + match[0].length
}

function extractCaptionText(text = '') {
  const captionStart = findCaptionStart(text)
  if (captionStart === -1) return ''

  let index = captionStart
  while (index < text.length && /\s/.test(text[index])) index += 1
  if (text[index] !== '[') return ''

  const closeIndex = findMatchingDelimiter(text, index, '[', ']')
  if (closeIndex === -1) return ''

  return normalizeOutlineText(text.slice(index + 1, closeIndex))
}

function detectFigureContentKind(text = '') {
  let index = 0

  while (index < text.length) {
    const char = text[index]
    if (/\s/.test(char)) {
      index += 1
      continue
    }
    if (char === '/' && text[index + 1] === '/') {
      index = skipTypstLineComment(text, index)
      continue
    }
    break
  }

  if (text[index] === '#') index += 1
  const remainder = text.slice(index)
  return /^table\b\s*\(/.test(remainder) ? 'table' : 'figure'
}

function getTypstOutlineLevel(headings, offset) {
  let currentLevel = 0
  for (const heading of headings) {
    if (heading.offset > offset) break
    currentLevel = heading.level
  }
  return Math.min(currentLevel + 1, 6) || 1
}

function buildStructureText(kind, body, label) {
  const caption = extractCaptionText(body)
  if (caption) return caption
  if (label) return label
  return kind === 'table' ? 'Table' : 'Figure'
}

function isInsideConsumedLabel(index, consumedRanges) {
  return consumedRanges.some(range => index >= range.from && index < range.to)
}

export function parseTypstOutlineItems(text = '') {
  const source = String(text || '')
  const headings = []
  const structureItems = []
  const consumedLabelRanges = []

  HEADING_RE.lastIndex = 0
  let match
  while ((match = HEADING_RE.exec(source)) !== null) {
    headings.push({
      kind: 'heading',
      text: normalizeOutlineText(match[2]),
      level: match[1].length,
      offset: match.index,
    })
  }

  STRUCTURE_RE.lastIndex = 0
  while ((match = STRUCTURE_RE.exec(source)) !== null) {
    const openParenIndex = match.index + match[0].length - 1
    const closeParenIndex = findMatchingDelimiter(source, openParenIndex, '(', ')')
    if (closeParenIndex === -1) continue

    const body = source.slice(openParenIndex + 1, closeParenIndex)
    const trailingLabel = extractTrailingLabel(source, closeParenIndex + 1)
    const kind = match[1] === 'table' ? 'table' : detectFigureContentKind(body)

    if (trailingLabel) consumedLabelRanges.push({ from: trailingLabel.from, to: trailingLabel.to })

    structureItems.push({
      kind,
      text: buildStructureText(kind, body, trailingLabel?.label || ''),
      level: getTypstOutlineLevel(headings, match.index),
      offset: match.index,
      label: trailingLabel?.label || '',
    })

    STRUCTURE_RE.lastIndex = closeParenIndex + 1
  }

  LABEL_RE.lastIndex = 0
  while ((match = LABEL_RE.exec(source)) !== null) {
    if (isInsideConsumedLabel(match.index, consumedLabelRanges)) continue

    structureItems.push({
      kind: 'label',
      text: match[1],
      level: getTypstOutlineLevel(headings, match.index),
      offset: match.index,
      label: match[1],
    })
  }

  return [...headings, ...structureItems].sort((left, right) => left.offset - right.offset)
}

function formatReferenceDetail(ref = {}) {
  const author = ref.author?.[0]?.family || ref.author?.[0]?.given || ''
  const year = ref.issued?.['date-parts']?.[0]?.[0] || ''
  const title = ref.title || ''

  const left = [author, year].filter(Boolean).join(' ')
  return [left, title].filter(Boolean).join(' · ') || 'Library reference'
}

export function collectTypstReferenceOptions({ referencesStore, documentText = '', query = '', limit = 12 } = {}) {
  const normalizedQuery = String(query || '').trim().toLowerCase()
  const options = []
  const seen = new Set()

  for (const label of extractTypstLabels(documentText)) {
    if (normalizedQuery && !label.toLowerCase().includes(normalizedQuery)) continue
    const insertText = `@${label}`
    options.push({
      label: insertText,
      detail: 'Document label',
      type: 'variable',
      apply: insertText,
    })
    seen.add(insertText)
    if (options.length >= limit) return options
  }

  const refs = referencesStore
    ? (normalizedQuery ? referencesStore.searchRefs(normalizedQuery) : referencesStore.sortedLibrary || referencesStore.library || [])
    : []

  for (const ref of refs) {
    const key = ref?._key
    if (!key) continue

    const insertText = `@${key}`
    if (seen.has(insertText)) continue

    options.push({
      label: insertText,
      detail: formatReferenceDetail(ref),
      type: 'constant',
      apply: insertText,
    })
    seen.add(insertText)

    if (options.length >= limit) break
  }

  return options
}
