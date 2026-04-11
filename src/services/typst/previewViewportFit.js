const DEFAULT_TYPT_PREVIEW_FIT_REPAIR_THRESHOLD_PX = 8

function normalizeMetric(value) {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0
}

export function shouldRepairTypstPreviewFit(metrics = {}, thresholdPx = DEFAULT_TYPT_PREVIEW_FIT_REPAIR_THRESHOLD_PX) {
  const clientWidth = normalizeMetric(metrics.clientWidth)
  if (clientWidth <= 0) return false

  const scrollOverflow = normalizeMetric(metrics.scrollWidth) - clientWidth
  const previewOverflow = normalizeMetric(metrics.previewWidth) - clientWidth
  const overflowPx = Math.max(scrollOverflow, previewOverflow)
  return overflowPx > normalizeMetric(thresholdPx)
}

export { DEFAULT_TYPT_PREVIEW_FIT_REPAIR_THRESHOLD_PX }
