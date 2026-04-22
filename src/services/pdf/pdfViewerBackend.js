export const PDF_VIEWER_BACKEND_PDFJS = 'pdfjs'
export const PDF_VIEWER_BACKEND_EMBEDPDF = 'embedpdf'
export const PDF_VIEWER_BACKEND_OVERRIDE_KEY = 'scribeflow:pdf-backend'

const KNOWN_PDF_VIEWER_BACKENDS = new Set([
  PDF_VIEWER_BACKEND_PDFJS,
  PDF_VIEWER_BACKEND_EMBEDPDF,
])

function normalizePdfViewerBackend(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  return KNOWN_PDF_VIEWER_BACKENDS.has(normalized)
    ? normalized
    : PDF_VIEWER_BACKEND_PDFJS
}

export function resolvePdfViewerBackend() {
  if (typeof window !== 'undefined') {
    try {
      const localOverride = window.localStorage?.getItem(PDF_VIEWER_BACKEND_OVERRIDE_KEY)
      if (localOverride) {
        return normalizePdfViewerBackend(localOverride)
      }
    } catch {
      // Ignore local override read failures and fall through to env/default.
    }
  }

  return normalizePdfViewerBackend(import.meta.env?.VITE_SCRIBEFLOW_PDF_BACKEND)
}

export function shouldUseEmbedPdfBackend(options = {}) {
  const backend = normalizePdfViewerBackend(options.backend || resolvePdfViewerBackend())
  return backend === PDF_VIEWER_BACKEND_EMBEDPDF
}
