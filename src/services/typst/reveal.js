import { focusEditorRangeWithHighlight } from '../../editor/revealHighlight'
import { tinymistRangeToOffsets } from '../tinymist/textEdits.js'
import { suppressTypstSelectionPreviewSync } from './previewSelectionSync.js'

const VIEW_WAIT_TIMEOUT_MS = 1500

export async function waitForTypstEditorView(editorStore, targetPath, timeoutMs = VIEW_WAIT_TIMEOUT_MS) {
  const startedAt = Date.now()
  let targetView = editorStore?.getAnyEditorView?.(targetPath) || null

  while (!targetView && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 16))
    targetView = editorStore?.getAnyEditorView?.(targetPath) || null
  }

  return targetView
}

export function focusTypstSourceLocation(targetView, location, options = {}) {
  const offsets = location?.offsets || (() => {
    const range = location?.targetSelectionRange || location?.range
    return tinymistRangeToOffsets(targetView.state, range)
  })()
  if (!offsets) return false

  return focusEditorRangeWithHighlight(
    targetView,
    offsets.from,
    offsets.to,
    options,
  )
}

export async function revealTypstSourceLocation(editorStore, location, options = {}) {
  const targetPath = String(location?.filePath || '')
  if (!targetPath) return false
  if (options.suppressPreviewSync !== false) {
    suppressTypstSelectionPreviewSync(targetPath, Number(options.suppressDurationMs || 420))
  }

  const existingPaneId = editorStore?.findPaneWithTab?.(targetPath)?.id || ''
  const preferredPaneId = String(options.paneId || existingPaneId || '')
  if (preferredPaneId && editorStore?.findPane?.(editorStore.paneTree, preferredPaneId)) {
    editorStore?.openFileInPane?.(targetPath, preferredPaneId, { activatePane: true })
  } else {
    editorStore?.openFile?.(targetPath)
  }
  const targetView = await waitForTypstEditorView(
    editorStore,
    targetPath,
    Number(options.timeoutMs || VIEW_WAIT_TIMEOUT_MS),
  )
  if (!targetView) return false

  return focusTypstSourceLocation(targetView, location, options)
}
