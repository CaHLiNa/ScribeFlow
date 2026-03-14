function summarizeProblems(problems = []) {
  const errorCount = problems.filter(problem => problem.severity === 'error').length
  const warningCount = problems.filter(problem => problem.severity === 'warning').length
  return { errorCount, warningCount }
}

export function buildMarkdownWorkflowProblems(sourcePath, state = {}) {
  return Array.isArray(state?.problems)
    ? state.problems.map((problem, index) => ({
      id: problem.id || `markdown:${sourcePath}:${index}`,
      sourcePath,
      line: problem.line ?? null,
      column: problem.column ?? null,
      severity: problem.severity || 'error',
      message: problem.message || '',
      origin: problem.origin || 'preview',
      actionable: problem.actionable !== false,
      raw: problem.raw,
    }))
    : []
}

export function buildMarkdownWorkflowUiState({
  previewKind = 'html',
  previewAvailable = false,
  htmlState = {},
  pdfState = {},
}) {
  const state = previewKind === 'pdf' ? pdfState : htmlState
  const problems = buildMarkdownWorkflowProblems('', state)
  const { errorCount, warningCount } = summarizeProblems(problems)

  let phase = 'idle'
  if (state?.status === 'rendering') phase = 'rendering'
  else if (state?.status === 'error') phase = 'error'
  else if (previewAvailable || state?.status === 'ready') phase = 'ready'

  return {
    kind: 'markdown',
    previewKind,
    phase,
    errorCount,
    warningCount,
    canShowProblems: errorCount > 0 || warningCount > 0,
    canRevealPreview: previewAvailable,
    forwardSync: previewKind === 'html' ? 'approximate' : 'reveal-only',
    backwardSync: false,
    primaryAction: previewKind === 'pdf' ? 'compile' : 'refresh',
  }
}
