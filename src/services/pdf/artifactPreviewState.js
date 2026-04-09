function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalizePageMetric(metric = {}, fallbackPageNumber = 1) {
  const pageNumber = Number.isInteger(metric.pageNumber) && metric.pageNumber > 0
    ? metric.pageNumber
    : fallbackPageNumber
  const offsetTop = Number.isFinite(metric.offsetTop) ? metric.offsetTop : 0
  const offsetHeight = Number.isFinite(metric.offsetHeight) && metric.offsetHeight > 0
    ? metric.offsetHeight
    : 1

  return {
    pageNumber,
    offsetTop,
    offsetHeight,
    offsetBottom: offsetTop + offsetHeight,
  }
}

function normalizePageMetrics(pageMetrics = []) {
  return (Array.isArray(pageMetrics) ? pageMetrics : [])
    .map((metric, index) => normalizePageMetric(metric, index + 1))
    .sort((left, right) => left.pageNumber - right.pageNumber)
}

export function resolvePdfViewportCurrentPage(options = {}) {
  const metrics = normalizePageMetrics(options.pageMetrics)
  if (metrics.length === 0) return Number(options.fallbackPage || 1) || 1

  const scrollTop = Math.max(Number(options.scrollTop || 0), 0)
  const viewportHeight = Math.max(Number(options.viewportHeight || 0), 0)
  const viewportBottom = scrollTop + viewportHeight

  let bestMetric = metrics[0]
  let bestOverlap = -1
  let bestDistance = Number.POSITIVE_INFINITY

  for (const metric of metrics) {
    const overlap = Math.max(
      0,
      Math.min(viewportBottom, metric.offsetBottom) - Math.max(scrollTop, metric.offsetTop),
    )
    const distance = Math.abs(metric.offsetTop - scrollTop)

    if (
      overlap > bestOverlap
      || (overlap === bestOverlap && distance < bestDistance)
      || (
        overlap === bestOverlap
        && distance === bestDistance
        && metric.pageNumber < bestMetric.pageNumber
      )
    ) {
      bestMetric = metric
      bestOverlap = overlap
      bestDistance = distance
    }
  }

  return bestMetric.pageNumber
}

export function capturePdfViewportAnchor(options = {}) {
  const metrics = normalizePageMetrics(options.pageMetrics)
  if (metrics.length === 0) {
    return {
      pageNumber: Number(options.fallbackPage || 1) || 1,
      offsetRatio: 0,
    }
  }

  const pageNumber = resolvePdfViewportCurrentPage({
    pageMetrics: metrics,
    scrollTop: options.scrollTop,
    viewportHeight: options.viewportHeight,
    fallbackPage: options.fallbackPage,
  })
  const metric = metrics.find((entry) => entry.pageNumber === pageNumber) || metrics[0]
  const scrollTop = Math.max(Number(options.scrollTop || 0), 0)
  const offsetRatio = clamp(
    (scrollTop - metric.offsetTop) / metric.offsetHeight,
    0,
    1,
  )

  return {
    pageNumber: metric.pageNumber,
    offsetRatio,
  }
}

export function resolvePdfViewportScrollTop(anchor = null, pageMetrics = [], fallbackTop = 0) {
  const metrics = normalizePageMetrics(pageMetrics)
  if (metrics.length === 0) return Math.max(Number(fallbackTop || 0), 0)

  const targetPageNumber = Number(anchor?.pageNumber || 0)
  const metric = metrics.find((entry) => entry.pageNumber === targetPageNumber) || metrics[0]
  const offsetRatio = clamp(Number(anchor?.offsetRatio || 0), 0, 1)
  return Math.max(metric.offsetTop + metric.offsetHeight * offsetRatio, 0)
}
