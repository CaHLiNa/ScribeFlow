export function uniqueBy(items = [], keyFn = (value) => value) {
  const seen = new Set()
  const next = []
  for (const item of items) {
    const key = keyFn(item)
    if (seen.has(key)) continue
    seen.add(key)
    next.push(item)
  }
  return next
}

export function sortByOffset(items = []) {
  return [...items].sort((left, right) => {
    const leftOffset = Number(left?.offset) || 0
    const rightOffset = Number(right?.offset) || 0
    if (leftOffset !== rightOffset) return leftOffset - rightOffset
    return String(left?.text || left?.label || '').localeCompare(String(right?.text || right?.label || ''))
  })
}

export function buildContentSignature(text = '') {
  const value = String(text || '')
  return `${value.length}:${value.slice(0, 120)}:${value.slice(-120)}`
}

export function stableContentFingerprint(value = '') {
  const text = String(value || '')
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${text.length}:${(hash >>> 0).toString(16)}`
}
