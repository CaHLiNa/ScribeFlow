export function parseCslMetadata(xml = '') {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')
  const info = doc.querySelector('info')
  const title = info?.querySelector('title')?.textContent?.trim() || 'Unknown Style'
  const id = info?.querySelector('id')?.textContent?.trim() || ''
  const categoryEl = info?.querySelector('category[citation-format]')
  const citationFormat = categoryEl?.getAttribute('citation-format') || null

  const categoryMap = {
    'author-date': 'Author-date',
    numeric: 'Numeric',
    note: 'Note',
    author: 'Author',
    label: 'Label',
  }

  return {
    id,
    title,
    category: categoryMap[citationFormat] || citationFormat,
  }
}

export function deriveStyleId(cslId = '', title = '') {
  if (cslId) {
    const match = String(cslId).match(/\/([^/]+)$/)
    if (match) return match[1]
  }
  return String(title || 'custom-style')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
