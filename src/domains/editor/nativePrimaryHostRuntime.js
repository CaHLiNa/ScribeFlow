export const NATIVE_PRIMARY_LAYOUT = Object.freeze({
  paddingTop: 28,
  paddingRight: 32,
  paddingBottom: 48,
  paddingLeft: 32,
  gutterWidth: 68,
  lineHeight: 23.8,
  caretWidth: 2,
  minSelectionWidth: 2,
})

export function buildNativePrimaryFallbackLineNumbers(text = '') {
  const normalized = String(text || '')
  const parts = normalized.split('\n')
  let offset = 0
  return parts.map((part, index) => {
    const from = offset
    const to = offset + part.length
    offset = to + 1
    return {
      line: index + 1,
      from,
      to,
    }
  })
}

export function clampNativePrimaryOffset(text = '', offset = 0) {
  const normalized = String(text || '')
  const numeric = Number(offset || 0)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(normalized.length, Math.trunc(numeric)))
}

export function buildNativePrimarySelectionPayload({
  filePath = '',
  text = '',
  anchor = 0,
  head = 0,
} = {}) {
  const normalized = String(text || '')
  const safeAnchor = clampNativePrimaryOffset(normalized, anchor)
  const safeHead = clampNativePrimaryOffset(normalized, head)
  const from = Math.min(safeAnchor, safeHead)
  const to = Math.max(safeAnchor, safeHead)
  return {
    filePath,
    hasSelection: from !== to,
    anchor: safeAnchor,
    head: safeHead,
    from,
    to,
    text: from !== to ? normalized.slice(from, to) : '',
  }
}

export function findNativePrimaryLineIndex(lineNumbers = [], offset = 0) {
  if (!Array.isArray(lineNumbers) || lineNumbers.length === 0) return 0
  const safeOffset = Math.max(0, Number(offset || 0))
  for (let index = 0; index < lineNumbers.length; index += 1) {
    const line = lineNumbers[index]
    const from = Number(line?.from || 0)
    const to = Number(line?.to ?? from)
    if (safeOffset <= to || index === lineNumbers.length - 1) {
      return index
    }
    if (safeOffset >= from && safeOffset <= to + 1) {
      return index
    }
  }
  return lineNumbers.length - 1
}

export function resolveNativePrimaryOffsetAtPoint({
  text = '',
  lineNumbers = [],
  x = 0,
  y = 0,
  layout = NATIVE_PRIMARY_LAYOUT,
  measureTextWidth = () => 0,
} = {}) {
  const normalized = String(text || '')
  if (!Array.isArray(lineNumbers) || lineNumbers.length === 0) return 0

  const relativeY = Math.max(0, Number(y || 0) - layout.paddingTop)
  const lineIndex = Math.max(
    0,
    Math.min(lineNumbers.length - 1, Math.floor(relativeY / layout.lineHeight))
  )
  const line = lineNumbers[lineIndex]
  const lineText = normalized.slice(Number(line?.from || 0), Number(line?.to || 0))
  const relativeX = Math.max(0, Number(x || 0) - layout.paddingLeft)
  const offsetInLine = resolveOffsetInLineByWidth(lineText, relativeX, measureTextWidth)
  return clampNativePrimaryOffset(normalized, Number(line?.from || 0) + offsetInLine)
}

export function buildNativePrimarySelectionBlocks({
  text = '',
  lineNumbers = [],
  anchor = 0,
  head = 0,
  layout = NATIVE_PRIMARY_LAYOUT,
  measureTextWidth = () => 0,
} = {}) {
  const normalized = String(text || '')
  const selection = buildNativePrimarySelectionPayload({
    text: normalized,
    anchor,
    head,
  })
  if (!selection.hasSelection) return []

  return lineNumbers
    .map((line, index) => buildSelectionBlockForLine({
      line,
      lineIndex: index,
      text: normalized,
      selection,
      layout,
      measureTextWidth,
    }))
    .filter(Boolean)
}

export function buildNativePrimaryRangeBlocks({
  text = '',
  lineNumbers = [],
  ranges = [],
  layout = NATIVE_PRIMARY_LAYOUT,
  measureTextWidth = () => 0,
} = {}) {
  const normalized = String(text || '')
  return Array.isArray(ranges)
    ? ranges.flatMap((range, rangeIndex) => {
        const selection = buildNativePrimarySelectionPayload({
          text: normalized,
          anchor: range?.from ?? 0,
          head: range?.to ?? range?.from ?? 0,
        })
        if (!selection.hasSelection) return []
        return lineNumbers
          .map((line, lineIndex) =>
            buildSelectionBlockForLine({
              line,
              lineIndex,
              text: normalized,
              selection,
              layout,
              measureTextWidth,
              blockPrefix: `${rangeIndex}`,
            })
          )
          .filter(Boolean)
      })
    : []
}

