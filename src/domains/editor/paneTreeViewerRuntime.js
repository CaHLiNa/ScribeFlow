import { getViewerType } from '../../utils/fileTypes.js'

export function hasVisibleViewerType(paneTree, viewerType) {
  const targetViewerType = String(viewerType || '').trim()
  if (!paneTree || !targetViewerType) return false

  if (paneTree.type === 'leaf') {
    const activeTab = paneTree.activeTab
    return !!activeTab && getViewerType(activeTab) === targetViewerType
  }

  if (!Array.isArray(paneTree.children)) return false
  return paneTree.children.some((child) => hasVisibleViewerType(child, targetViewerType))
}

export function hasVisiblePdfPane(paneTree) {
  return hasVisibleViewerType(paneTree, 'pdf')
}
