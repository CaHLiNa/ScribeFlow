function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function buildLineOffsets(text = '') {
  const offsets = [0]
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') {
      offsets.push(index + 1)
    }
  }
  return offsets
}

function positionToOffset(lineOffsets, textLength, position = {}) {
  const lineIndex = clamp(Number(position.line) || 0, 0, Math.max(0, lineOffsets.length - 1))
  const lineStart = lineOffsets[lineIndex] || 0
  const nextLineStart = lineOffsets[lineIndex + 1] ?? textLength
  const lineLength = Math.max(0, nextLineStart - lineStart)
  const character = clamp(Number(position.character) || 0, 0, lineLength)
  return Math.min(lineStart + character, textLength)
}

function mapOutlineKind(symbol = {}) {
  const name = String(symbol?.name || '').trim().toLowerCase()
  if (name.startsWith('figure') || name.startsWith('fig.')) return 'figure'
  if (name.startsWith('table')) return 'table'
  if (name.startsWith('label')) return 'label'
  return 'heading'
}

function normalizeSymbolRange(symbol = {}) {
  if (symbol?.selectionRange?.start) return symbol.selectionRange.start
  if (symbol?.range?.start) return symbol.range.start
  if (symbol?.location?.range?.start) return symbol.location.range.start
  return { line: 0, character: 0 }
}

function flattenDocumentSymbols(symbols = [], visitor, depth = 0) {
  for (const symbol of symbols) {
    visitor(symbol, depth)
    if (Array.isArray(symbol?.children) && symbol.children.length > 0) {
      flattenDocumentSymbols(symbol.children, visitor, depth + 1)
    }
  }
}

export function normalizeTinymistDocumentSymbols(documentText = '', symbols = []) {
  const text = String(documentText || '')
  const textLength = text.length
  const lineOffsets = buildLineOffsets(text)
  const items = []

  flattenDocumentSymbols(symbols, (symbol, depth) => {
    const name = String(symbol?.name || '').trim()
    if (!name) return

    const start = normalizeSymbolRange(symbol)
    items.push({
      kind: mapOutlineKind(symbol),
      text: name,
      level: Math.max(1, depth + 1),
      offset: positionToOffset(lineOffsets, textLength, start),
    })
  })

  return items.sort((left, right) => left.offset - right.offset)
}
