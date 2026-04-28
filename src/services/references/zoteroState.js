export const zoteroSyncState = {
  status: 'disconnected',
  lastSyncTime: null,
  error: null,
  errorType: null,
  progress: null,
}

export function setZoteroSyncState(partial = {}) {
  Object.assign(zoteroSyncState, partial)
}

export function resetZoteroSyncState() {
  setZoteroSyncState({
    status: 'disconnected',
    lastSyncTime: null,
    error: null,
    errorType: null,
    progress: null,
  })
}

export function classifyZoteroSyncError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  if (message.includes('auth')) return 'auth'
  if (message.includes('rate-limit') || message.includes('retry after')) return 'rate-limit'
  if (/timeout|network|resolve|connect/.test(message)) return 'network'
  return 'generic'
}
