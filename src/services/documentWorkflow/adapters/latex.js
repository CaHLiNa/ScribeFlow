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
