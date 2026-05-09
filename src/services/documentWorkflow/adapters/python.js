import { basenamePath } from '../../../utils/path.js'

function isPythonFile(filePath = '') {
  return filePath.toLowerCase().endsWith('.py')
}

function formatPythonCompileDuration(state = {}, context = {}) {
  const t = context.t || ((value) => value)
  if (state?.status === 'running') return t('Running...')
  if (state?.status === 'error') return t('Run failed')

  const durationMs = Number(state?.durationMs || 0)
  const durationText = durationMs > 0
    ? durationMs < 1000
      ? `${durationMs}ms`
      : `${(durationMs / 1000).toFixed(1)}s`
    : t('Ready')

  const version = String(state?.interpreterVersion || '').trim()
  if (version) {
    return `${durationText} · Python ${version}`
  }
  const interpreterPath = String(state?.interpreterPath || '').trim()
  return interpreterPath ? `${durationText} · ${basenamePath(interpreterPath)}` : durationText
}

const pythonCompileAdapter = {
  id: 'python',

  stateForFile(filePath, context) {
    return context.pythonStore?.stateForFile?.(filePath) || null
  },

  async compile(filePath, context) {
    return context.pythonStore?.compile?.(filePath) || null
  },

  getDiagnostics(filePath, context) {
    const request = {
      sourcePath: filePath,
      state: this.stateForFile(filePath, context) || {},
    }
    const problems = context.workflowStore?.ensureResolvedPythonProblems?.(filePath, request)
    return Array.isArray(problems) ? problems : []
  },

  getArtifactPath() {
    return ''
  },

  getStatusText(filePath, context) {
    return formatPythonCompileDuration(this.stateForFile(filePath, context) || {}, context)
  },
}

export const pythonDocumentAdapter = {
  kind: 'python',

  matchesFile(filePath) {
    return isPythonFile(filePath)
  },

  supportsWorkflowSource(filePath) {
    return isPythonFile(filePath)
  },

  preview: {
    defaultKind: 'terminal',
    supportedKinds: ['terminal'],
    createPath() {
      return null
    },
    inferKind() {
      return null
    },
  },

  compile: pythonCompileAdapter,

  getProblems(filePath, context = {}) {
    return pythonCompileAdapter.getDiagnostics(filePath, context)
  },

  getUiState(filePath, context = {}) {
    const problems = this.getProblems(filePath, context)
    const errorCount = problems.filter((problem) => problem.severity === 'error').length
    const warningCount = problems.filter((problem) => problem.severity === 'warning').length
    const state = pythonCompileAdapter.stateForFile(filePath, context) || {}

    let phase = 'idle'
    if (state?.status === 'running') phase = 'running'
    else if (state?.status === 'error') phase = 'error'
    else if (state?.status === 'success') phase = 'ready'

    return {
      kind: 'python',
      previewKind: 'terminal',
      phase,
      errorCount,
      warningCount,
      canShowProblems: errorCount > 0 || warningCount > 0,
      canRevealPreview: true,
      canOpenPdf: false,
      backwardSync: false,
      primaryAction: 'run',
    }
  },
}
