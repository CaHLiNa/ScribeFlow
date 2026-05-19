import { emitEvent as emit, listenEvent as listen } from './tauriBridge.ts'

export const TRANSIENT_OVERLAY_DISMISS_EVENT = 'app:transient-overlay-dismiss'

export function createTransientOverlaySource(prefix = 'overlay') {
  const randomId = Math.random().toString(36).slice(2, 10)
  return `${prefix}:${randomId}`
}

export async function broadcastTransientOverlayDismiss(sourceId = '') {
  const payload = { sourceId: String(sourceId || '') }
  await emit(TRANSIENT_OVERLAY_DISMISS_EVENT, payload).catch(() => {})
}

export async function listenForTransientOverlayDismiss(sourceId = '', handler = () => {}) {
  const normalizedSourceId = String(sourceId || '')
  return listen(TRANSIENT_OVERLAY_DISMISS_EVENT, (event) => {
    if (String(event.payload?.sourceId || '') === normalizedSourceId) return
    handler(event.payload || {})
  }).catch(() => () => {})
}
