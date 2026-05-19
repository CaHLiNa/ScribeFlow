function normalizePath(path = '') {
  const value = String(path || '').trim().replace(/\\/g, '/')
  if (!value) return ''
  if (value === '/') return '/'
  if (/^[A-Za-z]:\/?$/.test(value)) return `${value.slice(0, 2)}/`
  return value.replace(/\/+$/, '')
}

function isWithinRoot(path = '', root = '') {
  if (!path || !root) return false
  if (path === root) return true
  const separator = root.endsWith('/') ? '' : '/'
  return path.startsWith(`${root}${separator}`)
}

function encodeRelativePath(relativePath = '') {
  return String(relativePath || '')
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/')
}

export function toWorkspaceProtocolUrl(filePath, workspace, options = {}) {
  const normalizedFilePath = normalizePath(filePath)
  const workspaceRoot = normalizePath(workspace?.path || '')
  const dataRoot = normalizePath(workspace?.workspaceDataDir || '')
  const globalRoot = normalizePath(workspace?.globalConfigDir || '')
  const { version = '' } = options

  let scope = ''
  let relativePath = ''

  if (isWithinRoot(normalizedFilePath, workspaceRoot)) {
    scope = 'workspace'
    relativePath = normalizedFilePath.slice(workspaceRoot.length).replace(/^\/+/, '')
  } else if (isWithinRoot(normalizedFilePath, dataRoot)) {
    scope = 'data'
    relativePath = normalizedFilePath.slice(dataRoot.length).replace(/^\/+/, '')
  } else if (isWithinRoot(normalizedFilePath, globalRoot)) {
    scope = 'global'
    relativePath = normalizedFilePath.slice(globalRoot.length).replace(/^\/+/, '')
  } else {
    return ''
  }

  if (!relativePath) return ''

  const baseUrl = `scribeflow-workspace://localhost/${scope}/${encodeRelativePath(relativePath)}`
  if (!version) return baseUrl
  return `${baseUrl}?v=${encodeURIComponent(String(version))}`
}
