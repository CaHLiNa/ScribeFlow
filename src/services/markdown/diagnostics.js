import { visit } from 'unist-util-visit'
import { normalizeProblems } from '../documentIntelligence/diagnostics.js'
import { parseMarkdownDraft } from './parser.js'

const RAW_HTML_MESSAGE = 'Raw HTML may not migrate cleanly to Typst/LaTeX export.'
const CITE_KEY_RE = /@([a-zA-Z][\w:-]*)/g

function nodePosition(node) {
  return {
    line: Number.isInteger(node?.position?.start?.line) ? node.position.start.line : null,
    column: Number.isInteger(node?.position?.start?.column) ? node.position.start.column : null,
  }
}

function createProblem(sourcePath, node, problem = {}) {
  const position = nodePosition(node)
  return {
    sourcePath,
    line: position.line,
    column: position.column,
    severity: problem.severity || 'warning',
    message: problem.message || '',
    origin: 'draft',
    actionable: true,
    raw: problem.raw || problem.message || '',
  }
}

function collectHeadingDiagnostics(tree, sourcePath) {
  const problems = []
  let previousLevel = 0

  visit(tree, 'heading', (node) => {
    const level = Math.max(1, Number(node?.depth) || 1)
    if (previousLevel > 0 && level > previousLevel + 1) {
      problems.push(createProblem(sourcePath, node, {
        message: `Heading level jumps from ${previousLevel} to ${level}.`,
      }))
    }
    previousLevel = level
  })

  return problems
}

function collectHtmlDiagnostics(tree, sourcePath) {
  const problems = []
  visit(tree, 'html', (node) => {
    const raw = String(node?.value || '').trim()
    if (!raw) return
    problems.push(createProblem(sourcePath, node, {
      message: RAW_HTML_MESSAGE,
      raw,
    }))
  })
  return problems
}

function collectFootnoteDiagnostics(tree, sourcePath) {
  const problems = []
  const definitions = new Map()
  const references = []

  visit(tree, (node) => {
    if (node?.type === 'footnoteDefinition') {
      const id = String(node.identifier || '').trim()
      if (!id) return
      if (definitions.has(id)) {
        problems.push(createProblem(sourcePath, node, {
          message: `Duplicate footnote definition: [^${id}].`,
          severity: 'warning',
        }))
        return
      }
      definitions.set(id, node)
      return
    }

    if (node?.type === 'footnoteReference') {
      const id = String(node.identifier || '').trim()
      if (!id) return
      references.push({ id, node })
    }
  })

  for (const reference of references) {
    if (definitions.has(reference.id)) continue
    problems.push(createProblem(sourcePath, reference.node, {
      message: `Footnote [^${reference.id}] has no matching definition.`,
      severity: 'error',
    }))
  }

  return problems
}

function isBareCitationBoundary(prevChar = '') {
  return !prevChar || /\s|[({\u3000]/.test(prevChar)
}

function advancePosition(source = '', line = 1, column = 1) {
  let nextLine = line
  let nextColumn = column
  for (const char of String(source || '')) {
    if (char === '\n') {
      nextLine += 1
      nextColumn = 1
    } else {
      nextColumn += 1
    }
  }
  return { line: nextLine, column: nextColumn }
}

function scanCitationEntries(content = '') {
  const source = String(content || '')
  const entries = []
  let inFence = false
  let line = 1
  let column = 1
  let i = 0

  while (i < source.length) {
    const char = source[i]

    if ((column === 1 || source[i - 1] === '\n') && (source.startsWith('```', i) || source.startsWith('~~~', i))) {
      inFence = !inFence
    }

    if (!inFence && char === '`') {
      let ticks = 1
      while (source[i + ticks] === '`') ticks += 1
      for (let step = 0; step < ticks; step += 1) {
        i += 1
        column += 1
      }
      while (i < source.length) {
        if (source.startsWith('`'.repeat(ticks), i)) {
          for (let step = 0; step < ticks; step += 1) {
            i += 1
            column += 1
          }
          break
        }
        if (source[i] === '\n') {
          line += 1
          column = 1
          i += 1
        } else {
          i += 1
          column += 1
        }
      }
      continue
    }

    if (!inFence && char === '[') {
      const close = source.indexOf(']', i + 1)
      if (close !== -1) {
        const inner = source.slice(i + 1, close)
        CITE_KEY_RE.lastIndex = 0
        let keyMatch
        while ((keyMatch = CITE_KEY_RE.exec(inner)) !== null) {
          entries.push({
            key: keyMatch[1],
            bare: false,
            line,
            column: column + 1 + keyMatch.index,
            raw: keyMatch[0],
          })
        }
        const consumed = source.slice(i, close + 1)
        const next = advancePosition(consumed, line, column)
        i = close + 1
        line = next.line
        column = next.column
        continue
      }
    }

    if (!inFence && char === '@' && /[A-Za-z]/.test(source[i + 1] || '')) {
      const prevChar = source[i - 1] || ''
      if (isBareCitationBoundary(prevChar)) {
        let j = i + 1
        while (/[\w:-]/.test(source[j] || '')) j += 1
        const key = source.slice(i + 1, j)
        if (key) {
          entries.push({
            key,
            bare: true,
            line,
            column,
            raw: `@${key}`,
          })
          const consumed = j - i
          i = j
          column += consumed
          continue
        }
      }
    }

    if (char === '\n') {
      line += 1
      column = 1
      i += 1
      continue
    }

    i += 1
    column += 1
  }

  return entries
}

function collectCitationDiagnostics(sourcePath, content = '', options = {}) {
  const entries = scanCitationEntries(content)
  const problems = []
  const referenceKeys = new Set((options.referenceKeys || []).filter(Boolean))

  for (const entry of entries) {
    if (entry.bare) {
      problems.push({
        sourcePath,
        line: entry.line,
        column: entry.column,
        severity: 'warning',
        message: `Prefer [@${entry.key}] in Markdown drafts instead of bare @${entry.key}.`,
        origin: 'draft',
        actionable: true,
        raw: entry.raw,
      })
    }

    if (entry.key && !referenceKeys.has(entry.key)) {
      problems.push({
        sourcePath,
        line: entry.line,
        column: entry.column,
        severity: 'warning',
        message: `Unknown citation key: ${entry.key}.`,
        origin: 'draft',
        actionable: true,
        raw: entry.raw,
      })
    }
  }

  return problems
}

export function buildMarkdownDraftProblems(sourcePath, content = '', options = {}) {
  const tree = parseMarkdownDraft(content)
  const problems = [
    ...collectHeadingDiagnostics(tree, sourcePath),
    ...collectHtmlDiagnostics(tree, sourcePath),
    ...collectFootnoteDiagnostics(tree, sourcePath),
    ...collectCitationDiagnostics(sourcePath, content, options),
  ]

  return normalizeProblems(problems, {
    sourcePath,
    origin: 'draft',
    severity: 'warning',
  })
}
