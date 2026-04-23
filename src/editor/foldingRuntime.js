import { foldService } from '@codemirror/language'

const INDENT_FOLD_EXTS = new Set(['m', 'py', 'pyw'])
const LATEX_FOLD_EXTS = new Set(['tex', 'latex', 'cls', 'sty'])
const LATEX_SECTION_RE = /^\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\b/

function extname(path = '') {
  const value = String(path || '')
  const dot = value.lastIndexOf('.')
  return dot >= 0 ? value.slice(dot + 1).toLowerCase() : ''
}

function indentationWidth(lineText = '') {
  const match = String(lineText).match(/^[\t ]*/)
  return match ? match[0].length : 0
}

function countLiteral(haystack = '', needle = '') {
  if (!needle) return 0
  let count = 0
  let fromIndex = 0
  while (fromIndex < haystack.length) {
    const found = haystack.indexOf(needle, fromIndex)
    if (found === -1) break
    count += 1
    fromIndex = found + needle.length
  }
  return count
}

function findIndentedFold(state, lineStart) {
  const startLine = state.doc.lineAt(lineStart)
  if (startLine.number >= state.doc.lines) return null
  if (!startLine.text.trim()) return null

  const baseIndent = indentationWidth(startLine.text)
  let firstBodyLine = null
  let lastBodyLine = null

  for (let number = startLine.number + 1; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number)
    const trimmed = line.text.trim()
    if (!trimmed) continue

    if (indentationWidth(line.text) <= baseIndent) break
    if (!firstBodyLine) firstBodyLine = line
    lastBodyLine = line
  }

  if (!firstBodyLine || !lastBodyLine) return null
  return { from: startLine.to, to: lastBodyLine.to }
}

function findLatexEnvironmentFold(state, startLine, envName) {
  const beginNeedle = `\\begin{${envName}}`
  const endNeedle = `\\end{${envName}}`
  let depth = 0

  for (let number = startLine.number; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number)
    const text = line.text
    depth += countLiteral(text, beginNeedle)
    depth -= countLiteral(text, endNeedle)

    if (number > startLine.number && depth <= 0) {
      return { from: startLine.to, to: line.from }
    }
  }

  return null
}

function findLatexSectionFold(state, startLine) {
  let lastContentLine = null

  for (let number = startLine.number + 1; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number)
    const trimmed = line.text.trim()
    if (LATEX_SECTION_RE.test(trimmed)) break
    if (trimmed) lastContentLine = line
  }

  if (!lastContentLine) return null
  return { from: startLine.to, to: lastContentLine.to }
}

function findLatexFold(state, lineStart) {
  const startLine = state.doc.lineAt(lineStart)
  const text = startLine.text.trim()
  if (!text) return null

  const beginMatch = text.match(/^\\begin\{([^}]+)\}/)
  if (beginMatch?.[1]) {
    return findLatexEnvironmentFold(state, startLine, beginMatch[1])
  }

  if (LATEX_SECTION_RE.test(text)) {
    return findLatexSectionFold(state, startLine)
  }

  return null
}

export function createFoldingExtension(filePath = '') {
  const ext = extname(filePath)
  if (!INDENT_FOLD_EXTS.has(ext) && !LATEX_FOLD_EXTS.has(ext)) return []

  return [
    foldService.of((state, lineStart) => {
      try {
        if (LATEX_FOLD_EXTS.has(ext)) return findLatexFold(state, lineStart)
        if (INDENT_FOLD_EXTS.has(ext)) return findIndentedFold(state, lineStart)
        return null
      } catch (error) {
        console.warn('[folding] fold fallback failed:', error)
        return null
      }
    }),
  ]
}
