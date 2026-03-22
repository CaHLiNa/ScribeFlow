import { getViewerType } from '../../utils/fileTypes'
import { findPane } from './paneTreeLayout'

function buildEditorViewKey(paneId, path) {
  return `${paneId}:${path}`
}

function hasInsertableTextView(editorViews, paneId, path, isInsertablePath) {
  if (!path || !isInsertablePath?.(path)) return false
  if (getViewerType(path) !== 'text') return false
  return !!editorViews?.[buildEditorViewKey(paneId, path)]
}

export function registerEditorView(editorViews, paneId, path, view) {
  if (!editorViews || !paneId || !path) return false
  editorViews[buildEditorViewKey(paneId, path)] = view
  return true
}

export function unregisterEditorView(editorViews, paneId, path) {
  if (!editorViews || !paneId || !path) return false
  delete editorViews[buildEditorViewKey(paneId, path)]
  return true
}

export function getRegisteredEditorView(editorViews, paneId, path) {
  if (!editorViews || !paneId || !path) return null
  return editorViews[buildEditorViewKey(paneId, path)] || null
}

export function getAnyRegisteredEditorView(editorViews, path) {
  if (!editorViews || !path) return null
  for (const [key, view] of Object.entries(editorViews)) {
    if (key.endsWith(`:${path}`)) return view
  }
  return null
}

export function getRegisteredEditorViewsForPath(editorViews, path) {
  if (!editorViews || !path) return []
  const views = []
  for (const [key, view] of Object.entries(editorViews)) {
    if (key.endsWith(`:${path}`)) {
      views.push(view)
    }
  }
  return views
}

export function findPreferredTextInsertTarget({
  paneTree,
  activePaneId,
  editorViews,
  isInsertablePath,
} = {}) {
  const activePane = findPane(paneTree, activePaneId)
  const activePath = activePane?.activeTab || null
  if (hasInsertableTextView(editorViews, activePaneId, activePath, isInsertablePath)) {
    return {
      paneId: activePaneId,
      path: activePath,
      viewerType: 'text',
    }
  }

  const candidates = []
  const walk = (node) => {
    if (!node) return
    if (node.type === 'leaf') {
      const path = node.activeTab
      if (hasInsertableTextView(editorViews, node.id, path, isInsertablePath)) {
        candidates.push({
          paneId: node.id,
          path,
          viewerType: 'text',
        })
      }
      return
    }
    if (node.type === 'split' && Array.isArray(node.children)) {
      node.children.forEach(walk)
    }
  }

  walk(paneTree)
  return candidates[0] || null
}
