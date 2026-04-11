import { normalizeFsPath } from '../documentIntelligence/workspaceGraph.js'

const DEFAULT_SUPPRESS_MS = 420
const suppressUntilByFile = new Map()

function nowMs() {
  return Date.now()
}

export function suppressTypstSelectionPreviewSync(filePath, durationMs = DEFAULT_SUPPRESS_MS) {
  const normalizedPath = normalizeFsPath(filePath || '')
  if (!normalizedPath) return 0
  const resolvedDurationMs = durationMs == null ? DEFAULT_SUPPRESS_MS : durationMs
  const suppressUntil = nowMs() + Math.max(0, Number(resolvedDurationMs))
  suppressUntilByFile.set(normalizedPath, suppressUntil)
  return suppressUntil
}

export function shouldSuppressTypstSelectionPreviewSync(filePath) {
  const normalizedPath = normalizeFsPath(filePath || '')
  if (!normalizedPath) return false

  const suppressUntil = Number(suppressUntilByFile.get(normalizedPath) || 0)
  if (!Number.isFinite(suppressUntil) || suppressUntil <= 0) return false
  if (suppressUntil <= nowMs()) {
    suppressUntilByFile.delete(normalizedPath)
    return false
  }
  return true
}

export function clearTypstSelectionPreviewSyncSuppression(filePath = '') {
  const normalizedPath = normalizeFsPath(filePath || '')
  if (!normalizedPath) {
    suppressUntilByFile.clear()
    return
  }
  suppressUntilByFile.delete(normalizedPath)
}

export { DEFAULT_SUPPRESS_MS }
