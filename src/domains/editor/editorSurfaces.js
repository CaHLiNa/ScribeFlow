import { isAiWorkbenchPath, isLibraryPath } from '../../utils/fileTypes'

export function collectLegacySurfaceTabs(paneTree) {
  const legacyTabs = []

  const walk = (node) => {
    if (!node) return
    if (node.type === 'leaf') {
      for (const tab of node.tabs || []) {
        if (isLibraryPath(tab) || isAiWorkbenchPath(tab)) {
          legacyTabs.push({ paneId: node.id, tab })
        }
      }
      return
    }
    for (const child of node.children || []) {
      walk(child)
    }
  }

  walk(paneTree)
  return legacyTabs
}

function openWorkspaceSurface(workspace, surface) {
  if (surface === 'ai') {
    workspace.openAiSurface()
    return 'surface:ai'
  }
  if (surface === 'library') {
    workspace.openLibrarySurface()
    return 'surface:library'
  }
  workspace.openWorkspaceSurface()
  return 'surface:workspace'
}

export function openEditorSurface({ workspace, surface, pruneLegacySurfaceTabs }) {
  pruneLegacySurfaceTabs?.()
  return openWorkspaceSurface(workspace, surface)
}

export function closeEditorSurface({ workspace, surface }) {
  if (workspace.primarySurface !== surface) return false
  workspace.openWorkspaceSurface()
  return true
}

export function toggleEditorSurface({ workspace, surface, pruneLegacySurfaceTabs }) {
  if (workspace.primarySurface === surface) {
    workspace.openWorkspaceSurface()
    return false
  }
  pruneLegacySurfaceTabs?.()
  openWorkspaceSurface(workspace, surface)
  return true
}
