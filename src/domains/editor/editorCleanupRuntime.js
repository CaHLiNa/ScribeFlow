import { ROOT_PANE_ID } from './paneTreeLayout'

export function destroyEditorRuntimeViews(editorViews = {}) {
  for (const key of Object.keys(editorViews)) {
    try {
      editorViews[key]?.destroy()
    } catch {
      // Component may already be unmounted.
    }
  }
}

export function createEmptyEditorRuntimeState({ restoreGeneration = 0 } = {}) {
  return {
    editorViews: {},
    paneTree: {
      type: 'leaf',
      id: ROOT_PANE_ID,
      tabs: [],
      activeTab: null,
    },
    activePaneId: ROOT_PANE_ID,
    dirtyFiles: new Set(),
    legacyPreviewPaths: new Set(),
    recentFiles: [],
    lastContextPath: null,
    cursorOffset: 0,
    restoreGeneration,
  }
}
