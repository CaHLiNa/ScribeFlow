function toAsciiSlug(value = '') {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function firstNonEmpty(values = []) {
  for (const value of values) {
    if (value) return value
  }
  return ''
}

function makeBaseKey(cslJson = {}) {
  const firstAuthor = cslJson.author?.[0] || {}
  const year = String(cslJson.issued?.['date-parts']?.[0]?.[0] || '').trim()

  const authorToken = firstNonEmpty([
    toAsciiSlug(firstAuthor.family),
    toAsciiSlug(firstAuthor.given),
  ])
  const titleToken = toAsciiSlug(cslJson.title).slice(0, 24)

  let base = firstNonEmpty([authorToken, titleToken, 'ref'])
  if (!/^[a-z]/.test(base)) {
    base = `ref${base}`
  }

  if (year) {
    base += year
  }

  return base
}

export function buildReferenceKey(cslJson = {}, existingKeys = []) {
  const occupied = existingKeys instanceof Set ? existingKeys : new Set(existingKeys)
  const base = makeBaseKey(cslJson)

  if (!occupied.has(base)) return base

  for (let i = 0; i < 26; i++) {
    const candidate = `${base}${String.fromCharCode(97 + i)}`
    if (!occupied.has(candidate)) return candidate
  }

  return `${base}${Math.random().toString(36).slice(2, 5)}`
}

