const VIEW_WAIT_TIMEOUT_MS = 1500

function clampOffset(text = '', offset = 0) {
  const normalized = String(text || '')
  return Math.max(0, Math.min(Number(offset || 0), normalized.length))
}

function lineToOffset(text = '', line = 1) {
  const normalized = String(text || '')
  const targetLine = Math.max(1, Number(line || 1))
  let currentLine = 1
  let index = 0

  while (currentLine < targetLine && index < normalized.length) {
    if (normalized[index] === '\n') currentLine += 1
    index += 1
  }

  return clampOffset(normalized, index)
}

export async function waitForMarkdownEditorView(editorStore, targetPath, timeoutMs = VIEW_WAIT_TIMEOUT_MS) {
  const startedAt = Date.now()
  let targetRuntime = editorStore?.getAnyEditorRuntime?.(targetPath) || editorStore?.getAnyEditorView?.(targetPath) || null

  while (!targetRuntime && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 16))
    targetRuntime = editorStore?.getAnyEditorRuntime?.(targetPath) || editorStore?.getAnyEditorView?.(targetPath) || null
  }

  return targetRuntime
}

export function focusMarkdownSourceLocation(targetRuntime, location, options = {}) {
  let from = Number(location?.startOffset)
  let to = Number(location?.endOffset)

  if (!Number.isFinite(from)) {
    from = Number(location?.offset)
  }
  if (!Number.isFinite(to)) {
    to = from
  }

  if (!Number.isFinite(from)) {
    const content = targetRuntime?.altalsGetContent?.() || ''
    from = lineToOffset(content, location?.line || 1)
    to = from
  }

  if (!Number.isFinite(from)) return false
  return !!targetRuntime?.altalsRevealRange?.(from, Math.max(from, Number.isFinite(to) ? to : from), options)
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
  const targetRuntime = await waitForMarkdownEditorView(
    editorStore,
    targetPath,
    Number(options.timeoutMs || VIEW_WAIT_TIMEOUT_MS),
  )
  if (!targetRuntime) return false

  return focusMarkdownSourceLocation(targetRuntime, location, options)
}
