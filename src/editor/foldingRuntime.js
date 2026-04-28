import { foldService } from '@codemirror/language'

const INDENT_FOLD_EXTS = new Set(['m', 'py', 'pyw'])
const LATEX_FOLD_EXTS = new Set(['tex', 'latex', 'cls', 'sty'])
const LATEX_SECTION_COMMANDS = [
  'part',
  'chapter',
  'section',
  'subsection',
  'subsubsection',
  'paragraph',
  'subparagraph',
]
const LATEX_SECTION_RE = /^\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\b/
const LATEX_ENV_RE = /\\(begin){(.*?)}|\\(begingroup)[%\s\\]|\\(end){(.*?)}|\\(endgroup)[%\s\\]|^%\s*#?([rR]egion)|^%\s*#?([eE]ndregion)/gm

function extname(path = '') {
  const value = String(path || '')
  const dot = value.lastIndexOf('.')
  return dot >= 0 ? value.slice(dot + 1).toLowerCase() : ''
}

function indentationWidth(lineText = '') {
  const match = String(lineText).match(/^[\t ]*/)
  return match ? match[0].length : 0
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

function buildLatexSectionRegex() {
  return LATEX_SECTION_COMMANDS.map((section) =>
    new RegExp(String.raw`\\(?:${section})(?:\*)?(?:\[[^\[\]\{\}]*\])?{(.*)}`, 'm')
  )
}

function collectLatexSectionRanges(state) {
  const sectionRegex = buildLatexSectionRegex()
  const startingIndices = sectionRegex.map(() => -1)
  const sections = []
  let documentClassLine = -1
  let lastNonemptyLineIndex = -1

  for (let index = 1; index <= state.doc.lines; index += 1) {
    const line = state.doc.line(index).text

    for (let regIndex = 0; regIndex < sectionRegex.length; regIndex += 1) {
      const regex = sectionRegex[regIndex]
      if (!regex.exec(line)) continue

      const originalIndex = startingIndices[regIndex]
      if (originalIndex === -1) {
        startingIndices[regIndex] = index
        continue
      }

      let level = regIndex
      while (level < sectionRegex.length) {
        sections.push({
          from: startingIndices[level],
          to: lastNonemptyLineIndex,
        })
        startingIndices[level] = level === regIndex ? index : -1
        level += 1
      }
    }

    if (/\\documentclass/.test(line)) {
      documentClassLine = index
    }
    if (/\\begin{document}/.test(line) && documentClassLine > -1) {
      sections.push({
        from: documentClassLine,
        to: lastNonemptyLineIndex,
      })
    }
    if (/\\end{document}/.test(line) || index === state.doc.lines) {
      for (let level = 0; level < startingIndices.length; level += 1) {
        if (startingIndices[level] === -1) continue
        sections.push({
          from: startingIndices[level],
          to: lastNonemptyLineIndex,
        })
      }
    }
    if (!/^\s*$/.test(line)) {
      lastNonemptyLineIndex = index
    }
  }

  return sections.filter((range) => range.from > 0 && range.to > range.from)
}

function collectLatexEnvironmentRanges(state) {
  const ranges = []
  const opStack = []
  const text = state.doc.toString()
  LATEX_ENV_RE.lastIndex = 0

  while (true) {
    const match = LATEX_ENV_RE.exec(text)
    if (!match) return ranges

    let keyword = ''
    if (match[1]) {
      keyword = match[2]
    } else if (match[4]) {
      keyword = match[5]
    } else if (match[3] || match[6]) {
      keyword = 'group'
    } else if (match[7] || match[8]) {
      keyword = 'region'
    }

    const item = { keyword, index: match.index }
    const lastItem = opStack[opStack.length - 1]

    if ((match[4] || match[6] || match[8]) && lastItem && lastItem.keyword === item.keyword) {
      opStack.pop()
      const fromLine = state.doc.lineAt(lastItem.index).number
      const toLine = state.doc.lineAt(item.index).number - 1
      if (toLine > fromLine) {
        ranges.push({ from: fromLine, to: toLine })
      }
    } else {
      opStack.push(item)
    }
  }
}

function findLatexFold(state, lineStart) {
  const lineNumber = state.doc.lineAt(lineStart).number
  const allRanges = [
    ...collectLatexSectionRanges(state),
    ...collectLatexEnvironmentRanges(state),
  ]

  const matched = allRanges.find((range) => range.from === lineNumber)
  if (!matched) return null

  return {
    from: state.doc.line(matched.from).to,
    to: state.doc.line(matched.to).to,
  }
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
