import { normalizeFsPath } from '../documentIntelligence/workspaceGraph.js'

const pendingForwardSync = new Map()
export const MARKDOWN_FORWARD_SYNC_EVENT = 'markdown-forward-sync-location'
export const MARKDOWN_BACKWARD_SYNC_EVENT = 'markdown-backward-sync-location'

function normalizeSyncDetail(detail = {}) {
  const sourcePath = normalizeFsPath(detail.sourcePath || '')
  const line = Number(detail.line ?? -1)
  const offset = Number(detail.offset ?? -1)
  if (!sourcePath || !Number.isInteger(line) || line < 1 || !Number.isInteger(offset) || offset < 0) {
    return null
  }

  return {
    sourcePath,
    line,
    offset,
    reason: String(detail.reason || '').trim(),
  }
}

export function rememberPendingMarkdownForwardSync(detail = {}) {
  const payload = normalizeSyncDetail(detail)
  if (!payload) return null

  pendingForwardSync.set(payload.sourcePath, payload)
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

export function dispatchMarkdownForwardSync(detail = {}) {
  const payload = normalizeSyncDetail(detail)
  if (!payload || typeof window === 'undefined') return null

  window.dispatchEvent(
    new CustomEvent(MARKDOWN_FORWARD_SYNC_EVENT, {
      detail: payload,
    })
  )
  return payload
}

export function dispatchMarkdownBackwardSync(detail = {}) {
  const payload = normalizeSyncDetail(detail)
  if (!payload || typeof window === 'undefined') return null

  window.dispatchEvent(
    new CustomEvent(MARKDOWN_BACKWARD_SYNC_EVENT, {
      detail: payload,
    })
  )
  return payload
}
