export const LATEX_BACKWARD_SYNC_EVENT = 'latex-backward-sync'
export const LATEX_FORWARD_SYNC_EVENT = 'latex-forward-sync'

const LATEX_FORWARD_SYNC_PENDING_TTL_MS = 60_000

let latexForwardSyncRequestId = 0
let pendingLatexForwardSync = null

function normalizeLatexForwardSyncDetail(detail = {}) {
  const sourcePath = String(detail.sourcePath || '').trim()
  const filePath = String(detail.filePath || sourcePath || '').trim()
  const line = Number(detail.line || 0)
  const column = Number(detail.column || 0)

  if (!sourcePath || !filePath || !Number.isInteger(line) || line < 1) {
    return null
  }

  latexForwardSyncRequestId += 1

  return {
    ...detail,
    requestId: latexForwardSyncRequestId,
    sourcePath,
    filePath,
    line,
    column: Number.isInteger(column) && column > 0 ? column : 1,
    dispatchedAt: Date.now(),
  }
}

export function readPendingLatexForwardSync() {
  if (!pendingLatexForwardSync) return null
  if (Date.now() - pendingLatexForwardSync.dispatchedAt > LATEX_FORWARD_SYNC_PENDING_TTL_MS) {
    pendingLatexForwardSync = null
    return null
  }
  return { ...pendingLatexForwardSync }
}

export function dispatchLatexForwardSync(windowTarget, detail = {}) {
  const normalizedDetail = normalizeLatexForwardSyncDetail(detail)
  if (!normalizedDetail) return null

  pendingLatexForwardSync = normalizedDetail
  windowTarget?.dispatchEvent?.(new CustomEvent(LATEX_FORWARD_SYNC_EVENT, {
    detail: normalizedDetail,
  }))
  return normalizedDetail
}

export function dispatchLatexBackwardSync(windowTarget, detail = {}) {
  windowTarget?.dispatchEvent?.(new CustomEvent(LATEX_BACKWARD_SYNC_EVENT, { detail }))
}
