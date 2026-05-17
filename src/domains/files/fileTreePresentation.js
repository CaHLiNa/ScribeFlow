export const DEFAULT_RECENT_WORKSPACE_LIMIT = 5

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeNumber(value = 0, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function resolveFileTreeWorkspaceName({
  workspacePath = '',
  workspaceBasename = '',
  translate = (key) => key,
} = {}) {
  if (!normalizeText(workspacePath)) return translate('Explorer')
  return normalizeText(workspaceBasename) || translate('Explorer')
}

export function listFileTreeRecentWorkspaces(recentWorkspaces = [], limit = DEFAULT_RECENT_WORKSPACE_LIMIT) {
  const normalizedLimit = Math.max(0, Math.floor(Number(limit) || 0))
  return Array.isArray(recentWorkspaces) ? recentWorkspaces.slice(0, normalizedLimit) : []
}

export function resolveWorkspaceMenuStyle(position = {}) {
  return {
    right: `${Math.max(8, normalizeNumber(position.right, 8))}px`,
    bottom: `${Math.max(8, normalizeNumber(position.bottom, 8))}px`,
  }
}

export function resolveWorkspaceMenuPosition({
  anchorRect = null,
  viewportWidth = 0,
  viewportHeight = 0,
} = {}) {
  if (!anchorRect) {
    return { right: 8, bottom: 8 }
  }

  return {
    right: Math.max(8, normalizeNumber(viewportWidth) - normalizeNumber(anchorRect.right)),
    bottom: Math.max(8, normalizeNumber(viewportHeight) - normalizeNumber(anchorRect.top) + 2),
  }
}

export function resolveNewMenuStyle({
  anchorRect = null,
  menuRect = null,
  viewportHeight = 0,
} = {}) {
  if (!anchorRect || !menuRect) {
    return { top: '0px', left: '0px' }
  }

  let top = normalizeNumber(anchorRect.bottom) + 4
  const left = normalizeNumber(anchorRect.left)

  if (top + normalizeNumber(menuRect.height) > normalizeNumber(viewportHeight)) {
    top = Math.max(8, normalizeNumber(anchorRect.top) - normalizeNumber(menuRect.height) - 4)
  }

  return {
    top: `${top}px`,
    left: `${left}px`,
  }
}

export function normalizeTypedFileExtension(extension = '') {
  const normalized = normalizeText(extension)
  if (!normalized) return ''
  return normalized.startsWith('.') ? normalized : `.${normalized}`
}

export function appendTypedFileExtension(name = '', extension = '') {
  const normalizedName = normalizeText(name)
  const normalizedExtension = normalizeTypedFileExtension(extension)
  if (!normalizedName || !normalizedExtension || normalizedName.includes('.')) {
    return normalizedName
  }
  return `${normalizedName}${normalizedExtension}`
}

export function buildTypedFileNameCandidate({
  suggestedName = '',
  extension = '',
  fallbackBaseName = 'Untitled',
  index = 0,
} = {}) {
  const normalizedExtension = normalizeTypedFileExtension(extension)
  const preferredName = normalizeText(suggestedName) || `${fallbackBaseName}${normalizedExtension}`
  const normalizedName = preferredName.endsWith(normalizedExtension)
    ? preferredName
    : `${preferredName}${normalizedExtension}`
  const baseName = normalizedName.endsWith(normalizedExtension)
    ? normalizedName.slice(0, normalizedName.length - normalizedExtension.length)
    : normalizedName
  const normalizedIndex = Math.max(0, Math.floor(Number(index) || 0))

  return normalizedIndex === 0
    ? `${baseName}${normalizedExtension}`
    : `${baseName} ${normalizedIndex + 1}${normalizedExtension}`
}

export function deriveTypedFileNameCandidates({
  suggestedName = '',
  extension = '',
  fallbackBaseName = 'Untitled',
  maxAttempts = 100,
} = {}) {
  const attempts = Math.max(1, Math.floor(Number(maxAttempts) || 1))

  return Array.from({ length: attempts }, (_, index) => buildTypedFileNameCandidate({
    suggestedName,
    extension,
    fallbackBaseName,
    index,
  }))
}

export function buildFileTreeRenameState({
  entry = null,
  isNew = false,
  isDir = false,
  parentDir = '',
  value = '',
  autoExtension = '',
} = {}) {
  return {
    active: true,
    value: entry?.name ?? value,
    originalPath: entry?.path || '',
    isNew: isNew === true,
    isDir: isDir === true,
    autoExtension: normalizeTypedFileExtension(autoExtension),
    parentDir: normalizeText(parentDir),
  }
}

export function resetFileTreeRenameState() {
  return {
    active: false,
    value: '',
    originalPath: '',
    isNew: false,
    isDir: false,
    autoExtension: '',
    parentDir: '',
  }
}
