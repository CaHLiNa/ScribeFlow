import { focusEditorLineWithHighlight, focusEditorRangeWithHighlight } from '../../editor/revealHighlight.js'
import { resolveLatexEditorSelectionFromContext } from '../../domains/latex/latexPreviewSelection.js'
import { normalizeFsPath } from '../documentIntelligence/workspaceGraph.js'
import { resolveLatexSyncTarget } from './runtime.js'

const VIEW_WAIT_TIMEOUT_MS = 1500

export async function resolveLatexSyncTargetPath(reportedFile = '', options = {}) {
  const resolved = await resolveLatexSyncTarget({
    reportedFile,
    sourcePath: options.sourcePath || '',
    compileTargetPath: options.compileTargetPath || '',
    workspacePath: options.workspacePath || '',
  }).catch(() => null)
  const resolvedPath = normalizeFsPath(resolved?.path || '')
  return resolvedPath
}

export async function waitForLatexEditorView(editorStore, targetPath, timeoutMs = VIEW_WAIT_TIMEOUT_MS) {
  if (timeoutMs && typeof timeoutMs === 'object') {
    return waitForLatexEditorViewWithLifecycle(editorStore, targetPath, timeoutMs)
  }
  return waitForLatexEditorViewWithLifecycle(editorStore, targetPath, {
    timeoutMs,
  })
}

export async function waitForLatexEditorViewWithLifecycle(editorStore, targetPath, options = {}) {
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
      await new Promise(resolve => window.setTimeout(resolve, 16))
    }
    if (lifecycle?.isCancelled?.(token)) return null
    targetView = editorStore?.getAnyEditorView?.(targetPath) || null
  }

  if (lifecycle?.isCancelled?.(token)) return null
  return targetView
}

export async function revealLatexSourceLocation(editorStore, location, options = {}) {
  const targetPath = normalizeFsPath(location?.filePath || '')
  const line = Number(location?.line || 0)
  if (!targetPath || !Number.isInteger(line) || line < 1) return false
  const lifecycle = options.lifecycle || null
  const token = options.token || null

  if (lifecycle?.isCancelled?.(token)) return false

  const existingPaneId = editorStore?.findPaneWithTab?.(targetPath)?.id || ''
  const preferredPaneId = String(existingPaneId || options.paneId || editorStore?.activePaneId || '')
  if (preferredPaneId && editorStore?.findPane?.(editorStore.paneTree, preferredPaneId)) {
    editorStore?.openFileInPane?.(targetPath, preferredPaneId, { activatePane: true })
  } else {
    editorStore?.openFile?.(targetPath)
  }
  if (lifecycle?.isCancelled?.(token)) return false

  const targetView = await waitForLatexEditorViewWithLifecycle(
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

  const resolvedSelection = resolveLatexEditorSelectionFromContext(targetView, location)
  if (resolvedSelection?.from != null) {
    return focusEditorRangeWithHighlight(
      targetView,
      resolvedSelection.from,
      resolvedSelection.to,
      options,
    )
  }

  return focusEditorLineWithHighlight(targetView, line, options)
}
