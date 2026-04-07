function defaultTranslator(value, params = {}) {
  return String(value || '').replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`))
}

export function summarizeWorkflowProblems(problems = []) {
  const entries = Array.isArray(problems) ? problems : []
  const errorCount = entries.filter((problem) => problem?.severity === 'error').length
  const warningCount = entries.filter((problem) => problem?.severity !== 'error').length

  return {
    totalCount: entries.length,
    errorCount,
    warningCount,
    hasProblems: entries.length > 0,
  }
}

export function buildWorkflowProblemSummary(problems = [], t = defaultTranslator) {
  const summary = summarizeWorkflowProblems(problems)
  if (!summary.hasProblems) {
    return t('No current issues')
  }

  return t('{errors} errors · {warnings} warnings', {
    errors: summary.errorCount,
    warnings: summary.warningCount,
  })
}

export function buildWorkflowPhaseLabel(uiState = null, t = defaultTranslator) {
  const phase = uiState?.phase || 'idle'
  if (phase === 'compiling') return t('Compiling')
  if (phase === 'rendering') return t('Rendering')
  if (phase === 'queued') return t('Queued')
  if (phase === 'ready') return t('Ready')
  if (phase === 'error') return t('Needs attention')
  return t('Idle')
}

export function buildWorkflowStatusText({
  filePath = '',
  workflowStore = null,
  context = {},
  fallback = '',
  t = defaultTranslator,
} = {}) {
  if (!filePath || !workflowStore) {
    return fallback || ''
  }

  const statusText = workflowStore.getStatusTextForFile(filePath, context)
  if (statusText) {
    return statusText
  }

  return fallback || t('Waiting for the next document action.')
}