export function buildNativePrimaryCaretVisual({
  text = '',
  lineNumbers = [],
  offset = 0,
  layout = NATIVE_PRIMARY_LAYOUT,
  measureTextWidth = () => 0,
} = {}) {
  const normalized = String(text || '')
  if (!Array.isArray(lineNumbers) || lineNumbers.length === 0) {
    return {
      left: layout.paddingLeft,
      top: layout.paddingTop,
      height: layout.lineHeight,
    }
  }

  const safeOffset = clampNativePrimaryOffset(normalized, offset)
  const lineIndex = findNativePrimaryLineIndex(lineNumbers, safeOffset)
  const line = lineNumbers[lineIndex]
  const lineFrom = Number(line?.from || 0)
  const lineTo = Number(line?.to || lineFrom)
  const lineText = normalized.slice(lineFrom, lineTo)
  const beforeCaret = lineText.slice(0, Math.max(0, safeOffset - lineFrom))
  return {
    left: layout.paddingLeft + measureTextWidth(beforeCaret),
    top: layout.paddingTop + lineIndex * layout.lineHeight,
    height: layout.lineHeight,
  }
}

export function computeNativePrimaryContentWidth({
  lines = [],
  layout = NATIVE_PRIMARY_LAYOUT,
  measureTextWidth = () => 0,
} = {}) {
  const maxLineWidth = Array.isArray(lines)
    ? lines.reduce((current, line) => Math.max(current, measureTextWidth(String(line?.text || ''))), 0)
    : 0
  return Math.ceil(layout.paddingLeft + maxLineWidth + layout.paddingRight)
}

export function computeNativePrimaryContentHeight({
  lineCount = 1,
  layout = NATIVE_PRIMARY_LAYOUT,
} = {}) {
  const safeLineCount = Math.max(1, Number(lineCount || 1))
  return Math.ceil(layout.paddingTop + safeLineCount * layout.lineHeight + layout.paddingBottom)
}

export function selectNativePrimaryWord(text = '', offset = 0) {
  const normalized = String(text || '')
  const safeOffset = clampNativePrimaryOffset(normalized, offset)
  if (!normalized) return { anchor: 0, head: 0 }

  const pivot = safeOffset < normalized.length ? safeOffset : Math.max(0, safeOffset - 1)
  const character = normalized[pivot] || ''
  if (!isNativePrimaryWordChar(character)) {
    return {
      anchor: pivot,
      head: Math.min(normalized.length, pivot + (character ? 1 : 0)),
    }
  }

  let start = pivot
  let end = pivot + 1

  while (start > 0 && isNativePrimaryWordChar(normalized[start - 1])) {
    start -= 1
  }
  while (end < normalized.length && isNativePrimaryWordChar(normalized[end])) {
    end += 1
  }

  return {
    anchor: start,
    head: end,
  }
}

function buildSelectionBlockForLine({
  line,
  lineIndex,
  text,
  selection,
  layout,
  measureTextWidth,
  blockPrefix = '',
}) {
  const lineFrom = Number(line?.from || 0)
  const lineTo = Number(line?.to || lineFrom)
  const from = Math.max(lineFrom, selection.from)
  const to = Math.min(lineTo, selection.to)
  if (to < from) return null
  if (to === from && !(lineFrom === lineTo && selection.from <= lineFrom && selection.to >= lineFrom)) {
    return null
  }

  const lineText = text.slice(lineFrom, lineTo)
  const startText = lineText.slice(0, Math.max(0, from - lineFrom))
  const endText = lineText.slice(0, Math.max(0, to - lineFrom))
  const left = layout.paddingLeft + measureTextWidth(startText)
  const width = Math.max(
    layout.minSelectionWidth,
    measureTextWidth(endText) - measureTextWidth(startText)
  )

  return {
    key: `${blockPrefix}:${lineIndex}:${from}:${to}`,
    left,
    top: layout.paddingTop + lineIndex * layout.lineHeight,
    width,
    height: layout.lineHeight,
  }
}

function resolveOffsetInLineByWidth(text = '', targetX = 0, measureTextWidth = () => 0) {
  const normalized = String(text || '')
  if (!normalized || targetX <= 0) return 0

  let bestOffset = normalized.length
  let bestDistance = Number.POSITIVE_INFINITY

  for (let offset = 0; offset <= normalized.length; offset += 1) {
    const width = measureTextWidth(normalized.slice(0, offset))
    const distance = Math.abs(width - targetX)
    if (distance < bestDistance) {
      bestDistance = distance
      bestOffset = offset
    }
    if (width > targetX && distance > bestDistance) {
      break
    }
  }

  return bestOffset
}

function isNativePrimaryWordChar(character = '') {
  return /[\p{L}\p{N}_-]/u.test(String(character || ''))
}
