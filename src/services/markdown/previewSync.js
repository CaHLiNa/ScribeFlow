import { normalizeFsPath } from '../documentIntelligence/workspaceGraph.js'

const pendingForwardSync = new Map()

export function rememberPendingMarkdownForwardSync(detail = {}) {
  const sourcePath = normalizeFsPath(detail.sourcePath || '')
  const line = Number(detail.line ?? -1)
  const offset = Number(detail.offset ?? -1)
  if (!sourcePath || !Number.isInteger(line) || line < 1 || !Number.isInteger(offset) || offset < 0) {
    return null
  }

  const payload = {
    sourcePath,
    line,
    offset,
  }

  pendingForwardSync.set(sourcePath, payload)
  return payload
}

export function clearPendingMarkdownForwardSync(detail = null) {
  if (!detail) {
    pendingForwardSync.clear()
    return
  }

  const sourcePath = normalizeFsPath(detail.sourcePath || '')
  if (!sourcePath) return
  pendingForwardSync.delete(sourcePath)
}

export function takePendingMarkdownForwardSync(sourcePath = '') {
  const normalized = normalizeFsPath(sourcePath)
  if (!normalized || !pendingForwardSync.has(normalized)) return null
  const payload = pendingForwardSync.get(normalized)
  pendingForwardSync.delete(normalized)
  return payload
}
