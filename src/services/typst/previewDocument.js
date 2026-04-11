import { invoke } from '@tauri-apps/api/core'

const DEFAULT_SCROLL_DEBOUNCE_MS = 80
const PREVIEW_DOCUMENT_CACHE_VERSION = 3
const SCROLL_DEBOUNCE_PATTERN =
  /fromEvent\(resizeTarget, "scroll"\)\.pipe\(debounceTime\((\d+)\)\)\.subscribe\(\(\) => svgDoc\.addViewportChange\(\)\)/g
const WS_BOOTSTRAP_PATTERN = /let urlObject = new URL\("\/", window\.location\.href\);/
const PSEUDO_LINK_HOVER_PATTERN =
  /elem\.addEventListener\("mousemove", mouseMoveToLink\);\s*elem\.addEventListener\("mouseleave", mouseLeaveFromLink\);/g
const APP_BACKGROUND_STYLE_PATTERN =
  /background-color:\s*var\(--typst-preview-background-color\)\s*!important;/g
const previewDocumentUrlCache = new Map()

function normalizePreviewBaseUrl(previewUrl = '') {
  const value = String(previewUrl || '').trim()
  if (!value) return ''
  return value.endsWith('/') ? value : `${value}/`
}

export function patchTypstPreviewDocumentHtml(html, options = {}) {
  const source = String(html || '')
  const previewBaseUrl = normalizePreviewBaseUrl(options.previewBaseUrl || '')
  const scrollDebounceMs = Number.isFinite(options.scrollDebounceMs)
    ? Math.max(0, Math.trunc(options.scrollDebounceMs))
    : DEFAULT_SCROLL_DEBOUNCE_MS

  if (!source) {
    return { html: '', patched: false }
  }

  let nextHtml = source
  let patched = false

  nextHtml = nextHtml.replace(SCROLL_DEBOUNCE_PATTERN, (match, currentValue) => {
    if (Number(currentValue) === scrollDebounceMs) return match
    patched = true
    return match.replace(`debounceTime(${currentValue})`, `debounceTime(${scrollDebounceMs})`)
  })

  nextHtml = nextHtml.replace(PSEUDO_LINK_HOVER_PATTERN, () => {
    patched = true
    return ''
  })

  nextHtml = nextHtml.replace(APP_BACKGROUND_STYLE_PATTERN, () => {
    patched = true
    return 'background-color: #fff !important;'
  })

  if (previewBaseUrl) {
    nextHtml = nextHtml.replace(WS_BOOTSTRAP_PATTERN, () => {
      patched = true
      return `let urlObject = new URL(${JSON.stringify(previewBaseUrl)}, window.location.href);`
    })
  }

  return {
    html: nextHtml,
    patched,
  }
}

function buildPreviewDocumentCacheKey(previewUrl, options = {}) {
  const normalizedPreviewUrl = normalizePreviewBaseUrl(previewUrl)
  const scrollDebounceMs = Number.isFinite(options.scrollDebounceMs)
    ? Math.max(0, Math.trunc(options.scrollDebounceMs))
    : DEFAULT_SCROLL_DEBOUNCE_MS
  if (!normalizedPreviewUrl) return ''
  return `${normalizedPreviewUrl}::v${PREVIEW_DOCUMENT_CACHE_VERSION}::${scrollDebounceMs}`
}

export async function fetchTypstPreviewDocumentHtml(previewUrl) {
  const target = normalizePreviewBaseUrl(previewUrl)
  if (!target) return ''
  return invoke('typst_preview_fetch_document', { url: target })
}

export async function createTypstPreviewDocumentUrl(previewUrl, options = {}) {
  const cacheKey = buildPreviewDocumentCacheKey(previewUrl, options)
  if (cacheKey && previewDocumentUrlCache.has(cacheKey)) {
    return previewDocumentUrlCache.get(cacheKey) || ''
  }

  const rawHtml = await fetchTypstPreviewDocumentHtml(previewUrl)
  if (!rawHtml) return ''

  const { html } = patchTypstPreviewDocumentHtml(rawHtml, {
    previewBaseUrl: previewUrl,
    scrollDebounceMs: options.scrollDebounceMs,
  })

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const objectUrl = URL.createObjectURL(blob)
  if (cacheKey) {
    previewDocumentUrlCache.set(cacheKey, objectUrl)
  }
  return objectUrl
}

export function isManagedTypstPreviewDocumentUrl(url) {
  const value = String(url || '')
  if (!value) return false
  for (const cachedUrl of previewDocumentUrlCache.values()) {
    if (cachedUrl === value) return true
  }
  return false
}

export function clearTypstPreviewDocumentCache(previewUrl = '') {
  const normalizedPreviewUrl = normalizePreviewBaseUrl(previewUrl)
  for (const [cacheKey, objectUrl] of previewDocumentUrlCache.entries()) {
    if (normalizedPreviewUrl && !cacheKey.startsWith(`${normalizedPreviewUrl}::`)) continue
    if (typeof objectUrl === 'string' && objectUrl.startsWith('blob:')) {
      URL.revokeObjectURL(objectUrl)
    }
    previewDocumentUrlCache.delete(cacheKey)
  }
}

export { DEFAULT_SCROLL_DEBOUNCE_MS, buildPreviewDocumentCacheKey }
