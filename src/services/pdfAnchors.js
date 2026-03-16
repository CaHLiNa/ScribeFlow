function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function sliceContext(value, maxLength = 120) {
  const normalized = normalizeWhitespace(value)
  if (normalized.length <= maxLength) return normalized
  return normalized.slice(0, maxLength).trimEnd()
}

/**
 * Create a stable-enough first-pass PDF quote anchor.
 * Phase 1 intentionally prefers page + quote + local text context over
 * fragile viewport-only coordinates, so reopening a PDF can fall back to
 * text matching when exact rectangles are unavailable.
 */
export function createPdfQuoteAnchor({
  pdfPath,
  referenceKey = null,
  page,
  quote,
  prefix = '',
  suffix = '',
  selectionRect = null,
} = {}) {
  const normalizedQuote = normalizeWhitespace(quote)
  if (!pdfPath || !normalizedQuote || !Number.isFinite(Number(page))) {
    throw new Error('createPdfQuoteAnchor requires pdfPath, page, and quote')
  }

  return {
    kind: 'pdf-quote',
    pdfPath,
    referenceKey: referenceKey || null,
    page: Number(page),
    quote: normalizedQuote,
    prefix: sliceContext(prefix),
    suffix: sliceContext(suffix),
    selectionRect: selectionRect || null,
  }
}

export function buildPdfAnchorFingerprint(anchor) {
  if (!anchor) return ''
  const page = Number(anchor.page || 0)
  const quote = normalizeWhitespace(anchor.quote || '')
  const prefix = normalizeWhitespace(anchor.prefix || '')
  const suffix = normalizeWhitespace(anchor.suffix || '')
  return [anchor.pdfPath || '', page, quote, prefix, suffix].join('::')
}

export function isPdfQuoteAnchor(anchor) {
  return anchor?.kind === 'pdf-quote'
}

export function normalizePdfAnchorForMatch(anchor) {
  if (!isPdfQuoteAnchor(anchor)) return null
  return {
    ...anchor,
    page: Number(anchor.page || 0),
    quote: normalizeWhitespace(anchor.quote),
    prefix: normalizeWhitespace(anchor.prefix || ''),
    suffix: normalizeWhitespace(anchor.suffix || ''),
  }
}
