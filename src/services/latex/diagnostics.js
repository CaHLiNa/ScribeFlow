import { normalizeProblems } from '../documentIntelligence/diagnostics.js'
import { getCachedLatexProjectGraph, resolveLatexProjectContext } from './projectGraph.js'

function buildLineOffsets(text = '') {
  const offsets = [0]
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') offsets.push(index + 1)
  }
  return offsets
}

function offsetToLine(lineOffsets = [], offset = 0) {
  let low = 0
  let high = lineOffsets.length - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (lineOffsets[mid] <= offset) low = mid + 1
    else high = mid - 1
  }
  return Math.max(1, high + 1)
}

function deriveProjectWarnings(project = null) {
  if (!project) return { unresolvedRefs: [], unresolvedCitations: [] }
  if (Array.isArray(project.unresolvedRefs) || Array.isArray(project.unresolvedCitations)) {
    return {
      unresolvedRefs: Array.isArray(project.unresolvedRefs) ? project.unresolvedRefs : [],
      unresolvedCitations: Array.isArray(project.unresolvedCitations) ? project.unresolvedCitations : [],
    }
  }

  return { unresolvedRefs: [], unresolvedCitations: [] }
}

function buildProjectWarnings(sourcePath, project = null) {
  if (!project) return []
  const { unresolvedRefs, unresolvedCitations } = deriveProjectWarnings(project)

  const refWarnings = unresolvedRefs.map((entry) => ({
    id: `latex:ref:${entry.filePath}:${entry.key}:${entry.line}`,
    sourcePath: entry.filePath || sourcePath,
    line: entry.line ?? null,
    column: null,
    severity: 'warning',
    origin: 'project',
    actionable: true,
    message: `Unknown label: ${entry.key}`,
    raw: entry.key,
  }))

  const citationWarnings = unresolvedCitations.map((entry) => ({
    id: `latex:cite:${entry.filePath}:${entry.key}:${entry.line}`,
    sourcePath: entry.filePath || sourcePath,
    line: entry.line ?? null,
    column: null,
    severity: 'warning',
    origin: 'project',
    actionable: true,
    message: `Unknown citation key: ${entry.key}`,
    raw: entry.key,
  }))

  return [...refWarnings, ...citationWarnings]
}

export function buildLatexProjectProblemsSync(sourcePath) {
  const project = getCachedLatexProjectGraph(sourcePath)
  return normalizeProblems(buildProjectWarnings(sourcePath, project))
}

export async function buildLatexProjectProblems(sourcePath, options = {}) {
  const project = await resolveLatexProjectContext(sourcePath, options)
  return normalizeProblems(buildProjectWarnings(sourcePath, project))
}

export function buildLatexLintProblems(sourcePath, diagnostics = []) {
  return normalizeProblems((Array.isArray(diagnostics) ? diagnostics : []).map((problem, index) => ({
    id: `latex:lint:${problem.file || sourcePath}:${problem.line || 0}:${index}`,
    sourcePath: problem.file || sourcePath,
    line: problem.line ?? null,
    column: problem.column ?? null,
    severity: problem.severity === 'error' ? 'error' : 'warning',
    origin: 'lint',
    actionable: true,
    message: problem.message || '',
    raw: problem.raw || problem.message || '',
  })))
}
