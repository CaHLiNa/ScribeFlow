export function classifyZoteroSyncError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  if (message.includes('auth')) return 'auth'
  if (message.includes('rate-limit') || message.includes('retry after')) return 'rate-limit'
  if (/timeout|network|resolve|connect/.test(message)) return 'network'
  return 'generic'
}
