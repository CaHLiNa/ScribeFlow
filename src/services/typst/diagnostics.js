import { normalizeProblems } from '../documentIntelligence/diagnostics.js'
import {
  getTinymistDiagnosticsStatus,
  normalizeTinymistDiagnostics,
} from '../tinymist/diagnostics.js'
import { getCachedTypstProjectGraph } from './projectGraph.js'

const PROJECT_LABEL_KEY_RE = /^[A-Za-z][\w-]*:[\w:-]+$/

function normalizeSeverity(value) {
  return value === 'error' ? 'error' : 'warning'
}

export function buildTypstCompileProblems(sourcePath, state = {}) {
  const errors = Array.isArray(state?.errors) ? state.errors : []
  const warnings = Array.isArray(state?.warnings) ? state.warnings : []

  return [
    ...errors.map((problem, index) => ({
      id: `typst:compile:error:${sourcePath}:${index}`,
      sourcePath,
      line: problem.line ?? null,
      column: problem.column ?? null,
      severity: 'error',
      message: problem.message || '',
      origin: 'compile',
      actionable: true,
      raw: problem.raw || problem.message || '',
    })),
    ...warnings.map((problem, index) => ({
      id: `typst:compile:warning:${sourcePath}:${index}`,
      sourcePath,
      line: problem.line ?? null,
      column: problem.column ?? null,
      severity: 'warning',
      message: problem.message || '',
      origin: 'compile',
      actionable: true,
      raw: problem.raw || problem.message || '',
    })),
  ]
}

export function buildTypstTinymistProblems(sourcePath, diagnostics = []) {
  return normalizeTinymistDiagnostics(sourcePath, diagnostics).map((problem, index) => ({
    id: `typst:tinymist:${normalizeSeverity(problem.severity)}:${sourcePath}:${index}`,
    sourcePath,
    line: problem.line ?? null,
    column: problem.column ?? null,
    severity: normalizeSeverity(problem.severity),
    message: problem.message || '',
    origin: 'tinymist',
    actionable: true,
    raw: problem.raw || problem.message || '',
  }))
}

function isTypstProjectLabelKey(key = '') {
  return PROJECT_LABEL_KEY_RE.test(String(key || '').trim())
}

function deriveTypstProjectWarnings(project = null, referencesStore = null) {
  if (!project) return { unresolvedRefs: [], unresolvedCitations: [] }

  const labelKeys = new Set((project.labels || []).map(label => label.key))
  const unresolvedRefs = []
  const unresolvedCitations = []

  for (const reference of project.references || []) {
    const key = String(reference?.key || '').trim()
    if (!key || labelKeys.has(key)) continue

    if (isTypstProjectLabelKey(key)) {
      unresolvedRefs.push(reference)
      continue
    }

    if (!referencesStore?.getByKey?.(key)) {
      unresolvedCitations.push(reference)
    }
  }

  return { unresolvedRefs, unresolvedCitations }
}

function buildProjectWarnings(sourcePath, project = null, referencesStore = null) {
  if (!project) return []
  const { unresolvedRefs, unresolvedCitations } = deriveTypstProjectWarnings(project, referencesStore)

  const refWarnings = unresolvedRefs.map((entry, index) => ({
    id: `typst:project:ref:${entry.filePath || sourcePath}:${entry.key}:${entry.line ?? 0}:${index}`,
    sourcePath: entry.filePath || sourcePath,
    line: entry.line ?? null,
    column: null,
    severity: 'warning',
    origin: 'project',
    actionable: true,
    message: `Unknown project label: ${entry.key}`,
    raw: entry.key,
  }))

  const citationWarnings = unresolvedCitations.map((entry, index) => ({
    id: `typst:project:cite:${entry.filePath || sourcePath}:${entry.key}:${entry.line ?? 0}:${index}`,
    sourcePath: entry.filePath || sourcePath,
    line: entry.line ?? null,
    column: null,
    severity: 'warning',
    origin: 'project',
    actionable: true,
    message: `Unknown reference key: ${entry.key}`,
    raw: entry.key,
  }))

  return [...refWarnings, ...citationWarnings]
}

