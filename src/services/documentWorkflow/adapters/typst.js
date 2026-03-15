import { isTypst } from '../../../utils/fileTypes.js'
import { ensureTypstCompileReady } from '../../environmentPreflight.js'

function formatCompileDuration(state = {}, t = (value) => value) {
  if (state?.status === 'compiling') return t('Compiling...')
  if (state?.status !== 'success') return ''
  const ms = state?.durationMs
  if (!ms) return t('Compiled')
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function buildTypstWorkflowProblems(sourcePath, state = {}) {
  const errors = Array.isArray(state?.errors) ? state.errors : []
  const warnings = Array.isArray(state?.warnings) ? state.warnings : []

  return [
    ...errors.map((problem, index) => ({
      id: `typst:error:${sourcePath}:${index}`,
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
      id: `typst:warning:${sourcePath}:${index}`,
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

export function buildTypstWorkflowUiState(state = {}, options = {}) {
  const problems = buildTypstWorkflowProblems('', state)
  const errorCount = problems.filter(problem => problem.severity === 'error').length
  const warningCount = problems.filter(problem => problem.severity === 'warning').length

  let phase = 'idle'
  if (state?.status === 'compiling') phase = 'compiling'
  else if (state?.status === 'error') phase = 'error'
  else if (options.previewAvailable || state?.status === 'success') phase = 'ready'

  return {
    kind: 'typst',
    previewKind: 'pdf',
    phase,
    errorCount,
    warningCount,
    canShowProblems: errorCount > 0 || warningCount > 0,
    canRevealPreview: !!options.previewAvailable,
    forwardSync: 'reveal-only',
    backwardSync: false,
    primaryAction: 'compile',
  }
}

const typstPreviewAdapter = {
  defaultKind: 'pdf',
  supportedKinds: ['pdf'],

  createPath(sourcePath, previewKind) {
    if (!sourcePath || previewKind !== 'pdf') return null
    return sourcePath.replace(/\.typ$/i, '.pdf')
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

const typstCitationSyntax = {
  supportsInsertion(filePath) {
    return isTypst(filePath)
  },

  buildText(_filePath, keys) {
    const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean)
    return list.map(key => `@${key}`).join(' ')
  },
}

const typstCompileAdapter = {
  id: 'typst',

  stateForFile(filePath, context) {
    return context.typstStore?.stateForFile(filePath) || null
  },

  async ensureReady(_filePath) {
    return ensureTypstCompileReady()
  },

  async compile(filePath, context, options = {}) {
    if (!context.typstStore) return null
    if (!(await this.ensureReady(filePath, context, options))) return null
    await context.typstStore.compile(filePath)
    return this.stateForFile(filePath, context)
  },

  getDiagnostics(filePath, context) {
    return buildTypstWorkflowProblems(filePath, this.stateForFile(filePath, context) || {})
  },

  getArtifactPath(filePath, context) {
    return this.stateForFile(filePath, context)?.pdfPath || typstPreviewAdapter.createPath(filePath, 'pdf')
  },

  getStatusText(filePath, context) {
    return formatCompileDuration(this.stateForFile(filePath, context) || {}, context.t)
  },

  openLog(filePath, context) {
    context.typstStore?.openCompileLog(filePath)
  },
}

export const typstDocumentAdapter = {
  kind: 'typst',

  matchesFile(filePath) {
    return isTypst(filePath)
  },

  supportsWorkflowSource(filePath) {
    return isTypst(filePath)
  },

  preview: typstPreviewAdapter,
  citationSyntax: typstCitationSyntax,
  compile: typstCompileAdapter,

  getProblems(filePath, context = {}) {
    return typstCompileAdapter.getDiagnostics(filePath, context)
  },

  getUiState(filePath, context = {}) {
    return buildTypstWorkflowUiState(
      typstCompileAdapter.stateForFile(filePath, context) || {},
      { previewAvailable: !!context.previewAvailable },
    )
  },
}
