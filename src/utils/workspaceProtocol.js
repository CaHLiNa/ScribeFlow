function normalizePath(path = '') {
  const value = String(path || '').replace(/\/+$/, '')
  return value || '/'
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
  const { version = '' } = options

  let scope = ''
  let relativePath = ''

  if (workspaceRoot && (normalizedFilePath === workspaceRoot || normalizedFilePath.startsWith(`${workspaceRoot}/`))) {
    scope = 'workspace'
    relativePath = normalizedFilePath.slice(workspaceRoot.length).replace(/^\/+/, '')
  } else if (dataRoot && (normalizedFilePath === dataRoot || normalizedFilePath.startsWith(`${dataRoot}/`))) {
    scope = 'data'
    relativePath = normalizedFilePath.slice(dataRoot.length).replace(/^\/+/, '')
  } else {
    return ''
  }

  if (!relativePath) return ''

  const baseUrl = `altals-workspace://localhost/${scope}/${encodeRelativePath(relativePath)}`
  if (!version) return baseUrl
  return `${baseUrl}?v=${encodeURIComponent(String(version))}`
}
