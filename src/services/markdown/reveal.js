import { EditorView } from '@codemirror/view'

const VIEW_WAIT_TIMEOUT_MS = 1500

function clampOffset(state, offset) {
  const length = state?.doc?.length || 0
  return Math.max(0, Math.min(Number(offset || 0), length))
}

export async function waitForMarkdownEditorView(editorStore, targetPath, timeoutMs = VIEW_WAIT_TIMEOUT_MS) {
  const startedAt = Date.now()
  let targetView = editorStore?.getAnyEditorView?.(targetPath) || null

  while (!targetView && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 16))
    targetView = editorStore?.getAnyEditorView?.(targetPath) || null
  }

  return targetView
}

export function focusMarkdownSourceLocation(targetView, location, options = {}) {
  if (!targetView?.state?.doc) return false

  let from = Number(location?.startOffset)
  let to = Number(location?.endOffset)

  if (!Number.isFinite(from)) {
    from = Number(location?.offset)
  }
  if (!Number.isFinite(to)) {
    to = from
  }

  if (!Number.isFinite(from)) {
    const lineNumber = Math.max(1, Number(location?.line || 1))
    const line = targetView.state.doc.line(Math.min(lineNumber, targetView.state.doc.lines))
    from = line.from
    to = line.from
  }

  from = clampOffset(targetView.state, from)
  to = clampOffset(targetView.state, to)

  targetView.dispatch({
    selection: {
      anchor: from,
      head: Math.max(from, to),
    },
    effects: EditorView.scrollIntoView(from, {
      y: options.center === false ? 'nearest' : 'center',
      yMargin: 80,
    }),
  })
  targetView.focus()
  return true
}

export async function revealMarkdownSourceLocation(editorStore, location, options = {}) {
  const targetPath = String(location?.filePath || '')
  if (!targetPath) return false

  const targetPaneId = String(options.paneId || '')
  if (targetPaneId && editorStore?.findPane?.(editorStore.paneTree, targetPaneId)) {
    editorStore?.openFileInPane?.(targetPath, targetPaneId, { activatePane: true })
  } else {
    editorStore?.openFile?.(targetPath)
  }
  const targetView = await waitForMarkdownEditorView(
    editorStore,
    targetPath,
    Number(options.timeoutMs || VIEW_WAIT_TIMEOUT_MS),
  )
  if (!targetView) return false

  return focusMarkdownSourceLocation(targetView, location, options)
}
