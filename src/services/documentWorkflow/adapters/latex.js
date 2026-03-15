import { isLatex } from '../../../utils/fileTypes.js'
import { ensureLatexCompileReady } from '../../environmentPreflight.js'

function formatCompileDuration(state = {}, t = (value) => value) {
  if (state?.status === 'compiling') return t('Compiling...')
  if (state?.status !== 'success') return ''
  const ms = state?.durationMs
  if (!ms) return t('Compiled')
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function buildLatexWorkflowProblems(sourcePath, state = {}) {
  const errors = Array.isArray(state?.errors) ? state.errors : []
  const warnings = Array.isArray(state?.warnings) ? state.warnings : []

  return [
    ...errors.map((problem, index) => ({
      id: `latex:error:${sourcePath}:${index}`,
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
      id: `latex:warning:${sourcePath}:${index}`,
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

export function buildLatexWorkflowUiState(state = {}, options = {}) {
  const problems = buildLatexWorkflowProblems('', state)
  const errorCount = problems.filter(problem => problem.severity === 'error').length
  const warningCount = problems.filter(problem => problem.severity === 'warning').length

  let phase = 'idle'
  if (state?.status === 'compiling') phase = 'compiling'
  else if (state?.status === 'error') phase = 'error'
  else if (options.previewAvailable || state?.status === 'success') phase = 'ready'

  return {
    kind: 'latex',
    previewKind: 'pdf',
    phase,
    errorCount,
    warningCount,
    canShowProblems: errorCount > 0 || warningCount > 0,
    canRevealPreview: !!options.previewAvailable,
    forwardSync: 'precise',
    backwardSync: true,
    primaryAction: 'compile',
  }
}

const latexPreviewAdapter = {
  defaultKind: 'pdf',
  supportedKinds: ['pdf'],

  createPath(sourcePath, previewKind) {
    if (!sourcePath || previewKind !== 'pdf') return null
    return sourcePath.replace(/\.(tex|latex)$/i, '.pdf')
  },

  inferKind(sourcePath, previewPath) {
    return previewPath === this.createPath(sourcePath, 'pdf') ? 'pdf' : null
  },

  ensure(sourcePath, context, options = {}) {
    return context.workflowStore?.ensurePreviewForSource(sourcePath, {
      ...options,
      previewKind: 'pdf',
    }) || null
  },

  reveal(sourcePath, context, options = {}) {
    return context.workflowStore?.revealPreview(sourcePath, {
      ...options,
      previewKind: 'pdf',
    }) || null
  },
}

const latexCitationSyntax = {
  supportsInsertion(filePath) {
    return isLatex(filePath)
  },

  buildText(_filePath, keys, options = {}) {
    const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean)
    if (list.length === 0) return ''
    const command = options.latexCommand || 'cite'
    return `\\${command}{${list.join(', ')}}`
  },
}

const latexCompileAdapter = {
  id: 'latex',

  stateForFile(filePath, context) {
    return context.latexStore?.stateForFile(filePath) || null
  },

  async ensureReady(_filePath) {
    return ensureLatexCompileReady()
  },

  async compile(filePath, context, options = {}) {
    if (!context.latexStore) return null
    if (!(await this.ensureReady(filePath, context, options))) return null

    await context.latexStore.compile(filePath)
    return this.stateForFile(filePath, context)
  },

  getDiagnostics(filePath, context) {
    return buildLatexWorkflowProblems(filePath, this.stateForFile(filePath, context) || {})
  },

  getArtifactPath(filePath, context) {
    return this.stateForFile(filePath, context)?.pdfPath || latexPreviewAdapter.createPath(filePath, 'pdf')
  },

  getStatusText(filePath, context) {
    return formatCompileDuration(this.stateForFile(filePath, context) || {}, context.t)
  },

  openLog(filePath, context) {
    context.latexStore?.openCompileLog(filePath)
  },
}

export const latexDocumentAdapter = {
  kind: 'latex',

  matchesFile(filePath) {
    return isLatex(filePath)
  },

  supportsWorkflowSource(filePath) {
    return isLatex(filePath)
  },

  preview: latexPreviewAdapter,
  citationSyntax: latexCitationSyntax,
  compile: latexCompileAdapter,

  getProblems(filePath, context = {}) {
    return latexCompileAdapter.getDiagnostics(filePath, context)
  },

  getUiState(filePath, context = {}) {
    return buildLatexWorkflowUiState(
      latexCompileAdapter.stateForFile(filePath, context) || {},
      { previewAvailable: !!context.previewAvailable },
    )
  },
}
