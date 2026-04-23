import { foldService } from '@codemirror/language'

const INDENT_FOLD_EXTS = new Set([
  'm',
  'py',
  'pyw',
])

const LATEX_FOLD_EXTS = new Set([
  'tex',
  'latex',
  'cls',
  'sty',
])

function fileExt(path = '') {
  const value = String(path || '')
  const dot = value.lastIndexOf('.')
  return dot > -1 ? value.slice(dot + 1).toLowerCase() : ''
}

function lineIndent(line) {
  const match = line.text.match(/^[\t ]*/)
  return match ? match[0].length : 0
}

function findIndentedBlock(state, lineStart) {
  const startLine = state.doc.lineAt(lineStart)
  if (startLine.number >= state.doc.lines) return null

  const baseIndent = lineIndent(startLine)
  let firstBodyLine = null
  let lastBodyLine = null

  for (let number = startLine.number + 1; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number)
    const trimmed = line.text.trim()
    if (!trimmed) continue

    const indent = lineIndent(line)
    if (indent <= baseIndent) {
      break
    }

    if (firstBodyLine == null) firstBodyLine = line
    lastBodyLine = line
  }

  if (!firstBodyLine || !lastBodyLine) return null
  return {
    from: startLine.to,
    to: lastBodyLine.to,
  }
}

function findLatexFold(state, lineStart) {
  const startLine = state.doc.lineAt(lineStart)
  const text = startLine.text.trim()
  if (!text) return null

  const beginMatch = text.match(/^\\begin\{([^}]+)\}/)
  if (beginMatch) {
    const envName = beginMatch[1]
    let depth = 0
    for (let number = startLine.number; number <= state.doc.lines; number += 1) {
      const line = state.doc.line(number)
      const lineText = line.text
      const beginCount = [...lineText.matchAll(new RegExp(String.raw`\\begin\{${envName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\}`, 'g'))].length
      const endCount = [...lineText.matchAll(new RegExp(String.raw`\\end\{${envName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\}`, 'g'))].length
      depth += beginCount
      depth -= endCount
      if (number > startLine.number && depth <= 0) {
        return {
          from: startLine.to,
          to: line.from,
        }
      }
    }
  }

  const sectionLike = text.match(/^\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\b/)
  if (sectionLike) {
    let lastContentLine = startLine
    for (let number = startLine.number + 1; number <= state.doc.lines; number += 1) {
      const line = state.doc.line(number)
      const trimmed = line.text.trim()
      if (/^\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\b/.test(trimmed)) {
        break
      }
      if (trimmed) lastContentLine = line
    }
    if (lastContentLine.number > startLine.number) {
      return {
        from: startLine.to,
        to: lastContentLine.to,
      }
    }
  }

  return null
}

export function createFoldingExtension(filePath = '') {
  const ext = fileExt(filePath)
  if (!INDENT_FOLD_EXTS.has(ext) && !LATEX_FOLD_EXTS.has(ext)) return []

  return foldService.of((state, lineStart, _lineEnd) => {
    if (LATEX_FOLD_EXTS.has(ext)) {
      return findLatexFold(state, lineStart)
    }
    if (INDENT_FOLD_EXTS.has(ext)) {
      return findIndentedBlock(state, lineStart)
    }
    return null
  })
}
