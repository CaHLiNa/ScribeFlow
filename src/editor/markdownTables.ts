import { syntaxTree } from '@codemirror/language'

function isInCodeContext(state, from, to) {
  let inCode = false
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      const name = node.type.name
      if (
        name === 'CodeBlock' || name === 'FencedCode' || name === 'CodeText'
        || name === 'InlineCode' || name === 'CodeMark' || name === 'CodeInfo'
      ) {
        inCode = true
        return false
      }
    },
  })
  return inCode
}

function splitTableRow(line = '') {
  let text = String(line || '').trim()
  if (text.startsWith('|')) text = text.slice(1)
  if (text.endsWith('|')) text = text.slice(0, -1)

  const cells = []
  let current = ''
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]
    if (char === '\\' && next === '|') {
      current += '|'
      i += 1
      continue
    }
    if (char === '|') {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

function isDelimiterCell(cell = '') {
  return /^:?-{3,}:?$/.test(String(cell || '').trim())
}

function isTableLine(text = '') {
  const trimmed = String(text || '').trim()
  if (!trimmed || !trimmed.includes('|')) return false
  return splitTableRow(trimmed).length >= 2
}

function parseAlignment(cell = '') {
  const value = String(cell || '').trim()
  const left = value.startsWith(':')
  const right = value.endsWith(':')
  if (left && right) return 'center'
  if (left) return 'left'
  if (right) return 'right'
  return 'none'
}

function formatDelimiterCell(alignment, width) {
  const innerWidth = Math.max(3, width)
  if (alignment === 'center') return `:${'-'.repeat(Math.max(1, innerWidth - 2))}:`
  if (alignment === 'left') return `:${'-'.repeat(Math.max(2, innerWidth - 1))}`
  if (alignment === 'right') return `${'-'.repeat(Math.max(2, innerWidth - 1))}:`
  return '-'.repeat(innerWidth)
}

function normalizeRows(rows = [], width = 0) {
  return rows.map((row) => {
    const next = row.slice(0, width)
    while (next.length < width) {
      next.push('')
    }
    return next
  })
}

function extractCurrentTableBlock(state, pos) {
  const line = state.doc.lineAt(pos)
  if (!isTableLine(line.text)) return null
  if (isInCodeContext(state, line.from, line.to)) return null

  let startNumber = line.number
  let endNumber = line.number

  while (startNumber > 1) {
    const prev = state.doc.line(startNumber - 1)
    if (!isTableLine(prev.text) || isInCodeContext(state, prev.from, prev.to)) break
    startNumber -= 1
  }

  while (endNumber < state.doc.lines) {
    const next = state.doc.line(endNumber + 1)
    if (!isTableLine(next.text) || isInCodeContext(state, next.from, next.to)) break
    endNumber += 1
  }

  const lines = []
  for (let number = startNumber; number <= endNumber; number += 1) {
    lines.push(state.doc.line(number))
  }

  if (lines.length < 2) return null

  const headerCells = splitTableRow(lines[0].text)
  const delimiterCells = splitTableRow(lines[1].text)
  if (!delimiterCells.every(isDelimiterCell)) return null

  return {
    from: lines[0].from,
    to: lines[lines.length - 1].to,
    lineIndex: line.number - startNumber,
    column: pos - line.from,
    lineCount: lines.length,
    headerCells,
    delimiterCells,
    bodyRows: lines.slice(2).map(item => splitTableRow(item.text)),
  }
}

export function hasMarkdownTableAtCursor(state, pos = null) {
  const cursor = pos ?? state.selection.main.head
  return !!extractCurrentTableBlock(state, cursor)
}

export function insertMarkdownTable(view) {
  const { state } = view
  const { from, to } = state.selection.main
  const template = [
    '| Column 1 | Column 2 |',
    '| --- | --- |',
    '| Value 1 | Value 2 |',
  ].join('\n')

  view.dispatch({
    changes: { from, to, insert: template },
    selection: { anchor: from + 2, head: from + 10 },
    scrollIntoView: true,
  })
  return true
}

export function formatCurrentMarkdownTable(view) {
  const { state } = view
  const block = extractCurrentTableBlock(state, state.selection.main.head)
  if (!block) return false

  const width = Math.max(
    block.headerCells.length,
    block.delimiterCells.length,
    ...block.bodyRows.map(row => row.length),
  )

  const header = normalizeRows([block.headerCells], width)[0]
  const bodyRows = normalizeRows(block.bodyRows, width)
  const alignments = normalizeRows([block.delimiterCells], width)[0].map(parseAlignment)
  const columnWidths = new Array(width).fill(3)

  for (let i = 0; i < width; i += 1) {
    columnWidths[i] = Math.max(
      3,
      header[i]?.length || 0,
      ...bodyRows.map(row => row[i]?.length || 0),
    )
  }

  const formatRow = (cells) => `| ${cells.map((cell, index) => (cell || '').padEnd(columnWidths[index])).join(' | ')} |`
  const delimiter = `| ${alignments.map((alignment, index) => formatDelimiterCell(alignment, columnWidths[index])).join(' | ')} |`
  const nextLines = [
    formatRow(header),
    delimiter,
    ...bodyRows.map(formatRow),
  ]
  const nextText = nextLines.join('\n')
  const prefixLength = nextLines.slice(0, block.lineIndex).reduce((sum, line) => sum + line.length + 1, 0)
  const targetLine = nextLines[block.lineIndex] || nextLines[nextLines.length - 1] || ''
  const targetColumn = Math.min(block.column, targetLine.length)

  view.dispatch({
    changes: { from: block.from, to: block.to, insert: nextText },
    selection: { anchor: block.from + prefixLength + targetColumn },
    scrollIntoView: true,
  })
  return true
}
