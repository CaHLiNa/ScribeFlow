const BRACKET_CITATION_RE = /\[([^\[\]\n]*@[a-zA-Z][\w:-]*[^\[\]\n]*)\]/g
const BRACKET_CITATION_KEY_RE = /@([a-zA-Z][\w:-]*)/g
const BARE_CITATION_RE = /(^|[\s([{\u3000])@([a-zA-Z][\w:-]*)\b/g

function uniqueKeys(keys = []) {
  const seen = new Set()
  const result = []
  for (const key of keys) {
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(key)
  }
  return result
}

export function extractCitationKeysFromRaw(raw = '') {
  const keys = []
  BRACKET_CITATION_KEY_RE.lastIndex = 0
  let match
  while ((match = BRACKET_CITATION_KEY_RE.exec(String(raw || ''))) !== null) {
    keys.push(match[1])
  }
  return uniqueKeys(keys)
}

export function extractMarkdownCitationKeys(text = '') {
  const source = String(text || '')
  const keys = []

  BRACKET_CITATION_RE.lastIndex = 0
  let match
  while ((match = BRACKET_CITATION_RE.exec(source)) !== null) {
    keys.push(...extractCitationKeysFromRaw(match[1]))
  }

  BARE_CITATION_RE.lastIndex = 0
  while ((match = BARE_CITATION_RE.exec(source)) !== null) {
    keys.push(match[2])
  }

  return uniqueKeys(keys)
}
