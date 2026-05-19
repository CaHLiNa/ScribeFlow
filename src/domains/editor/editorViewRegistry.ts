import { getViewerType } from '../../utils/fileTypes'

function buildEditorViewKey(paneId, path) {
  return `${paneId}:${path}`
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
