export async function readPdfTextContent(page, params = {}) {
  if (!page) {
    throw new Error('PDF page is required')
  }

  if (typeof page.streamTextContent !== 'function') {
    return page.getTextContent(params)
  }

  const readableStream = page.streamTextContent(params)
  if (!readableStream?.getReader) {
    return page.getTextContent(params)
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
