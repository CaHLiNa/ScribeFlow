import { visit } from 'unist-util-visit'
import { normalizeProblems } from '../documentIntelligence/diagnostics.js'
import { parseMarkdownDraft } from './parser.js'

const RAW_HTML_MESSAGE = 'Raw HTML may not migrate cleanly to LaTeX export.'
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

export function buildMarkdownDraftProblems(sourcePath, content = '', options = {}) {
  void options
  const tree = parseMarkdownDraft(content)
  const problems = [
    ...collectHeadingDiagnostics(tree, sourcePath),
    ...collectHtmlDiagnostics(tree, sourcePath),
    ...collectFootnoteDiagnostics(tree, sourcePath),
  ]

  return normalizeProblems(problems, {
    sourcePath,
    origin: 'draft',
    severity: 'warning',
  })
}
