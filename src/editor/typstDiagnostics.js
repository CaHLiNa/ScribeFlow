function normalizeLineNumber(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizeIssue(filePath, issue = {}, fallbackSeverity, rawLog = '') {
  const severity = issue?.severity === 'warning' || fallbackSeverity === 'warning'
    ? 'warning'
    : 'error'

  return {
    file: filePath,
    line: normalizeLineNumber(issue?.line),
    column: normalizeLineNumber(issue?.column),
    from: issue?.from ?? null,
    to: issue?.to ?? null,
    severity,
    message: String(issue?.message || '').trim(),
    source: 'typst',
    raw: String(issue?.raw || rawLog || '').trim() || undefined,
  }
}

export function normalizeTypstDiagnostics(filePath, compileState = {}) {
  const rawLog = String(compileState?.log || '').trim()
  const errors = Array.isArray(compileState?.errors) ? compileState.errors : []
  const warnings = Array.isArray(compileState?.warnings) ? compileState.warnings : []

  return [
    ...errors.map(issue => normalizeIssue(filePath, issue, 'error', rawLog)),
    ...warnings.map(issue => normalizeIssue(filePath, issue, 'warning', rawLog)),
  ].filter(diagnostic => diagnostic.message)
}

export function getPrimaryTypstDiagnostic(diagnostics = []) {
  return diagnostics.find(diagnostic => diagnostic?.severity === 'error') || null
}

export function hasTypstDiagnosticLocation(diagnostic) {
  return Number.isInteger(diagnostic?.line) && diagnostic.line > 0
}

export function buildTypstDiagnosticSignature(diagnostic) {
  if (!diagnostic) return ''
  return [
    diagnostic.file || '',
    diagnostic.line ?? '',
    diagnostic.column ?? '',
    diagnostic.severity || '',
    diagnostic.message || '',
  ].join('::')
}

export function getTypstStatusTransition(previousStatus, nextStatus) {
  const prev = previousStatus || 'idle'
  const next = nextStatus || 'idle'

  if (prev === 'success' && next === 'error') return 'success-to-error'
  if (prev === 'error' && next === 'error') return 'error-to-error'
  if (prev === 'error' && next === 'success') return 'error-to-success'
  if (prev === 'success' && next === 'success') return 'success-to-success'
  if (prev === 'idle' && next === 'error') return 'idle-to-error'
  if (prev === 'idle' && next === 'success') return 'idle-to-success'
  return `${prev}-to-${next}`
}

export function shouldAutoJumpTypstDiagnostic(previousSignature, nextDiagnostic, context = {}) {
  if (!nextDiagnostic || nextDiagnostic.severity !== 'error' || !hasTypstDiagnosticLocation(nextDiagnostic)) {
    return false
  }

  const nextSignature = context.nextSignature || nextDiagnostic._signature || buildTypstDiagnosticSignature(nextDiagnostic)
  if (!nextSignature) return false

  if (context.statusTransition === 'success-to-error') {
    return true
  }

  if (!previousSignature) {
    return true
  }

  return nextSignature !== previousSignature
}
