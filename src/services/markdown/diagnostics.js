import { normalizeProblems } from '../documentIntelligence/diagnostics.js'

const RAW_HTML_MESSAGE = 'Raw HTML may not migrate cleanly to LaTeX export.'
const FENCE_RE = /^\s*(```|~~~)/
const HEADING_RE = /^(#{1,6})\s+\S/
const HTML_RE = /<([A-Za-z][\w:-]*)(?:\s|>|\/>)/
const FOOTNOTE_DEFINITION_RE = /^\s*\[\^([^\]\s]+)\]:/
const FOOTNOTE_REFERENCE_RE = /\[\^([^\]\s]+)\]/g

function createProblem(sourcePath, line, column, problem = {}) {
  return {
    sourcePath,
    line,
    column,
    severity: problem.severity || 'warning',
    message: problem.message || '',
    origin: 'draft',
    actionable: true,
    raw: problem.raw || problem.message || '',
  }
}

function collectLightweightDiagnostics(sourcePath, content = '') {
  const problems = []
  const lines = String(content || '').split(/\r?\n/)
  let previousLevel = 0
  let inFence = false
  const footnoteDefinitions = new Set()
  const seenFootnoteDefinitions = new Set()
  const footnoteReferences = []

  lines.forEach((line, index) => {
    const lineNumber = index + 1
    if (FENCE_RE.test(line)) {
      inFence = !inFence
      return
    }
    if (inFence) return

    const heading = line.match(HEADING_RE)
    if (heading) {
      const level = heading[1].length
      if (previousLevel > 0 && level > previousLevel + 1) {
        problems.push(createProblem(sourcePath, lineNumber, 1, {
          message: `Heading level jumps from ${previousLevel} to ${level}.`,
        }))
      }
      previousLevel = level
    }

    const html = line.match(HTML_RE)
    if (html) {
      problems.push(createProblem(sourcePath, lineNumber, html.index + 1, {
        message: RAW_HTML_MESSAGE,
        raw: line.trim(),
      }))
    }

    const definition = line.match(FOOTNOTE_DEFINITION_RE)
    if (definition) {
      const id = definition[1].trim()
      footnoteDefinitions.add(id)
      if (seenFootnoteDefinitions.has(id)) {
        problems.push(createProblem(sourcePath, lineNumber, definition.index + 1, {
          message: `Duplicate footnote definition: [^${id}].`,
          severity: 'warning',
        }))
      }
      seenFootnoteDefinitions.add(id)
    }

    FOOTNOTE_REFERENCE_RE.lastIndex = 0
    let match
    while ((match = FOOTNOTE_REFERENCE_RE.exec(line)) !== null) {
      const id = String(match[1] || '').trim()
      if (!id) return
      const isDefinition = Boolean(definition && definition[1].trim() === id && match.index === definition.index)
      if (!isDefinition) {
        footnoteReferences.push({ id, line: lineNumber, column: match.index + 1 })
      }
    }
  })

  for (const reference of footnoteReferences) {
    if (footnoteDefinitions.has(reference.id)) continue
    problems.push(createProblem(sourcePath, reference.line, reference.column, {
      message: `Footnote [^${reference.id}] has no matching definition.`,
      severity: 'error',
    }))
  }

  return problems
}

export function buildMarkdownDraftProblems(sourcePath, content = '', options = {}) {
  void options
  const problems = collectLightweightDiagnostics(sourcePath, content)

  return normalizeProblems(problems, {
    sourcePath,
    origin: 'draft',
    severity: 'warning',
  })
}
