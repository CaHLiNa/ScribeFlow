function normalizeLineNumber(value) {
  return Number.isInteger(value) ? value + 1 : null
}

function normalizeSeverity(value) {
  return value === 1 ? 'error' : 'warning'
}

export function normalizeTinymistDiagnostics(filePath, diagnostics = []) {
  return diagnostics
    .map((diagnostic) => {
      const start = diagnostic?.range?.start || {}
      const end = diagnostic?.range?.end || {}

      return {
        file: filePath,
        line: normalizeLineNumber(start.line),
        column: normalizeLineNumber(start.character),
        from: Number.isInteger(start.character) ? start.character : null,
        to: Number.isInteger(end.character) ? end.character : null,
        severity: normalizeSeverity(diagnostic?.severity),
        message: String(diagnostic?.message || '').trim(),
        source: String(diagnostic?.source || 'tinymist').trim() || 'tinymist',
        code: diagnostic?.code ?? null,
        raw: undefined,
      }
    })
    .filter(diagnostic => diagnostic.message)
}

export function getTinymistDiagnosticsStatus(diagnostics = []) {
  return diagnostics.some(diagnostic => diagnostic?.severity === 'error')
    ? 'error'
    : 'success'
}