export function buildTypstProjectProblems(sourcePath, options = {}) {
  const project = options.project || getCachedTypstProjectGraph(sourcePath)
  return normalizeProblems(buildProjectWarnings(sourcePath, project, options.referencesStore))
}

export function buildTypstWorkflowProblems(sourcePath, options = {}) {
  const compileState = options.compileState || {}
  const liveState = options.liveState || {}
  const tinymistBacked = liveState?.tinymistBacked === true
  const projectProblems = Array.isArray(liveState?.projectProblems)
    ? liveState.projectProblems
    : buildTypstProjectProblems(sourcePath, options)
  const baseProblems = tinymistBacked
    ? buildTypstTinymistProblems(sourcePath, liveState.diagnostics || [])
    : buildTypstCompileProblems(sourcePath, compileState)

  return normalizeProblems([
    ...baseProblems,
    ...projectProblems,
  ])
}

function formatCompileDuration(state = {}, t = (value) => value) {
  if (state?.status === 'compiling') return t('Compiling...')
  if (state?.status !== 'success') return ''
  const ms = state?.durationMs
  if (!ms) return t('Ready')
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function buildTypstWorkflowStatusText(options = {}, t = (value) => value) {
  const compileState = options.compileState || {}
  const queueState = options.queueState || {}
  const liveState = options.liveState || {}

  if (queueState?.phase === 'scheduled' || queueState?.phase === 'queued') {
    const pendingCount = Number(queueState?.pendingCount || 0)
    return pendingCount > 0
      ? t('Queued +{count}', { count: pendingCount })
      : t('Queued')
  }

  if (queueState?.phase === 'running' || compileState?.status === 'compiling') {
    return t('Compiling...')
  }

  if (compileState?.status === 'success') {
    return formatCompileDuration(compileState, t)
  }

  if (compileState?.status === 'error') {
    const problems = buildTypstCompileProblems('', compileState)
    const errorCount = problems.filter(problem => problem.severity === 'error').length
    const warningCount = problems.filter(problem => problem.severity === 'warning').length
    if (errorCount > 0) return t('{count} errors', { count: errorCount })
    if (warningCount > 0) return t('{count} warnings', { count: warningCount })
  }

  if (liveState?.tinymistBacked) {
    const problems = buildTypstTinymistProblems('', liveState.diagnostics || [])
    const errorCount = problems.filter(problem => problem.severity === 'error').length
    const warningCount = problems.filter(problem => problem.severity === 'warning').length
    if (errorCount > 0) return t('{count} errors', { count: errorCount })
    if (warningCount > 0) return t('{count} warnings', { count: warningCount })
    return ''
  }

  return ''
}

export function buildTypstWorkflowUiState(options = {}) {
  const sourcePath = options.sourcePath || ''
  const compileState = options.compileState || {}
  const liveState = options.liveState || {}
  const queueState = options.queueState || {}
  const previewAvailable = options.previewAvailable === true
  const tinymistBacked = liveState?.tinymistBacked === true
  const liveDiagnostics = Array.isArray(liveState?.diagnostics) ? liveState.diagnostics : []
  const liveStatus = getTinymistDiagnosticsStatus(liveDiagnostics)
  const problems = buildTypstWorkflowProblems(sourcePath, options)
  const errorCount = problems.filter(problem => problem.severity === 'error').length
  const warningCount = problems.filter(problem => problem.severity === 'warning').length

  let phase = 'idle'
  if (queueState?.phase === 'running' || compileState?.status === 'compiling') phase = 'compiling'
  else if (queueState?.phase === 'scheduled' || queueState?.phase === 'queued') phase = 'queued'
  else if (tinymistBacked && liveStatus === 'error') phase = 'error'
  else if (!tinymistBacked && compileState?.status === 'error') phase = 'error'
  else if (previewAvailable || compileState?.status === 'success') phase = 'ready'

  return {
    kind: 'typst',
    previewKind: 'pdf',
    phase,
    errorCount,
    warningCount,
    canShowProblems: errorCount > 0 || warningCount > 0,
    canRevealPreview: !!previewAvailable,
    forwardSync: 'precise',
    backwardSync: true,
    primaryAction: 'compile',
  }
}
