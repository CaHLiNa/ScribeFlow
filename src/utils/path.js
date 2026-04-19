export function normalizeFsPath(value = '') {
  return String(value || '').trim().replace(/\\/g, '/')
}

export function basenamePath(filePath = '') {
  const normalized = normalizeFsPath(filePath)
  if (!normalized) return ''
  if (normalized === '/') return '/'

  const withoutTrailing = normalized.replace(/\/+$/, '')
  if (/^[A-Za-z]:$/.test(withoutTrailing)) return `${withoutTrailing}/`

  const parts = withoutTrailing.split('/').filter(Boolean)
  return parts.at(-1) || withoutTrailing
}

export function dirnamePath(filePath = '') {
  const normalized = normalizeFsPath(filePath)
  if (!normalized) return '.'
  if (normalized === '/') return '/'
  if (/^[A-Za-z]:\/?$/.test(normalized)) return `${normalized.slice(0, 2)}/`

  const withoutTrailing = normalized.replace(/\/+$/, '')
  const index = withoutTrailing.lastIndexOf('/')
  if (index < 0) return '.'
  if (index === 0) return '/'

  const head = withoutTrailing.slice(0, index)
  if (/^[A-Za-z]:$/.test(head)) return `${head}/`
  return head
}

export function stripExtension(filePath = '') {
  const name = basenamePath(filePath)
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(0, index) : name
}
