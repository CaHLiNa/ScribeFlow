function normalizeText(value = '') {
  return String(value || '').trim()
}

export function buildExtensionTargetSummary(target = {}) {
  const path = normalizeText(target?.path)
  const referenceId = normalizeText(target?.referenceId || target?.reference_id)
  const kind = normalizeText(target?.kind)

  if (path && referenceId) {
    return {
      available: true,
      kind,
      textKey: 'Target: {path} · ref:{referenceId}',
      params: { path, referenceId },
    }
  }

  if (path) {
    return {
      available: true,
      kind,
      textKey: 'Target: {path}',
      params: { path },
    }
  }

  if (referenceId) {
    return {
      available: true,
      kind,
      textKey: 'Target reference: {referenceId}',
      params: { referenceId },
    }
  }

  return {
    available: false,
    kind,
    textKey: '',
    params: {},
  }
}
