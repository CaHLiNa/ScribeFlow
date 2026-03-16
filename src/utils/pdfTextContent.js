const PDF_PAGE_PATCHED = Symbol('altalsPdfPageTextContentPatched')
const PDF_PAGE_ORIGINAL_GET_TEXT_CONTENT = Symbol('altalsPdfPageOriginalGetTextContent')
const PDF_DOCUMENT_PATCHED = Symbol('altalsPdfDocumentTextContentPatched')

async function readPdfTextContentWithFallback(page, params = {}, fallbackGetTextContent = null) {
  if (!page) {
    throw new Error('PDF page is required')
  }

  if (typeof page.streamTextContent !== 'function') {
    if (!fallbackGetTextContent) {
      throw new Error('PDF page does not expose text extraction methods')
    }
    return fallbackGetTextContent(params)
  }

  const readableStream = page.streamTextContent(params)
  if (!readableStream?.getReader) {
    if (!fallbackGetTextContent) {
      throw new Error('PDF text stream reader is unavailable')
    }
    return fallbackGetTextContent(params)
  }

  const reader = readableStream.getReader()
  const textContent = {
    items: [],
    styles: Object.create(null),
    lang: null,
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (!value) continue
      textContent.lang ??= value.lang ?? null
      if (value.styles) {
        Object.assign(textContent.styles, value.styles)
      }
      if (Array.isArray(value.items) && value.items.length > 0) {
        textContent.items.push(...value.items)
      }
    }
  } finally {
    reader.releaseLock?.()
  }

  return textContent
}

export async function readPdfTextContent(page, params = {}) {
  const fallbackGetTextContent = page?.[PDF_PAGE_ORIGINAL_GET_TEXT_CONTENT]
    || (typeof page?.getTextContent === 'function' ? page.getTextContent.bind(page) : null)
  return readPdfTextContentWithFallback(page, params, fallbackGetTextContent)
}

export function patchPdfPageTextContent(page) {
  if (!page || page[PDF_PAGE_PATCHED]) return page

  const originalGetTextContent = typeof page.getTextContent === 'function'
    ? page.getTextContent.bind(page)
    : null

  if (!originalGetTextContent) return page

  Object.defineProperty(page, PDF_PAGE_ORIGINAL_GET_TEXT_CONTENT, {
    value: originalGetTextContent,
    configurable: false,
    enumerable: false,
    writable: false,
  })

  page.getTextContent = function getPatchedTextContent(params = {}) {
    return readPdfTextContentWithFallback(page, params, originalGetTextContent)
  }

  Object.defineProperty(page, PDF_PAGE_PATCHED, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  })

  return page
}

export function patchPdfDocumentTextContent(pdfDocument) {
  if (!pdfDocument || pdfDocument[PDF_DOCUMENT_PATCHED] || typeof pdfDocument.getPage !== 'function') {
    return pdfDocument
  }

  const originalGetPage = pdfDocument.getPage.bind(pdfDocument)
  pdfDocument.getPage = async function getPatchedPage(pageNumber) {
    const page = await originalGetPage(pageNumber)
    return patchPdfPageTextContent(page)
  }

  Object.defineProperty(pdfDocument, PDF_DOCUMENT_PATCHED, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  })

  return pdfDocument
}
