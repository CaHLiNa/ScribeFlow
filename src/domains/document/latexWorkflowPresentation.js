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

export function formatLatexCompileDuration(state = {}, context = {}, queueState = null) {
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

export function countLatexWorkflowProblemSeverities(problems = []) {
  const normalizedProblems = Array.isArray(problems) ? problems : []
  return {
    errorCount: normalizedProblems.filter(
      (problem) => problem.severity === 'error',
    ).length,
    warningCount: normalizedProblems.filter(
      (problem) => problem.severity === 'warning',
    ).length,
  }
}

export function buildLatexWorkflowUiState(state = {}, options = {}) {
  const severityCounts = options.problems
    ? countLatexWorkflowProblemSeverities(options.problems)
    : countLatexWorkflowProblemSeverities([])
  const { errorCount, warningCount } = severityCounts

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
