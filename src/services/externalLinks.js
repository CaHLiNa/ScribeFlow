import { invoke } from '@tauri-apps/api/core'
import { isNativeDesktopRuntime } from './runtimeGuard.js'

const EXTERNAL_HTTP_PROTOCOLS = new Set(['http:', 'https:'])

function getElementFromTarget(target) {
  if (!target || typeof target !== 'object') return null
  if (target.nodeType === 1) return target
  if (target.nodeType === 3) return target.parentElement || null
  return null
}

export function normalizeExternalHttpUrl(value, base = undefined) {
  if (!value || typeof value !== 'string') return null
  try {
    const fallbackBase =
      typeof window !== 'undefined' && typeof window.location?.href === 'string'
        ? window.location.href
        : 'http://localhost/'
    const url = new URL(value, base || fallbackBase)
    if (!EXTERNAL_HTTP_PROTOCOLS.has(url.protocol)) return null
    return url.toString()
  } catch {
    return null
  }
}

export async function resolveExternalHttpUrl(value, base = undefined) {
  if (!isNativeDesktopRuntime()) return normalizeExternalHttpUrl(value, base)
  const normalized = await invoke('external_http_url_resolve', {
    params: {
      url: value,
      base,
    },
  })
  return normalized || null
}

export function resolveExternalHttpAnchor(target, base = undefined) {
  const element = getElementFromTarget(target)
  if (!element || typeof element.closest !== 'function') return null
  const anchor = element.closest('a[href]')
  if (!anchor || String(anchor.tagName || '').toLowerCase() !== 'a') return null
  if (anchor.hasAttribute('download')) return null
  const href = anchor.getAttribute('href') || anchor.href || ''
  const url = normalizeExternalHttpUrl(href, anchor.baseURI || base)
  if (!url) return null
  return { anchor, url }
}

export async function openExternalHttpUrl(url, base = undefined) {
  const normalized = await resolveExternalHttpUrl(url, base)
  if (!normalized) return false
  const { open } = await import('@tauri-apps/plugin-shell')
  await open(normalized)
  return true
}
