import { EditorView } from '@codemirror/view'
import { tinymistRangeToOffsets } from '../tinymist/textEdits.js'

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

  targetView.dispatch({
    selection: {
      anchor: offsets.from,
      head: offsets.to,
    },
    effects: EditorView.scrollIntoView(offsets.from, {
      y: options.center === false ? 'nearest' : 'center',
      yMargin: 80,
    }),
  })
  targetView.focus()
  return true
}

export async function revealTypstSourceLocation(editorStore, location, options = {}) {
  const targetPath = String(location?.filePath || '')
  if (!targetPath) return false

  editorStore?.openFile?.(targetPath)
  const targetView = await waitForTypstEditorView(
    editorStore,
    targetPath,
    Number(options.timeoutMs || VIEW_WAIT_TIMEOUT_MS),
  )
  if (!targetView) return false

  return focusTypstSourceLocation(targetView, location, options)
}
