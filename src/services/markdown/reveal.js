import { EditorView } from '@codemirror/view'

const VIEW_WAIT_TIMEOUT_MS = 1500

function clampOffset(state, offset) {
  const length = state?.doc?.length || 0
  return Math.max(0, Math.min(Number(offset || 0), length))
}

export async function waitForMarkdownEditorView(editorStore, targetPath, timeoutMs = VIEW_WAIT_TIMEOUT_MS) {
  if (timeoutMs && typeof timeoutMs === 'object') {
    return waitForMarkdownEditorViewWithLifecycle(editorStore, targetPath, timeoutMs)
  }
  return waitForMarkdownEditorViewWithLifecycle(editorStore, targetPath, {
    timeoutMs,
  })
}

export async function waitForMarkdownEditorViewWithLifecycle(editorStore, targetPath, options = {}) {
  const timeoutMs = Number(options.timeoutMs || VIEW_WAIT_TIMEOUT_MS)
  const lifecycle = options.lifecycle || null
  const token = options.token || null
  const startedAt = Date.now()
  let targetView = editorStore?.getAnyEditorView?.(targetPath) || null

  while (!targetView && Date.now() - startedAt < timeoutMs) {
    if (lifecycle?.isCancelled?.(token)) return null
    if (lifecycle?.wait) {
      await lifecycle.wait(16)
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 16))
    }
    if (lifecycle?.isCancelled?.(token)) return null
    targetView = editorStore?.getAnyEditorView?.(targetPath) || null
  }

  if (lifecycle?.isCancelled?.(token)) return null
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
  const lifecycle = options.lifecycle || null
  const token = options.token || null

  if (lifecycle?.isCancelled?.(token)) return false

  const targetPaneId = String(options.paneId || '')
  if (targetPaneId && editorStore?.findPane?.(editorStore.paneTree, targetPaneId)) {
    editorStore?.openFileInPane?.(targetPath, targetPaneId, { activatePane: true })
  } else {
    editorStore?.openFile?.(targetPath)
  }
  if (lifecycle?.isCancelled?.(token)) return false
  const targetView = await waitForMarkdownEditorViewWithLifecycle(
    editorStore,
    targetPath,
    {
      timeoutMs: Number(options.timeoutMs || VIEW_WAIT_TIMEOUT_MS),
      lifecycle,
      token,
    },
  )
  if (!targetView) return false
  if (lifecycle?.isCancelled?.(token)) return false

  return focusMarkdownSourceLocation(targetView, location, options)
}
