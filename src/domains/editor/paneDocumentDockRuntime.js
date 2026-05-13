import { isNewTab, isPreviewPath, previewSourcePathFromPath } from '../../utils/fileTypes.js'
import { normalizeFsPath } from '../../utils/path.js'

function normalizeWorkspaceBoundaryPath(path = '') {
  const normalized = normalizeFsPath(path)
  if (!normalized) return ''
  if (normalized === '/') return '/'
  if (/^[A-Za-z]:\/?$/.test(normalized)) return `${normalized.slice(0, 2).toLowerCase()}/`
  return normalized.replace(/\/+$/, '')
}

function normalizeComparablePath(path = '') {
  const normalized = normalizeWorkspaceBoundaryPath(path)
  if (/^[A-Za-z]:\//.test(normalized)) {
    return `${normalized.slice(0, 2).toLowerCase()}${normalized.slice(2)}`
  }
  return normalized
}

export function isWorkspaceDocumentPath(path = '', workspacePath = '') {
  if (!path || isNewTab(path) || isPreviewPath(path)) return false

  const root = normalizeComparablePath(workspacePath)
  const candidate = normalizeComparablePath(path)
  if (!root || !candidate) return false
  if (root === '/') return candidate.startsWith('/')
  return candidate === root || candidate.startsWith(`${root}/`)
}

export function resolvePaneDocumentTab({
  activeTab = null,
  lastDocumentTab = null,
  workspacePath = '',
} = {}) {
  if (isWorkspaceDocumentPath(activeTab, workspacePath)) return activeTab
  if (isWorkspaceDocumentPath(lastDocumentTab, workspacePath)) return lastDocumentTab
  return null
}

export function resolveActiveWorkspaceDocumentTab({
  activeTab = null,
  workspacePath = '',
} = {}) {
  if (isWorkspaceDocumentPath(activeTab, workspacePath)) return activeTab

  if (isPreviewPath(activeTab)) {
    const sourcePath = previewSourcePathFromPath(activeTab)
    if (isWorkspaceDocumentPath(sourcePath, workspacePath)) return sourcePath
  }

  return null
}

export function resolvePaneDockContextPath({
  documentTab = null,
  activeDocumentDockTab = null,
  documentDockTabs = [],
  workspacePath = '',
} = {}) {
  const candidates = [
    documentTab,
    activeDocumentDockTab,
    ...(Array.isArray(documentDockTabs) ? documentDockTabs : []),
  ]

  return candidates.find((path) => isWorkspaceDocumentPath(path, workspacePath)) || ''
}

export function resolvePaneDocumentDockOpen({
  hasWorkspace = false,
  isWorkspaceSurface = false,
  isReferencePanel = false,
  documentDockOpen = false,
  activeDocumentPreviewOpen = false,
} = {}) {
  return Boolean(
    hasWorkspace &&
      isWorkspaceSurface &&
      !isReferencePanel &&
      (documentDockOpen || activeDocumentPreviewOpen)
  )
}
