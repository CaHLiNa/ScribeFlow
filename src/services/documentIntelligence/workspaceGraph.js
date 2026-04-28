export function normalizeFsPath(value = '') {
  const normalized = String(value || '').trim().replace(/\\/g, '/')
  if (!normalized) return ''
  if (normalized === '/') return '/'
  if (/^[A-Za-z]:\/?$/.test(normalized)) return `${normalized.slice(0, 2)}/`
  return normalized.replace(/\/+$/, '')
}

export function dirnamePath(filePath = '') {
  const normalized = normalizeFsPath(filePath)
  if (!normalized || normalized === '/') return '/'
  const index = normalized.lastIndexOf('/')
  if (index <= 0) return normalized.startsWith('/') ? '/' : '.'
  return normalized.slice(0, index)
}

export function basenamePath(filePath = '') {
  const normalized = normalizeFsPath(filePath)
  if (!normalized) return ''
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(index + 1) : normalized
}

export function extnamePath(filePath = '') {
  const name = basenamePath(filePath)
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(index).toLowerCase() : ''
}

export function stripExtension(filePath = '') {
  const normalized = normalizeFsPath(filePath)
  const name = basenamePath(normalized)
  const index = name.lastIndexOf('.')
  if (index <= 0) return normalized
  return `${dirnamePath(normalized)}/${name.slice(0, index)}`.replace(/\/\.\//g, '/')
}

export function joinPath(...segments) {
  const cleaned = segments
    .map(segment => normalizeFsPath(segment))
    .filter(Boolean)
  if (cleaned.length === 0) return ''

  const parts = []
  for (let index = 0; index < cleaned.length; index += 1) {
    const segment = cleaned[index]
    if (index === 0 && (segment.startsWith('/') || /^[A-Za-z]:\//.test(segment))) {
      parts.push(segment)
      continue
    }
    parts.push(segment.replace(/^\/+/, ''))
  }
  return normalizeFsPath(parts.join('/'))
}

export function resolveRelativePath(baseDir = '', target = '') {
  const normalizedTarget = normalizeFsPath(target)
  if (!normalizedTarget) return ''
  if (normalizedTarget.startsWith('/') || /^[A-Za-z]:\//.test(normalizedTarget)) {
    return normalizedTarget
  }

  const seed = normalizeFsPath(baseDir || '.')
  const baseParts = seed.split('/').filter(Boolean)
  const targetParts = normalizedTarget.split('/')
  const absolute = seed.startsWith('/') || /^[A-Za-z]:\//.test(seed)
  const drivePrefix = /^[A-Za-z]:\//.test(seed) ? seed.slice(0, 2) : ''

  for (const segment of targetParts) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (baseParts.length > 0) baseParts.pop()
      continue
    }
    baseParts.push(segment)
  }

  if (drivePrefix) return normalizeFsPath(`${drivePrefix}/${baseParts.slice(1).join('/')}`)
  return absolute ? normalizeFsPath(`/${baseParts.join('/')}`) : normalizeFsPath(baseParts.join('/'))
}

export function relativePathBetween(fromFilePath = '', targetPath = '') {
  const fromDir = dirnamePath(fromFilePath)
  const fromParts = normalizeFsPath(fromDir).split('/').filter(Boolean)
  const targetParts = normalizeFsPath(targetPath).split('/').filter(Boolean)

  let common = 0
  while (common < fromParts.length && common < targetParts.length && fromParts[common] === targetParts[common]) {
    common += 1
  }

  const upward = fromParts.length - common
  const remainder = targetParts.slice(common)
  if (upward === 0) return remainder.join('/')
  return `${'../'.repeat(upward)}${remainder.join('/')}`.replace(/\/+$/, '')
}

export function buildContentSignature(text = '') {
  const value = String(text || '')
  return `${value.length}:${value.slice(0, 120)}:${value.slice(-120)}`
}

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
