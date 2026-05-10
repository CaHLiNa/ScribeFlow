import { getCachedLatexProjectGraph, resolveLatexProjectContext } from './projectGraph.js'

function deduplicateProblems(problems) {
  const seen = new Set()
  return problems.filter((p) => {
    const sig = `${p.sourcePath}::${p.line || 0}::${p.severity}::${p.message}`
    if (seen.has(sig)) return false
    seen.add(sig)
    return true
  })
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
  return deduplicateProblems(buildProjectWarnings(sourcePath, project))
}

export async function buildLatexProjectProblems(sourcePath, options = {}) {
  const project = await resolveLatexProjectContext(sourcePath, options)
  return deduplicateProblems(buildProjectWarnings(sourcePath, project))
}

export function buildLatexDocumentReferenceProblemsSync(sourcePath, referencesStore = null) {
  if (!referencesStore || typeof referencesStore.documentReferencesForTex !== 'function') return []

  const project = getCachedLatexProjectGraph(sourcePath)
  const citations = Array.isArray(project?.citations) ? project.citations : []
  if (citations.length === 0) return []

  const referenceScopePath = project?.rootPath || sourcePath
  const selectedKeys = new Set(
    referencesStore
      .documentReferencesForTex(referenceScopePath)
      .flatMap((reference) => [reference.citationKey, reference.id])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )
  const seen = new Set()

  return citations
    .map((citation) => {
      const key = String(citation?.key || '').trim()
      const filePath = citation?.filePath || sourcePath
      const signature = `${filePath}:${key}:${citation?.line || 0}:${citation?.offset || 0}`
      if (!key || selectedKeys.has(key) || seen.has(signature)) return null
      if (typeof referencesStore.getByKey === 'function' && !referencesStore.getByKey(key)) return null
      seen.add(signature)
      return {
        id: `latex:document-reference:${signature}`,
        sourcePath: filePath,
        line: citation?.line ?? null,
        column: null,
        severity: 'warning',
        origin: 'project',
        actionable: true,
        message: `Citation key is not in this document's reference list: ${key}`,
        raw: key,
      }
    })
    .filter(Boolean)
}

export function buildLatexLintProblems(sourcePath, diagnostics = []) {
  const normalized = String(sourcePath || '').trim().replace(/\\/g, '/')
  const problems = (Array.isArray(diagnostics) ? diagnostics : []).map((d, index) => {
    const file = String(d.file || '').trim().replace(/\\/g, '/') || normalized
    const severity = d.severity === 'error' ? 'error' : 'warning'
    return {
      id: `latex:lint:${file}:${d.line || 0}:${index}`,
      sourcePath: file,
      line: d.line ?? null,
      column: d.column ?? null,
      severity,
      origin: 'lint',
      actionable: true,
      message: String(d.message || ''),
      raw: String(d.raw || d.message || ''),
    }
  })
  return deduplicateProblems(problems)
}
