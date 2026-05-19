const SEMANTIC_SCALE_VALUES = new Set(['auto', 'page-fit', 'page-width'])

export function isPdfViewerSemanticScaleValue(scaleValue) {
  return SEMANTIC_SCALE_VALUES.has(String(scaleValue || '').trim())
}

function normalizePdfViewerScale(scale) {
  const numericScale = Number(scale)
  if (!Number.isFinite(numericScale) || numericScale <= 0) return ''
  return String(Math.round(numericScale * 10000) / 10000)
}

export function createPdfViewerScaleLock(scaleValue, scale) {
  const restoreScaleValue = String(scaleValue || '').trim()
  if (!isPdfViewerSemanticScaleValue(restoreScaleValue)) return null

  const lockedScaleValue = normalizePdfViewerScale(scale)
  if (!lockedScaleValue) return null

  return {
    lockedScaleValue,
    restoreScaleValue,
  }
}
