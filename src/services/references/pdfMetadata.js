import { invoke } from '@tauri-apps/api/core'

async function loadPdfDocument(filePath = '') {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).href

  const base64 = await invoke('read_file_base64', { path: filePath })
  const data = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  return pdfjsLib.getDocument({ data }).promise
}

export async function readPdfPageTextContent(page = null) {
  if (!page) return { items: [], styles: Object.create(null), lang: null }

  if (typeof page.streamTextContent !== 'function') {
    return page.getTextContent()
  }

  const readableStream = page.streamTextContent()
  if (!readableStream || typeof readableStream.getReader !== 'function') {
    return page.getTextContent()
  }

  const reader = readableStream.getReader()
  const textContent = {
    items: [],
    styles: Object.create(null),
    lang: null,
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue

      if (textContent.lang == null && value.lang != null) {
        textContent.lang = value.lang
      }
      Object.assign(textContent.styles, value.styles || {})
      if (Array.isArray(value.items) && value.items.length > 0) {
        textContent.items.push(...value.items)
      }
    }
  } finally {
    reader.releaseLock?.()
  }

  return textContent
}

export async function extractTextFromPdf(filePath = '') {
  const pdf = await loadPdfDocument(filePath)
  const pages = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const textContent = await readPdfPageTextContent(page)
    const text = textContent.items
      .map((item) => String(item.str || '').trim())
      .filter(Boolean)
      .join(' ')
      .trim()
    if (text) pages.push(text)
  }

  return pages.join('\n\n')
}

export async function extractPdfMetadata(filePath = '') {
  const pdf = await loadPdfDocument(filePath)
  const metadata = {
    title: '',
    author: '',
    doi: '',
    year: null,
  }

  const pdfMeta = await pdf.getMetadata().catch(() => null)
  if (pdfMeta?.info) {
    const info = pdfMeta.info
    if (String(info.Title || '').trim().length > 5) metadata.title = String(info.Title).trim()
    if (String(info.Author || '').trim()) metadata.author = String(info.Author).trim()
    if (String(info.CreationDate || '').trim()) {
      const yearMatch = String(info.CreationDate).match(/(\d{4})/)
      if (yearMatch) metadata.year = Number.parseInt(yearMatch[1], 10)
    }
    if (String(info.Subject || '').trim()) {
      const doiMatch = String(info.Subject).match(/10\.\d{4,9}\/[^\s,;]+/i)
      if (doiMatch) metadata.doi = doiMatch[0]
    }
  }

  let firstPagesText = ''
  const previewPages = Math.min(3, pdf.numPages)
  for (let pageNumber = 1; pageNumber <= previewPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const textContent = await readPdfPageTextContent(page)
    firstPagesText += ` ${textContent.items.map((item) => item.str).join(' ')}`
  }

  if (!metadata.doi) {
    const doiMatch = firstPagesText.match(/(?:doi[:\s]*|https?:\/\/doi\.org\/)(10\.\d{4,9}\/[^\s,;]+)/i)
    if (doiMatch) metadata.doi = doiMatch[1]
  }

  return {
    firstText: firstPagesText.trim(),
    metadata,
  }
}
