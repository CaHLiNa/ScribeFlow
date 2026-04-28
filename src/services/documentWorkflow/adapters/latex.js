import { isLatex } from '../../../utils/fileTypes.js'
import {
  buildLatexLintProblems,
  buildLatexProjectProblemsSync,
} from '../../latex/diagnostics.js'
import { resolveCachedLatexPreviewPath } from '../../latex/root.js'

function resolveKnownLatexArtifactPath(sourcePath, context = {}) {
  const state = latexCompileAdapter.stateForFile(sourcePath, context) || null
  return (
    state?.previewPath ||
    state?.pdfPath ||
    context.workflowStore?.getLatexArtifactPathForFile?.(sourcePath) ||
    ''
  )
}

function buildBuildStatusSuffix(context = {}, state = {}, queueState = null) {
  const extraArgs = state?.buildExtraArgs || queueState?.buildExtraArgs || ''
  const parts = []

  if (extraArgs) {
    parts.push(context.t?.('Custom args') || 'Custom args')
  }

  return parts.join(' · ')
}

function appendStatusSuffix(base, context = {}, state = {}, queueState = null) {
  const suffix = buildBuildStatusSuffix(context, state, queueState)
  return suffix ? `${base} · ${suffix}` : base
}

function formatCompileDuration(state = {}, context = {}, queueState = null) {
  const t = context.t || ((value) => value)
  if (state?.status === 'compiling') {
    const base =
      queueState?.pendingCount > 0
        ? `${t('Compiling...')} · ${t('Queued +{count}', { count: queueState.pendingCount })}`
        : t('Compiling...')
    return appendStatusSuffix(base, context, state, queueState)
  }
  if (queueState?.phase === 'scheduled' || queueState?.phase === 'queued') {
    return appendStatusSuffix(t('Queued'), context, state, queueState)
  }
  if (state?.status !== 'success') return ''
  const ms = state?.durationMs
  const durationText = !ms
    ? t('Compiled')
    : ms < 1000
      ? `${ms}ms`
      : `${(ms / 1000).toFixed(1)}s`
  return appendStatusSuffix(durationText, context, state, queueState)
}

export function buildLatexWorkflowProblems(sourcePath, state = {}) {
  const errors = Array.isArray(state?.errors) ? state.errors : []
  const warnings = Array.isArray(state?.warnings) ? state.warnings : []

  return [
    ...errors.map((problem, index) => ({
      id: `latex:error:${problem.file || sourcePath}:${index}`,
      sourcePath: problem.file || sourcePath,
      line: problem.line ?? null,
      column: problem.column ?? null,
      severity: 'error',
      message: problem.message || '',
      origin: 'compile',
      actionable: true,
      raw: problem.raw || problem.message || '',
    })),
    ...warnings.map((problem, index) => ({
      id: `latex:warning:${problem.file || sourcePath}:${index}`,
      sourcePath: problem.file || sourcePath,
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
  const errorCount = problems.filter(
    (problem) => problem.severity === 'error',
  ).length
  const warningCount = problems.filter(
    (problem) => problem.severity === 'warning',
  ).length

  let phase = 'idle'
  if (state?.status === 'compiling') phase = 'compiling'
  else if (
    options.queuePhase === 'scheduled' ||
    options.queuePhase === 'queued'
  )
    phase = 'queued'
  else if (state?.status === 'error') phase = 'error'
  else if (options.previewAvailable || state?.status === 'success')
    phase = 'ready'

  return {
    kind: 'latex',
    previewKind: options.previewKind || null,
    phase,
    errorCount,
    warningCount,
    canShowProblems: errorCount > 0 || warningCount > 0,
    canRevealPreview: false,
    canOpenPdf: options.artifactReady === true,
    backwardSync: true,
    primaryAction: 'compile',
  }
}

const latexPreviewAdapter = {
  defaultKind: null,
  supportedKinds: ['pdf'],

  createPath() {
    return null
  },

  inferKind() {
    return null
  },

  getTargetPath(sourcePath, context) {
    return (
      resolveKnownLatexArtifactPath(sourcePath, context) ||
      resolveCachedLatexPreviewPath(sourcePath) ||
      ''
    )
  },

  ensure(sourcePath, context, options = {}) {
    void sourcePath
    void context
    void options
    return null
  },

  reveal(sourcePath, context, options = {}) {
    void sourcePath
    void context
    void options
    return null
  },
}

const latexCompileAdapter = {
  id: 'latex',

  stateForFile(filePath, context) {
    return context.latexStore?.stateForFile(filePath) || null
  },

  async ensureReady(_filePath) {
    const { ensureLatexCompileReady } =
      await import('../../environmentPreflight.js')
    return ensureLatexCompileReady()
  },

  async compile(filePath, context, options = {}) {
    if (!context.latexStore) return null
    if (!(await this.ensureReady(filePath, context, options))) return null

    await context.latexStore.compile(filePath, options)
    return this.stateForFile(filePath, context)
  },

  getDiagnostics(filePath, context) {
    return buildLatexWorkflowProblems(
      filePath,
      this.stateForFile(filePath, context) || {},
    )
  },

  getArtifactPath(filePath, context) {
    return (
      resolveKnownLatexArtifactPath(filePath, context) ||
      resolveCachedLatexPreviewPath(filePath) ||
      ''
    )
  },

  getStatusText(filePath, context) {
    const state = this.stateForFile(filePath, context) || {}
    const queueState = context.latexStore?.queueStateForFile?.(filePath) || null
    return formatCompileDuration(state, context, queueState)
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
  compile: latexCompileAdapter,

  getProblems(filePath, context = {}) {
    const lintDiagnostics =
      context.latexStore?.lintDiagnosticsForFile(filePath) || []
    return [
      ...latexCompileAdapter.getDiagnostics(filePath, context),
      ...buildLatexProjectProblemsSync(filePath),
      ...buildLatexLintProblems(filePath, lintDiagnostics),
    ]
  },

  getUiState(filePath, context = {}) {
    const problems = this.getProblems(filePath, context)
    const errorCount = problems.filter(
      (problem) => problem.severity === 'error',
    ).length
    const warningCount = problems.filter(
      (problem) => problem.severity === 'warning',
    ).length
    const queueState = context.latexStore?.queueStateForFile?.(filePath) || null
    return {
      ...buildLatexWorkflowUiState(
        latexCompileAdapter.stateForFile(filePath, context) || {},
        {
          artifactReady: context.artifactReady === true,
          queuePhase: queueState?.phase || null,
          previewKind: context.previewKind || null,
        },
      ),
      errorCount,
      warningCount,
      canShowProblems: errorCount > 0 || warningCount > 0,
    }
  },
}
