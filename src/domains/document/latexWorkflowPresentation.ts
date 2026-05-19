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
